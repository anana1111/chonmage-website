// Mobile links remain visible if JavaScript never initializes.
const menuButton = document.querySelector('.menu-button');
const mobileNav = document.getElementById('mobile-nav');
const header = document.querySelector('.site-header');

if (menuButton && mobileNav && header && typeof window.matchMedia === 'function') {
  const mobileView = window.matchMedia('(max-width: 900px)');
  let menuOpen = false;

  const setMenuOpen = (open) => {
    menuOpen = mobileView.matches && open;
    mobileNav.hidden = !menuOpen;
    menuButton.setAttribute('aria-expanded', String(menuOpen));
    menuButton.setAttribute('aria-label', menuOpen ? 'メニューを閉じる' : 'メニューを開く');
  };

  const syncMenu = () => {
    const focusedLink = mobileNav.contains(document.activeElement) ? document.activeElement : null;
    menuButton.hidden = !mobileView.matches;
    setMenuOpen(false);
    if (focusedLink) {
      const desktopLink = [...header.querySelectorAll('nav:not(.mobile-nav) a')]
        .find((link) => link.getAttribute('href') === focusedLink.getAttribute('href'));
      (mobileView.matches ? menuButton : desktopLink || header.querySelector('.brand'))?.focus();
    }
  };

  menuButton.addEventListener('click', () => setMenuOpen(!menuOpen));
  mobileNav.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || !mobileNav.contains(link)) return;
    setMenuOpen(false);
    const target = document.getElementById(link.hash.slice(1));
    if (target) {
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      }
      target.focus({ preventScroll: true });
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault();
      setMenuOpen(false);
      menuButton.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (menuOpen && !header.contains(event.target)) setMenuOpen(false);
  });
  header.addEventListener('focusout', () => {
    requestAnimationFrame(() => {
      if (menuOpen && !header.contains(document.activeElement)) setMenuOpen(false);
    });
  });
  if (mobileView.addEventListener) mobileView.addEventListener('change', syncMenu);
  else mobileView.addListener?.(syncMenu);
  syncMenu();
  header.classList.add('nav-ready');
}

const rail = document.querySelector('[data-drag-scroll]');
if (rail) {
  let dragging = false;
  let dragStart = 0;
  let scrollStart = 0;
  rail.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    dragging = true;
    dragStart = event.clientX;
    scrollStart = rail.scrollLeft;
    rail.setPointerCapture?.(event.pointerId);
  });
  rail.addEventListener('pointermove', (event) => {
    if (dragging) rail.scrollLeft = scrollStart - (event.clientX - dragStart);
  });
  const stopDragging = () => { dragging = false; };
  rail.addEventListener('pointerup', stopDragging);
  rail.addEventListener('pointercancel', stopDragging);
  rail.addEventListener('lostpointercapture', stopDragging);
}

// The page is readable before and without this optional animation.
if ('IntersectionObserver' in window && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });
  document.querySelectorAll('.reveal').forEach((item, index) => {
    item.style.setProperty('--reveal-delay', String(Math.min(index % 4, 3) * 70) + 'ms');
    observer.observe(item);
  });
}

// JSON content enhances the static HTML; an unknown date is never advertised as today.
const officialXUrl = 'https://x.com/ChonmageNiigata';
const todaySection = document.getElementById('today');

function getJapanDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateValue(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Invalid date');
  const value = new Date(`${iso}T12:00:00+09:00`);
  if (!Number.isFinite(value.getTime()) || getJapanDate(value) !== iso) throw new Error('Invalid date');
  return value;
}

function formatJapaneseDate(iso) {
  const date = dateValue(iso);
  const day = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric',
  }).format(date);
  const weekday = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', weekday: 'short',
  }).format(date);
  return `${day}（${weekday}）`;
}

// Same rules as scripts/schedule-core.mjs (checked by scripts/test-browser.mjs).
const PLACEHOLDER_TEXTS = ['詳細を入力してください。', '詳細を入力してください'];

function requireText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing text');
  if (PLACEHOLDER_TEXTS.includes(value.trim())) throw new Error('Placeholder text');
}

function requireTime(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Invalid time');
}

function safeUrl(value, allowTelephone = false) {
  if (typeof value !== 'string') throw new Error('Missing URL');
  if (allowTelephone && /^tel:\+?[\d -]+$/.test(value)) return value;
  const url = new URL(value);
  if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  throw new Error('Unsupported URL');
}

const filled = (value) => value !== undefined && value !== '';

// Without publish-core.js a scheduled item could appear early, so it is rejected instead.
function publishAtValue(value) {
  if (value !== undefined && !window.ChonmagePublish?.isValid(value)) throw new Error('Invalid publishAt');
}

// Kept in sync with the shared Node/admin validator.
function validateHeroOverrides(overrides) {
  if (overrides === undefined) return;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('Invalid hero overrides');
  Object.entries(overrides).forEach(([date, hero]) => {
    dateValue(date);
    if (!hero || typeof hero !== 'object' || Array.isArray(hero)) throw new Error('Invalid hero date');
    for (const key of ['open', 'mainTime', 'mainTitle', 'latestUrl']) {
      if (hero[key] !== undefined && typeof hero[key] !== 'string') throw new Error('Invalid hero ' + key);
    }
    if (!['open', 'ongoing', 'ended', 'closed'].includes(hero.status)) throw new Error('Invalid hero status');
    if (hero.status !== 'closed' || hero.open) requireTime(hero.open);
    if (hero.mainTime || hero.mainTitle) { requireTime(hero.mainTime); requireText(hero.mainTitle); }
    requireText(hero.latestText);
    if (hero.latestUrl) safeUrl(hero.latestUrl);
    publishAtValue(hero.publishAt);
  });
}

function validateEvents(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid schedule');
  validateHeroOverrides(data.heroOverrides);
  dateValue(data.date);
  if (!['open', 'closed'].includes(data.status)) throw new Error('Invalid status');
  // A closed day may omit OPEN; an open day always needs it.
  if (data.status === 'open' || filled(data.open)) requireTime(data.open);
  if (filled(data.close)) requireTime(data.close);
  safeUrl(data.latestXUrl);
  if (filled(data.schedulePostUrl)) safeUrl(data.schedulePostUrl);
  if (data.summary !== undefined) {
    if (!Array.isArray(data.summary)) throw new Error('Invalid summary');
    data.summary.forEach(requireText);
  }
  if (data.ringGame !== undefined) {
    if (!data.ringGame || typeof data.ringGame !== 'object' || typeof data.ringGame.enabled !== 'boolean') throw new Error('Invalid ring game');
    if (data.ringGame.start) requireTime(data.ringGame.start);
    if (data.ringGame.enabled) {
      requireText(data.ringGame.title);
      requireText(data.ringGame.description);
    }
  }
  if (!Array.isArray(data.events)) throw new Error('Missing events');
  const eventIds = new Set();
  data.events.forEach((event) => {
    if (!event || typeof event !== 'object') throw new Error('Invalid event');
    if (event.id !== undefined) {
      requireText(event.id);
      if (eventIds.has(event.id)) throw new Error('Duplicate event id');
      eventIds.add(event.id);
    }
    requireTime(event.time);
    if (filled(event.end)) requireTime(event.end);
    requireText(event.title);
    requireText(event.description);
    if (event.type !== undefined && !['free', 'tournament', 'special', 'event'].includes(event.type)) throw new Error('Invalid event type');
    if (event.theme !== undefined && !['blue', 'orange'].includes(event.theme)) throw new Error('Invalid event theme');
    if (event.hidden !== undefined && typeof event.hidden !== 'boolean') throw new Error('Invalid hidden flag');
    if (event.isMain !== undefined && typeof event.isMain !== 'boolean') throw new Error('Invalid main flag');
    publishAtValue(event.publishAt);
    if (event.heroTitle !== undefined) requireText(event.heroTitle);
    if (event.tags !== undefined && !Array.isArray(event.tags)) throw new Error('Invalid tags');
    (event.tags || []).forEach(requireText);
    if (event.facts !== undefined && !Array.isArray(event.facts)) throw new Error('Invalid facts');
    (event.facts || []).forEach((fact) => { requireText(fact?.label); requireText(fact?.value); });
    if (event.link !== undefined && event.link !== null) {
      if (typeof event.link !== 'object') throw new Error('Invalid link');
      requireText(event.link.label); safeUrl(event.link.url, true);
    }
  });
  if (data.source?.url) safeUrl(data.source.url);
  return data;
}

function validateNews(data) {
  return window.ChonmageNews.validateNews(data);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function contentLink(className, label, url, allowTelephone = false) {
  const link = element('a', className, label);
  link.setAttribute('href', safeUrl(url, allowTelephone));
  if (link.getAttribute('href').startsWith('https:')) {
    link.target = '_blank';
    link.rel = 'noreferrer';
  }
  return link;
}

// timeline.js renders TODAY and the Hero schedule. Without it the page stays in
// the safe "check official X" state instead of showing unverified times.
const timelineReady = () => typeof window.renderChonmageTimeline === 'function' && typeof window.renderChonmageTimelineHero === 'function';

function renderEvents(data) {
  if (!timelineReady()) throw new Error('timeline.js is not available');
  window.renderChonmageTimeline(data);
}

function renderHeroSchedule(data) {
  if (!timelineReady()) throw new Error('timeline.js is not available');
  window.renderChonmageTimelineHero(data);
}

// Today in Japan, or the previous day until a past-midnight CLOSE (25時CLOSE).
function isCurrentSchedule(data, now = new Date()) {
  const clock = window.ChonmageSchedule?.businessClock;
  if (typeof clock === 'function') return clock(data, now).current;
  return data.date === getJapanDate(now);
}

function applyStaleState(isStale, latestXUrl = officialXUrl, heroIsStale = isStale) {
  if (!todaySection) return;
  if (isStale) window.ChonmageActivity?.clear();
  const live = todaySection.querySelector('.today-live-content');
  const message = todaySection.querySelector('.today-stale-message');
  if (live) live.hidden = isStale;
  if (message) message.hidden = !isStale;
  todaySection.classList.toggle('is-stale', isStale);
  todaySection.setAttribute('aria-labelledby', isStale ? 'today-stale-title' : 'today-title');
  todaySection.querySelector('.today-stale-x')?.setAttribute('href', latestXUrl);
  const schedule = document.querySelector('.hero-schedule');
  schedule?.classList.toggle('is-stale', heroIsStale);
  schedule?.setAttribute('aria-label', heroIsStale ? '最新の営業・イベント情報' : '本日の営業とイベント');
  if (heroIsStale) schedule?.querySelector('.schedule-x')?.setAttribute('href', latestXUrl);
  if (heroIsStale) {
    const latest = schedule?.querySelector('.schedule-x strong');
    if (latest) latest.textContent = 'Xで確認 ↗';
    document.querySelectorAll('.hero-event-detail').forEach((item) => { item.hidden = true; });
    const date = document.getElementById('hero-schedule-date');
    const status = document.getElementById('hero-business-status-text');
    if (date) date.textContent = 'LATEST INFO';
    if (status) status.textContent = '最新情報はXで確認';
    const dot = document.getElementById('hero-business-status');
    if (dot) dot.dataset.phase = 'stale';
  }
}

let liveNews = null;
let newsTimer = null;
let newsSignature = '';
function renderNews(data, now = Date.now()) {
  const grid = document.querySelector('.news-grid');
  if (!grid || !window.ChonmageNews || !window.ChonmageNewsView) return;
  const cards = document.createDocumentFragment();
  const items = window.ChonmageNews.visibleItems(data, now, 3);
  const root = new URL('./', location.href);
  items.forEach((item) => cards.append(window.ChonmageNewsView.card(item, root)));
  if (!items.length) cards.append(element('p', 'news-empty', '最近30日間のニュースはありません。'));
  grid.replaceChildren(cards);
}
function refreshNews() {
  if (!liveNews || !window.ChonmageNews) return;
  const signature = window.ChonmageNews.visibleItems(liveNews, Date.now(), 3).map((item) => item.id).join('|');
  if (signature !== newsSignature) { renderNews(liveNews); newsSignature = signature; }
  clearTimeout(newsTimer);
  newsTimer = setTimeout(refreshNews, window.ChonmageNews.nextRefreshDelay(liveNews));
}

async function fetchData(path) {
  const response = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

let liveEvents = null;
let liveWeek = null;
let liveLastEntries = null;
let liveSignature = '';

// 予約公開: scheduled events and home cards stay hidden until their publishAt (JST).
const visibleNow = (data) => window.ChonmagePublish ? window.ChonmagePublish.visibleSchedule(data) : data;
// After midnight, before GitHub Actions has written the new day, today's row of the week
// picture stands in so the page never waits for a job. A 25時CLOSE day stays until it closes.
// 最終受付 from the time library (data/last-entry.json) where today's post gives none.
function effectiveSchedule(source) {
  const data = scheduleFromSources(source);
  return window.ChonmageWeek?.withLastEntries ? window.ChonmageWeek.withLastEntries(data, liveLastEntries) : data;
}
function scheduleFromSources(source) {
  let data = visibleNow(source);
  const week = window.ChonmageWeek;
  if (!week || !liveWeek) return data;
  if (!isCurrentSchedule(data)) {
    try {
      const fromWeek = week.daySchedule(liveWeek, getJapanDate());
      if (fromWeek) data = { ...validateEvents(fromWeek), heroOverrides: data.heroOverrides };
    } catch (error) { console.warn('週間スケジュールを使えません。', error); }
  }
  // 本日終了 and 休業 say when the shop opens next.
  const next = isCurrentSchedule(data) ? week.nextOpening(liveWeek, data.date) : null;
  if (next) data = { ...data, nextOpen: next };
  // 表示時間帯: the week's card for this time of day (a date's heroOverrides still wins).
  const today = getJapanDate();
  const card = !data.heroOverrides?.[today] && week.activeCard ? week.activeCard(liveWeek, today, week.japanMinute()) : null;
  return card ? { ...data, heroWindow: { date: today, hero: card } } : data;
}
const signatureOf = (data) => (window.ChonmageSchedule?.scheduleSignature?.(effectiveSchedule(data)) || '') + (window.ChonmagePublish?.visibilityKey(data) || '') + getJapanDate();

function showEvents(source) {
  liveSignature = signatureOf(source);
  const data = effectiveSchedule(source);
  const isCurrent = isCurrentSchedule(data);
  if (isCurrent) {
    renderEvents(data);
  }
  const hasHero = Boolean(window.ChonmageSchedule?.getHeroOverride?.(data));
  if (isCurrent || hasHero) renderHeroSchedule(data);
  applyStaleState(!isCurrent, safeUrl(data.latestXUrl), !isCurrent && !hasHero);
}

async function loadEvents() {
  if (!todaySection) return;
  // Prevent old static times appearing as today's schedule while loading or on failure.
  applyStaleState(true);
  try {
    const [events, week, lastEntries] = await Promise.all([
      fetchData('./data/events.json'),
      fetchData('./data/week.json').catch(() => null),
      fetchData('./data/last-entry.json').catch(() => null),
    ]);
    liveWeek = week;
    liveLastEntries = lastEntries;
    liveEvents = validateEvents(events);
    renderWeek(week);
    showEvents(liveEvents);
  } catch (error) {
    liveEvents = null;
    // The week card does not depend on a valid events.json.
    if (liveWeek) renderWeek(liveWeek);
    applyStaleState(true);
    console.warn('開催情報を読み込めません。公式Xをご確認ください。', error);
  }
}

// 「今週のスケジュール」: the week picture as a table, today marked. Hidden for an old week.
let weekSignature = '';
function renderWeek(week) {
  const section = document.getElementById('week');
  const core = window.ChonmageWeek;
  if (!section || !core) return;
  const today = getJapanDate();
  // Today's own X post (events.json) wins over the week picture's row for today.
  if (week && liveEvents && core.withDailyPost) week = core.withDailyPost(week, liveEvents);
  const days = week ? core.weekDays(week, today) : [];
  const signature = today + JSON.stringify(days) + JSON.stringify(week?.notes || null) + JSON.stringify(liveLastEntries);
  if (signature === weekSignature) return;
  weekSignature = signature;
  section.hidden = !days.length;
  const list = section.querySelector('.week-list');
  if (!list || !days.length) return;
  const noon = (iso) => new Date(iso + 'T12:00:00+09:00');
  const weekday = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(noon(iso)).toUpperCase();
  const range = section.querySelector('.week-range');
  if (range) range.textContent = days[0].date.slice(5).replace('-', '.') + ' – ' + days[days.length - 1].date.slice(5).replace('-', '.');
  // The remaining days share the full width: 3 days left = 3 columns, 7 = 7.
  list.style.setProperty('--week-days', String(days.length));
  list.classList.toggle('is-dense', days.length >= 5);
  list.replaceChildren(...days.map((day) => {
    const open = /^\d{2}:\d{2}$/.test(day.open || '');
    const row = element('li', 'week-day' + (day.date === today ? ' is-today' : '') + (open ? '' : ' is-closed'));
    if (day.date === today) row.setAttribute('aria-current', 'date');
    const head = element('div', 'week-day-head');
    const date = element('p', 'week-date');
    date.append(element('strong', '', String(Number(day.date.slice(8)))), element('span', '', weekday(day.date)));
    if (day.date === today) date.append(element('em', '', 'TODAY'));
    head.append(date, element('p', 'week-hours', open ? day.open + (day.close ? '–' + day.close : ' OPEN') : '休業'));
    row.append(head);
    const games = element('ul', 'week-games');
    if (open && day.ringGame) {
      const ring = element('li', 'week-game is-ring');
      ring.append(element('span', 'week-game-time', '終日'), element('span', 'week-game-title', 'NLHリングゲーム'));
      games.append(ring);
    }
    // Each game shows time and name; ENTRY / RENTRY open with a tap.
    (open && Array.isArray(day.events) ? day.events : []).forEach((event) => {
      const item = element('li', 'week-game');
      const head = [element('span', 'week-game-time', String(event.time || '')), element('span', 'week-game-title', String(event.title || ''))];
      const lastEntry = event.lastEntry || (core.usualLastEntry ? core.usualLastEntry(event, day.open, liveLastEntries) : '');
      const prices = [['ENTRY', event.entry], ['RENTRY', event.reentry], ['最終受付', lastEntry]].filter(([, value]) => value);
      if (!prices.length) { item.append(...head); games.append(item); return; }
      const details = element('details', 'week-game-details');
      const summary = element('summary');
      summary.append(...head, element('span', 'week-game-toggle', event.entry || event.reentry ? '料金' : '詳細'));
      const list = element('dl', 'week-game-entry');
      prices.forEach(([label, value]) => { const row = element('div'); row.append(element('dt', '', label), element('dd', '', String(value))); list.append(row); });
      details.append(summary, list);
      item.append(details);
      games.append(item);
    });
    if (games.children.length) row.append(games);
    return row;
  }));
  // The ※ notes printed under the week picture (施設利用料 etc.).
  const notes = section.querySelector('.week-notes');
  if (notes) {
    const rows = (Array.isArray(week.notes) ? week.notes : []).filter((note) => typeof note === 'string' && note.trim()).slice(0, 5);
    notes.replaceChildren(...rows.map((note) => element('li', '', note.replace(/^※\s*/, ''))));
    notes.hidden = !rows.length;
  }
  const link = section.querySelector('.week-source');
  if (link && typeof week.sourceUrl === 'string' && /^https:\/\/x\.com\//.test(week.sourceUrl)) link.href = week.sourceUrl;
}

// NOW / NEXT / 本日終了 and the date check follow the clock while the page stays open.
function refreshEvents() {
  if (liveWeek) renderWeek(liveWeek);
  if (!liveEvents || signatureOf(liveEvents) === liveSignature) return;
  try { showEvents(liveEvents); } catch (error) { applyStaleState(true); console.warn('開催情報を更新できません。', error); }
}

// An open page reads events.json / week.json again now and then, so a schedule the shop
// changed on X shows without reloading. A failed read keeps what is on screen.
const RELOAD_MS = 5 * 60000;
let lastDataLoad = Date.now();
async function reloadEvents() {
  if (!liveEvents || Date.now() - lastDataLoad < 60000) return;
  lastDataLoad = Date.now();
  try {
    const [events, week, lastEntries] = await Promise.all([fetchData('./data/events.json'), fetchData('./data/week.json').catch(() => liveWeek), fetchData('./data/last-entry.json').catch(() => liveLastEntries)]);
    liveEvents = validateEvents(events);
    liveWeek = week;
    liveLastEntries = lastEntries;
    refreshEvents();
  } catch (error) { console.warn('開催情報を再読み込みできません。', error); }
}

async function loadNews() {
  try {
    liveNews = await fetchData('./data/news.json');
    if (!liveNews || !Array.isArray(liveNews.items)) throw new Error('Missing news items');
    renderNews(liveNews);
    newsSignature = window.ChonmageNews.visibleItems(liveNews, Date.now(), 3).map((item) => item.id).join('|');
    refreshNews();
  } catch (error) {
    const grid = document.querySelector('.news-grid');
    if (grid) grid.replaceChildren(element('p', 'news-empty', 'ニュースを読み込めませんでした。NEWS一覧で再度お試しください。'));
    console.warn('ニュースを読み込めません。', error);
  }
}

// 置きバケ: copy the shop's number (tapping the number itself calls).
document.querySelectorAll('.okibake-copy').forEach((button) => {
  button.addEventListener('click', async () => {
    const status = button.parentElement.querySelector('.okibake-copied');
    const number = button.dataset.copy || '';
    let ok = false;
    try { await navigator.clipboard.writeText(number); ok = true; } catch {
      // Older browsers: copy through a hidden text field.
      const field = document.createElement('textarea');
      field.value = number; field.setAttribute('readonly', ''); field.style.position = 'fixed'; field.style.opacity = '0';
      document.body.append(field); field.select();
      try { ok = document.execCommand('copy'); } catch {}
      field.remove();
    }
    if (status) status.textContent = ok ? 'コピーしました' : '長押しでコピーしてください';
    clearTimeout(button._copiedTimer);
    button._copiedTimer = setTimeout(() => { if (status) status.textContent = ''; }, 2500);
  });
});

// Drafts are accepted only by the opt-in preview document from its same-origin parent.
const isPreviewMode = new URLSearchParams(window.location.search).get('preview') === '1';
if (isPreviewMode) {
  applyStaleState(true);
  let previewSection = null;
  let previewScrollPending = false;
  const positionPreview = () => {
    if (!previewScrollPending || window.frameElement && !window.frameElement.getClientRects().length) return;
    const target = document.getElementById(previewSection === 'news' ? 'news' : previewSection === 'today' ? 'activity-hero' : 'top') || document.getElementById('today');
    if (!target || !target.getClientRects().length) return;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
    previewScrollPending = false;
  };
  window.addEventListener('resize', () => { if (previewScrollPending) requestAnimationFrame(positionPreview); });
  const tellParent = (message) => window.parent.postMessage(message, window.location.origin);
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'CHONMAGE_PREVIEW_REQUEST_READY') {
      tellParent({ type: 'CHONMAGE_PREVIEW_READY' });
      return;
    }
    if (message.type !== 'CHONMAGE_PREVIEW') return;
    try {
      let events = validateEvents(message.events);
      const news = validateNews(message.news);
      if (!['selected', 'actual'].includes(message.dateMode)) throw new Error('Invalid preview date mode');
      if (message.heroDate !== undefined) dateValue(message.heroDate);
      // Both datasets are validated before replacing any content. The real-date mode
      // shows what visitors see now; the edited-date mode also shows scheduled items.
      if (message.dateMode === 'actual') events = visibleNow(events);
      renderEvents(events);
      renderHeroSchedule(events);
      renderNews(news);
      const hasHero = Boolean(window.ChonmageSchedule?.getHeroOverride?.(events));
      const heroStale = message.dateMode === 'actual' ? !isCurrentSchedule(events) && !hasHero :
        Boolean(message.heroDate && message.heroDate !== events.date && !hasHero);
      applyStaleState(message.dateMode === 'actual' && !isCurrentSchedule(events), safeUrl(events.latestXUrl), heroStale);
      if (previewSection !== message.section) {
        previewSection = message.section;
        previewScrollPending = true;
      }
      // Hidden iframe scrolls are ignored by browsers; retry when it is shown.
      if (previewScrollPending) requestAnimationFrame(positionPreview);
      tellParent({ type: 'CHONMAGE_PREVIEW_RENDERED', requestId: message.requestId });
    } catch (error) {
      console.warn('下書きのプレビューを更新できません。', error);
      tellParent({ type: 'CHONMAGE_PREVIEW_ERROR', requestId: message.requestId });
    }
  });
  tellParent({ type: 'CHONMAGE_PREVIEW_READY' });
} else {
  loadEvents();
  loadNews();
  let activityTimer;
  const scheduleRefresh = () => {
    clearTimeout(activityTimer);
    if (window.ChonmageActivity?.testTime) return;
    activityTimer = setTimeout(() => { refreshEvents(); scheduleRefresh(); }, window.ChonmageActivity?.nextMinuteDelay() ?? 60000 - (Date.now() % 60000) + 20);
  };
  scheduleRefresh();
  if (!window.ChonmageActivity?.testTime) setInterval(() => { if (!document.hidden) reloadEvents(); }, RELOAD_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { refreshEvents(); scheduleRefresh(); refreshNews(); reloadEvents(); }
  });
  window.addEventListener('pageshow', refreshNews);
}
