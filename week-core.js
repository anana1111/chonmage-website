// The Sunday week picture (data/week.json) shared by the public page and Node.
// The page uses it so a new day appears at midnight without waiting for GitHub Actions,
// and so 本日終了 can say when the shop opens next.
(function (root) {
  'use strict';
  const PROFILE_URL = 'https://x.com/ChonmageNiigata';
  const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const isTime = (value) => typeof value === 'string' && TIME.test(value);
  const rows = (week) => (week && Array.isArray(week.days) ? week.days : []).filter((row) => row && typeof row.date === 'string');

  function eventType(title) {
    if (/free\s*roll|フリー ?ロール/i.test(title)) return 'free';
    if (/special|スペシャル/i.test(title)) return 'special';
    if (/tournament|トーナメント|トナメ|DAILY/i.test(title)) return 'tournament';
    return 'event';
  }

  // One day of the week picture in the events.json shape (not yet validated), or null.
  function daySchedule(week, date, now = new Date()) {
    const day = rows(week).find((row) => row.date === date);
    if (!day) return null;
    const url = typeof week.sourceUrl === 'string' && /^https:\/\/x\.com\//.test(week.sourceUrl) ? week.sourceUrl : PROFILE_URL;
    const used = new Set();
    const events = (Array.isArray(day.events) ? day.events : []).map((row) => {
      const type = eventType(row.title);
      let id = (type === 'free' ? 'freeroll' : 'event') + '-' + String(row.time).replace(':', '');
      while (used.has(id)) id += '-2';
      used.add(id);
      const facts = [];
      if (row.entry) facts.push({ label: 'ENTRY', value: row.entry });
      if (row.reentry) facts.push({ label: 'RE-ENTRY', value: row.reentry });
      return {
        id, time: row.time, type, title: row.title,
        heroTitle: type === 'free' ? 'FREE ROLL' : String(row.title).slice(0, 24),
        theme: type === 'free' ? 'blue' : 'orange',
        tags: type === 'free' ? ['1 DRINK'] : [],
        description: '週間スケジュールより。当日の変更は公式Xでお知らせします。',
        facts,
        link: { label: '週間スケジュール ↗', url },
      };
    });
    const schedule = {
      version: 2,
      date,
      latestXUrl: PROFILE_URL,
      schedulePostUrl: url,
      updatedAt: new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).format(now).replace(' ', 'T') + '+09:00',
      source: { type: 'x', url, mode: 'auto' },
      open: day.open,
      status: 'open',
      summary: ['今週のスケジュールより。', '当日の変更は公式Xでお知らせします。'],
      ringGame: day.ringGame ? { enabled: true, start: day.open, title: 'NLHリングゲーム', description: '終日開催。' } : { enabled: false },
      events,
    };
    if (!day.open) {
      Object.assign(schedule, { status: 'closed', summary: ['本日は休業です。', '最新情報は公式Xでお知らせします。'], ringGame: { enabled: false }, events: [] });
      delete schedule.open;
    }
    if (day.close && day.open) schedule.close = day.close;
    return fillClose(schedule);
  }

  // The first open day after `date` in the week picture: { date, open, label }, or null.
  // label: 「明日 17:00」 or 「10/12（月）13:00」.
  function nextOpening(week, date) {
    const next = rows(week).filter((row) => row.date > date && isTime(row.open))
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (!next) return null;
    const noon = (iso) => new Date(iso + 'T12:00:00+09:00');
    const days = Math.round((noon(next.date) - noon(date)) / 86400000);
    if (!Number.isFinite(days) || days < 1) return null;
    const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(noon(next.date));
    const [, month, day] = next.date.split('-').map(Number);
    const when = days === 1 ? '明日' : `${month}/${day}（${weekday}）`;
    return { date: next.date, open: next.open, label: `${when} ${next.open}` };
  }

  // The shop's usual closing time (also in index.html openingHoursSpecification).
  const DEFAULT_CLOSE = '23:30';
  // Times before 06:00 after an evening OPEN belong to the same business day (25時CLOSE = 01:00).
  function businessMinutes(value, open) {
    if (!isTime(value)) return Infinity;
    const [hour, minute] = value.split(':').map(Number);
    const result = hour * 60 + minute;
    const openHour = isTime(open) ? Number(open.slice(0, 2)) : 24;
    return result < 360 && openHour >= 6 ? result + 1440 : result;
  }

  // Without CLOSE an open day says 営業中 all night, and X posts often give only OPEN.
  // Such a day takes `close` (the week picture's) or the usual time, unless a game
  // starts at or after it; then CLOSE stays unknown.
  function fillClose(schedule, close = DEFAULT_CLOSE) {
    if (!schedule || schedule.status !== 'open' || !isTime(schedule.open) || isTime(schedule.close)) return schedule;
    const value = isTime(close) ? close : DEFAULT_CLOSE;
    const closeMinute = businessMinutes(value, schedule.open);
    const starts = (Array.isArray(schedule.events) ? schedule.events : [])
      .filter((event) => event && !event.hidden).map((event) => event.time);
    if (schedule.ringGame && schedule.ringGame.enabled && schedule.ringGame.start) starts.push(schedule.ringGame.start);
    if (businessMinutes(schedule.open, schedule.open) < closeMinute &&
      starts.every((time) => businessMinutes(time, schedule.open) < closeMinute)) schedule.close = value;
    return schedule;
  }

  // ---------- 表示時間帯 (days[].cards) ----------
  // A day can say what the home card shows from when to when: each card is a home card
  // (same fields as heroOverrides) with start / end in Japan time. end may be 24:00.
  const CARD_STATUSES = ['open', 'ongoing', 'ended', 'closed'];
  const clock = (value) => (value === '24:00' ? 1440 : isTime(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN);
  const text = (value) => typeof value === 'string' && value.trim() !== '';
  const httpsUrl = (value) => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } };

  // Problems of one card as [{ key, message }]; an empty list means the card is valid.
  function cardProblems(card) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) return [{ key: '', message: 'カードの形式が正しくありません。' }];
    const problems = [];
    const add = (key, message) => problems.push({ key, message });
    if (!isTime(card.start)) add('start', '開始時刻を入力してください（例：17:00）。');
    if (!isTime(card.end) && card.end !== '24:00') add('end', '終了時刻を入力してください（例：19:00、日付が変わるまでは 24:00）。');
    else if (isTime(card.start) && clock(card.end) <= clock(card.start)) add('end', '終了は開始より後の時刻にしてください。翌日に続く場合は 24:00 で区切り、翌日の欄に続きを作ります。');
    if (!CARD_STATUSES.includes(card.status)) add('status', '営業状況を選択してください。');
    if ((card.status !== 'closed' || card.open) && !isTime(card.open)) add('open', 'OPEN の時刻を入力してください（例：17:00）。');
    if (card.mainTime || card.mainTitle) {
      if (!isTime(card.mainTime)) add('mainTime', 'MAIN TIME とイベント名を一緒に入力してください。');
      if (!text(card.mainTitle)) add('mainTitle', 'MAIN EVENT を入力してください。');
    }
    if (!text(card.latestText)) add('latestText', 'LATEST に出す文言を入力してください。');
    if (card.latestUrl && !httpsUrl(card.latestUrl)) add('latestUrl', 'https:// で始まるURLを入力してください。');
    return problems;
  }

  // Problems of a whole day's cards: each card's own, plus overlapping time ranges.
  function dayCardProblems(cards) {
    const list = Array.isArray(cards) ? cards : [];
    const problems = list.map((card) => cardProblems(card));
    const ranges = list.map((card, index) => ({ index, start: clock(card?.start), end: clock(card?.end) }))
      .filter((range, index) => !problems[index].some((problem) => ['start', 'end'].includes(problem.key)))
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < ranges.length; i += 1) {
      if (ranges[i].start < ranges[i - 1].end) problems[ranges[i].index].push({ key: 'start', message: 'ほかの表示時間帯と重なっています。' });
    }
    return problems;
  }

  // The valid cards of one date, in time order. Invalid or overlapping cards are left out.
  function dayCards(week, date) {
    const day = rows(week).find((row) => row.date === date);
    const cards = Array.isArray(day?.cards) ? day.cards : [];
    const problems = dayCardProblems(cards);
    return cards.filter((card, index) => !problems[index].length).sort((a, b) => clock(a.start) - clock(b.start));
  }

  // The card shown at `minute` (minutes since 00:00 JST) on `date`, or null.
  function activeCard(week, date, minute) {
    return dayCards(week, date).find((card) => clock(card.start) <= minute && minute < clock(card.end)) || null;
  }

  // Minutes since 00:00 in Japan time.
  function japanMinute(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now).map((part) => [part.type, part.value]));
    return Number(parts.hour) * 60 + Number(parts.minute);
  }

  // The rows of the week picture for the public 「今週のスケジュール」 card: today and the days
  // after it. A day disappears once it is over, so an old week shows nothing.
  function weekDays(week, today) {
    return rows(week).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  // The week picture with one day replaced by that day's own post (events.json), so a change
  // the shop posts on X shows in 「今週のスケジュール」 too. The week's own row stays when the
  // daily data was made from the week picture itself.
  const fact = (facts, pattern) => (Array.isArray(facts) ? facts : []).find((row) => row && pattern.test(String(row.label || '').trim()))?.value || '';
  function withDailyPost(week, daily) {
    if (!week || !daily || typeof daily.date !== 'string' || !daily.source || daily.source.url === week.sourceUrl) return week;
    const index = rows(week).findIndex((row) => row.date === daily.date);
    if (index < 0) return week;
    const old = rows(week)[index];
    const open = daily.status !== 'closed' && isTime(daily.open);
    const day = {
      ...old,
      open: open ? daily.open : null,
      close: open && isTime(daily.close) ? daily.close : null,
      ringGame: open && Boolean(daily.ringGame && daily.ringGame.enabled),
      events: open ? (Array.isArray(daily.events) ? daily.events : []).filter((event) => event && !event.hidden && isTime(event.time)).map((event) => {
        // A price the post leaves out stays from the week picture's game at the same time.
        const same = (Array.isArray(old.events) ? old.events : []).find((row) => row && row.time === event.time) || {};
        return {
          time: event.time,
          title: String(event.title || '').replace(/\s*[\u{1F550}-\u{1F567}]\s*$/u, ''),
          entry: fact(event.facts, /^(?:ENTRY|エントリー|参加費|参加料金)$/i) || same.entry || '',
          reentry: fact(event.facts, /^(?:RE-?ENTRY|リエントリー|再エントリー)$/i) || same.reentry || '',
          lastEntry: fact(event.facts, /^(?:最終受付|late\s*reg(?:istration)?)$/i),
        };
      }) : [],
    };
    const days = rows(week).slice();
    days[index] = day;
    return { ...week, days };
  }

  const api = Object.freeze({ DEFAULT_CLOSE, fillClose, daySchedule, nextOpening, cardProblems, dayCardProblems, dayCards, activeCard, japanMinute, weekDays, withDailyPost });
  root.ChonmageWeek = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
