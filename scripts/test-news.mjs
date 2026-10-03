// Fixed clocks cover NEWS retention, legacy migration, safe URLs and crawl merging.
import assert from 'node:assert/strict';
import '../news-core.js';
import { mergeNews, newsFromCandidate } from './sync-news.mjs';
import { candidateFromObject, loadCandidates } from './fetch-events.mjs';
import { rssCandidatesFromText } from './x-reader.mjs';
const n = globalThis.ChonmageNews;
const now = Date.parse('2026-10-03T13:00:00+09:00');
const item = (overrides = {}) => ({ id: 'manual-1', publishedAt: '2026-10-03T12:00:00+09:00', title: 'お知らせ', content: '日本語\n中文\nEnglish', source: 'manual', published: true, ...overrides });
let checks = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); checks++; }
function throws(fn) { assert.throws(fn); checks++; }

equal(n.publishedTime('2026-10-03'), Date.parse('2026-10-03T00:00:00+09:00'));
equal(n.publishedTime('2026-10-03T12:00'), Date.parse('2026-10-03T12:00:00+09:00'));
equal(n.publishedTime('2026-10-03T03:00:00Z'), n.publishedTime('2026-10-03T12:00:00+09:00'));
equal(n.japanDateTime('2026-10-02T15:00:00Z'), '2026-10-03T00:00:00+09:00');
for (const date of ['2026-02-30', '2026-13-01', '2026-01-01T24:01:00+09:00', '10/03/2026', null, 123]) equal(Number.isNaN(n.publishedTime(date)), true);
equal(n.status(item(), now), 'Published');
equal(n.status(item({ published: false }), now), 'Draft');
equal(n.status(item({ publishedAt: '2026-10-03T13:00:01+09:00' }), now), 'Scheduled');
equal(n.status(item({ publishedAt: n.japanDateTime(now - n.WINDOW_MS) }), now), 'Published');
equal(n.status(item({ publishedAt: n.japanDateTime(now - n.WINDOW_MS - 1) }), now), 'Expired');
equal(n.status(item({ publishedAt: n.japanDateTime(now - n.WINDOW_MS + 1) }), now), 'Published');
equal(n.status(item({ publishedAt: 'bad' }), now), 'Invalid');
equal(n.status(item({ pinned: true, publishedAt: '2026-09-01T00:00:00+09:00' }), now), 'Expired');
equal(n.nextRefreshDelay({ items: [item({ publishedAt: n.japanDateTime(now - n.WINDOW_MS) })] }, now), 1);
const rows = { items: [item({ id: 'old', publishedAt: '2026-10-01' }), item({ id: 'pin', pinned: true, publishedAt: '2026-10-02' }), item({ id: 'latest' }), item({ id: 'draft', published: false }), item({ id: 'future', publishedAt: '2026-10-04' }), item({ id: 'expired', publishedAt: '2026-08-01' }), null, { title: 'bad' }] };
equal(n.visibleItems(rows, now).map((row) => row.id), ['pin', 'latest', 'old']);
equal(n.visibleItems(rows, now, 2).length, 2);
equal(rows.items.length, 8); // No mutation or archive deletion.
const legacy = { date: '2026-10-02', title: '旧NEWS', url: 'https://twitter.com/ChonmageNiigata/status/123?ref=site', text: '保存済みの本文' };
equal(n.normalizeItem(legacy).id, 'x-123');
equal(n.normalizeItem(legacy).sourceUrl, 'https://x.com/ChonmageNiigata/status/123');
equal(n.normalizeItem(legacy).content, '保存済みの本文');
equal(n.normalizeItem(legacy).summary, '保存済みの本文');
equal(n.normalizeItem({ date: '2026-10-02', title: 'no body' }).content, '');
equal(n.normalizeItem({ date: '2026-10-02', title: 'same' }).id, n.normalizeItem({ date: '2026-10-02', title: 'same' }).id);
equal(n.itemsOf({ items: [null, { date: 'bad' }, legacy, legacy, item()] }).length, 2);
equal(n.normalizeItem(item({ content: '<img src=x onerror=alert(1)>' })).content, '<img src=x onerror=alert(1)>');
for (const url of ['javascript:alert(1)', 'data:image/svg+xml,bad', 'http://x.test/a.jpg', '//x.test/a.jpg', '../private.txt', 'https://u:p@x.test/a.jpg']) equal(n.imageUrl(url), '');
equal(n.imageUrl('images/photo.webp'), 'images/photo.webp');
equal(n.imageUrl('https://pbs.twimg.com/media/photo.jpg'), 'https://pbs.twimg.com/media/photo.jpg');
equal(n.xUrl('https://x.com.evil.test/user/status/1'), '');
equal(n.xUrl('https://twitter.com/user/status/1?s=20', true), 'https://x.com/user/status/1');
equal(n.xUrl('https://x.com/user', true), '');
equal(n.normalizeItem(item({ source: 'manual', sourceUrl: 'https://x.com/user/status/1' })).source, 'manual');
n.validateNews({ items: [legacy, item()] }); checks++;
n.validateNews({ items: [{ id: 'draft', publishedAt: '2026-10-03', title: '', published: false }] }); checks++;
for (const overrides of [{ publishedAt: 'bad' }, { theme: 'blue' }, { published: 'false' }, { image: 'javascript:alert(1)' }, { images: ['data:image/png,a'] }, { url: 'javascript:alert(1)' }, { title: 123 }]) throws(() => n.validateNews({ items: [item(overrides)] }));
throws(() => n.validateNews({ items: [item(), item()] }));
throws(() => n.validateNews({ items: 'bad' }));
const candidate = { url: 'https://x.com/ChonmageNiigata/status/123', newsText: 'イベントのお知らせ\n全文。\n中文 / English', publishedAt: '2026-10-03T12:00:00+09:00', images: ['https://pbs.twimg.com/media/a.jpg'] };
const imported = mergeNews({ items: [item({ id: 'archive', publishedAt: '2026-01-01' })] }, [candidate, candidate], now);
equal(imported.items.length, 2);
equal(imported.items[1].content, candidate.newsText);
equal(imported.items[1].image, candidate.images[0]);
equal(mergeNews(imported, [], now), imported); // Deleted original does not erase snapshot.
const refreshed = mergeNews(imported, [{ ...candidate, newsText: '更新された本文' }], now);
equal(refreshed.items.length, 2);
equal(refreshed.items[1].content, '更新された本文');
refreshed.items[1].autoUpdate = false; refreshed.items[1].content = '管理者の本文'; refreshed.items[1].published = false;
equal(mergeNews(refreshed, [candidate], now).items[1].content, '管理者の本文');
equal(mergeNews(refreshed, [candidate], now).items[1].published, false);
equal(mergeNews({ items: [], excludedSourceUrls: [candidate.url] }, [candidate], now).items.length, 0);
equal(mergeNews({ items: [] }, [{ ...candidate, publishedAt: '2026-01-01' }], now).items.length, 0);
equal(mergeNews({ items: [] }, [{ ...candidate, publishedAt: '2026-10-04' }], now).items.length, 0);
equal(newsFromCandidate({ ...candidate, url: 'https://x.com/other/status/123' }, now), null);
equal(newsFromCandidate({ text: 'unbounded reader window', url: candidate.url }, now), null);
const snowflake = ((BigInt(now - 60000) - 1288834974657n) << 22n).toString();
equal(n.publishedTime(newsFromCandidate({ ...candidate, url: 'https://x.com/ChonmageNiigata/status/' + snowflake, publishedAt: '' }, now).publishedAt), now - 60000);
const structured = [];
candidateFromObject({ id_str: '123', created_at: candidate.publishedAt, full_text: candidate.newsText, entities: { media: [{ media_url_https: candidate.images[0] }] } }, structured, new Set(), true);
equal(structured[0].newsText, candidate.newsText);
equal(structured[0].images, candidate.images);
const unrelated = []; candidateFromObject({ id_str: '123', text: 'お知らせ', user: { screen_name: 'other' } }, unrelated, new Set(), true); equal(unrelated.length, 0);
const rss = '<rss><item><title>結果発表</title><pubDate>Sat, 03 Oct 2026 03:00:00 GMT</pubDate><link>https://nitter.test/ChonmageNiigata/status/123</link><description><![CDATA[結果発表<br>中文 / English<img src="https://pbs.twimg.com/media/a.jpg">]]></description></item></rss>';
equal(rssCandidatesFromText(rss).length, 0); // Original schedule API remains schedule-only.
const posts = rssCandidatesFromText(rss, 'ChonmageNiigata', { includeNews: true });
equal(posts.length, 1);
equal(posts[0].newsText, '結果発表\n中文 / English');
equal(posts[0].images, candidate.images);
equal(newsFromCandidate(posts[0], now).theme, 'result');
// Exercise the actual free-fetch fallback chain, including unstructured profile HTML.
const originalFetch = globalThis.fetch;
const originalWarn = console.warn, originalLog = console.log;
try {
  console.warn = () => {}; console.log = () => {};
  const rssBody = '<rss><item><title>10月3日 13:00 OPEN</title><pubDate>Sat, 03 Oct 2026 03:00:00 GMT</pubDate><link>https://nitter.test/ChonmageNiigata/status/123</link><description>本日の全文</description></item></rss>';
  globalThis.fetch = async (url) => new Response(url.includes('syndication.') ? '' : url === 'https://x.com/ChonmageNiigata' ? '{"full_text":"10月3日 13:00 OPEN"}' : url.includes('twiiit.') ? rssBody : '', { status: url.includes('syndication.') ? 403 : 200 });
  const captured = await loadCandidates();
  equal(captured.length, 2);
  equal(captured[0].url, 'https://x.com/ChonmageNiigata');
  equal(captured[1].newsText, '10月3日 13:00 OPEN\n本日の全文');
  // A failed optional NEWS fallback must not discard a working schedule.
  globalThis.fetch = async (url) => new Response(url === 'https://x.com/ChonmageNiigata' ? '{"full_text":"10月3日 13:00 OPEN"}' : '', { status: url === 'https://x.com/ChonmageNiigata' ? 200 : 403 });
  equal((await loadCandidates()).length, 1);
  const malformed = []; candidateFromObject({ id_str: '123', text: 'OPEN', mediaDetails: {} }, malformed, new Set(), true); equal(malformed.length, 1);
} finally { globalThis.fetch = originalFetch; console.warn = originalWarn; console.log = originalLog; }
console.log('NEWS tests passed (' + checks + ' checks)');
