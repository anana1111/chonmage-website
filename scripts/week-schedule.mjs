// The shop posts next week's schedule as one picture every Sunday. data/week.json holds that
// week in a short form; on a day the daily X post has not been read yet, today's row becomes
// events.auto.json so the cards are not empty. A daily post for the same day still wins.
import fs from 'node:fs';
import { validateSchedule } from './validate-events.mjs';
import { fillClose, isTime } from './schedule-core.mjs';

export const WEEK_FILE = 'data/week.json';
const PROFILE_URL = 'https://x.com/ChonmageNiigata';

function eventType(title) {
  if (/free\s*roll|フリー ?ロール/i.test(title)) return 'free';
  if (/special|スペシャル/i.test(title)) return 'special';
  if (/tournament|トーナメント|トナメ|DAILY/i.test(title)) return 'tournament';
  return 'event';
}

export function weekDaySchedule(week, date, now = new Date()) {
  const day = (week?.days || []).find((row) => row && row.date === date);
  if (!day) return null;
  const url = typeof week.sourceUrl === 'string' && /^https:\/\/x\.com\//.test(week.sourceUrl) ? week.sourceUrl : PROFILE_URL;
  const used = new Set();
  const events = (day.events || []).map((row) => {
    const type = eventType(row.title);
    let id = (type === 'free' ? 'freeroll' : 'event') + '-' + row.time.replace(':', '');
    while (used.has(id)) id += '-2';
    used.add(id);
    const facts = [];
    if (row.entry) facts.push({ label: 'ENTRY', value: row.entry });
    if (row.reentry) facts.push({ label: 'RE-ENTRY', value: row.reentry });
    return {
      id, time: row.time, type, title: row.title,
      heroTitle: type === 'free' ? 'FREE ROLL' : row.title.slice(0, 24),
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
  return validateSchedule(fillClose(schedule));
}

// Today's CLOSE from the week picture, when that row has a valid one.
export function weekClose(week, date) {
  const day = (Array.isArray(week?.days) ? week.days : []).find((row) => row && row.date === date && row.open);
  return isTime(day?.close) ? day.close : '';
}

export function readWeek(file = WEEK_FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
