import assert from 'node:assert/strict';
import { validateSchedule } from './validate-events.mjs';
import { mergeSchedule } from './merge-events.mjs';
import { normalizeScheduleText } from './normalize-events.mjs';
import { readerCandidatesFromText, rssCandidatesFromText } from './x-reader.mjs';
import { pickSchedule, cleanPostText, candidateFromObject, decodeJsonString } from './fetch-events.mjs';
import { validateNews, scheduleMinutes } from './schedule-core.mjs';

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


// --- crawl simulation -------------------------------------------------------
const friday = new Date('2026-10-02T08:30:00Z'); // 17:30 JST, Friday
const realPost = [
  '2日(金)17時OPEN✨',
  '🕠 フリーロール 18:00 ～',
  '参加費無料＆1ドリンク付き🥤',
  '※別途、施設利用料500円が必要です。',
  '🕠 ふるまちトーナメント 19:10〜',
  'Entry ¥2,500/ 25,000pt',
  'リングゲームもOPENから参加者募集中🔥',
].join('\n');

// clean() must keep the line breaks that the parser reads row by row.
assert.equal(cleanPostText('a  b\n\n\n\nc\u3000 d'), 'a b\n\nc d');
const syndicationRows = [];
candidateFromObject({ props: { timeline: [{ id_str: '111', full_text: realPost }] } }, syndicationRows);
assert.equal(syndicationRows.length, 1);
assert.match(syndicationRows[0].text, /\n🕠 フリーロール/);
const fromSyndication = pickSchedule(syndicationRows, { now: friday, warn: () => {} });
assert.equal(fromSyndication.open, '17:00');
assert.equal(fromSyndication.events.length, 2, 'day-only post via syndication keeps both events');
assert.equal(fromSyndication.schedulePostUrl, 'https://x.com/ChonmageNiigata/status/111');

// Escaped quotes inside profile-HTML JSON strings decode correctly.
assert.equal(decodeJsonString('say \\"hi\\"\\n18:00'), 'say "hi"\n18:00');

// A post that throws is skipped and the next good post is still used.
const warnings = [];
const picked = pickSchedule([
  { text: realPost, url: 'javascript:alert(1)' },
  { text: '昨日の結果です。ありがとうございました', url: undefined },
  { text: realPost, url: 'https://x.com/ChonmageNiigata/status/222' },
], { now: friday, warn: (message) => warnings.push(message) });
assert.equal(picked.schedulePostUrl, 'https://x.com/ChonmageNiigata/status/222');
assert.equal(warnings.length, 1);
assert.equal(pickSchedule([{ text: 42 }, null, { text: 'hello', url: 'https://x.com/a' }], { now: friday, warn: () => {} }), null);

// 25時CLOSE and after-midnight events.
const lateNight = normalizeScheduleText('2日(金)17時OPEN〜25時CLOSE\n24時半 ディープスタック\n19:10 ふるまちトーナメント', { now: friday });
assert.equal(lateNight.open, '17:00');
assert.equal(lateNight.close, '01:00');
assert.deepEqual(lateNight.events.map((event) => event.time), ['19:10', '00:30']);
const closeLine = normalizeScheduleText('2日(金)\n17:00 OPEN\n25:00 CLOSE', { now: friday });
assert.equal(closeLine.close, '01:00');
assert.equal(closeLine.events.length, 0);
assert.ok(scheduleMinutes('01:00', '17:00') > scheduleMinutes('23:30', '17:00'));
assert.ok(scheduleMinutes('16:00', '17:00') < scheduleMinutes('17:00', '17:00'));

// 「17:00まで」 deadlines are not the closing time.
const deadline = normalizeScheduleText('2日(金)17時OPEN\n19:00 ランキング王者決定戦\n置きバケ連絡 17:00まで', { now: friday });
assert.equal(deadline.close, undefined);
assert.equal(deadline.events.length, 1);
const lateReg = normalizeScheduleText('2日(金)17時OPEN\n19:10 ふるまちトーナメント\nEntry ¥2,500\n最終受付 21:00', { now: friday });
assert.equal(lateReg.events.length, 1);
assert.equal(lateReg.events[0].facts.find((row) => row.label === '最終受付').value, '21:00');

// 「3時間」 is a duration, never a clock time.
const duration = normalizeScheduleText('2日(金)17時OPEN\n18:00 フリーロール\n最大3時間・24時間前までに予約', { now: friday });
assert.equal(duration.events.length, 1);
assert.doesNotMatch(JSON.stringify(duration), /03:00間|00:00間/);

// Duplicate generated IDs are made unique instead of failing validation.
const dup = normalizeScheduleText('2日(金)17時OPEN\n19:00 ふるまちトーナメント\n19:00 ふるまちトーナメント', { now: friday });
assert.deepEqual(dup.events.map((event) => event.id), ['event-1900', 'event-1900-2']);

// Closed-day posts are never treated as open.
const saturday = new Date('2026-10-03T03:00:00Z');
const closedPost = normalizeScheduleText('3日(土)は臨時休業です。\n営業再開は公式Xでお知らせします。', { now: saturday });
assert.equal(closedPost.status, 'closed');
assert.equal(closedPost.events.length, 0);
assert.equal(closedPost.open, undefined);
const twoDays = '3日(土)は臨時休業です🙇\n4日(日)は13時OPEN\n13:30 フリーロール';
assert.equal(normalizeScheduleText(twoDays, { now: saturday }).status, 'closed');
const sundayResult = normalizeScheduleText(twoDays, { now: new Date('2026-10-04T03:00:00Z') });
assert.equal(sundayResult.status, 'open');
assert.equal(sundayResult.open, '13:00');
assert.equal(sundayResult.events.length, 1);
// 「CLOSE」 as a closing time is not a closed day.
assert.equal(lateNight.status, 'open');
// Wrong weekday for a day-only date is rejected.
assert.equal(normalizeScheduleText('2日(土)17時OPEN\n18:00 フリーロール', { now: friday }), null);
// Reader fallback accepts the real day-only format with 時 times.
assert.equal(readerCandidatesFromText(realPost + '\nhttps://x.com/ChonmageNiigata/status/333').length, 1);

// --- data validation ----------------------------------------------------------
validateSchedule({ ...base, status: 'closed', open: undefined, events: [] });
assert.throws(() => validateSchedule({ ...base, open: undefined }));
validateSchedule({ ...base, events: [{ id: 'nt', time: '18:00', title: 'No theme', description: 'details' }] });
assert.throws(() => validateSchedule({ ...base, events: [{ id: 'bad', time: '18:00', title: 'X', theme: 'green', description: 'details' }] }));
assert.throws(() => validateSchedule({ ...base, events: [{ id: 'ph', time: '18:00', title: 'X', description: '詳細を入力してください。' }] }), /placeholder/);
assert.throws(() => validateSchedule({ ...base, events: [{ id: '', time: '18:00', title: 'X', description: 'd' }] }));
assert.throws(() => validateSchedule({ ...base, events: [{ id: 'h', time: '18:00', title: 'X', heroTitle: ' ', description: 'd' }] }));
validateNews({ items: [{ date: '2026-10-02', category: 'EVENT', visualLabel: 'SPECIAL', theme: 'event', title: 't', description: 'd', url: 'https://x.com/a' }] });
assert.throws(() => validateNews({ items: [{ date: '2026-10-02', category: 'EVENT', visualLabel: 'SPECIAL', theme: 'blue', title: 't', description: 'd', url: 'https://x.com/a' }] }));

// --- merge ------------------------------------------------------------------------
const collision = mergeSchedule(auto, { version: 1, date: auto.date, fields: {}, ringGame: {}, events: {}, extraEvents: [{ id: 'one', time: '19:00', title: 'EXTRA', description: 'd' }] }, { warn: () => {} });
assert.deepEqual(collision.events.map((event) => event.id), ['one', 'one-2']);
const overnight = mergeSchedule(auto, { version: 1, date: auto.date, fields: { close: '01:00' }, ringGame: {}, events: {}, extraEvents: [{ id: 'late', time: '00:30', title: 'LATE', description: 'd' }, { id: 'hidden', time: '20:00', title: 'H', description: 'd', hidden: true }] });
assert.deepEqual(overnight.events.map((event) => event.id), ['one', 'late']);
const replacementWithHidden = mergeSchedule(auto, { version: 1, date: '2026-10-03', replacement: { ...base, date: '2026-10-03', events: [{ id: 'x', time: '18:00', title: 'X', description: 'd', hidden: true }] } });
assert.equal(replacementWithHidden.events.length, 0);

console.log('schedule data tests passed');
