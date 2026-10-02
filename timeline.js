'use strict';
(() => {
  const timelineState = { dateMode: 'actual', data: null, rail: null, activeIndex: 0 };
  const KIND_ORDER = { open: 0, ring: 1, free: 2, tournament: 3, special: 3, event: 4, close: 9 };

  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }

  function validTime(value) {
    return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  function minutes(value) {
    if (!validTime(value)) return Number.POSITIVE_INFINITY;
    const parts = value.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  }

  function japanClock(now) {
    const date = now || new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return {
      date: values.year + '-' + values.month + '-' + values.day,
      minute: Number(values.hour) * 60 + Number(values.minute),
    };
  }

  function timelineDateLabel(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'TODAY';
    const parts = iso.split('-');
    const date = new Date(iso + 'T12:00:00+09:00');
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(date).toUpperCase();
    return 'TODAY · ' + parts[1] + '.' + parts[2] + ' ' + weekday;
  }

  function normalizedType(event) {
    const explicit = String(event.type || '').toLowerCase();
    if (['free', 'tournament', 'special', 'event'].includes(explicit)) return explicit;
    const text = String(event.title || '') + ' ' + String(event.heroTitle || '');
    if (/free\s*roll|フリー ?ロール/i.test(text)) return 'free';
    if (/special|スペシャル/i.test(text)) return 'special';
    if (/tournament|トーナメント|王者/i.test(text)) return 'tournament';
    return 'event';
  }

  function buildTimeline(data) {
    if (!data || data.status === 'closed') return [];
    const list = [];
    if (validTime(data.open)) {
      list.push({
        id: 'open',
        kind: 'open',
        time: data.open,
        typeLabel: 'OPEN',
        title: '本日の営業スタート',
        description: '',
        facts: [],
        tags: [],
      });
    }
    if (data.ringGame && data.ringGame.enabled) {
      const start = validTime(data.ringGame.start) ? data.ringGame.start : data.open;
      if (validTime(start)) {
        list.push({
          id: 'ring',
          kind: 'ring',
          time: start,
          end: validTime(data.close) ? data.close : '',
          typeLabel: 'RING GAME',
          title: data.ringGame.title || 'RING GAME',
          description: data.ringGame.description || 'OPENから参加者募集中',
          facts: [],
          tags: ['途中参加 OK'],
          link: data.latestXUrl ? { label: 'Xで状況を見る ↗', url: data.latestXUrl } : null,
        });
      }
    }
    (data.events || []).filter((event) => !event.hidden).forEach((event, index) => {
      if (!validTime(event.time)) return;
      const kind = normalizedType(event);
      const labels = { free: 'FREE ROLL', tournament: 'TOURNAMENT', special: 'SPECIAL', event: 'EVENT' };
      list.push({
        id: event.id || ('event-' + index + '-' + event.time.replace(':', '')),
        kind,
        time: event.time,
        end: validTime(event.end) ? event.end : '',
        typeLabel: event.heroTitle || labels[kind] || 'EVENT',
        title: event.title,
        description: event.description || '',
        facts: Array.isArray(event.facts) ? event.facts : [],
        tags: Array.isArray(event.tags) ? event.tags : [],
        link: event.link || null,
        sourceEvent: event,
      });
    });
    if (validTime(data.close)) {
      list.push({
        id: 'close',
        kind: 'close',
        time: data.close,
        typeLabel: 'CLOSE',
        title: '本日の営業終了',
        description: '',
        facts: [],
        tags: [],
      });
    }
    return list.sort((a, b) => {
      const diff = minutes(a.time) - minutes(b.time);
      if (diff) return diff;
      return (KIND_ORDER[a.kind] ?? 5) - (KIND_ORDER[b.kind] ?? 5);
    });
  }

  function statusMap(data, items) {
    const result = new Map();
    const clock = japanClock();
    const selectedPreview = timelineState.dateMode === 'selected' && data.date !== clock.date;
    if (data.date !== clock.date && !selectedPreview) return result;
    const nowMinute = selectedPreview ? -1 : clock.minute;
    let nextIndex = -1;

    items.forEach((item, index) => {
      const start = minutes(item.time);
      const end = validTime(item.end) ? minutes(item.end) : null;
      if (item.kind === 'ring') {
        const ringEnd = end !== null ? end : (validTime(data.close) ? minutes(data.close) : 24 * 60);
        if (nowMinute >= start && nowMinute < ringEnd) result.set(item.id, 'now');
        else if (nowMinute > ringEnd) result.set(item.id, 'past');
      } else if (end !== null && nowMinute >= start && nowMinute < end) {
        result.set(item.id, 'now');
      } else if (nowMinute > start || (item.kind === 'open' && nowMinute >= start)) {
        result.set(item.id, 'past');
      }
      if (nextIndex === -1 && start > nowMinute && item.kind !== 'ring') nextIndex = index;
    });

    if (nextIndex === -1) nextIndex = items.findIndex((item) => minutes(item.time) > nowMinute);
    if (nextIndex >= 0) {
      const item = items[nextIndex];
      if (!result.has(item.id)) result.set(item.id, 'next');
    }
    return result;
  }

  function highlightFacts(facts) {
    const preferred = ['ENTRY', '参加料金', 'STARTING STACK', 'STACK', '持ち点', '施設利用料'];
    const sorted = facts.slice().sort((a, b) => {
      const ai = preferred.findIndex((key) => String(a.label || '').toUpperCase().includes(key));
      const bi = preferred.findIndex((key) => String(b.label || '').toUpperCase().includes(key));
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    return sorted.slice(0, 2);
  }

  function createCard(item, stateName, index) {
    const card = node('article', 'timeline-card timeline-card--' + item.kind);
    card.dataset.timelineIndex = String(index);
    card.dataset.state = stateName || '';
    card.setAttribute('aria-label', item.time + ' ' + item.typeLabel + ' ' + item.title);

    const top = node('div', 'timeline-card__top');
    const time = node('time', 'timeline-card__time', item.time);
    time.dateTime = item.time;
    const badgeRow = node('div', 'timeline-card__badges');
    if (stateName === 'now') badgeRow.append(node('span', 'timeline-status timeline-status--now', 'NOW'));
    if (stateName === 'next') badgeRow.append(node('span', 'timeline-status timeline-status--next', 'NEXT'));
    badgeRow.append(node('span', 'timeline-card__type', item.typeLabel));
    top.append(time, badgeRow);

    const title = node('h3', 'timeline-card__title', item.title);
    const highlights = node('dl', 'timeline-card__highlights');
    highlightFacts(item.facts).forEach((fact) => {
      const row = node('div');
      row.append(node('dt', '', fact.label), node('dd', '', fact.value));
      highlights.append(row);
    });

    card.append(top, title);
    if (highlights.children.length) card.append(highlights);

    const hasDetails = Boolean(item.description || item.tags.length || item.facts.length || item.link);
    if (hasDetails) {
      const details = node('details', 'timeline-card__details');
      const summary = node('summary', '', '詳細を見る');
      const body = node('div', 'timeline-card__detail-body');
      if (item.description) body.append(node('p', '', item.description));
      if (item.tags.length) {
        const tags = node('div', 'timeline-card__tags');
        item.tags.forEach((tag) => tags.append(node('span', '', tag)));
        body.append(tags);
      }
      if (item.facts.length) {
        const facts = node('dl', 'timeline-card__facts');
        item.facts.forEach((fact) => {
          const row = node('div');
          row.append(node('dt', '', fact.label), node('dd', '', fact.value));
          facts.append(row);
        });
        body.append(facts);
      }
      if (item.link && item.link.url && item.link.label) {
        try {
          const anchor = node('a', 'timeline-card__link', item.link.label);
          const url = new URL(item.link.url, location.href);
          if (url.protocol === 'https:' || url.protocol === 'tel:') {
            anchor.href = url.href;
            if (url.protocol === 'https:') {
              anchor.target = '_blank';
              anchor.rel = 'noreferrer';
            }
            body.append(anchor);
          }
        } catch { /* invalid optional link stays hidden */ }
      }
      details.append(summary, body);
      card.append(details);
    }
    return card;
  }

  function updateSummary(data) {
    const today = document.getElementById('today');
    if (!today) return;
    const title = document.getElementById('today-title');
    if (title) {
      const br = document.createElement('br');
      title.replaceChildren(document.createTextNode('今日、'), br, document.createTextNode('何して遊ぶ？'));
    }
    const summary = today.querySelector('.today-summary');
    if (summary) {
      const date = summary.querySelector('span');
      const strong = summary.querySelector('strong');
      if (date) date.textContent = timelineDateLabel(data.date);
      if (strong) strong.textContent = validTime(data.close) ? ('営業時間 ' + data.open + '–' + data.close) : (data.open + ' OPEN');
    }
    const ring = today.querySelector('.ring-banner');
    if (ring) {
      ring.hidden = true;
      ring.style.display = 'none';
    }
  }

  function activeIndexForRail(rail) {
    const cards = Array.from(rail.querySelectorAll('.timeline-card'));
    if (!cards.length) return 0;
    const left = rail.scrollLeft;
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    cards.forEach((card, index) => {
      const diff = Math.abs(card.offsetLeft - left);
      if (diff < distance) {
        distance = diff;
        best = index;
      }
    });
    return best;
  }

  function attachControls(wrapper, rail, cards) {
    const controls = node('div', 'timeline-controls');
    const arrows = node('div', 'timeline-arrows');
    const prev = node('button', 'timeline-arrow', '←');
    const next = node('button', 'timeline-arrow', '→');
    prev.type = 'button';
    next.type = 'button';
    prev.setAttribute('aria-label', '前の時間カード');
    next.setAttribute('aria-label', '次の時間カード');
    arrows.append(prev, next);

    const dots = node('div', 'timeline-dots');
    dots.setAttribute('role', 'group');
    dots.setAttribute('aria-label', '時間カードの位置');
    cards.forEach((card, index) => {
      const dot = node('button', 'timeline-dot');
      dot.type = 'button';
      dot.setAttribute('aria-label', '時間カード ' + (index + 1) + ' を表示');
      dot.addEventListener('click', () => card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' }));
      dots.append(dot);
    });
    controls.append(dots, arrows);
    wrapper.append(controls);

    function update() {
      const index = activeIndexForRail(rail);
      timelineState.activeIndex = index;
      Array.from(dots.children).forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        dot.setAttribute('aria-current', i === index ? 'true' : 'false');
      });
      prev.disabled = index <= 0;
      next.disabled = index >= cards.length - 1;
    }

    function move(offset) {
      const index = Math.max(0, Math.min(cards.length - 1, activeIndexForRail(rail) + offset));
      cards[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }

    prev.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    rail.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1);
    });

    let ticking = false;
    rail.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    }, { passive: true });

    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    rail.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.pointerType === 'touch') return;
      dragging = true;
      startX = event.clientX;
      startScroll = rail.scrollLeft;
      rail.classList.add('is-dragging');
      rail.setPointerCapture?.(event.pointerId);
    });
    rail.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      rail.scrollLeft = startScroll - (event.clientX - startX);
    });
    const stop = () => {
      dragging = false;
      rail.classList.remove('is-dragging');
    };
    rail.addEventListener('pointerup', stop);
    rail.addEventListener('pointercancel', stop);
    rail.addEventListener('lostpointercapture', stop);
    update();
  }

  function renderTimeline(data) {
    timelineState.data = data;
    const container = document.querySelector('#today .event-list');
    if (!container) return;
    const items = buildTimeline(data);
    const states = statusMap(data, items);
    container.classList.add('timeline-enhanced');
    container.replaceChildren();

    const wrapper = node('div', 'timeline-shell');
    const rail = node('div', 'timeline-rail');
    rail.tabIndex = 0;
    rail.setAttribute('role', 'region');
    rail.setAttribute('aria-label', '本日の営業時間とイベント。横方向にスクロールできます。');
    rail.setAttribute('aria-roledescription', '時間カード');

    const cards = items.map((item, index) => createCard(item, states.get(item.id), index));
    if (!cards.length) {
      wrapper.append(node('p', 'timeline-empty', data.status === 'closed' ? '本日は休業です。' : '本日のイベント情報は公式Xをご確認ください。'));
    } else {
      rail.append(...cards);
      wrapper.append(rail);
      attachControls(wrapper, rail, cards);
    }
    container.append(wrapper);
    timelineState.rail = rail;
    updateSummary(data);
  }

  function renderHero(data) {
    const schedule = document.querySelector('.hero-schedule');
    if (!schedule) return;
    const openItem = schedule.querySelector('[data-hero-event="open"]');
    const nextItem = schedule.querySelector('[data-hero-event="next"]');
    const mainItem = schedule.querySelector('[data-hero-event="main"]');
    const events = (data.events || []).filter((event) => !event.hidden && validTime(event.time)).slice().sort((a, b) => minutes(a.time) - minutes(b.time));
    const clock = japanClock();
    const selectedPreview = timelineState.dateMode === 'selected' && data.date !== clock.date;
    const nowMinute = selectedPreview ? -1 : clock.minute;
    let nextEvent = events.find((event) => minutes(event.time) > nowMinute);
    if (!nextEvent) nextEvent = events[0] || null;
    const mainEvent = events.find((event) => event.isMain) || events.find((event) => ['special', 'tournament'].includes(normalizedType(event))) || events[1] || events[0] || null;

    if (openItem) {
      openItem.hidden = data.status === 'closed';
      const strong = openItem.querySelector('strong');
      if (strong) strong.textContent = data.open;
    }
    if (nextItem) {
      nextItem.hidden = data.status === 'closed' || !nextEvent;
      const strong = nextItem.querySelector('strong');
      if (strong && nextEvent) strong.textContent = nextEvent.time + ' ' + (nextEvent.heroTitle || nextEvent.title);
    }
    if (mainItem) {
      mainItem.hidden = data.status === 'closed' || !mainEvent;
      const strong = mainItem.querySelector('strong');
      if (strong && mainEvent) strong.textContent = mainEvent.time + ' ' + (mainEvent.heroTitle || mainEvent.title);
    }
    const count = [openItem, nextItem, mainItem].filter((item) => item && !item.hidden).length;
    schedule.dataset.detailCount = String(count);
    const x = schedule.querySelector('.schedule-x');
    if (x && data.latestXUrl) x.href = data.latestXUrl;
  }

  window.renderChonmageTimeline = renderTimeline;
  window.renderChonmageTimelineHero = renderHero;

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const message = event.data;
    if (!message || typeof message !== 'object' || message.type !== 'CHONMAGE_PREVIEW') return;
    timelineState.dateMode = message.dateMode === 'selected' ? 'selected' : 'actual';
  });
})();
