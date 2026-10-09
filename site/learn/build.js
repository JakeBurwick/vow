// Embeds lessons.json into lessons.js so the static site can load lessons with a plain
// <script> tag (works from file:// and needs no fetch). lessons.json stays the source of truth.
//   node site/learn/build.js          regenerate lessons.js
//   node site/learn/build.js --check  exit 1 if lessons.js is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const lessons = JSON.parse(fs.readFileSync(path.join(dir, 'lessons.json'), 'utf8'));
const out = '// GENERATED from lessons.json by `node site/learn/build.js`. Edit lessons.json, not this file.\n'
  + 'window.VOW_LESSONS = ' + JSON.stringify(lessons, null, 1) + ';\n';
const target = path.join(dir, 'lessons.js');

if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== out) { console.error('site/learn/lessons.js is stale: run node site/learn/build.js'); process.exit(1); }
  console.log('site/learn/lessons.js is up to date');
} else {
  fs.writeFileSync(target, out);
  console.log(`wrote ${target} (${lessons.length} lessons)`);
}
