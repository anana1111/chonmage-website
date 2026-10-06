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

  const api = Object.freeze({ DEFAULT_CLOSE, fillClose, daySchedule, nextOpening });
  root.ChonmageWeek = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
