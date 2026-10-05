// Scheduled visibility (予約公開) shared by the public pages, the static admin and Node.
// Content is uploaded ahead of time with a `publishAt` (Japan time); the page simply
// hides it until that moment. There is no server job: every reader applies the same rule.
//
// One structure for every kind of content:
//   draft      → not shown        (events: hidden: true / NEWS: published: false)
//   scheduled  → publishAt > now  (events & home cards: publishAt / NEWS: publishedAt)
//   live       → shown
(function (root) {
  'use strict';
  const PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/;

  // Datetimes without an offset (datetime-local inputs) always mean Japan time.
  function parse(value) {
    if (typeof value !== 'string') return NaN;
    const match = value.match(PATTERN);
    if (!match) return NaN;
    const [, y, mo, d, h, mi, s = '00', zone] = match;
    if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return NaN;
    const day = new Date(`${y}-${mo}-${d}T00:00:00Z`);
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== `${y}-${mo}-${d}`) return NaN;
    return Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}${zone || '+09:00'}`);
  }

  // Canonical stored form: 2026-10-10T18:00:00+09:00 (JST has no daylight saving).
  function format(value) {
    const time = typeof value === 'number' ? value : parse(value);
    if (!Number.isFinite(time)) return '';
    return new Date(time + 9 * 3600000).toISOString().slice(0, 19) + '+09:00';
  }

  function isValid(value) { return value === undefined || Number.isFinite(parse(value)); }

  function clock(now) {
    const time = new Date(now ?? Date.now()).getTime();
    return Number.isFinite(time) ? time : Date.now();
  }

  // An item with no publishAt is live as soon as it is uploaded (the old behaviour).
  function state(item, now) {
    if (!item || item.hidden === true || item.published === false) return 'draft';
    const at = parse(item.publishAt);
    return Number.isFinite(at) && at > clock(now) ? 'scheduled' : 'live';
  }

  function isLive(item, now) { return state(item, now) === 'live'; }

  // The schedule as a visitor sees it at `now`: scheduled events and home cards removed.
  function visibleSchedule(data, now) {
    if (!data || typeof data !== 'object') return data;
    const result = { ...data };
    if (Array.isArray(data.events)) result.events = data.events.filter((event) => !event?.publishAt || isLive(event, now));
    if (data.heroOverrides && typeof data.heroOverrides === 'object') {
      const heroes = Object.entries(data.heroOverrides).filter(([, hero]) => !hero?.publishAt || isLive(hero, now));
      if (heroes.length) result.heroOverrides = Object.fromEntries(heroes); else delete result.heroOverrides;
    }
    return result;
  }

  // Changes exactly when a scheduled item goes live, so open pages can re-render then.
  function visibilityKey(data, now) {
    const shown = visibleSchedule(data, now);
    return JSON.stringify([(shown?.events || []).map((event) => event?.id ?? event?.time), Object.keys(shown?.heroOverrides || {})]);
  }

  const api = Object.freeze({ parse, format, isValid, state, isLive, visibleSchedule, visibilityKey });
  root.ChonmagePublish = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
