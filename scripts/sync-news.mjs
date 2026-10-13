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

// Text from X can carry HTML entities (&amp;) and emoji around names and labels.
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (text) => text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity]);
const plain = (text) => decode(text).replace(/[\p{Extended_Pictographic}\u200d\ufe0f\u20e3]/gu, '').replace(/\s+/g, ' ').trim();
// A first line like 「【トーナメント結果】✨」 says only what kind of post it is.
const isResultLabel = (line) => /^[【\[]?(?:トーナメント|大会)?結果(?:発表)?[】\]]?$/.test(plain(line));

function postLines(body) {
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length) lines[0] = lines[0].replace(/^Pinned:\s*/i, '');
  // Some captures repeat the whole post as one flattened first line before the real lines.
  if (lines.length > 1 && lines[0].length > lines[1].length && lines[0].startsWith(lines[1])) lines.shift();
  return lines;
}

// Result posts name the winner a line or two below 「🥇優勝🥇」 or 「本日の〇〇優勝者は…」:
// 「THE DAILY 優勝はカイ様！」 says more than 「【トーナメント結果】」.
export function resultTitle(lines) {
  const at = lines.findIndex((line) => line.includes('優勝') && !line.includes('おめでとう'));
  if (at < 0) return '';
  const after = lines[at].slice(lines[at].indexOf('優勝') + 2).replace(/^者は[.…・]*/, '');
  const name = [after, lines[at + 1] || ''].map(plain).find((text) => /^\S.{0,23}様$/u.test(text));
  if (!name) return '';
  const entry = lines.findIndex((line) => line.includes('入賞者'));
  let event = '';
  if (entry >= 0) event = plain(lines[entry].split('入賞者')[0]) || (entry > 0 && !isResultLabel(lines[entry - 1]) ? plain(lines[entry - 1]) : '');
  else event = plain(lines[at]).match(/^(?:本日の)?(.+?)優勝者は/)?.[1] || '';
  event = event.replace(/^[【\[][^】\]]*[】\]]\s*/, '');
  return ((event && event.length <= 30 ? event + ' ' : '') + '優勝は' + name + '！').slice(0, 60);
}

export function postTitle(body, theme) {
  const lines = postLines(body);
  return (theme === 'result' && resultTitle(lines)) || decode(lines[0] || '').slice(0, 60);
}

function postSummary(body) {
  const lines = postLines(body);
  if (lines.length > 1 && isResultLabel(lines[0])) lines.shift();
  return decode(lines.join(' ')).replace(/\s+/g, ' ').slice(0, 140);
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
    title: postTitle(body, theme), content: body, summary: postSummary(body),
    category: theme.toUpperCase(), theme, visualLabel: theme === 'schedule' ? 'TODAY' : theme.toUpperCase(),
    source: 'x', sourceUrl: url, url, images: Array.isArray(candidate.images) ? candidate.images : [],
    published: true, pinned: false, autoUpdate: true,
  });
}

// Posts that still follow X get their title and teaser from the current rules on every run,
// so older posts read like new ones. Posts edited in the static editor keep theirs.
function refreshText(item) {
  if (item.source !== 'x' || item.autoUpdate !== true || typeof item.content !== 'string' || !item.content.trim()) return;
  const theme = core.THEMES.includes(item.theme) ? item.theme : 'event';
  item.title = postTitle(item.content, theme);
  item.summary = item.description = postSummary(item.content);
}

export function mergeNews(existing, candidates, now = Date.now()) {
  core.validateNews(existing);
  const result = JSON.parse(JSON.stringify(existing));
  result.items.forEach(refreshText);
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
