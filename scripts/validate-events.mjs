import fs from 'node:fs';

export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T12:00:00+09:00');
  return Number.isFinite(parsed.getTime()) && new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(parsed) === value;
}

export function isTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isSafeUrl(value, allowTel = false) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (allowTel && /^tel:\+?[\d -]+$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' is required');
}

export function validateSchedule(data) {
  if (!data || typeof data !== 'object') throw new Error('schedule must be an object');
  if (!isDate(data.date)) throw new Error('invalid date');
  if (!isTime(data.open)) throw new Error('invalid open time');
  if (data.close && !isTime(data.close)) throw new Error('invalid close time');
  if (!['open', 'closed'].includes(data.status)) throw new Error('invalid status');
  if (!isSafeUrl(data.latestXUrl)) throw new Error('invalid latestXUrl');
  if (data.schedulePostUrl && !isSafeUrl(data.schedulePostUrl)) throw new Error('invalid schedulePostUrl');

  if (data.summary !== undefined) {
    if (!Array.isArray(data.summary)) throw new Error('summary must be an array');
    data.summary.forEach((row, index) => requireText(row, 'summary[' + index + ']'));
  }

  if (data.ringGame !== undefined) {
    if (!data.ringGame || typeof data.ringGame !== 'object' || typeof data.ringGame.enabled !== 'boolean') throw new Error('invalid ringGame');
    if (data.ringGame.start && !isTime(data.ringGame.start)) throw new Error('invalid ringGame.start');
    if (data.ringGame.enabled) {
      requireText(data.ringGame.title, 'ringGame.title');
      requireText(data.ringGame.description, 'ringGame.description');
    }
  }

  if (!Array.isArray(data.events)) throw new Error('events must be an array');
  const ids = new Set();
  data.events.forEach((event, index) => {
    if (!event || typeof event !== 'object') throw new Error('invalid event ' + index);
    if (event.id) {
      requireText(event.id, 'event id');
      if (ids.has(event.id)) throw new Error('duplicate event id: ' + event.id);
      ids.add(event.id);
    }
    if (!isTime(event.time)) throw new Error('invalid event time: ' + index);
    if (event.end && !isTime(event.end)) throw new Error('invalid event end: ' + index);
    requireText(event.title, 'event title ' + index);
    requireText(event.description, 'event description ' + index);
    if (event.type && !['free', 'tournament', 'special', 'event'].includes(event.type)) throw new Error('invalid event type');
    if (event.theme && !['blue', 'orange'].includes(event.theme)) throw new Error('invalid event theme');
    if (event.hidden !== undefined && typeof event.hidden !== 'boolean') throw new Error('invalid hidden flag');
    if (event.isMain !== undefined && typeof event.isMain !== 'boolean') throw new Error('invalid isMain flag');
    if (event.tags !== undefined) {
      if (!Array.isArray(event.tags)) throw new Error('invalid tags');
      event.tags.forEach((tag) => requireText(tag, 'tag'));
    }
    if (event.facts !== undefined) {
      if (!Array.isArray(event.facts)) throw new Error('invalid facts');
      event.facts.forEach((fact) => {
        requireText(fact?.label, 'fact label');
        requireText(fact?.value, 'fact value');
      });
    }
    if (event.link) {
      requireText(event.link.label, 'event link label');
      if (!isSafeUrl(event.link.url, true)) throw new Error('invalid event link');
    }
  });

  if (data.source?.url && !isSafeUrl(data.source.url)) throw new Error('invalid source url');
  return data;
}

export function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

if (process.argv[1] && process.argv[1].endsWith('validate-events.mjs') && process.argv[2]) {
  validateSchedule(readJson(process.argv[2]));
  console.log('validated ' + process.argv[2]);
}
