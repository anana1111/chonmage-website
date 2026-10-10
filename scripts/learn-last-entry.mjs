// 最終受付の時間库: when today's post gives a game's LATE REG / 最終受付, remember it in
// data/last-entry.json as minutes after the start, so later days without it still show it.
// Rules marked "fixed" (entered by the shop) are never changed here.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { titleKey } = require('../week-core.js');

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const LATE = /^(?:最終受付|late\s*reg(?:istration)?)$/i;
const minutes = (value) => { const match = TIME.exec(String(value || '').trim()); return match ? Number(match[1]) * 60 + Number(match[2]) : null; };

export function learnLastEntries(library, schedule) {
  const rules = Array.isArray(library?.rules) ? library.rules.map((rule) => ({ ...rule })) : [];
  let changed = false;
  for (const event of Array.isArray(schedule?.events) ? schedule.events : []) {
    if (!event || event.hidden || event.type === 'free' || /free\s*roll|フリー ?ロール/i.test(String(event.title || ''))) continue;
    const start = minutes(event.time);
    const late = minutes((Array.isArray(event.facts) ? event.facts : []).find((row) => row && LATE.test(String(row.label || '').trim()))?.value);
    if (start === null || late === null) continue;
    const after = (late - start + 1440) % 1440;
    if (after < 1 || after > 720) continue;
    const title = String(event.title || '').normalize('NFKC').replace(/\p{Extended_Pictographic}|️/gu, '').replace(/\s+/g, ' ').trim();
    const key = titleKey(title);
    if (!key) continue;
    const rule = { title, after, source: schedule?.source?.url || '', learnedAt: schedule?.date || '' };
    const index = rules.findIndex((row) => titleKey(row.title) === key);
    if (index < 0) { rules.push(rule); changed = true; continue; }
    if (rules[index].fixed || rules[index].after === after) continue;
    rules[index] = { ...rules[index], ...rule };
    changed = true;
  }
  return changed ? { version: 1, ...library, rules } : library;
}

if (process.argv[1] && process.argv[1].endsWith('learn-last-entry.mjs')) {
  const schedulePath = process.argv[2] || 'data/events.auto.json';
  const libraryPath = process.argv[3] || 'data/last-entry.json';
  let library = { version: 1, rules: [] };
  try { library = JSON.parse(fs.readFileSync(libraryPath, 'utf8')); } catch {}
  let schedule = null;
  try { schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8')); } catch (error) { console.warn('::warning::no schedule to learn from: ' + error.message); }
  const next = learnLastEntries(library, schedule);
  if (next === library) console.log('last-entry library unchanged');
  else { fs.writeFileSync(libraryPath, JSON.stringify(next, null, 2) + '\n'); console.log('updated ' + libraryPath); }
}
