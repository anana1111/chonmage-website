// Tell IndexNow search engines (Bing, Yahoo, Yandex, Naver …; Google does not take part) which
// pages changed, by comparing the previous sitemap with the new one.
// Usage: node scripts/indexnow.mjs <old-sitemap.xml> <new-sitemap.xml>
// It first waits until GitHub Pages serves the new sitemap and the key file, so the engines never
// fetch a page before it is live. Every problem only warns: this must never block a site update.
import fs from 'node:fs';

const SITE = 'https://chonmagepoker.com/';
const KEY = 'c8de240a145fb4e8d75b2e1fa3b7d313';
const KEY_URL = SITE + KEY + '.txt';
const WAIT_MS = 10 * 60 * 1000;
const POLL_MS = 20 * 1000;

function entries(xml) {
  const map = new Map();
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) || []) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (loc) map.set(loc, block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] || '');
  }
  return map;
}

export function changedUrls(oldXml, newXml) {
  const before = entries(oldXml), after = entries(newXml);
  const urls = new Set();
  for (const [loc, lastmod] of after) if (!before.has(loc) || before.get(loc) !== lastmod) urls.add(loc);
  for (const loc of before.keys()) if (!after.has(loc)) urls.add(loc); // removed pages now answer 404
  // The NEWS list shows every post, so it changes whenever a post page does.
  if ([...urls].some((url) => url.startsWith(SITE + 'news/'))) urls.add(SITE + 'news/');
  return [...urls].filter((url) => url.startsWith(SITE));
}

async function text(url) {
  const response = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache: 'no-store' });
  return response.ok ? (await response.text()).trim() : null;
}

async function waitUntilLive(newXml) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    try {
      if ((await text(KEY_URL)) === KEY && (await text(SITE + 'sitemap.xml')) === newXml.trim()) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return false;
}

async function main() {
  const [oldPath, newPath] = process.argv.slice(2);
  const oldXml = oldPath && fs.existsSync(oldPath) ? fs.readFileSync(oldPath, 'utf8') : '';
  const newXml = fs.readFileSync(newPath || 'sitemap.xml', 'utf8');
  const urlList = changedUrls(oldXml, newXml);
  if (!urlList.length) { console.log('IndexNow: no page changes.'); return; }
  if (!(await waitUntilLive(newXml))) { console.log('::warning::IndexNow: the new pages were not live yet; skipped.'); return; }
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: KEY_URL, urlList }),
  });
  if (response.ok) console.log('IndexNow: sent ' + urlList.length + ' URL(s), HTTP ' + response.status + '.');
  else console.log('::warning::IndexNow answered HTTP ' + response.status + ': ' + (await response.text()).slice(0, 200));
}

if (import.meta.url === 'file://' + process.argv[1]) main().catch((error) => console.log('::warning::IndexNow failed: ' + error.message));
