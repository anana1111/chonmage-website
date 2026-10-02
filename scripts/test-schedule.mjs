import assert from 'node:assert/strict';
import { validateSchedule } from './validate-events.mjs';
import { mergeSchedule } from './merge-events.mjs';
import { readerCandidatesFromText } from './x-reader.mjs';

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

console.log('schedule data tests passed');
