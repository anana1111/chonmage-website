// Ensure that every public static HTML page has the site's GA4 tag.
// Safe to run repeatedly. Internal admin pages and source assets are deliberately excluded.
// Run "node scripts/ensure-ga4.mjs" before committing newly created pages.
// Use --check in CI to validate without changing files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'G-LW40HNQ1PL';
const EXCLUDED = new Set(['admin', 'node_modules', 'vendor', 'coverage', 'dist', 'build']);
const checkOnly = process.argv.includes('--check');

function* publicHtml(dir = ROOT) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Jekyll does not publish these directories; the admin is intentionally excluded.
      if (!entry.name.startsWith('.') && !entry.name.startsWith('_') && !EXCLUDED.has(entry.name)) {
        yield* publicHtml(file);
      }
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      yield file;
    }
  }
}

function googleTag(indent) {
  return [
    '<!-- Google tag (gtag.js), GA4 ' + ID + '; exclude local, preview and test visits. -->',
    '<script async src="https://www.googletagmanager.com/gtag/js?id=' + ID + '"></script>',
    '<script>',
    '  window.dataLayer = window.dataLayer || [];',
    '  function gtag(){dataLayer.push(arguments);}',
    "  if (!(location.hostname === 'chonmagepoker.com' || location.hostname.endsWith('.chonmagepoker.com')) || /[?&](preview|now)=/.test(location.search)) window['ga-disable-" + ID + "'] = true;",
    "  gtag('js', new Date());",
    "  gtag('config', '" + ID + "');",
    '</script>'
  ].map((line) => indent + line).join('\n');
}

let inspected = 0;
let changed = 0;
const problems = [];
for (const file of publicHtml()) {
  inspected++;
  const relative = path.relative(ROOT, file).replaceAll(path.sep, '/');
  const html = fs.readFileSync(file, 'utf8');
  const correctScript = html.includes('gtag/js?id=' + ID);
  const correctConfig = html.includes("gtag('config', '" + ID + "')") || html.includes('gtag("config", "' + ID + '")');
  if (correctScript && correctConfig) continue; // Idempotent; never double-count.
  if (/googletagmanager\.com\/gtag\/js\?id=|gtag\(['"]config['"]/.test(html)) {
    problems.push(relative + ': an existing Google tag needs manual review (avoid duplicate analytics).');
    continue;
  }

  const headMatch = /<head\b[^>]*>/i.exec(html);
  if (!headMatch) {
    problems.push(relative + ': missing <head> tag.');
    continue;
  }
  const afterHead = html.slice(headMatch.index + headMatch[0].length);
  const indent = /^\r?\n([ \t]+)\S/.exec(afterHead)?.[1] || '  ';
  const next = html.slice(0, headMatch.index + headMatch[0].length)
    + '\n' + googleTag(indent)
    + html.slice(headMatch.index + headMatch[0].length);
  if (!checkOnly) fs.writeFileSync(file, next);
  changed++;
  console.log((checkOnly ? 'MISSING' : 'ADDED') + ' GA4: ' + relative);
}
for (const problem of problems) console.error('ERROR: ' + problem);
console.log('GA4: inspected ' + inspected + ' public HTML pages; ' +
  (checkOnly ? 'missing ' : 'updated ') + changed + '. Admin and _originals excluded.');
if (problems.length || (checkOnly && changed)) process.exitCode = 1;
