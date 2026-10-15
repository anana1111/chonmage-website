// Checks for scripts/generate-schedule-page.mjs. Usage: node scripts/test-schedule-page.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkWeek, generate, pageHtml, scheduleDays, tokyoDate, usableEvents } from './generate-schedule-page.mjs';

const week = {
  sourceUrl: 'https://x.com/ChonmageNiigata',
  notes: ['施設利用料（500円）とワンドリンクオーダー制'],
  promos: [{ dates: ['2026-10-17'], text: '来場者特典 <b>' }],
  days: [
    { date: '2026-10-15', open: '17:00', close: '23:30', ringGame: true, events: [{ time: '18:00', title: 'OLD GAME', entry: '¥1', reentry: '¥1' }] },
    { date: '2026-10-16', open: '17:00', close: '23:30', ringGame: true, events: [{ time: '18:00', title: 'フリーロール', entry: '無料', reentry: '¥500' }] },
    { date: '2026-10-17', open: '13:00', close: '23:30', ringGame: true, events: [{ time: '13:30', title: 'WEEKEND', entry: '¥3,500' }] },
    { date: '2026-10-18', open: '', events: [] },
  ],
};
const events = {
  date: '2026-10-16', open: '17:00', close: '23:30', status: 'open', ringGame: { enabled: true },
  events: [{ time: '19:10', title: 'X POST GAME', facts: [{ label: 'ENTRY', value: '¥3,000' }, { label: 'LATE REG', value: '21:00' }] }],
};
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };

ok(tokyoDate(new Date('2026-10-15T15:30:00Z')) === '2026-10-16', 'JST date after midnight');

// Seven dates from today; past days are left out; today's daily post wins over the week picture.
const days = scheduleDays(week, events, '2026-10-16');
assert.deepEqual(days.map((d) => d.date), ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']); checks++;
ok(days[0].games[0].title === 'X POST GAME', 'daily post used for today');
assert.deepEqual(days[0].games[0].prices, [['参加費', '¥3,000'], ['最終受付', '21:00']]); checks++;
ok(days[2].closed, 'a day without open is closed');
ok(days[3].unknown && days[6].unknown, 'dates past the week picture are marked as not announced');
ok(scheduleDays(week, { ...events, date: '2026-10-15' }, '2026-10-16')[0].games[0].title === 'フリーロール', 'stale events.json ignored');

const html = pageHtml({ week, events, today: '2026-10-16' });
ok(!html.includes('OLD GAME'), 'past day not shown');
ok(html.includes('本日 10/16（金）') && html.includes('10/22（木）'), 'today and the 7th date shown with weekday');
ok(html.includes('休業日です。') && html.includes('まだ発表されていません'), 'closed and unannounced days shown');
ok(html.includes('施設利用料は500円です') && html.includes('ドリンクが1杯付きます') && html.includes('ワンドリンクオーダー制'), 'fee and drink rules shown');
ok(html.includes('来場者特典 &lt;b&gt;'), 'promo escaped');
ok(html.includes('"dateModified": "2026-10-16"'), 'dateModified is today');
ok(html.includes('G-LW40HNQ1PL'), 'GA4 built in');
ok((html.match(/<script\b/g) || []).length === 3, 'readable without JavaScript: only the GA4 tag and JSON-LD');

// Bad input is rejected; bad events.json falls back to the week picture.
assert.throws(() => checkWeek(null)); checks++;
assert.throws(() => checkWeek({ days: [{ date: '2026-10-16', open: '25:00' }] })); checks++;
assert.throws(() => checkWeek({ days: [{ date: '2026-10-16', open: '17:00', events: [{ time: '18:00' }] }] })); checks++;
ok(usableEvents({ date: '2026-10-16', events: [{ time: 'x', title: 'a' }] }) === null, 'broken events.json ignored');

// generate() keeps the previous page when week.json is broken.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schedule-test-'));
const cwd = process.cwd();
try {
  fs.mkdirSync(path.join(dir, 'data'));
  fs.mkdirSync(path.join(dir, 'schedule'));
  fs.writeFileSync(path.join(dir, 'schedule', 'index.html'), 'LAST GOOD PAGE');
  fs.writeFileSync(path.join(dir, 'data', 'week.json'), '{ broken');
  process.chdir(dir);
  // OUT is resolved from the cwd at import time, so check through a fresh import.
  const fresh = await import('./generate-schedule-page.mjs?keep=' + Date.now());
  ok(fresh.generate(new Date('2026-10-16T03:00:00Z')) === false, 'generate reports no write');
  ok(fs.readFileSync(path.join(dir, 'schedule', 'index.html'), 'utf8') === 'LAST GOOD PAGE', 'previous page kept');
  fs.writeFileSync(path.join(dir, 'data', 'week.json'), JSON.stringify(week));
  ok(fresh.generate(new Date('2026-10-16T03:00:00Z')) === true, 'good data writes the page');
  ok(fs.readFileSync(path.join(dir, 'schedule', 'index.html'), 'utf8').includes('フリーロール'), 'page rewritten from good data');
} finally {
  process.chdir(cwd);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`schedule page tests passed (${checks} checks)`);
