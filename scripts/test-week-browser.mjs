// Browser QA for 週間スケジュール: the public 「今週のスケジュール」 card, the home card's
// 表示時間帯, and the admin calendar (view, edit, week.json export). No live-data writes.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { weekDaySchedule } from './week-schedule.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv.slice(2).find((value) => !value.startsWith('--'));
if (shots) fs.mkdirSync(shots, { recursive: true });

const weekday = [
  { start: '00:00', end: '17:00', status: 'open', open: '17:00', mainTime: '19:10', mainTitle: 'ふるまちdeトナメ', latestText: '本日17:00 OPEN' },
  { start: '17:00', end: '19:10', status: 'ongoing', open: '17:00', mainTime: '19:10', mainTitle: 'ふるまちdeトナメ', latestText: 'フリーロール受付中', latestUrl: 'https://x.com/ChonmageNiigata/status/1' },
  { start: '23:30', end: '24:00', status: 'ended', open: '17:00', latestText: '明日は13:00 OPEN' },
];
const event = (time, title, entry, reentry) => ({ time, title, entry, reentry });
const day = (date, open, events, cards) => ({ date, open, close: open ? '23:30' : '', ringGame: Boolean(open), events, ...(cards ? { cards } : {}) });
const week = { version: 1, sourceUrl: 'https://x.com/ChonmageNiigata/status/2106713700346515720', notes: ['施設利用料（500円）とワンドリンクオーダー制となっております。', '※日程や内容については変更する場合があります。'], days: [
  day('2026-10-05', '17:00', [event('18:00', 'THE DAILY', '¥1,500〜', '¥2,000')], weekday),
  day('2026-10-06', '', []),
  day('2026-10-07', '17:00', [event('18:00', 'フリーロール', '無料', '¥500'), event('19:10', 'PLOトーナメント', '¥3,000', '¥3,000')], weekday),
  day('2026-10-08', '17:00', [event('18:00', 'フリーロール', '無料', '¥500')], weekday),
  day('2026-10-09', '17:00', [event('18:00', 'フリーロール', '無料', '¥500'), event('19:10', 'ふるまちdeトナメ', '¥2,500', '¥2,500')], weekday),
  day('2026-10-10', '13:00', [event('13:30', 'フリーロール', '無料', '¥500'), event('15:30', 'ふるまちdeトナメ(deep)', '¥3,500', '¥3,500')]),
  day('2026-10-11', '13:00', [event('20:00', 'ふるまちターボ', '¥1,500', '¥1,500')]),
] };
const events = weekDaySchedule(week, '2026-10-09', new Date('2026-10-09T00:00:00Z'));

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
let checks = 0;
const yes = (value, label) => { assert.ok(value, label); checks++; };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };

async function open(url, { at, width = 390, height = 900, weekData = week, eventsData = events } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, timezoneId: 'Asia/Tokyo', acceptDownloads: true });
  await context.addInitScript(() => { try { localStorage.setItem('chonmage-admin-unlock', '9e06018654272ea14463bc3c1652fd88ac344865948d75336ccf7b8f21c04360'); sessionStorage.setItem('chonmage-preloader-seen', '1'); } catch {} });
  const page = await context.newPage(); const errors = [];
  await page.clock.install({ time: new Date(at) });
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 200, contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/plain', body: '' }));
  await page.route(/\/data\/events(?:\.auto)?\.json/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(typeof eventsData === 'function' ? eventsData() : eventsData) }));
  await page.route(/\/data\/events\.manual\.json/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, date: events.date }) }));
  await page.route(/\/data\/week\.json/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(weekData) }));
  await page.goto(origin + url, { waitUntil: 'load' });
  await page.clock.runFor(2500);
  return { page, errors, context };
}
const heroText = (page) => page.evaluate(() => ({
  status: document.getElementById('hero-business-status-text').textContent,
  main: document.querySelector('[data-hero-event="main"] strong').textContent,
  latest: document.querySelector('.schedule-x strong').textContent,
  href: document.querySelector('.schedule-x').getAttribute('href'),
}));

// ---------- public page: 今週のスケジュール ----------
for (const width of [320, 390, 768, 1024, 1440]) {
  const { page, errors, context } = await open('/', { at: '2026-10-09T10:00:00+09:00', width });
  yes(await page.isVisible('#week'), `week card visible at ${width}px`);
  equal(await page.$$eval('.week-date strong', (rows) => rows.map((row) => row.textContent)), ['9', '10', '11'], 'past days are gone; today and later stay');
  equal(await page.textContent('.week-day.is-today .week-date strong'), '9', 'today marked');
  equal(await page.$$eval('.week-day.is-today .week-game-entry', (rows) => rows.map((row) => [...row.children].map((item) => item.querySelector('dt').textContent + ' ' + item.querySelector('dd').textContent))), [['ENTRY 無料', 'RENTRY ¥500', '最終受付 18:40'], ['ENTRY ¥2,500', 'RENTRY ¥2,500', '最終受付 20:50']], 'ENTRY, RENTRY and the usual last entry from the time library');
  // Prices stay folded until the game is tapped.
  const firstGame = '.week-day.is-today .week-game-details';
  yes(!(await page.isVisible(firstGame + ' .week-game-entry')), 'prices folded by default');
  await page.click(firstGame + ' summary');
  yes(await page.isVisible(firstGame + ' .week-game-entry'), 'tap opens prices');
  // 3 days left: 3 equal columns, side by side above the phone layout.
  const lefts = await page.$$eval('.week-day', (rows) => rows.map((row) => Math.round(row.getBoundingClientRect().left)));
  equal(new Set(lefts).size, width <= 700 ? 1 : 3, `3 days share the row at ${width}px`);
  equal(await page.$$eval('.week-notes li', (rows) => rows.map((row) => row.textContent)), ['施設利用料（500円）とワンドリンクオーダー制となっております。', '日程や内容については変更する場合があります。'], 'notes under the table');
  equal(await page.getAttribute('.okibake a', 'href'), 'tel:08014700011', '置きバケ line calls the shop');
  yes(await page.isVisible('.okibake'), `置きバケ line visible at ${width}px`);
  if (width === 390) {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await page.click('.okibake-copy');
    equal(await page.evaluate(() => navigator.clipboard.readText()), '080-1470-0011', 'copy button copies the number');
    equal(await page.textContent('.okibake-copied'), 'コピーしました', 'copy is confirmed');
  }
  equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `no horizontal overflow at ${width}px`);
  if (shots) { const el = await page.$('#week'); await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: path.join(shots, `week-public-${width}.png`) }); }
  equal(errors, [], 'no console errors');
  await context.close();
}
{
  // Early in the week a closed day is listed as 休業, and the range starts today.
  const { page, context } = await open('/', { at: '2026-10-06T10:00:00+09:00', width: 1440 });
  equal(await page.$$eval('.week-date strong', (rows) => rows.length), 6, 'from Tuesday on');
  const columns = await page.$$eval('.week-day', (rows) => new Set(rows.map((row) => Math.round(row.getBoundingClientRect().left))).size);
  equal(columns, 6, '6 days left = 6 columns');
  yes((await page.textContent('.week-day.is-closed')).includes('休業'), 'closed day says 休業');
  equal(await page.textContent('.week-range'), '10.06 – 10.11', 'range starts today');
  // Just after midnight the finished day goes away without reloading.
  await page.clock.runFor(14 * 3600000);
  equal(await page.$$eval('.week-date strong', (rows) => rows.length), 5, 'Tuesday drops at midnight');
  await context.close();
}
{
  // The shop changed today's games on X: the week card's today row follows the daily post,
  // and an open page picks up a later change without reloading.
  let daily = { ...events, schedulePostUrl: 'https://x.com/ChonmageNiigata/status/9', source: { type: 'x', url: 'https://x.com/ChonmageNiigata/status/9', mode: 'auto' },
    events: [{ ...events.events[0], title: 'フリーロール 🕕', facts: [{ label: 'ENTRY', value: '¥0' }, { label: '最終受付', value: '18:30' }] },
      { ...events.events[1], time: '19:00', title: 'ふるまちトーナメント', facts: [{ label: 'ENTRY', value: '¥2,500' }] }] };
  const { page, errors, context } = await open('/', { at: '2026-10-09T10:00:00+09:00', width: 1440, eventsData: () => daily });
  const todayGames = () => page.$$eval('.week-day.is-today .week-game:not(.is-ring)', (rows) => rows.map((row) => row.querySelector('.week-game-time').textContent + ' ' + row.querySelector('.week-game-title').textContent));
  equal(await todayGames(), ['18:00 フリーロール', '19:00 ふるまちトーナメント'], 'today row follows the X post');
  await page.click('.week-day.is-today .week-game-details summary');
  yes((await page.textContent('.week-day.is-today .week-game-entry')).includes('最終受付18:30'), 'last entry in the details');
  equal(await page.$$eval('.week-day:not(.is-today) .week-date strong', (rows) => rows.map((row) => row.textContent)), ['10', '11'], 'other days stay from the week picture');
  daily = { ...daily, events: [daily.events[0], { ...daily.events[1], time: '20:00' }] };
  await page.clock.runFor(5 * 60000 + 2000);
  equal(await todayGames(), ['18:00 フリーロール', '20:00 ふるまちトーナメント'], 'open page picks up a changed post');
  await context.close();
}
{
  // An old week is never shown as this week.
  const { page, context } = await open('/', { at: '2026-10-13T10:00:00+09:00' });
  yes(!(await page.isVisible('#week')), 'old week hidden');
  await context.close();
}

// ---------- public page: 表示時間帯 drive the home card ----------
{
  const { page, errors, context } = await open('/', { at: '2026-10-09T10:00:00+09:00', width: 1440 });
  equal(await heroText(page), { status: '本日営業', main: '19:10 ふるまちdeトナメ', latest: '本日17:00 OPEN ↗', href: 'https://x.com/ChonmageNiigata' }, 'morning card');
  if (shots) await (await page.$('.hero-schedule')).screenshot({ path: path.join(shots, 'hero-1000.png') });
  // The open page switches by itself at 17:00 and back to the automatic card at 19:10.
  await page.clock.runFor(7 * 3600000 + 60000);
  equal(await heroText(page), { status: '開催中', main: '19:10 ふるまちdeトナメ', latest: 'フリーロール受付中 ↗', href: 'https://x.com/ChonmageNiigata/status/1' }, 'card switches at 17:00');
  if (shots) await (await page.$('.hero-schedule')).screenshot({ path: path.join(shots, 'hero-1701.png') });
  await page.clock.runFor(2 * 3600000 + 10 * 60000);
  const auto = await heroText(page);
  equal([auto.status, auto.latest], ['営業中', 'Xで確認 ↗'], 'outside the windows the automatic card returns');
  await page.clock.runFor(4 * 3600000 + 20 * 60000); // 23:31
  equal((await heroText(page)).latest, '明日は13:00 OPEN ↗', '23:30–24:00 window');
  equal(errors, [], 'no console errors');
  await context.close();
}
{
  // A date's heroOverrides (ホーム's manual card) still wins over the week's windows.
  const context2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Tokyo' });
  const page2 = await context2.newPage();
  await page2.clock.install({ time: new Date('2026-10-09T18:00:00+09:00') });
  await page2.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 200, body: '' }));
  await page2.route(/\/data\/events\.json/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...events, heroOverrides: { '2026-10-09': { status: 'closed', open: '', mainTime: '', mainTitle: '', latestText: '臨時休業', latestUrl: '' } } }) }));
  await page2.route(/\/data\/week\.json/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(week) }));
  await page2.goto(origin + '/', { waitUntil: 'load' }); await page2.clock.runFor(2500);
  equal((await heroText(page2)).latest, '臨時休業 ↗', 'heroOverrides beats the week window');
  await context2.close();
}
{
  // An invalid card is ignored instead of breaking the page.
  const broken = JSON.parse(JSON.stringify(week));
  broken.days[4].cards = [{ start: '17:00', end: '16:00', status: 'open', open: '17:00', latestText: 'bad' }];
  const { page, errors, context } = await open('/', { at: '2026-10-09T16:30:00+09:00', width: 1440, weekData: broken });
  equal((await heroText(page)).latest, 'Xで確認 ↗', 'invalid card ignored');
  equal(errors, [], 'no console errors with an invalid card');
  await context.close();
}

// ---------- admin: view, edit, export ----------
for (const width of [390, 1440]) {
  const { page, errors, context } = await open('/admin/#week', { at: '2026-10-09T18:20:00+09:00', width, height: width < 600 ? 900 : 1200 });
  await page.waitForSelector('.week-calendar');
  equal(await page.$$eval('.week-col', (cols) => cols.length), 7, 'admin calendar has 7 days');
  yes((await page.textContent('.week-col.is-today')).includes('ふるまちdeトナメ'), 'today column lists events');
  equal(await page.$$eval('.week-timeline-block.is-active', (blocks) => blocks.length), 1, 'the card shown now is marked');
  equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `admin no horizontal overflow at ${width}px`);
  if (shots) await page.screenshot({ path: path.join(shots, `admin-week-${width}.png`), fullPage: true });
  await page.click('.week-col.is-today .week-col-foot button');
  await page.clock.runFor(300);
  yes(await page.isVisible('#week-dialog'), 'day editor opens');
  const end = '[data-week-path="days.4.cards.1.end"]';
  await page.fill(end, '16:00');
  yes((await page.textContent('[data-week-error="days.4.cards.1.end"]')).includes('開始より後'), 'end before start is shown as an error');
  equal(await page.isDisabled('#week-export'), true, 'export blocked while invalid');
  await page.fill(end, '19:30');
  await page.fill('[data-week-path="days.4.cards.1.latestText"]', 'ただいまフリーロール');
  yes((await page.textContent('.week-edit-card:nth-of-type(2) .week-card-preview')).includes('ただいまフリーロール'), 'card preview follows typing');
  await page.click('#week-dialog .drawer-section:last-of-type .button.dashed');
  equal(await page.$$eval('#week-dialog .week-edit-card', (cards) => cards.length), 4, 'a window can be added');
  await page.click('#week-dialog .week-edit-card:last-of-type .text-button.danger');
  if (shots && width === 1440) await page.screenshot({ path: path.join(shots, 'admin-week-dialog.png') });
  await page.click('#close-week-dialog');
  await page.clock.runFor(300);
  // The dialog's close event redraws the panel; type into the new notes field, not the old one.
  await page.waitForFunction(() => !document.getElementById('week-dialog').open);
  await page.waitForTimeout(100);
  await page.fill('#week-notes', '施設利用料（500円）とワンドリンクオーダー制となっております。\n\n※変更する場合があります。');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#week-export')]);
  const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  equal(exported.days[4].cards[1], { start: '17:00', end: '19:30', status: 'ongoing', open: '17:00', mainTime: '19:10', mainTitle: 'ふるまちdeトナメ', latestText: 'ただいまフリーロール', latestUrl: 'https://x.com/ChonmageNiigata/status/1' }, 'exported window');
  equal(exported.days[1].cards, undefined, 'a day without windows has no cards key');
  equal(exported.days.length, 7, 'all days exported');
  equal(exported.notes, ['施設利用料（500円）とワンドリンクオーダー制となっております。', '変更する場合があります。'], 'notes exported one per line');
  // The export is a week the public page and Actions accept.
  exported.days.forEach((row) => weekDaySchedule(exported, row.date));
  equal(errors, [], 'no admin console errors');
  await context.close();
}

await browser.close(); server.close();
console.log(`week browser tests passed (${checks} checks)`);
