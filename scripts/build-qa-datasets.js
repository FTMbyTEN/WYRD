// One-time parser: turns the raw WikiQA + CMU Q&A dataset files into a single consolidated,
// cleaned data/qa_datasets.json that the server loads at startup into an in-memory topic index.
// Kept as a standalone script (not run on every boot) since parsing ~40MB of raw text is real
// work that should happen once, not on every server restart.
const fs = require('fs');
const path = require('path');

const DATASETS_DIR = path.join(__dirname, '..', 'data', 'datasets');
const OUT_FILE = path.join(__dirname, '..', 'data', 'qa_datasets.json');

const STOPWORDS = new Set(['the','a','an','is','are','was','were','to','of','and','in','on','for','it','i','you','me','my','your','that','this','with','be','do','does','did','so','but','if','or','at','as','not','no','yes','what','how','why','who','when','where','which','does','did','was','were','is','are']);

function extractTopics(text) {
  return (text.toLowerCase().match(/[a-z0-9']+/g) || [])
    .filter((w) => w.length > 2 && w.length < 20 && !STOPWORDS.has(w));
}

const entries = [];

// ---- WikiQA: sentence-level, Label=1 marks a correct answer sentence for that question ----
function parseWikiQA() {
  const file = path.join(DATASETS_DIR, 'WikiQACorpus', 'WikiQA.tsv');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const byQuestion = new Map(); // questionId -> { question, answers: [] }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 7) continue;
    const [qid, question, , , , sentence, label] = cols;
    if (label.trim() !== '1') continue; // only keep verified correct answers
    if (!byQuestion.has(qid)) byQuestion.set(qid, { question: question.trim(), answers: [] });
    byQuestion.get(qid).answers.push(sentence.trim());
  }

  let count = 0;
  for (const { question, answers } of byQuestion.values()) {
    if (!question || answers.length === 0) continue;
    const answer = answers.join(' ');
    const topics = extractTopics(`${question} ${answer}`);
    if (topics.length === 0) continue;
    entries.push({ question, answer, topics, source: 'WikiQA' });
    count++;
  }
  console.log(`WikiQA: ${count} question/answer entries`);
}

// ---- CMU: direct question/answer pairs across S08/S09/S10, many answers are empty/NULL ----
function parseCMU() {
  let count = 0;
  for (const year of ['S08', 'S09', 'S10']) {
    const file = path.join(DATASETS_DIR, 'Question_Answer_Dataset_v1.2', year, 'question_answer_pairs.txt');
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      if (cols.length < 3) continue;
      const [articleTitle, question, answer] = cols;
      if (!question || !answer) continue;
      const q = question.trim();
      const a = answer.trim();
      if (!q || !a || a.toUpperCase() === 'NULL' || a.length < 2) continue;
      const topics = extractTopics(`${q} ${a} ${articleTitle}`);
      if (topics.length === 0) continue;
      entries.push({ question: q, answer: a, topics, source: 'CMU-QA' });
      count++;
    }
  }
  console.log(`CMU-QA: ${count} question/answer entries`);
}

parseWikiQA();
parseCMU();

// de-duplicate identical question+answer pairs (both datasets have some repeats across splits)
const seen = new Set();
const deduped = entries.filter((e) => {
  const key = `${e.question}|||${e.answer}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

fs.writeFileSync(OUT_FILE, JSON.stringify({ entries: deduped }, null, 2));
console.log(`Total after dedup: ${deduped.length} entries written to ${OUT_FILE}`);
