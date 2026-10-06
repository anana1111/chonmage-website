// The shop posts next week's schedule as one picture every Sunday. data/week.json holds that
// week in a short form; on a day the daily X post has not been read yet, today's row becomes
// events.auto.json so the cards are not empty. A daily post for the same day still wins.
import fs from 'node:fs';
import '../week-core.js';
import { validateSchedule } from './validate-events.mjs';
import { fillClose, isTime } from './schedule-core.mjs';

export const WEEK_FILE = 'data/week.json';

export function weekDaySchedule(week, date, now = new Date()) {
  const schedule = globalThis.ChonmageWeek.daySchedule(week, date, now);
  return schedule && validateSchedule(fillClose(schedule));
}

// Today's CLOSE from the week picture, when that row has a valid one.
export function weekClose(week, date) {
  const day = (Array.isArray(week?.days) ? week.days : []).find((row) => row && row.date === date && row.open);
  return isTime(day?.close) ? day.close : '';
}

export function readWeek(file = WEEK_FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
