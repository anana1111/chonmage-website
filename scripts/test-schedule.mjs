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

// Homepage overrides coexist with older/future schedule edits and automatic updates.
const hero = { status: 'ended', open: '17:00', mainTime: '18:00', mainTitle: '王者決定戦', latestText: 'Xで確認', latestUrl: '' };
const heroOverrides = { '2026-10-03': hero, '2026-10-04': { ...hero, status: 'closed', open: '', mainTime: '', mainTitle: '' } };
for (const manualDate of ['2026-09-01', auto.date, '2026-12-01']) {
  const result = mergeSchedule(auto, { version: 1, date: manualDate, heroOverrides });
  assert.deepEqual(result.heroOverrides, heroOverrides);
  assert.equal(result.date, auto.date);
  validateSchedule(result);
}
const advanced = mergeSchedule({ ...auto, date: '2026-10-05' }, { version: 1, date: auto.date, heroOverrides });
assert.equal(advanced.date, '2026-10-05');
assert.deepEqual(advanced.heroOverrides, heroOverrides);
assert.deepEqual(advanced.events, auto.events);
assert.equal(mergeSchedule(auto, { version: 1, date: auto.date, heroOverrides: {} }).heroOverrides, undefined);
for (const invalid of [{ status: 'bad' }, { open: '25:00' }, { mainTime: '' }, { latestUrl: 'javascript:alert(1)' }, { latestUrl: 'https://user:password@x.com/a' }, { latestText: '' }]) {
  assert.throws(() => validateSchedule({ ...base, heroOverrides: { '2026-10-03': { ...hero, ...invalid } } }));
}
assert.throws(() => validateSchedule({ ...base, heroOverrides: { '2026-02-30': hero } }));
assert.throws(() => validateSchedule({ ...base, heroOverrides: { '2026-10-03': null } }));
validateSchedule({ ...base, heroOverrides: { '2026-10-03': { ...hero, mainTitle: '超長い日本語の大会名'.repeat(50) } } });

// 予約公開: one publishAt rule for events and home cards.
{
  const P = globalThis.ChonmagePublish;
  const at = (clock) => Date.parse('2026-10-10T' + clock + ':00+09:00');
  assert.equal(P.parse('2026-10-10T18:00'), at('18:00'));
  assert.equal(P.parse('2026-10-10T18:00:00+09:00'), at('18:00'));
  assert.equal(P.parse('2026-10-10T09:00:00Z'), at('18:00'));
  for (const bad of ['', '2026-10-10', '2026-02-30T18:00', '2026-10-10T24:00', 'tomorrow', 5]) assert.ok(!Number.isFinite(P.parse(bad)), String(bad));
  assert.equal(P.format('2026-10-10T18:00'), '2026-10-10T18:00:00+09:00');
  assert.equal(P.format(at('00:05')), '2026-10-10T00:05:00+09:00');
  const scheduled = { id: 'night', time: '19:10', type: 'tournament', title: 'ふるまちトナメ', description: 'details', publishAt: '2026-10-10T18:00:00+09:00' };
  assert.equal(P.state(scheduled, at('17:59')), 'scheduled');
  assert.equal(P.state(scheduled, at('18:00')), 'live');
  assert.equal(P.state({ ...scheduled, hidden: true }, at('19:00')), 'draft');
  assert.equal(P.state({ title: 'old' }, at('00:00')), 'live');
  const day = { ...base, date: '2026-10-10', events: [{ id: 'free', time: '18:00', title: 'FREE', description: 'd' }, scheduled],
    heroOverrides: { '2026-10-10': { ...hero, publishAt: '2026-10-10T12:00:00+09:00' } } };
  validateSchedule(day);
  assert.deepEqual(P.visibleSchedule(day, at('11:00')).events.map((event) => event.id), ['free']);
  assert.equal(P.visibleSchedule(day, at('11:00')).heroOverrides, undefined);
  assert.deepEqual(Object.keys(P.visibleSchedule(day, at('12:00')).heroOverrides), ['2026-10-10']);
  assert.deepEqual(P.visibleSchedule(day, at('18:00')).events.map((event) => event.id), ['free', 'night']);
  assert.notEqual(P.visibilityKey(day, at('17:59')), P.visibilityKey(day, at('18:00')));
  assert.equal(day.events.length, 2, 'visibleSchedule does not mutate');
  assert.throws(() => validateSchedule({ ...day, events: [{ ...scheduled, publishAt: '2026-10-10' }] }));
  assert.throws(() => validateSchedule({ ...day, heroOverrides: { '2026-10-10': { ...hero, publishAt: 'soon' } } }));
  // Actions keeps publishAt from the manual file for both overrides and added events.
  const autoDay = { ...base, date: '2026-10-10', events: [{ id: 'free', time: '18:00', title: 'FREE', description: 'd' }] };
  const merged = mergeSchedule(autoDay, { version: 1, date: '2026-10-10', events: { free: { publishAt: '2026-10-10T17:00:00+09:00' } }, extraEvents: [scheduled] });
  assert.equal(merged.events.find((event) => event.id === 'free').publishAt, '2026-10-10T17:00:00+09:00');
  assert.equal(merged.events.find((event) => event.id === 'night').publishAt, scheduled.publishAt);
}
// Weekday format (2026-10-05): the event name is on the line above its time.
{
  const daily = normalizeScheduleText('5日(月)17時OPEN✨\n本日のトーナメントはこちら👇\n🆕🏆 THE DAILY\n🕕18:00〜\nお手頃価格でも、30,000点スタートでしっかり遊べる。', { now: new Date('2026-10-05T08:00:00Z') });
  assert.equal(daily.open, '17:00');
  assert.deepEqual(daily.events.map((event) => event.time + ' ' + event.title), ['18:00 THE DAILY']);
}
// Sunday week picture: today's row fills the cards until the daily post is read.
{
  const { weekDaySchedule } = await import('./week-schedule.mjs');
  const { useWeekSchedule } = await import('./fetch-events.mjs');
  const fsm = await import('node:fs');
  const os = await import('node:os');
  const pathm = await import('node:path');
  const week = { version: 1, sourceUrl: 'https://x.com/ChonmageNiigata/status/1', days: [
    { date: '2026-10-07', open: '17:00', close: '23:30', ringGame: true, events: [
      { time: '18:00', title: 'フリーロール', entry: '無料', reentry: '¥500' },
      { time: '19:10', title: 'PLOトーナメント', entry: '¥3,000', reentry: '¥3,000' }] }] };
  const day = weekDaySchedule(week, '2026-10-07', new Date('2026-10-07T00:00:00Z'));
  assert.equal(day.open, '17:00');
  assert.equal(day.close, '23:30');
  assert.deepEqual(day.events.map((event) => event.type), ['free', 'tournament']);
  assert.equal(weekDaySchedule(week, '2026-10-08'), null);
  const dir = fsm.mkdtempSync(pathm.join(os.tmpdir(), 'week-'));
  const out = pathm.join(dir, 'auto.json');
  const morning = new Date('2026-10-07T00:07:00Z');
  fsm.writeFileSync(out, JSON.stringify({ date: '2026-10-06', source: { url: 'https://x.com/ChonmageNiigata/status/9' } }));
  assert.equal(useWeekSchedule(morning, out, week), true);
  assert.equal(JSON.parse(fsm.readFileSync(out, 'utf8')).date, '2026-10-07');
  const daily = { date: '2026-10-07', source: { url: 'https://x.com/ChonmageNiigata/status/99' } };
  fsm.writeFileSync(out, JSON.stringify(daily));
  assert.equal(useWeekSchedule(morning, out, week), false);
  assert.deepEqual(JSON.parse(fsm.readFileSync(out, 'utf8')), daily);
  fsm.rmSync(dir, { recursive: true });
}
// Week picture read by GitHub Models: only a sane answer becomes week.json.
{
  const { findWeekPost, weekFromAnswer, readWeekImage } = await import('./read-week-image.mjs');
  const { weekDaySchedule } = await import('./week-schedule.mjs');
  const fsm = await import('node:fs');
  const os = await import('node:os');
  const pathm = await import('node:path');
  const now = new Date('2026-10-05T03:00:00Z');
  const tweet = { id: '2106713700346515720', text: '10月5日(月)からのスケジュール', isRetweet: false, author: { screenName: 'ChonmageNiigata' },
    createdAtISO: '2026-10-04T11:51:00+00:00', media: [{ type: 'photo', url: 'https://pbs.twimg.com/media/ABC.jpg' }] };
  const post = findWeekPost({ ok: true, data: [{ ...tweet, id: '1', text: '5日(月)17時OPEN' }, tweet] }, now);
  assert.equal(post.url, 'https://x.com/ChonmageNiigata/status/2106713700346515720');
  assert.equal(findWeekPost({ data: [{ ...tweet, isRetweet: true }] }, now), null);
  assert.equal(findWeekPost({ data: [tweet] }, new Date('2026-10-20T00:00:00Z')), null);
  const answer = { days: [
    { month: 10, day: 5, open: '17:00', close: '23:30', ringGame: true, events: [{ time: '18:00', title: 'THE DAILY', entry: '¥1,500〜', reentry: '¥2,000' }] },
    { month: 10, day: 6, open: '', close: '', ringGame: false, events: [] }] };
  const week = weekFromAnswer(answer, post);
  assert.deepEqual(week.days.map((day) => day.date), ['2026-10-05', '2026-10-06']);
  assert.equal(weekDaySchedule(week, '2026-10-06').status, 'closed');
  assert.throws(() => weekFromAnswer({ days: [{ month: 11, day: 30, open: '17:00', events: [] }] }, post));
  assert.throws(() => weekFromAnswer({ days: [{ month: 10, day: 7, open: '7pm', events: [] }] }, post));
  assert.throws(() => weekFromAnswer({ days: [] }, post));
  const decemberPost = { ...post, postedAt: new Date('2026-12-27T03:00:00Z') };
  assert.equal(weekFromAnswer({ days: [{ month: 1, day: 2, open: '13:00', events: [] }] }, decemberPost).days[0].date, '2027-01-02');
  const dir = fsm.mkdtempSync(pathm.join(os.tmpdir(), 'weekimg-'));
  const posts = pathm.join(dir, 'posts.json');
  const file = pathm.join(dir, 'week.json');
  fsm.writeFileSync(posts, JSON.stringify({ ok: true, data: [tweet] }));
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push(url);
    if (url.startsWith('https://pbs.twimg.com/')) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1]), { headers: { 'content-type': 'image/jpeg' } });
    assert.match(init.headers.Authorization, /^Bearer t$/);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
  };
  assert.equal(await readWeekImage({ postsPath: posts, token: 't', fetch: fakeFetch, file, now }), true);
  assert.equal(JSON.parse(fsm.readFileSync(file, 'utf8')).days.length, 2);
  assert.equal(await readWeekImage({ postsPath: posts, token: 't', fetch: fakeFetch, file, now }), false);
  assert.equal(calls.length, 2);
  fsm.rmSync(dir, { recursive: true });
}
console.log('schedule data tests passed');
