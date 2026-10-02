import assert from 'node:assert/strict';
import { validateSchedule } from './validate-events.mjs';
import { mergeSchedule } from './merge-events.mjs';

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

console.log('schedule data tests passed');
