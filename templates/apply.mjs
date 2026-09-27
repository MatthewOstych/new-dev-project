// Копирует шаблон скилла в проект: убирает части, которых в проекте нет, и
// подставляет плейсхолдеры. Проверен полным прогоном скилла.
//
//   node apply.mjs <values.json> <шаблон> <файл в проекте>
//
// values.json: { "__parts": ["web", "railway", "ios", ...], "PROJECT": "Orbit", ... }.
// Части: web, ios, android, railway, firebase, stripe, vercel, apple, posthog,
// google-sign-in, admin. Правила маркеров (те же, что в SKILL.md):
//   # [x] на своей строке      идущие следом строки комментария, следующая строка
//                              и всё, что под ней с большим отступом;
//   // --- [x] Название ---    секция до следующего заголовка вида `--- … ---`
//   # --- [x] Название ---     (любого, в том числе без маркера);
//   текст <!-- [x] -->         строка md или пункт списка со строками продолжения;
//   <!-- [x] --> на строке     следующий блок md: раздел заголовка, абзац или код.
// Часть есть: удаляется только маркер. Плейсхолдер без значения печатается в
// stderr и остаётся в файле, чтобы его нельзя было пропустить.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [valuesFile, src, dst] = process.argv.slice(2);
if (!valuesFile || !src || !dst) {
  console.error('usage: node apply.mjs <values.json> <template> <target>');
  process.exit(2);
}
const values = JSON.parse(readFileSync(valuesFile, 'utf8'));
const PRESENT = new Set(values.__parts ?? []);

const lines = readFileSync(src, 'utf8').split('\n');
const out = [];
const indentOf = (l) => (l ?? '').match(/^\s*/)[0].length;
const isMd = src.endsWith('.md');

const HEADER_ANY = /^\s*(\/\/|#) --- /;
const HEADER_PART = /^(\s*(?:\/\/|#) --- )\[([a-z-]+)\] (.*)$/;
const HASH_OWN = /^\s*# \[([a-z-]+)\]\s*$/;
const MD_OWN = /^\s*<!-- \[([a-z-]+)\] -->\s*$/;
const MD_EOL = /^(.*\S)\s*<!-- \[([a-z-]+)\] -->\s*$/;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let m;
  if ((m = line.match(HEADER_PART))) {
    if (PRESENT.has(m[2])) {
      out.push(`${m[1]}${m[3]}`);
      continue;
    }
    i++;
    while (i < lines.length && !HEADER_ANY.test(lines[i])) i++;
    i--;
    continue;
  }
  if (!isMd && (m = line.match(HASH_OWN))) {
    if (PRESENT.has(m[1])) continue;
    let j = i + 1;
    while (j < lines.length && /^\s*#/.test(lines[j])) j++;
    const base = indentOf(lines[j]);
    j++;
    while (j < lines.length && lines[j].trim() !== '' && indentOf(lines[j]) > base) j++;
    i = j - 1;
    continue;
  }
  if (isMd && (m = line.match(MD_OWN))) {
    if (PRESENT.has(m[1])) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    const next = lines[j] ?? '';
    const h = next.match(/^(#+)\s/);
    if (h) {
      j++;
      while (j < lines.length) {
        const h2 = lines[j].match(/^(#+)\s/);
        if (h2 && h2[1].length <= h[1].length) break;
        if (MD_OWN.test(lines[j])) break;
        j++;
      }
    } else if (next.startsWith('```')) {
      j++;
      while (j < lines.length && !lines[j].startsWith('```')) j++;
      j++;
    } else {
      while (j < lines.length && lines[j].trim() !== '') j++;
    }
    // После удалённого блока не оставлять двойную пустую строку.
    while (j < lines.length && lines[j].trim() === '' && (out.at(-1) ?? '').trim() === '') j++;
    i = j - 1;
    continue;
  }
  if (isMd && (m = line.match(MD_EOL))) {
    if (PRESENT.has(m[2])) {
      out.push(m[1]);
      continue;
    }
    const bullet = line.match(/^(\s*)([-*]|\d+\.)\s/);
    if (bullet) {
      const base = bullet[1].length;
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '' && indentOf(lines[j]) > base) j++;
      i = j - 1;
    }
    continue;
  }
  out.push(line);
}

let text = out.join('\n');
const missing = new Set();
text = text.replace(/\{\{([A-Z_]+)\}\}/g, (all, key) => {
  if (key in values) return values[key];
  missing.add(key);
  return all;
});
if (missing.size) console.error(`apply: no value in ${src}: ${[...missing].join(', ')}`);
mkdirSync(path.dirname(dst), { recursive: true });
writeFileSync(dst, text);
