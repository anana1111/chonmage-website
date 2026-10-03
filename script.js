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
  if (!data || !Array.isArray(data.items)) throw new Error('Missing news items');
  data.items.forEach((item) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid news item');
    dateValue(item.date);
    ['category', 'visualLabel', 'title', 'description'].forEach((key) => requireText(item[key]));
    if (!['schedule', 'event', 'result'].includes(item.theme)) throw new Error('Invalid news theme');
    safeUrl(item.url);
  });
  return data;
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
  }
}

function renderNews(data) {
  const grid = document.querySelector('.news-grid');
  if (!grid) return;
  const cards = document.createDocumentFragment();
  data.items.forEach((item) => {
    const card = element('article', 'news-card reveal in');
    const image = contentLink(`news-image news-image--${item.theme}`, '', item.url);
    image.setAttribute('aria-label', `${item.title}を公式Xで見る`);
    const arrow = element('span', 'news-image-arrow', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    image.append(element('span', 'news-image-category', item.category), element('strong', '', item.visualLabel), arrow);
    const meta = element('div', 'news-meta');
    const time = element('time', '', item.date.replaceAll('-', '.'));
    time.setAttribute('datetime', item.date);
    meta.append(time, element('span', '', item.category));
    const title = element('h3');
    title.append(contentLink('', item.title, item.url));
    card.append(image, meta, title, element('p', '', item.description));
    cards.append(card);
  });
  grid.replaceChildren(cards);
}

async function fetchData(path) {
  const response = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

let liveEvents = null;
let liveSignature = '';

const signatureOf = (data) => window.ChonmageSchedule?.scheduleSignature?.(data) || '';

function showEvents(data) {
  liveSignature = signatureOf(data);
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
    liveEvents = validateEvents(await fetchData('./data/events.json'));
    showEvents(liveEvents);
  } catch (error) {
    liveEvents = null;
    applyStaleState(true);
    console.warn('開催情報を読み込めません。公式Xをご確認ください。', error);
  }
}

// NOW / NEXT / 本日終了 and the date check follow the clock while the page stays open.
function refreshEvents() {
  if (!liveEvents || signatureOf(liveEvents) === liveSignature) return;
  try { showEvents(liveEvents); } catch (error) { applyStaleState(true); console.warn('開催情報を更新できません。', error); }
}

async function loadNews() {
  try {
    renderNews(validateNews(await fetchData('./data/news.json')));
  } catch (error) {
    console.warn('ニュースを読み込めません。表示中の情報または公式Xをご確認ください。', error);
  }
}

// Drafts are accepted only by the opt-in preview document from its same-origin parent.
const isPreviewMode = new URLSearchParams(window.location.search).get('preview') === '1';
if (isPreviewMode) {
  applyStaleState(true);
  let previewSection = null;
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
      const events = validateEvents(message.events);
      const news = validateNews(message.news);
      if (!['selected', 'actual'].includes(message.dateMode)) throw new Error('Invalid preview date mode');
      if (message.heroDate !== undefined) dateValue(message.heroDate);
      // Both datasets are validated before replacing any content.
      renderEvents(events);
      renderHeroSchedule(events);
      renderNews(news);
      const hasHero = Boolean(window.ChonmageSchedule?.getHeroOverride?.(events));
      const heroStale = message.dateMode === 'actual' ? !isCurrentSchedule(events) && !hasHero :
        Boolean(message.heroDate && message.heroDate !== events.date && !hasHero);
      applyStaleState(message.dateMode === 'actual' && !isCurrentSchedule(events), safeUrl(events.latestXUrl), heroStale);
      if (previewSection !== message.section) {
        previewSection = message.section;
        const target = document.getElementById(previewSection === 'news' ? 'news' : 'top');
        if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
      }
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
  setInterval(refreshEvents, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshEvents(); });
}
