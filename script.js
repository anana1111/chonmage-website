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

function requireText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing text');
}

function requireTime(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Invalid time');
}

function safeUrl(value, allowTelephone = false) {
  if (typeof value !== 'string') throw new Error('Missing URL');
  const url = new URL(value);
  if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  if (allowTelephone && /^tel:\+?[\d -]+$/.test(value)) return value;
  throw new Error('Unsupported URL');
}

function validateEvents(data) {
  dateValue(data.date);
  requireTime(data.open);
  if (data.close) requireTime(data.close);
  if (!['open', 'closed'].includes(data.status)) throw new Error('Invalid status');
  safeUrl(data.latestXUrl);
  if (data.schedulePostUrl) safeUrl(data.schedulePostUrl);
  if (data.summary !== undefined) {
    if (!Array.isArray(data.summary)) throw new Error('Invalid summary');
    data.summary.forEach(requireText);
  }
  if (data.ringGame) {
    if (typeof data.ringGame.enabled !== 'boolean') throw new Error('Invalid ring game');
    if (data.ringGame.start) requireTime(data.ringGame.start);
    if (data.ringGame.enabled) {
      requireText(data.ringGame.title);
      requireText(data.ringGame.description);
    }
  }
  if (!Array.isArray(data.events)) throw new Error('Missing events');
  const eventIds = new Set();
  data.events.filter((event) => !event.hidden).forEach((event) => {
    if (event.id !== undefined) {
      requireText(event.id);
      if (eventIds.has(event.id)) throw new Error('Duplicate event id');
      eventIds.add(event.id);
    }
    requireTime(event.time);
    if (event.end) requireTime(event.end);
    requireText(event.title);
    requireText(event.description);
    if (event.type !== undefined && !['free', 'tournament', 'special', 'event'].includes(event.type)) throw new Error('Invalid event type');
    if (!['blue', 'orange'].includes(event.theme)) throw new Error('Invalid event theme');
    if (event.hidden !== undefined && typeof event.hidden !== 'boolean') throw new Error('Invalid hidden flag');
    if (event.isMain !== undefined && typeof event.isMain !== 'boolean') throw new Error('Invalid main flag');
    if (event.heroTitle !== undefined) requireText(event.heroTitle);
    if (event.tags !== undefined && !Array.isArray(event.tags)) throw new Error('Invalid tags');
    (event.tags || []).forEach(requireText);
    if (event.facts !== undefined && !Array.isArray(event.facts)) throw new Error('Invalid facts');
    (event.facts || []).forEach((fact) => { requireText(fact.label); requireText(fact.value); });
    if (event.link) { requireText(event.link.label); safeUrl(event.link.url, true); }
  });
  return data;
}

function validateNews(data) {
  if (!Array.isArray(data.items)) throw new Error('Missing news items');
  data.items.forEach((item) => {
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

function renderEvents(data) {
  if (typeof window.renderChonmageTimeline === 'function') {
    window.renderChonmageTimeline(data);
    return;
  }
  const list = todaySection?.querySelector('.event-list');
  if (!list) return;
  const cards = document.createDocumentFragment();
  data.events.forEach((event) => {
    const card = element('article', `event-card event-card--${event.theme} reveal in`);
    const time = element('div', 'event-time');
    time.append(element('span', '', 'START'), element('time', '', event.time));
    const main = element('div', 'event-main');
    const tags = element('div', 'event-tags');
    (event.tags || []).forEach((tag) => tags.append(element('span', '', tag)));
    main.append(tags, element('h3', '', event.title), element('p', '', event.description));
    if (event.facts?.length) {
      const facts = element('dl', 'event-facts');
      event.facts.forEach((fact) => {
        const row = element('div');
        row.append(element('dt', '', fact.label), element('dd', '', fact.value));
        facts.append(row);
      });
      main.append(facts);
    }
    card.append(time, main);
    if (event.link) card.append(contentLink('event-link', event.link.label, event.link.url, true));
    cards.append(card);
  });
  list.replaceChildren(cards);

  const summary = todaySection.querySelector('.today-summary');
  if (summary) {
    summary.querySelector('span').textContent = formatJapaneseDate(data.date);
    summary.querySelector('strong').textContent = data.status === 'closed' ? '本日休業' : `${data.open} OPEN`;
    const copy = summary.querySelector('p');
    copy.replaceChildren();
    (data.summary || ['当日の開催情報は公式Xをご確認ください。']).forEach((line, index) => {
      if (index) copy.append(element('br'));
      copy.append(document.createTextNode(line));
    });
  }
  const ring = todaySection.querySelector('.ring-banner');
  if (ring) {
    // Explicit display is needed because this component's existing CSS uses grid.
    ring.hidden = !data.ringGame?.enabled;
    ring.style.display = ring.hidden ? 'none' : '';
    if (!ring.hidden) {
      ring.querySelector('strong').textContent = data.ringGame.title;
      ring.querySelector('p').textContent = data.ringGame.description;
      ring.querySelector('a').setAttribute('href', safeUrl(data.latestXUrl));
    }
  }
}

function renderHeroSchedule(data) {
  if (typeof window.renderChonmageTimelineHero === 'function') {
    window.renderChonmageTimelineHero(data);
    return;
  }
  const schedule = document.querySelector('.hero-schedule');
  if (!schedule) return;
  const date = document.getElementById('hero-schedule-date');
  const status = document.getElementById('hero-business-status-text');
  if (date) date.textContent = formatJapaneseDate(data.date);
  if (status) status.textContent = data.status === 'closed' ? '本日休業' : '本日営業';
  const visibleEvents = data.events.filter((event) => !event.hidden);
  let detailCount = 0;
  ['open', 'next', 'main'].forEach((name, index) => {
    const item = schedule.querySelector(`[data-hero-event="${name}"]`);
    if (!item) return;
    const event = visibleEvents[index - 1];
    item.hidden = data.status === 'closed' || (name !== 'open' && !event);
    if (!item.hidden) {
      item.querySelector('strong').textContent = name === 'open'
        ? data.open : `${event.time} ${event.heroTitle || event.title}`;
      detailCount += 1;
    }
  });
  schedule.dataset.detailCount = String(detailCount);
  schedule.querySelector('.schedule-x')?.setAttribute('href', safeUrl(data.latestXUrl));
}

function applyStaleState(isStale, latestXUrl = officialXUrl) {
  if (!todaySection) return;
  const live = todaySection.querySelector('.today-live-content');
  const message = todaySection.querySelector('.today-stale-message');
  if (live) live.hidden = isStale;
  if (message) message.hidden = !isStale;
  todaySection.classList.toggle('is-stale', isStale);
  todaySection.setAttribute('aria-labelledby', isStale ? 'today-stale-title' : 'today-title');
  todaySection.querySelector('.today-stale-x')?.setAttribute('href', latestXUrl);
  const schedule = document.querySelector('.hero-schedule');
  schedule?.classList.toggle('is-stale', isStale);
  schedule?.setAttribute('aria-label', isStale ? '最新の営業・イベント情報' : '本日の営業とイベント');
  schedule?.querySelector('.schedule-x')?.setAttribute('href', latestXUrl);
  if (isStale) {
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

async function loadEvents() {
  if (!todaySection) return;
  // Prevent old static times appearing as today's schedule while loading or on failure.
  applyStaleState(true);
  try {
    const data = validateEvents(await fetchData('./data/events.json'));
    const isCurrent = data.date === getJapanDate();
    if (isCurrent) {
      renderEvents(data);
      renderHeroSchedule(data);
    }
    applyStaleState(!isCurrent, safeUrl(data.latestXUrl));
  } catch (error) {
    applyStaleState(true);
    console.warn('開催情報を読み込めません。公式Xをご確認ください。', error);
  }
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
      // Both datasets are validated before replacing any content.
      renderEvents(events);
      renderHeroSchedule(events);
      renderNews(news);
      applyStaleState(message.dateMode === 'actual' && events.date !== getJapanDate(), safeUrl(events.latestXUrl));
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
}
