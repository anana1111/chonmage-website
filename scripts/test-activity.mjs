import assert from 'node:assert/strict';
import '../activity.js';
const a = globalThis.ChonmageActivity;
export const fixture = (changes = {}) => ({ version: 2, date: '2026-10-04', status: 'open', open: '13:00', close: '23:00', latestXUrl: 'https://x.com/ChonmageNiigata', summary: ['本日の開催情報です。'],
  ringGame: { enabled: true, start: '13:00', title: 'RING GAME', description: '途中参加OK' },
  events: [
    { id: 'free-roll', time: '13:30', title: 'フリーロール', type: 'free', description: '初めての方もご参加ください。', facts: [{ label: '最終受付', value: '14:00' }, { label: 'ENTRY', value: '¥0' }, { label: '施設利用料', value: '¥500' }] },
    { id: 'pineapple', time: '15:30', title: '超クレイジーパイナップル', description: 'ゲームのご案内', facts: [{ label: 'LATE REG', value: '16:00' }] },
    { id: 'furumachi', time: '19:10', title: 'ふるまちトナメ', description: '夜のトーナメント', facts: [{ label: '最終受付', value: '19:40' }, { label: 'ENTRY', value: '¥2,500' }, { label: 'STACK', value: '25,000pt' }] },
  ], ...changes });
let checks = 0;
const equal = (got, expected) => { assert.deepEqual(got, expected); checks++; };
const sched = a.adaptSchedule(fixture());
for (const [time, type, remaining] of [['12:00', 'before-open', 60], ['13:17', 'open-ring', undefined], ['13:32', 'tournament-open', 28], ['13:42', 'tournament-open', 18], ['13:55', 'last-call', 5], ['14:05', 'open-ring', undefined], ['23:10', 'after-close', undefined]]) {
  const state = a.getPrimaryState(a.timeToMinutes(time), sched);
  equal(state.type, type); equal(state.remaining, remaining);
  const secondary = a.secondaryItems(state, sched, a.timeToMinutes(time));
  equal(secondary.some((event) => event.kind !== 'ring' && event.id === state.event?.id), false);
  if (type === 'after-close') equal(secondary, []);
}
for (const [time, status] of [['13:29', 'upcoming'], ['13:30', 'registering'], ['13:49', 'registering'], ['13:50', 'last-call'], ['13:59', 'last-call'], ['14:00', 'running'], ['16:59', 'running'], ['17:00', 'finished']]) equal(a.getEventStatus(sched.events[0], a.timeToMinutes(time)).status, status);
const overlap = a.adaptSchedule(fixture({ events: [...fixture().events, { id: 'early-cutoff', time: '13:35', title: '受付が先に終わる大会', facts: [{ label: '最終受付', value: '13:50' }] }] }));
equal(a.getPrimaryState(13 * 60 + 42, overlap).event.id, 'early-cutoff');
equal(a.getPrimaryState(13 * 60 + 42, overlap).type, 'last-call');
const noRing = a.adaptSchedule(fixture({ ringGame: { enabled: false } }));
equal(a.getPrimaryState(13 * 60 + 17, noRing).type, 'next-event');
equal(a.getPrimaryState(22 * 60 + 50, noRing).type, 'open-info');
equal(a.getPrimaryState(23 * 60, noRing).type, 'after-close');
equal(a.getPrimaryState(12 * 60, a.adaptSchedule(fixture({ status: 'closed' }))).type, 'closed-day');
equal(a.getPrimaryState(16 * 60, a.adaptSchedule(fixture({ events: [], ringGame: { enabled: false } }))).type, 'open-info');
equal(a.getPrimaryState(14 * 60, a.adaptSchedule(fixture({ events: [], ringGame: { enabled: true, start: '16:00' } }))).type, 'open-info');
equal(a.getPrimaryState(16 * 60, a.adaptSchedule(fixture({ events: [], ringGame: { enabled: true, start: '16:00' } }))).type, 'open-ring');
for (const close of ['25:00', '01:00']) {
  const overnight = a.adaptSchedule(fixture({ open: '17:00', close, events: [{ id: 'late', time: '23:30', title: '深夜のゲーム', facts: [{ label: '最終受付', value: '00:30' }] }] }));
  equal(overnight.close, 1500); equal(overnight.events[0].registrationEnd, 1470);
  equal(a.getPrimaryState(1465, overnight).type, 'last-call');
  equal(a.getPrimaryState(1500, overnight).type, 'after-close');
}
for (const facts of [[], [{ label: '置きバケ連絡締切', value: '14:00' }], [{ label: '最終受付', value: 'invalid' }], [{ label: '最終受付', value: '13:00' }]]) {
  const event = a.adaptSchedule(fixture({ events: [{ id: 'x', time: '13:30', title: '受付不明', facts }] })).events[0];
  equal(event.registrationEnd, null); equal(a.getEventStatus(event, 13 * 60 + 40).status, 'running');
}
const explicitEnd = a.adaptSchedule(fixture({ events: [{ id: 'x', time: '13:30', end: '14:30', title: '明示された終了時刻', facts: [{ label: '最終受付', value: '14:00' }] }] })).events[0];
equal(a.getEventStatus(explicitEnd, 14 * 60 + 30).status, 'finished');
equal(a.adaptSchedule(fixture({ events: [{ time: 'bad', title: 'bad' }, { time: '13:30', hidden: true }] })).events, []);
equal(a.adaptSchedule(fixture({ close: undefined })).close, null);
equal(a.getPrimaryState(23 * 60 + 10, a.adaptSchedule(fixture({ close: undefined }))).type, 'open-ring');
for (const bad of [null, '', '13:60', '48:00', 'x', '<script>']) equal(a.timeToMinutes(bad), null);
equal(a.formatRemaining(60), '1時間'); equal(a.formatRemaining(61), '1時間1分'); equal(a.formatRemaining(5), '5分');
equal(a.nextMinuteDelay(59999), 21); equal(a.nextMinuteDelay(120000), 60020);
const original = fixture(), serialized = JSON.stringify(original); a.adaptSchedule(original); equal(JSON.stringify(original), serialized);
equal(a.adaptSchedule(fixture({ events: [{ time: '13:30', title: '電話で確認', link: { label: '電話', url: 'tel:025-123-4567' } }] })).events[0].link.url, 'tel:025-123-4567');
equal(a.adaptSchedule(fixture({ events: [{ time: '13:30', title: '不正なリンク', link: { url: 'javascript:alert(1)' } }] })).events[0].link.url, 'https://x.com/ChonmageNiigata');
// 最終受付の時間库: FREE ROLL 土日祝 (13:00 OPEN) 14:30 / weekdays 18:40, learned `after` rules.
{
  const core = (await import('../week-core.js')).default || globalThis.ChonmageWeek;
  const { learnLastEntries } = await import('./learn-last-entry.mjs');
  const library = { version: 1, rules: [{ title: 'THE DAILY', after: 130 }] };
  equal(core.usualLastEntry({ time: '13:30', title: 'フリーロール 🕜' }, '13:00', null), '14:30');
  equal(core.usualLastEntry({ time: '18:00', title: 'フリーロール' }, '17:00', null), '18:40');
  equal(core.usualLastEntry({ time: '19:10', title: 'ふるまちdeトナメ' }, '17:00', library), '');
  equal(core.usualLastEntry({ time: '18:00', title: 'THE DAILY 🕕' }, '17:00', library), '20:10');
  equal(core.usualLastEntry({ time: '23:00', title: 'THE DAILY' }, '17:00', library), '01:10');
  const enriched = core.withLastEntries(fixture({ events: [{ id: 'fr', time: '13:30', title: 'フリーロール', type: 'free' }, { id: 'd', time: '18:00', title: 'THE DAILY', facts: [{ label: 'LATE REG', value: '20:30' }] }] }), library);
  equal(enriched.events[0].facts, [{ label: '最終受付', value: '14:30' }]);
  equal(enriched.events[1].facts, [{ label: 'LATE REG', value: '20:30' }]);
  equal(a.adaptSchedule(enriched).events[0].registrationEnd, 14 * 60 + 30);
  // Learning keeps fixed rules and records `after` for tournaments with LATE REG.
  const learned = learnLastEntries({ version: 1, rules: [{ title: 'フリーロール', weekday: '18:40', holiday: '14:30', fixed: true }] },
    { date: '2026-10-12', source: { url: 'https://x.com/ChonmageNiigata/status/1' }, events: [
      { time: '13:30', title: 'フリーロール', type: 'free', facts: [{ label: '最終受付', value: '14:00' }] },
      { time: '19:10', title: 'ふるまちdeトナメ 🕖', facts: [{ label: '最終受付', value: '21:00' }] }] });
  equal(learned.rules.map((rule) => [rule.title, rule.after ?? rule.weekday]), [['フリーロール', '18:40'], ['ふるまちdeトナメ', 110]]);
  equal(learnLastEntries(learned, { events: [] }), learned);
}
console.log(`Activity state tests passed (${checks} checks)`);
