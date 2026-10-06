import '../news-core.js';
import '../publish-core.js';

// Pure schedule rules shared by the Node scripts and the admin page.
// This file must not import Node-only modules: /admin/ loads it in the browser
// so that its export is produced by exactly the same merge as merge-events.mjs.

export const EVENT_TYPES = ['free', 'tournament', 'special', 'event'];
export const EVENT_THEMES = ['blue', 'orange'];
export const NEWS_THEMES = ['schedule', 'event', 'result'];
// Admin's old default description. It must never reach the public site.
export const PLACEHOLDER_TEXTS = ['詳細を入力してください。', '詳細を入力してください'];
// Times before this hour belong to the previous business day (e.g. 25時CLOSE = 01:00).
export const BUSINESS_DAY_START_MINUTE = 6 * 60;

const clone = (value) => JSON.parse(JSON.stringify(value));

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

// 予約公開: optional Japan datetime after which an event or home card is shown.
export function isPublishAt(value) {
  return value === undefined || globalThis.ChonmagePublish.isValid(value);
}

export function isPlaceholderText(value) {
  return typeof value === 'string' && PLACEHOLDER_TEXTS.includes(value.trim());
}

// Homepage-only edits are scoped by Japan calendar date. They never replace
// automatic event data or change another day's schedule.
export function validateHeroOverrides(overrides) {
  if (overrides === undefined) return;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('invalid hero overrides');
  Object.entries(overrides).forEach(([date, hero]) => {
    if (!isDate(date) || !hero || typeof hero !== 'object' || Array.isArray(hero)) throw new Error('invalid hero date');
    for (const key of ['open', 'mainTime', 'mainTitle', 'latestUrl']) {
      if (hero[key] !== undefined && typeof hero[key] !== 'string') throw new Error('invalid hero ' + key);
    }
    if (!['open', 'ongoing', 'ended', 'closed'].includes(hero.status)) throw new Error('invalid hero status');
    if (hero.status !== 'closed' || hero.open) {
      if (!isTime(hero.open)) throw new Error('invalid hero open');
    }
    if (hero.mainTime || hero.mainTitle) {
      if (!isTime(hero.mainTime)) throw new Error('invalid hero main time');
      requireText(hero.mainTitle, 'hero main title');
    }
    requireText(hero.latestText, 'hero latest text');
    if (hero.latestUrl && !isSafeUrl(hero.latestUrl)) throw new Error('invalid hero latest URL');
    if (!isPublishAt(hero.publishAt)) throw new Error('invalid hero publishAt');
  });
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' is required');
  if (isPlaceholderText(value)) throw new Error(label + ' still has the placeholder text');
}

function clockMinutes(value) {
  if (!isTime(value)) return Number.POSITIVE_INFINITY;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

// Minutes since the start of the business day. Early-morning times after an
// evening OPEN (25時CLOSE -> 01:00) sort after the evening instead of before it.
export function scheduleMinutes(value, open) {
  const result = clockMinutes(value);
  if (!Number.isFinite(result)) return result;
  const openMinute = clockMinutes(open);
  const afterMidnight = result < BUSINESS_DAY_START_MINUTE &&
    (!Number.isFinite(openMinute) || openMinute >= BUSINESS_DAY_START_MINUTE);
  return afterMidnight ? result + 24 * 60 : result;
}

export function sortEvents(events, open) {
  return events.sort((a, b) => scheduleMinutes(a.time, open) - scheduleMinutes(b.time, open));
}

// These rules are mirrored by validateEvents() in /script.js; scripts/test-browser.mjs
// runs both against the same fixtures so that they cannot drift apart.
export function validateSchedule(data) {
  if (!data || typeof data !== 'object') throw new Error('schedule must be an object');
  validateHeroOverrides(data.heroOverrides);
  if (!isDate(data.date)) throw new Error('invalid date');
  if (!['open', 'closed'].includes(data.status)) throw new Error('invalid status');
  // A closed day may omit OPEN; an open day always needs it.
  if (data.status === 'open' ? !isTime(data.open) : (data.open !== undefined && data.open !== '' && !isTime(data.open))) {
    throw new Error('invalid open time');
  }
  if (data.close !== undefined && data.close !== '' && !isTime(data.close)) throw new Error('invalid close time');
  if (!isSafeUrl(data.latestXUrl)) throw new Error('invalid latestXUrl');
  if (data.schedulePostUrl !== undefined && data.schedulePostUrl !== '' && !isSafeUrl(data.schedulePostUrl)) throw new Error('invalid schedulePostUrl');

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
    if (event.id !== undefined) {
      requireText(event.id, 'event id');
      if (ids.has(event.id)) throw new Error('duplicate event id: ' + event.id);
      ids.add(event.id);
    }
    if (!isTime(event.time)) throw new Error('invalid event time: ' + index);
    if (event.end !== undefined && event.end !== '' && !isTime(event.end)) throw new Error('invalid event end: ' + index);
    requireText(event.title, 'event title ' + index);
    requireText(event.description, 'event description ' + index);
    if (event.heroTitle !== undefined) requireText(event.heroTitle, 'event heroTitle ' + index);
    if (event.type !== undefined && !EVENT_TYPES.includes(event.type)) throw new Error('invalid event type');
    if (event.theme !== undefined && !EVENT_THEMES.includes(event.theme)) throw new Error('invalid event theme');
    if (event.hidden !== undefined && typeof event.hidden !== 'boolean') throw new Error('invalid hidden flag');
    if (event.isMain !== undefined && typeof event.isMain !== 'boolean') throw new Error('invalid isMain flag');
    if (!isPublishAt(event.publishAt)) throw new Error('invalid event publishAt: ' + index);
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
    if (event.link !== undefined && event.link !== null) {
      if (!event.link || typeof event.link !== 'object') throw new Error('invalid event link');
      requireText(event.link.label, 'event link label');
      if (!isSafeUrl(event.link.url, true)) throw new Error('invalid event link');
    }
  });

  if (data.source?.url && !isSafeUrl(data.source.url)) throw new Error('invalid source url');
  return data;
}

export function validateNews(data) {
  return globalThis.ChonmageNews.validateNews(data);
}

function mergeObject(base, override) {
  const result = clone(base || {});
  Object.entries(override || {}).forEach(([key, value]) => {
    if (value === null) delete result[key];
    else result[key] = clone(value);
  });
  return result;
}

function uniqueId(id, used) {
  if (!used.has(id)) return id;
  let index = 2;
  while (used.has(id + '-' + index)) index += 1;
  return id + '-' + index;
}

export function mergeSchedule(autoData, manualData, options = {}) {
  const warn = options.warn || (() => {});
  validateSchedule(autoData);
  if (!manualData || typeof manualData !== 'object') return clone(autoData);

  validateHeroOverrides(manualData.heroOverrides);
  const withHero = (schedule) => {
    // The date-keyed map survives a newer AUTO day; selection happens in the
    // browser so an open page also changes correctly at Japan midnight.
    delete schedule.heroOverrides;
    if (Object.keys(manualData.heroOverrides || {}).length) schedule.heroOverrides = clone(manualData.heroOverrides);
    return schedule;
  };

  const manualDate = typeof manualData.date === 'string' ? manualData.date : autoData.date;
  if (manualDate < autoData.date) return withHero(clone(autoData));

  if (manualData.replacement && manualDate >= autoData.date) {
    const replacement = clone(manualData.replacement);
    replacement.source = mergeObject(replacement.source, {
      type: replacement.source?.type || 'manual',
      mode: 'manual',
      url: replacement.source?.url || replacement.latestXUrl,
    });
    replacement.events = (replacement.events || []).filter((event) => !event?.hidden);
    validateSchedule(replacement);
    sortEvents(replacement.events, replacement.open);
    return withHero(replacement);
  }

  if (manualDate > autoData.date) return withHero(clone(autoData));

  const result = clone(autoData);
  Object.entries(manualData.fields || {}).forEach(([key, value]) => {
    if (value === null) delete result[key];
    else result[key] = clone(value);
  });
  result.ringGame = mergeObject(result.ringGame, manualData.ringGame);

  const overrides = { ...(manualData.events || {}) };
  // The same event can get a different id once its source changes (week picture "event-1800",
  // daily post "the-daily-1800"). An edit whose id is gone follows the one event at that time.
  const autoIds = new Set(result.events.map((event) => event.id).filter(Boolean));
  Object.keys(overrides).forEach((id) => {
    const hhmm = !autoIds.has(id) && id.match(/-(\d{4})$/)?.[1];
    if (!hhmm) return;
    const matches = result.events.filter((event) => event.id && !overrides[event.id] &&
      event.time?.replace(':', '') === hhmm);
    if (matches.length !== 1) return;
    overrides[matches[0].id] = overrides[id];
    delete overrides[id];
  });
  const outputEvents = [];
  const usedIds = new Set();
  result.events.forEach((event) => {
    const override = event.id ? overrides[event.id] : null;
    if (override?.hidden) return;
    const merged = override ? mergeObject(event, override) : event;
    delete merged.hidden;
    if (merged.id) usedIds.add(merged.id);
    outputEvents.push(merged);
  });

  (manualData.extraEvents || []).forEach((event) => {
    if (!event || event.hidden) return;
    const extra = clone(event);
    if (extra.id && usedIds.has(extra.id)) {
      const renamed = uniqueId(extra.id, usedIds);
      warn('manual event id "' + extra.id + '" already exists; kept as "' + renamed + '"');
      extra.id = renamed;
    }
    if (extra.id) usedIds.add(extra.id);
    outputEvents.push(extra);
  });

  result.events = sortEvents(outputEvents, result.open);
  const hasManual = Object.keys(manualData.fields || {}).length ||
    Object.keys(manualData.ringGame || {}).length ||
    Object.keys(overrides).length ||
    (manualData.extraEvents || []).length;
  if (hasManual) result.source = mergeObject(result.source, { mode: 'merged' });

  validateSchedule(result);
  return withHero(result);
}
