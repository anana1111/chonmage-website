'use strict';
(() => {
  const timelineState = { dateMode: 'actual', data: null, rail: null, activeIndex: 0, userScrolled: false };
  const DAY = 24 * 60;
  // Times before 06:00 after an evening OPEN belong to the same business day (25時CLOSE = 01:00).
  const BUSINESS_DAY_START = 6 * 60;
  // A started event without `end` stays NOW until the next event, CLOSE, or this long.
  const DEFAULT_EVENT_MINUTES = 180;
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

  function scheduleMinutes(value, open) {
    const result = minutes(value);
    if (!Number.isFinite(result)) return result;
    const openMinute = minutes(open);
    const afterMidnight = result < BUSINESS_DAY_START && (!Number.isFinite(openMinute) || openMinute >= BUSINESS_DAY_START);
    return afterMidnight ? result + DAY : result;
  }

  function previousDate(iso) {
    const date = new Date(iso + 'T12:00:00+09:00');
    date.setUTCDate(date.getUTCDate() - 1);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }

  // Where "now" falls in this schedule's business day, in Japan time.
  function businessClock(data, now) {
    const clock = japanClock(now);
    if (!data || typeof data.date !== 'string') return { current: false, minute: clock.minute };
    if (data.date === clock.date) return { current: true, minute: clock.minute };
    const closeMinute = data.status === 'open' && validTime(data.close) ? scheduleMinutes(data.close, data.open) : NaN;
    if (closeMinute > DAY && data.date === previousDate(clock.date) && clock.minute + DAY < closeMinute) {
      return { current: true, minute: clock.minute + DAY };
    }
    return { current: false, minute: clock.minute };
  }

  function isPreviewSelected(data) {
    return timelineState.dateMode === 'selected' && !businessClock(data).current;
  }

  function currentMinute(data) {
    return isPreviewSelected(data) ? -1 : businessClock(data).minute;
  }

  function businessPhase(data, nowMinute) {
    if (!data || data.status === 'closed') return 'closed';
    if (isPreviewSelected(data)) return 'scheduled';
    if (validTime(data.open) && nowMinute < scheduleMinutes(data.open, data.open)) return 'before';
    if (validTime(data.close) && nowMinute >= scheduleMinutes(data.close, data.open)) return 'ended';
    return 'open';
  }

  function heroDateLabel(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'TODAY';
    const date = new Date(iso + 'T12:00:00+09:00');
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(date).toUpperCase();
    return iso.replaceAll('-', '.') + ' · ' + weekday;
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
      const diff = scheduleMinutes(a.time, data.open) - scheduleMinutes(b.time, data.open);
      if (diff) return diff;
      return (KIND_ORDER[a.kind] ?? 5) - (KIND_ORDER[b.kind] ?? 5);
    });
  }

  function itemWindow(data, items, index) {
    const item = items[index];
    const start = scheduleMinutes(item.time, data.open);
    const close = validTime(data.close) ? scheduleMinutes(data.close, data.open) : null;
    if (item.kind === 'open' || item.kind === 'close') return { start, end: start };
    if (validTime(item.end)) {
      let end = scheduleMinutes(item.end, data.open);
      if (end <= start) end += DAY;
      return { start, end };
    }
    if (item.kind === 'ring') return { start, end: close !== null ? close : DAY + BUSINESS_DAY_START };
    // No explicit end: the event is running until the next event starts.
    const following = items.slice(index + 1).find((other) => !['ring', 'open', 'close'].includes(other.kind) && scheduleMinutes(other.time, data.open) > start);
    const candidates = [start + DEFAULT_EVENT_MINUTES];
    if (following) candidates.push(scheduleMinutes(following.time, data.open));
    if (close !== null && close > start) candidates.push(close);
    return { start, end: Math.min(...candidates) };
  }

  function statusMap(data, items) {
    const result = new Map();
    if (!businessClock(data).current && !isPreviewSelected(data)) return result;
    const nowMinute = currentMinute(data);
    const ended = businessPhase(data, nowMinute) === 'ended';

    items.forEach((item, index) => {
      const { start, end } = itemWindow(data, items, index);
      if (ended || (item.kind === 'open' && nowMinute >= start) || (item.kind !== 'open' && nowMinute >= end && nowMinute >= start)) {
        result.set(item.id, 'past');
      } else if (nowMinute >= start && nowMinute < end) {
        result.set(item.id, 'now');
      }
    });
    if (ended) return result;

    let next = items.find((item) => !['ring', 'close'].includes(item.kind) && scheduleMinutes(item.time, data.open) > nowMinute);
    if (!next) next = items.find((item) => item.kind === 'ring' && scheduleMinutes(item.time, data.open) > nowMinute);
    if (next && !result.has(next.id)) result.set(next.id, 'next');
    return result;
  }

  // NOW first (the most recently started event), otherwise NEXT.
  function focusIndex(items, states) {
    let target = -1;
    items.forEach((item, index) => {
      if (states.get(item.id) === 'now' && item.kind !== 'ring') target = index;
    });
    if (target < 0) target = items.findIndex((item) => states.get(item.id) === 'next');
    if (target < 0) target = items.findIndex((item) => states.get(item.id) === 'now');
    if (target < 0 && items.length && items.every((item) => states.get(item.id) === 'past')) target = items.length - 1;
    return Math.max(target, 0);
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
    card.dataset.timelineId = item.id;
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
      title.replaceChildren(document.createTextNode('今日、'), br, node('span', 'today-title-phrase', '何して遊ぶ？'));
    }
    const summary = today.querySelector('.today-summary');
    if (summary) {
      const date = summary.querySelector('span');
      const strong = summary.querySelector('strong');
      const copy = summary.querySelector('p');
      if (date) date.textContent = timelineDateLabel(data.date);
      if (strong) {
        if (data.status === 'closed') strong.textContent = '本日休業';
        else strong.textContent = validTime(data.close) ? ('営業時間 ' + data.open + '–' + data.close) : (data.open + ' OPEN');
      }
      if (copy) {
        const lines = Array.isArray(data.summary) && data.summary.length ? data.summary : ['当日の変更は公式Xでお知らせします。'];
        copy.replaceChildren();
        lines.forEach((line, index) => {
          if (index) copy.append(document.createElement('br'));
          copy.append(document.createTextNode(line));
        });
      }
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
      dot.addEventListener('click', () => {
        timelineState.userScrolled = true;
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      });
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
      timelineState.userScrolled = true;
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

    const markUserScroll = () => { timelineState.userScrolled = true; };
    rail.addEventListener('wheel', markUserScroll, { passive: true });
    rail.addEventListener('touchstart', markUserScroll, { passive: true });
    rail.addEventListener('pointerdown', markUserScroll);
    let ticking = false;
    rail.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    }, { passive: true });

    // Mouse drag scrolls the rail. The pointer is captured only once it really moves,
    // so a plain click still reaches 「詳細を見る」 and links inside the cards.
    let pressed = false;
    let dragging = false;
    let suppressClick = false;
    let startX = 0;
    let startScroll = 0;
    rail.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.pointerType === 'touch') return;
      pressed = true;
      dragging = false;
      suppressClick = false;
      startX = event.clientX;
      startScroll = rail.scrollLeft;
    });
    rail.addEventListener('pointermove', (event) => {
      if (!pressed) return;
      if (!dragging && Math.abs(event.clientX - startX) > 5) {
        dragging = true;
        rail.classList.add('is-dragging');
        rail.setPointerCapture?.(event.pointerId);
      }
      if (dragging) rail.scrollLeft = startScroll - (event.clientX - startX);
    });
    const stop = () => {
      if (dragging) suppressClick = true;
      pressed = false;
      dragging = false;
      rail.classList.remove('is-dragging');
    };
    rail.addEventListener('click', (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
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
    const previousRail = timelineState.rail;
    const previousScroll = previousRail && previousRail.isConnected ? previousRail.scrollLeft : 0;
    // Keep 「詳細を見る」 panels the visitor opened when the clock refresh re-renders.
    const openIds = new Set([...container.querySelectorAll('.timeline-card')]
      .filter((card) => card.querySelector('details[open]')).map((card) => card.dataset.timelineId));
    container.classList.add('timeline-enhanced');
    container.replaceChildren();

    const wrapper = node('div', 'timeline-shell');
    const rail = node('div', 'timeline-rail');
    rail.tabIndex = 0;
    rail.setAttribute('role', 'region');
    rail.setAttribute('aria-label', '本日の営業時間とイベント。横方向にスクロールできます。');
    rail.setAttribute('aria-roledescription', '時間カード');

    const cards = items.map((item, index) => createCard(item, states.get(item.id), index));
    cards.forEach((card) => { if (openIds.has(card.dataset.timelineId)) card.querySelector('details')?.setAttribute('open', ''); });
    if (!cards.length) {
      wrapper.append(node('p', 'timeline-empty', data.status === 'closed' ? '本日は休業です。' : '本日のイベント情報は公式Xをご確認ください。'));
    } else {
      if (businessClock(data).current && businessPhase(data, currentMinute(data)) === 'ended') {
        const ended = node('p', 'timeline-ended');
        ended.append(node('strong', '', '本日終了'), document.createTextNode('本日の営業は終了しました。次回の営業情報は公式Xでお知らせします。'));
        wrapper.append(ended);
      }
      rail.append(...cards);
      wrapper.append(rail);
      attachControls(wrapper, rail, cards);
    }
    container.append(wrapper);
    timelineState.rail = rail;
    updateSummary(data);

    if (cards.length) {
      const target = cards[focusIndex(items, states)];
      const keepUserScroll = timelineState.userScrolled && previousRail;
      // Positioned after the current task so the section is visible and measurable.
      requestAnimationFrame(() => {
        if (!rail.isConnected) return;
        const left = keepUserScroll ? previousScroll : target.offsetLeft - cards[0].offsetLeft;
        rail.scrollTo({ left, behavior: 'instant' });
      });
    }
  }

  function setHeroItem(item, label, event) {
    if (!item) return;
    item.hidden = !event;
    if (!event) return;
    const span = item.querySelector('span');
    const strong = item.querySelector('strong');
    if (span) span.textContent = label;
    if (strong) strong.textContent = event.time + ' ' + (event.heroTitle || event.title);
  }

  function renderHero(data) {
    const schedule = document.querySelector('.hero-schedule');
    if (!schedule) return;
    const openItem = schedule.querySelector('[data-hero-event="open"]');
    const nextItem = schedule.querySelector('[data-hero-event="next"]');
    const mainItem = schedule.querySelector('[data-hero-event="main"]');
    const open = data.open;
    const events = (data.events || []).filter((event) => !event.hidden && validTime(event.time))
      .slice().sort((a, b) => scheduleMinutes(a.time, open) - scheduleMinutes(b.time, open));
    const nowMinute = currentMinute(data);
    const phase = businessPhase(data, nowMinute);
    const closed = phase === 'closed';

    const dateLabel = document.getElementById('hero-schedule-date');
    if (dateLabel) dateLabel.textContent = heroDateLabel(data.date);
    const statusText = document.getElementById('hero-business-status-text');
    const statusLabels = { closed: '本日休業', scheduled: '本日営業', before: '本日 ' + open + ' OPEN', open: '営業中', ended: '本日終了' };
    if (statusText) statusText.textContent = statusLabels[phase];
    const status = document.getElementById('hero-business-status');
    if (status) status.dataset.phase = phase;

    // NEXT is the next upcoming event; while nothing is upcoming, the running event is shown as NOW.
    const items = buildTimeline(data);
    const states = statusMap(data, items);
    const stateOf = (event) => states.get((items.find((item) => item.sourceEvent === event) || {}).id);
    let nextEvent = null;
    let nextLabel = 'NEXT';
    if (!closed && phase !== 'ended') {
      nextEvent = events.find((event) => scheduleMinutes(event.time, open) > nowMinute) || null;
      if (!nextEvent) {
        nextEvent = events.slice().reverse().find((event) => stateOf(event) === 'now') || null;
        nextLabel = 'NOW';
      }
    }
    const mainEvent = closed ? null : (events.find((event) => event.isMain) ||
      events.slice().reverse().find((event) => ['special', 'tournament'].includes(normalizedType(event))) || null);

    if (openItem) {
      openItem.hidden = closed || !validTime(open);
      const strong = openItem.querySelector('strong');
      if (strong && validTime(open)) strong.textContent = open;
    }
    if (nextEvent && nextEvent === mainEvent) {
      setHeroItem(nextItem, nextLabel + ' · MAIN', nextEvent);
      setHeroItem(mainItem, 'MAIN', null);
    } else {
      setHeroItem(nextItem, nextLabel, nextEvent);
      setHeroItem(mainItem, 'MAIN', mainEvent);
    }
    const count = [openItem, nextItem, mainItem].filter((item) => item && !item.hidden).length;
    schedule.dataset.detailCount = String(count);
    const x = schedule.querySelector('.schedule-x');
    if (x && data.latestXUrl) x.href = data.latestXUrl;
  }

  // Changes only when something visible changes (date check, phase, NOW / NEXT / past).
  function scheduleSignature(data) {
    const items = buildTimeline(data);
    return JSON.stringify([businessClock(data).current, businessPhase(data, currentMinute(data)), [...statusMap(data, items)]]);
  }

  window.ChonmageSchedule = { businessClock, scheduleMinutes, scheduleSignature };
  window.renderChonmageTimeline = renderTimeline;
  window.renderChonmageTimelineHero = renderHero;

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const message = event.data;
    if (!message || typeof message !== 'object' || message.type !== 'CHONMAGE_PREVIEW') return;
    timelineState.dateMode = message.dateMode === 'selected' ? 'selected' : 'actual';
  });
})();
