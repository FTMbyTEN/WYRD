// Rotation cleanup for the reasoning/ folder.
// Keeps the most recent KEEP_LIVE files as individual .md files (what the UI reads via
// /api/reasoning), and consolidates everything older into dated archive bundles so the
// directory doesn't accumulate unbounded thousands of tiny files, without losing any content.
const fs = require('fs');
const path = require('path');

const REASONING_DIR = path.join(__dirname, '..', 'reasoning');
const ARCHIVE_DIR = path.join(REASONING_DIR, 'archive');
const KEEP_LIVE = 300;
const CHUNK_SIZE = 1000; // files per archive bundle

if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

const files = fs.readdirSync(REASONING_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort(); // ISO-timestamp filenames sort chronologically

const total = files.length;
if (total <= KEEP_LIVE) {
  console.log(`nothing to rotate — ${total} files, keep threshold is ${KEEP_LIVE}`);
  process.exit(0);
}

const toArchive = files.slice(0, total - KEEP_LIVE);
console.log(`total files: ${total}, archiving: ${toArchive.length}, keeping live: ${total - toArchive.length}`);

let archivedCount = 0;
for (let i = 0; i < toArchive.length; i += CHUNK_SIZE) {
  const chunk = toArchive.slice(i, i + CHUNK_SIZE);
  const firstTs = chunk[0].replace(/\.md$/, '');
  const lastTs = chunk[chunk.length - 1].replace(/\.md$/, '');
  const archiveName = `archive_${firstTs}_to_${lastTs}.md`;
  const archivePath = path.join(ARCHIVE_DIR, archiveName);

  const parts = chunk.map((f) => {
    const content = fs.readFileSync(path.join(REASONING_DIR, f), 'utf8');
    return `<!-- source: ${f} -->\n${content}`;
  });

  fs.writeFileSync(archivePath, parts.join('\n---\n'));
  chunk.forEach((f) => fs.unlinkSync(path.join(REASONING_DIR, f)));
  archivedCount += chunk.length;
  console.log(`  wrote ${archiveName} (${chunk.length} entries)`);
}

console.log(`done. archived ${archivedCount} files into ${Math.ceil(toArchive.length / CHUNK_SIZE)} bundle(s) under reasoning/archive/`);
console.log(`live files remaining in reasoning/: ${fs.readdirSync(REASONING_DIR).filter((f) => f.endsWith('.md')).length}`);
