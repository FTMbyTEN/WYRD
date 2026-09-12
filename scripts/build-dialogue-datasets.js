// One-time parser: turns MultiWOZ, ConvAI2, NPS Chat, and the SWIG IRC sample into a single
// consolidated data/dialogue_datasets.json of {context, response, topics, source} exchange pairs —
// same shape/purpose as build-qa-datasets.js, so it plugs into the same kind of inverted-index
// recall on the server side. Capped per-source so the consolidated file stays a few MB, not tens.
const fs = require('fs');
const path = require('path');

const DIALOGUE_DIR = path.join(__dirname, '..', 'data', 'datasets', 'dialogue');
const OUT_FILE = path.join(__dirname, '..', 'data', 'dialogue_datasets.json');

const STOPWORDS = new Set(['the','a','an','is','are','was','were','to','of','and','in','on','for','it','i','you','me','my','your','that','this','with','be','do','does','did','so','but','if','or','at','as','not','no','yes','what','how','why','who','when','where','which']);

function extractTopics(text) {
  return (text.toLowerCase().match(/[a-z0-9']+/g) || [])
    .filter((w) => w.length > 2 && w.length < 20 && !STOPWORDS.has(w));
}

const entries = [];

function addPair(context, response, source) {
  context = (context || '').trim();
  response = (response || '').trim();
  if (context.length < 3 || response.length < 2) return;
  if (context.length > 300 || response.length > 300) return; // skip walls of text, keep it conversational
  const topics = extractTopics(`${context} ${response}`);
  if (topics.length === 0) return;
  entries.push({ context, response, topics, source });
}

// ---- MultiWOZ: task-oriented dialogues, log[] alternates user/system turns ----
function parseMultiWOZ(cap) {
  const file = path.join(DIALOGUE_DIR, 'MultiWOZ_2.1', 'MultiWOZ_2.1', 'data.json');
  if (!fs.existsSync(file)) return console.log('MultiWOZ: file not found, skipped');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let count = 0;
  for (const key of Object.keys(data)) {
    if (count >= cap) break;
    const log = data[key].log || [];
    for (let i = 0; i < log.length - 1 && count < cap; i++) {
      addPair(log[i].text, log[i + 1].text, 'MultiWOZ');
      count++;
    }
  }
  console.log(`MultiWOZ: ${count} pairs`);
}

// ---- ConvAI2: dialog[] of {sender, text} ----
function parseConvAI2(cap) {
  let count = 0;
  for (const fname of ['convai2_tolokers.json', 'convai2_volunteers.json']) {
    const file = path.join(DIALOGUE_DIR, fname);
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const conv of data) {
      if (count >= cap) break;
      const dialog = conv.dialog || [];
      for (let i = 0; i < dialog.length - 1 && count < cap; i++) {
        addPair(dialog[i].text, dialog[i + 1].text, 'ConvAI2');
        count++;
      }
    }
  }
  console.log(`ConvAI2: ${count} pairs`);
}

// ---- NPS Chat: XML posts, adjacent non-System posts paired as loose exchanges ----
function parseNPSChat(cap) {
  const dir = path.join(DIALOGUE_DIR, 'nps_chat', 'nps_chat');
  if (!fs.existsSync(dir)) return console.log('NPS Chat: dir not found, skipped');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.xml'));
  let count = 0;
  for (const f of files) {
    if (count >= cap) break;
    const xml = fs.readFileSync(path.join(dir, f), 'utf8');
    // matches: <Post class="X" user="Y">TEXT<terminals   — text ends right before <terminals>
    const posts = [...xml.matchAll(/<Post class="([^"]*)"[^>]*>([^<]*)<terminals/g)]
      .filter((m) => m[1] !== 'System')
      .map((m) => m[2].trim());
    for (let i = 0; i < posts.length - 1 && count < cap; i++) {
      addPair(posts[i], posts[i + 1], 'NPS-Chat');
      count++;
    }
  }
  console.log(`NPS Chat: ${count} pairs`);
}

// ---- SWIG IRC logs: plain "HH:MM:SS <nick> text" lines, join/quit/mode noise filtered ----
function parseSwigIRC(cap) {
  const dir = path.join(DIALOGUE_DIR, 'swig_irc');
  if (!fs.existsSync(dir)) return console.log('SWIG IRC: dir not found, skipped');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'));
  const noise = /has (joined|quit|left)|sets mode|changed the topic|is now known as/;
  let count = 0;
  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    const messages = [];
    for (const line of lines) {
      const m = line.match(/^\d{2}:\d{2}:\d{2}\s+<([^>]+)>\s+(.*)$/);
      if (!m || noise.test(line)) continue;
      messages.push(m[2].trim());
    }
    for (let i = 0; i < messages.length - 1 && count < cap; i++) {
      addPair(messages[i], messages[i + 1], 'SWIG-IRC');
      count++;
    }
  }
  console.log(`SWIG IRC: ${count} pairs`);
}

parseMultiWOZ(3000);
parseConvAI2(3000);
parseNPSChat(1500);
parseSwigIRC(500);

const seen = new Set();
const deduped = entries.filter((e) => {
  const key = `${e.context}|||${e.response}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

fs.writeFileSync(OUT_FILE, JSON.stringify({ entries: deduped }, null, 2));
console.log(`Total after dedup: ${deduped.length} entries written to ${OUT_FILE}`);
