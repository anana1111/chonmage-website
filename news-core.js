// NEWS-only rules shared by the public pages, static admin and Node scripts.
(function (root) {
  'use strict';
  const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const THEMES = ['schedule', 'event', 'result'];
  const text = (value) => typeof value === 'string' ? value.trim() : '';

  function publishedTime(value) {
    if (typeof value !== 'string') return NaN;
    const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/);
    if (!match) return NaN;
    const day = new Date(match[1] + 'T00:00:00Z');
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]) return NaN;
    if (Number(match[2] || 0) > 23 || Number(match[3] || 0) > 59 || Number(match[4] || 0) > 59) return NaN;
    // Legacy date-only and datetime-local inputs always mean Japan time.
    const iso = match[2] ? value + (match[5] ? '' : '+09:00') : value + 'T00:00:00+09:00';
    return Date.parse(iso);
  }

  function japanDateTime(value = Date.now()) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    // JST has no daylight-saving transitions.
    return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00').replace('.000+09:00', '+09:00');
  }

  function httpsUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  function xUrl(value, requirePost = false) {
    const safe = httpsUrl(value);
    if (!safe) return '';
    const url = new URL(safe);
    if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname.toLowerCase())) return '';
    if (requirePost && !/^\/[A-Za-z0-9_]+\/status\/\d+\/?$/.test(url.pathname)) return '';
    return 'https://x.com' + url.pathname.replace(/\/$/, '');
  }

  function imageUrl(value) {
    const input = text(value);
    if (!input) return '';
    if (/^https:/i.test(input)) return httpsUrl(input);
    if (/^(?:\/\/|[a-z][a-z0-9+.-]*:)/i.test(input) || /[\\\u0000-\u001f]/.test(input)) return '';
    if (input.split(/[/?#]/).includes('..')) return '';
    return /^(?:\.\/)?(?:images|assets)\/[A-Za-z0-9_./% -]+$/.test(input) ? input : '';
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of value) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const timestamp = publishedTime(text(raw.publishedAt) || text(raw.date));
    if (!Number.isFinite(timestamp)) return null;
    const sourceUrl = xUrl(text(raw.sourceUrl) || text(raw.url));
    const content = text(raw.content) || text(raw.text) || text(raw.description) || text(raw.summary);
    const title = text(raw.title) || content.split('\n')[0].slice(0, 100) || 'お知らせ';
    const id = text(raw.id) || (xUrl(sourceUrl, true) ? 'x-' + sourceUrl.match(/\/status\/(\d+)/)[1] :
      'legacy-' + stableHash([raw.date || raw.publishedAt, title, raw.url || ''].join('\n')));
    const images = [...new Set([raw.image, ...(Array.isArray(raw.images) ? raw.images : [])].map(imageUrl).filter(Boolean))];
    return {
      ...raw, id, publishedAt: japanDateTime(timestamp), date: japanDateTime(timestamp).slice(0, 10),
      title, content, summary: text(raw.summary) || text(raw.description) || content.replace(/\s+/g, ' ').slice(0, 140),
      description: text(raw.description) || text(raw.summary) || content.replace(/\s+/g, ' ').slice(0, 140),
      category: text(raw.category) || 'NEWS', visualLabel: text(raw.visualLabel) || 'NEWS',
      theme: THEMES.includes(raw.theme) ? raw.theme : 'event',
      source: text(raw.source) || (sourceUrl ? 'x' : 'manual'), sourceUrl,
      image: images[0] || '', images, published: raw.published !== false, pinned: raw.pinned === true,
    };
  }

  function itemsOf(data) {
    const rows = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    const seen = new Set();
    return rows.map(normalizeItem).filter((item) => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id); return true;
    });
  }

  function status(raw, now = Date.now()) {
    const item = normalizeItem(raw);
    if (!item) return 'Invalid';
    if (!item.published) return 'Draft';
    const published = publishedTime(item.publishedAt);
    const clock = new Date(now).getTime();
    if (!Number.isFinite(clock)) return 'Invalid';
    if (published > clock) return 'Scheduled';
    return clock - published > WINDOW_MS ? 'Expired' : 'Published';
  }

  function visibleItems(data, now = Date.now(), limit = Infinity) {
    return itemsOf(data).filter((item) => status(item, now) === 'Published')
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || publishedTime(b.publishedAt) - publishedTime(a.publishedAt) || a.id.localeCompare(b.id))
      .slice(0, limit);
  }

  // Strict writes; tolerant reads use itemsOf() so one damaged row cannot break a page.
  function validateNews(data) {
    if (!data || !Array.isArray(data.items)) throw new Error('Missing news items');
    const ids = new Set();
    data.items.forEach((raw) => {
      const item = normalizeItem(raw);
      if (!item) throw new Error('Invalid news date');
      for (const key of ['id', 'publishedAt', 'date', 'title', 'summary', 'content', 'text', 'description', 'image', 'source', 'sourceUrl', 'url', 'category', 'visualLabel', 'theme']) {
        if (raw[key] !== undefined && typeof raw[key] !== 'string') throw new Error('Invalid news ' + key);
      }
      if (raw.published !== undefined && typeof raw.published !== 'boolean') throw new Error('Invalid published flag');
      if (raw.pinned !== undefined && typeof raw.pinned !== 'boolean') throw new Error('Invalid pinned flag');
      if (raw.autoUpdate !== undefined && typeof raw.autoUpdate !== 'boolean') throw new Error('Invalid automatic update flag');
      if (item.published && !text(raw.title) && !text(raw.content) && !text(raw.text)) throw new Error('Missing news title');
      if (raw.theme !== undefined && !THEMES.includes(raw.theme)) throw new Error('Invalid news theme');
      for (const key of ['url', 'sourceUrl']) if (text(raw[key]) && !httpsUrl(raw[key])) throw new Error('Unsafe news URL');
      if (text(raw.image) && !imageUrl(raw.image)) throw new Error('Unsafe news image');
      if (raw.images !== undefined && (!Array.isArray(raw.images) || raw.images.some((url) => !imageUrl(url)))) throw new Error('Unsafe news images');
      if (ids.has(item.id)) throw new Error('Duplicate news id');
      ids.add(item.id);
    });
    if (data.excludedSourceUrls !== undefined && (!Array.isArray(data.excludedSourceUrls) || data.excludedSourceUrls.some((url) => !xUrl(url, true)))) throw new Error('Invalid excluded news sources');
    return data;
  }

  function nextRefreshDelay(data, now = Date.now()) {
    const clock = new Date(now).getTime();
    let delay = 60000;
    itemsOf(data).filter((item) => item.published).forEach((item) => {
      const published = publishedTime(item.publishedAt);
      for (const boundary of [published, published + WINDOW_MS + 1]) {
        if (boundary > clock) delay = Math.min(delay, boundary - clock);
      }
    });
    return Math.max(1, delay);
  }

  const api = Object.freeze({ WINDOW_MS, THEMES, publishedTime, japanDateTime, httpsUrl, xUrl, imageUrl, normalizeItem, itemsOf, status, visibleItems, validateNews, nextRefreshDelay });
  root.ChonmageNews = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
