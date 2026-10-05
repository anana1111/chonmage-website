// Merge captured post snapshots into NEWS without touching any schedule data.
import fs from 'node:fs';
import '../news-core.js';
const core = globalThis.ChonmageNews;
const HANDLE = 'ChonmageNiigata';

function timestamp(candidate, now) {
  const explicit = candidate.publishedAt || candidate.createdAt;
  if (explicit) {
    const parsed = new Date(explicit).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  // X's snowflake timestamp is publication time, never the crawl time or event date.
  const id = core.xUrl(candidate.url, true)?.match(/\/status\/(\d+)/)?.[1];
  if (!id) return NaN;
  try {
    const value = Number((BigInt(id) >> 22n) + 1288834974657n);
    return value >= Date.UTC(2010, 10, 4) && value <= now ? value : NaN;
  } catch { return NaN; }
}

export function newsFromCandidate(candidate, now = Date.now()) {
  if (!candidate || typeof candidate.newsText !== 'string' || !candidate.newsText.trim()) return null;
  const url = core.xUrl(candidate.url, true);
  if (!url || new URL(url).pathname.split('/')[1].toLowerCase() !== HANDLE.toLowerCase()) return null;
  const published = timestamp(candidate, new Date(now).getTime());
  if (!Number.isFinite(published)) return null;
  const body = candidate.newsText.trim();
  const theme = /(優勝|入賞|結果|winner|result)/i.test(body) ? 'result' : /(OPEN|オープン|営業|休業|RING|リング)/i.test(body) ? 'schedule' : 'event';
  return core.normalizeItem({
    id: 'x-' + url.match(/\/status\/(\d+)/)[1], publishedAt: core.japanDateTime(published),
    title: body.split('\n').map((line) => line.trim()).find(Boolean).slice(0, 60),
    content: body, summary: body.replace(/\s+/g, ' ').slice(0, 140),
    category: theme.toUpperCase(), theme, visualLabel: theme === 'schedule' ? 'TODAY' : theme.toUpperCase(),
    source: 'x', sourceUrl: url, url, images: Array.isArray(candidate.images) ? candidate.images : [],
    published: true, pinned: false, autoUpdate: true,
  });
}

export function mergeNews(existing, candidates, now = Date.now()) {
  core.validateNews(existing);
  const result = JSON.parse(JSON.stringify(existing));
  const excluded = new Set((result.excludedSourceUrls || []).map((url) => core.xUrl(url, true)));
  const bySource = new Map();
  result.items.forEach((item, index) => {
    const url = core.xUrl(item.sourceUrl || item.url, true);
    if (url && !bySource.has(url)) bySource.set(url, index);
  });
  for (const candidate of candidates || []) {
    const incoming = newsFromCandidate(candidate, now);
    if (!incoming || excluded.has(incoming.sourceUrl)) continue;
    const index = bySource.get(incoming.sourceUrl);
    if (index !== undefined) {
      const current = result.items[index];
      // Static-editor edits opt out of refresh; deletion exclusions prevent resurrection.
      if (current.autoUpdate === true) result.items[index] = { ...current, ...incoming, id: current.id || incoming.id, pinned: current.pinned === true, published: current.published !== false };
    } else if (core.status(incoming, now) === 'Published') {
      bySource.set(incoming.sourceUrl, result.items.length); result.items.push(incoming);
    }
  }
  // No pruning: all expired and missing-from-source records remain in the archive.
  core.validateNews(result);
  return result;
}

export function syncNewsFile(candidates, output = 'data/news.json', now = Date.now()) {
  const oldText = fs.readFileSync(output, 'utf8');
  const old = JSON.parse(oldText);
  const merged = mergeNews(old, candidates, now);
  if (JSON.stringify(old) === JSON.stringify(merged)) return false;
  fs.writeFileSync(output, JSON.stringify(merged, null, 2) + '\n');
  console.log('updated ' + output + ' (' + merged.items.length + ' NEWS records, including history)');
  return true;
}

if (process.argv[1]?.endsWith('sync-news.mjs')) {
  const candidates = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (!Array.isArray(candidates)) throw new Error('Invalid NEWS candidates');
  syncNewsFile(candidates);
}
