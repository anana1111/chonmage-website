import assert from 'node:assert/strict';
import { validateSchedule } from './validate-events.mjs';
import { mergeSchedule } from './merge-events.mjs';
import { normalizeScheduleText } from './normalize-events.mjs';
import { readerCandidatesFromText, rssCandidatesFromText } from './x-reader.mjs';

const base = {
  version: 2,
  date: '2026-10-02',
  open: '17:00',
  close: '23:30',
  status: 'open',
  latestXUrl: 'https://x.com/ChonmageNiigata',
  source: { type: 'x', url: 'https://x.com/ChonmageNiigata', mode: 'auto' },
  ringGame: { enabled: true, start: '17:00', title: 'RING GAME', description: 'OPENから参加者募集中' },
  events: []
};

validateSchedule(base);
validateSchedule({ ...base, events: [{ id: 'one', time: '18:00', type: 'free', title: 'FREE ROLL', theme: 'blue', description: 'details', facts: [] }] });
validateSchedule({ ...base, events: Array.from({ length: 8 }, (_, index) => ({ id: 'e' + index, time: String(10 + index).padStart(2, '0') + ':00', type: 'event', title: 'Event ' + index, theme: 'blue', description: 'details', facts: [] })) });
validateSchedule({ ...base, ringGame: { enabled: false } });
validateSchedule({ ...base, status: 'closed', events: [] });
validateSchedule({ ...base, close: undefined, schedulePostUrl: undefined, events: [] });

assert.throws(() => validateSchedule({ ...base, date: '2026-02-31' }));
assert.throws(() => validateSchedule({ ...base, latestXUrl: 'javascript:alert(1)' }));

const auto = { ...base, events: [{ id: 'one', time: '18:00', type: 'free', title: 'AUTO', theme: 'blue', description: 'details', facts: [] }] };
const manual = { version: 1, date: auto.date, fields: { open: '18:00' }, ringGame: {}, events: { one: { title: 'MANUAL' } }, extraEvents: [] };
const merged = mergeSchedule(auto, manual);
assert.equal(merged.open, '18:00');
assert.equal(merged.events[0].title, 'MANUAL');

const oldManual = { ...manual, date: '2026-10-01' };
assert.equal(mergeSchedule(auto, oldManual).events[0].title, 'AUTO');

const futureManual = { version: 1, date: '2026-10-03', replacement: { ...base, date: '2026-10-03', events: [] } };
assert.equal(mergeSchedule(auto, futureManual).date, '2026-10-03');


const sameDateReplacement = {
  version: 1,
  date: auto.date,
  replacement: { ...base, date: auto.date, open: '19:00', events: [] }
};
assert.equal(mergeSchedule(auto, sameDateReplacement).open, '19:00');

const newerAuto = { ...auto, date: '2026-10-04' };
assert.equal(mergeSchedule(newerAuto, futureManual).date, '2026-10-04');


const readerFixture = `Title: CHONMAGE

Markdown Content:
10月2日（金）
17:00 OPEN
18:00 FREE ROLL ENTRY ¥0
19:10 ふるまちトーナメント ENTRY ¥2,500
https://x.com/ChonmageNiigata/status/1234567890
`;
const readerRows = readerCandidatesFromText(readerFixture);
assert.equal(readerRows.length, 1);
assert.equal(readerRows[0].url, 'https://x.com/ChonmageNiigata/status/1234567890');
assert.match(readerRows[0].text, /17:00 OPEN/);
assert.deepEqual(
  readerCandidatesFromText("Title: X\n\nDon't miss what's happening\nPeople on X are the first to know."),
  []
);


const rssFixture = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[10月2日 17:00 OPEN / 18:00 FREE ROLL]]></title><link>https://nitter.example/ChonmageNiigata/status/9876543210</link><description><![CDATA[19:10 ふるまちトーナメント ENTRY ¥2,500]]></description></item></channel></rss>`;
const rssRows = rssCandidatesFromText(rssFixture);
assert.equal(rssRows.length, 1);
assert.equal(rssRows[0].url, 'https://x.com/ChonmageNiigata/status/9876543210');
assert.match(rssRows[0].text, /19:10 ふるまちトーナメント/);
assert.deepEqual(rssCandidatesFromText('<rss><item><title>hello</title></item></rss>'), []);


const dayOnlyRss = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[2日(金)17時OPEN✨]]></title><pubDate>Fri, 02 Oct 2026 08:05:00 GMT</pubDate><link>https://nitter.example/ChonmageNiigata/status/2468135790</link><description><![CDATA[🕠 フリーロール 18:00 ～<br>参加費無料＆1ドリンク付き🥤<br>※別途、施設利用料500円が必要です。<br>🕠 ふるまちトーナメント 19:10〜<br>Entry ¥2,500/ 25,000pt<br>リングゲームもOPENから参加者募集中🔥]]></description></item></channel></rss>`;
const dayOnlyRows = rssCandidatesFromText(dayOnlyRss);
assert.equal(dayOnlyRows.length, 1);
assert.match(dayOnlyRows[0].text, /^2026-10-02\n/);
const normalizedRealPost = normalizeScheduleText(dayOnlyRows[0].text, {
  now: new Date('2026-10-02T11:30:00Z'),
  profileUrl: 'https://x.com/ChonmageNiigata',
  sourceUrl: dayOnlyRows[0].url
});
assert.equal(normalizedRealPost.open, '17:00');
assert.equal(normalizedRealPost.events.length, 2);
assert.equal(normalizedRealPost.events[0].type, 'free');
assert.equal(normalizedRealPost.events[0].facts.find((row) => row.label === 'ENTRY').value, '¥0');
assert.equal(normalizedRealPost.events[0].facts.find((row) => row.label === '施設利用料').value, '500円');
assert.equal(normalizedRealPost.events[1].facts.find((row) => row.label === 'STARTING STACK').value, '25,000pt');
assert.equal(normalizedRealPost.ringGame.enabled, true);

console.log('schedule data tests passed');
