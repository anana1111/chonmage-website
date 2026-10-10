'use strict';
// Adapt the existing events.json/admin model. Pure functions also run in Node tests.
(() => {
  const DAY = 1440, LAST_CALL = 10, RUNNING = 180;
  const OFFICIAL_X = 'https://x.com/ChonmageNiigata';
  const LATE_FACT = /^(最終受付|late\s*reg(?:istration)?)$/i;
  const text = (value) => typeof value === 'string' ? value : '';
  function timeToMinutes(value) {
    if (typeof value !== 'string' || !/^(?:[0-3]?\d|4[0-7]):[0-5]\d$/.test(value)) return null;
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }
  function businessMinute(value, open) {
    const minute = timeToMinutes(value);
    if (minute === null) return null;
    return minute < 360 && open !== null && open >= 360 ? minute + DAY : minute;
  }
  function afterStart(value, start, open) {
    let minute = businessMinute(value, open);
    if (minute !== null && minute < start) minute += DAY;
    return minute;
  }
  function safeLink(value, allowTelephone = false) {
    if (allowTelephone && typeof value === 'string' && /^tel:\+?[\d -]+$/.test(value)) return value;
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
    catch { return ''; }
  }
  function adaptSchedule(data = {}) {
    const open = timeToMinutes(data.open);
    let close = businessMinute(data.close, open);
    if (close !== null && open !== null && close < open) close += DAY;
    const events = (Array.isArray(data.events) ? data.events : []).filter((event) => event && !event.hidden).flatMap((event, index) => {
      const start = businessMinute(event.time, open);
      if (start === null) return [];
      const facts = (Array.isArray(event.facts) ? event.facts : []).filter((fact) => fact && typeof fact.label === 'string' && typeof fact.value === 'string');
      // 置きバケ連絡締切 is a contact deadline, NOT tournament registration.
      const registrationText = text(event.registrationEnd) || text(facts.find((fact) => LATE_FACT.test(fact.label.trim()))?.value);
      const parsed = registrationText.match(/^\s*((?:[0-3]?\d|4[0-7])[:：][0-5]\d)(?:\s*(?:まで|締切|締め切り|終了))?\s*$/)?.[1]?.replace('：', ':');
      let registrationEnd = afterStart(parsed, start, open);
      if (registrationEnd !== null && (registrationEnd - start > 12 * 60 || close !== null && registrationEnd > close)) registrationEnd = null;
      const explicitEnd = afterStart(event.end, start, open);
      const end = explicitEnd !== null ? explicitEnd : (registrationEnd ?? start) + RUNNING;
      if (registrationEnd !== null && registrationEnd > end) registrationEnd = null;
      return [{ id: text(event.id) || `event-${index}`, title: text(event.title), start, startTime: text(event.time), registrationEnd, end,
        facts, tags: (Array.isArray(event.tags) ? event.tags : []).filter((tag) => typeof tag === 'string'), description: text(event.description),
        link: { label: text(event.link?.label) || '公式Xで確認 ↗', url: safeLink(event.link?.url, true) || safeLink(data.schedulePostUrl) || safeLink(data.latestXUrl) || OFFICIAL_X } }];
    }).sort((a, b) => a.start - b.start);
    const ringStart = businessMinute(data.ringGame?.start, open) ?? open;
    const ring = data.ringGame?.enabled && ringStart !== null ? { id: 'ring', start: ringStart, title: text(data.ringGame.title) || 'RING GAME', description: text(data.ringGame.description) } : null;
    const nextOpen = data.nextOpen && typeof data.nextOpen.label === 'string' ? `${data.nextOpen.label} OPEN` : '';
    return { date: text(data.date), closed: data.status === 'closed', open, close, openTime: text(data.open), closeTime: text(data.close), ring, events, nextOpen,
      latestUrl: safeLink(data.schedulePostUrl) || safeLink(data.latestXUrl) || OFFICIAL_X };
  }
  function getEventStatus(event, now) {
    if (now < event.start) return { status: 'upcoming', remaining: event.start - now };
    if (now >= event.end) return { status: 'finished', remaining: 0 };
    if (event.registrationEnd !== null && now < event.registrationEnd) {
      const remaining = event.registrationEnd - now;
      return { status: remaining <= LAST_CALL ? 'last-call' : 'registering', remaining };
    }
    return { status: 'running', remaining: 0 };
  }
  function getPrimaryState(now, schedule) {
    const events = schedule.events.map((event) => ({ ...event, ...getEventStatus(event, now) }));
    if (schedule.closed) return { type: 'closed-day', events };
    if (schedule.open === null) return { type: 'open-info', events };
    if (now < schedule.open) return { type: 'before-open', remaining: schedule.open - now, events };
    if (schedule.close !== null && now >= schedule.close) return { type: 'after-close', events };
    const registering = events.filter((event) => ['registering', 'last-call'].includes(event.status)).sort((a, b) => a.remaining - b.remaining || a.start - b.start)[0];
    if (registering) return { type: registering.status === 'last-call' ? 'last-call' : 'tournament-open', event: registering, remaining: registering.remaining, events };
    if (schedule.ring && now >= schedule.ring.start) return { type: 'open-ring', events };
    const next = events.find((event) => event.status === 'upcoming');
    if (next) return { type: 'next-event', event: next, remaining: next.remaining, events };
    // No remaining tournament does not mean that the store is closed.
    return { type: 'open-info', events };
  }
  function secondaryItems(state, schedule, now) {
    if (['after-close', 'closed-day'].includes(state.type)) return [];
    const result = [];
    if (schedule.ring && state.type !== 'open-ring') result.push({ ...schedule.ring, kind: 'ring', status: now < schedule.ring.start ? 'upcoming' : 'running' });
    result.push(...state.events.filter((event) => event.id !== state.event?.id && ['registering', 'last-call', 'running'].includes(event.status)));
    const next = state.events.find((event) => event.id !== state.event?.id && event.status === 'upcoming');
    if (next) result.push(next);
    return result;
  }
  function formatRemaining(value) {
    if (!Number.isFinite(value)) return '';
    const minutes = Math.max(0, Math.ceil(value));
    return minutes < 60 ? `${minutes}分` : `${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ''}`;
  }
  function minuteLabel(minute) { return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`; }
  const queryNow = typeof location === 'object' ? new URLSearchParams(location.search).get('now') : null;
  const testTime = timeToMinutes(queryNow) !== null ? queryNow : null;
  function testClock(data) { return testTime ? { current: true, minute: businessMinute(testTime, timeToMinutes(data.open)) } : null; }
  function nextMinuteDelay(now = Date.now()) { return 60000 - (now % 60000) + 20; }

  function node(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined) el.textContent = value;
    return el;
  }
  function link(label, url, focusKey) {
    const el = node('a', 'activity-link', label);
    el.href = safeLink(url, true) || OFFICIAL_X;
    if (!el.href.startsWith('tel:')) { el.target = '_blank'; el.rel = 'noreferrer'; }
    el.dataset.activityFocus = focusKey;
    return el;
  }
  function factsList(facts, className) {
    const list = node('dl', className);
    facts.forEach((fact) => { const row = node('div'); row.append(node('dt', '', fact.label), node('dd', '', fact.value)); list.append(row); });
    return list;
  }
  function detailsFor(event, openIds) {
    const details = node('details', 'activity-details'); details.dataset.activityDetails = event.id; details.open = openIds.has(event.id);
    const summary = node('summary', '', '詳細を見る'); summary.dataset.activityFocus = `${event.id}-details`; details.append(summary);
    if (event.description) details.append(node('p', '', event.description));
    if (event.tags?.length) details.append(node('p', 'activity-tags', event.tags.join(' · ')));
    if (event.facts?.length) details.append(factsList(event.facts, 'activity-facts'));
    if (event.link) details.append(link(event.link.label, event.link.url, `${event.id}-link`));
    return details;
  }
  function eventStatusText(event, selected) {
    if (event.status === 'upcoming') return selected ? '開催予定' : `開始まであと${formatRemaining(event.remaining)}`;
    if (['registering', 'last-call'].includes(event.status)) return `受付中 · あと${formatRemaining(event.remaining)}`;
    // The end of a game is not known (a FREE ROLL can finish early), so a started game shows
    // its start and last entry instead of 開催中.
    const start = `${event.startTime} 開始`;
    return event.registrationEnd === null ? `${start} · 最終受付はXで確認` : `${start} · 最終受付 ${minuteLabel(event.registrationEnd % DAY)}`;
  }
  function heroContent(state, schedule, selected) {
    const remaining = formatRemaining(state.remaining);
    switch (state.type) {
      case 'before-open': return { status: 'BEFORE OPEN', kicker: selected ? '営業予定' : '今日の営業開始', value: `${schedule.openTime} OPEN`, title: selected ? 'この日の開催予定' : `あと${remaining}`, description: schedule.ring?.start === schedule.open ? '開店後はRING GAMEに参加できます' : '開催内容は下の予定をご覧ください' };
      case 'tournament-open': return { status: 'LIVE', kicker: 'いま参加できます', value: state.event.title, title: 'まだ参加できます', description: `受付終了まであと${remaining}` };
      case 'last-call': return { status: 'LAST CALL', kicker: '受付まもなく終了', value: `あと${remaining}`, title: `${state.event.title} 受付終了`, description: 'まだ間に合います' };
      case 'open-ring': return { status: 'NOW', kicker: '今から遊べる', value: schedule.ring.title, title: '今すぐ参加できます', description: '途中参加OK · 好きなタイミングで参加できます' };
      case 'next-event': return { status: 'NEXT', kicker: '次のゲーム', value: state.event.startTime, title: state.event.title, description: `開始まであと${remaining}` };
      case 'after-close': return { status: 'CLOSED', kicker: '本日の営業は終了しました', value: 'またのご来店を', title: schedule.nextOpen ? `次の営業 · ${schedule.nextOpen}` : '', description: '次回の営業情報は公式Xでお知らせします' };
      case 'closed-day': return { status: 'CLOSED', kicker: '本日の営業', value: '本日は休業です', title: schedule.nextOpen ? `次の営業 · ${schedule.nextOpen}` : '', description: '次回の営業情報は公式Xをご確認ください' };
      default: return { status: 'INFORMATION', kicker: '当日のご案内', value: '最新情報はXで', title: '', description: '開催状況・参加受付は公式Xまたは店舗へご確認ください' };
    }
  }
  let lastIdentity = '';
  function clear() {
    delete document.body.dataset.activityState; lastIdentity = '';
    const announce = document.getElementById('activity-announce'); if (announce) announce.textContent = '';
  }
  function render(data, options = {}) {
    const container = document.querySelector('#today .event-list'); if (!container) return;
    const schedule = adaptSchedule(data), selected = Boolean(options.selected);
    const minute = selected ? -Infinity : options.minute;
    if (typeof minute !== 'number' || Number.isNaN(minute)) return;
    const state = getPrimaryState(minute, schedule), secondary = secondaryItems(state, schedule, minute);
    const shown = new Set([state.event?.id, ...secondary.filter((item) => item.kind !== 'ring').map((item) => item.id)]);
    const later = ['after-close', 'closed-day'].includes(state.type) ? [] : state.events.filter((event) => event.status === 'upcoming' && !shown.has(event.id));
    const openIds = new Set([...container.querySelectorAll('details[open]')].map((el) => el.dataset.activityDetails));
    const focused = container.contains(document.activeElement) ? document.activeElement.dataset.activityFocus : null;
    const content = heroContent(state, schedule, selected), identity = `${state.type}:${state.event?.id || ''}`;
    container.classList.remove('timeline-enhanced'); container.classList.add('activity-enhanced'); document.body.dataset.activityState = state.type;
    const fragment = document.createDocumentFragment();
    if (testTime) fragment.append(node('p', 'activity-test-note', `時刻のテスト表示：${data.date} ${testTime}（日本時間）`));
    const hero = node('article', 'activity-hero'); hero.id = 'activity-hero'; hero.tabIndex = -1; hero.setAttribute('aria-labelledby', 'activity-value');
    if (state.event) { hero.dataset.activityEvent = state.event.id; hero.dataset.eventStatus = state.event.status; }
    if (lastIdentity && identity !== lastIdentity) hero.classList.add('is-switching');
    const status = node('div', 'activity-status'); status.append(node('span', 'activity-badge', content.status), node('span', 'activity-kicker', content.kicker));
    const value = node('h3', 'activity-value', content.value); value.id = 'activity-value';
    if (state.type === 'last-call') {
      value.classList.add('activity-value--count'); value.replaceChildren(node('span', 'activity-count-label', 'あと'), node('span', 'activity-count', String(Math.ceil(state.remaining))), node('span', 'activity-count-label', '分'));
    }
    hero.append(status, value);
    if (content.title) hero.append(node('p', 'activity-title', content.title));
    hero.append(node('p', 'activity-description', content.description));
    if (state.event) {
      const highlights = state.event.facts.filter((fact) => /entry|参加|施設利用料|stack|持ち点/i.test(fact.label)).slice(0, 3);
      if (highlights.length) hero.append(factsList(highlights, 'activity-meta'));
      hero.append(detailsFor(state.event, openIds));
    } else if (state.type === 'open-ring') hero.append(detailsFor({ ...schedule.ring, link: { label: 'Xで状況を見る ↗', url: schedule.latestUrl } }, openIds));
    else hero.append(link('公式Xで確認 ↗', schedule.latestUrl, 'primary-x'));
    fragment.append(hero);
    const secondarySection = node('section', 'activity-secondary'); secondarySection.id = 'secondary-cards'; secondarySection.setAttribute('aria-label', 'ほかのゲームと次の予定'); secondarySection.hidden = !secondary.length;
    secondary.forEach((event) => {
      const card = node('article', 'activity-card'), ring = event.kind === 'ring';
      if (!ring) { card.dataset.activityEvent = event.id; card.dataset.eventStatus = event.status; }
      const label = ring ? 'RING GAME' : `${event.status === 'upcoming' ? 'NEXT · ' : ''}${event.startTime}`;
      card.append(node('p', 'activity-card-label', label), node('h3', 'activity-card-title', event.title));
      const description = ring ? event.status === 'upcoming' ? `${minuteLabel(event.start)}から参加OK` : 'いつでも参加OK' : eventStatusText(event, selected);
      card.append(node('p', 'activity-card-state', description));
      card.append(detailsFor(ring ? { ...event, link: { label: 'Xで状況を見る ↗', url: schedule.latestUrl } } : event, openIds)); secondarySection.append(card);
    });
    fragment.append(secondarySection);
    const laterSection = node('section', 'activity-later'); laterSection.id = 'activity-later'; laterSection.setAttribute('aria-labelledby', 'activity-later-title');
    const laterTitle = node('h3', '', '今日このあと'); laterTitle.id = 'activity-later-title';
    const list = node('ul'); list.id = 'later-list';
    later.forEach((event) => {
      const row = node('li'); row.dataset.activityEvent = event.id; row.dataset.eventStatus = event.status;
      const details = detailsFor(event, openIds), summary = details.querySelector('summary');
      summary.replaceChildren(node('span', 'activity-later-time', event.startTime), node('span', 'activity-later-name', event.title), node('span', 'activity-later-remaining', selected ? '開催予定' : `あと${formatRemaining(event.remaining)}`));
      row.append(details); list.append(row);
    });
    const closedText = schedule.nextOpen ? `次の営業は${schedule.nextOpen}です。` : '次回の開催情報は公式Xをご確認ください。';
    if (!later.length) list.append(node('li', 'activity-empty', ['after-close', 'closed-day'].includes(state.type) ? closedText : 'このあと予定されているゲームはありません。'));
    laterSection.append(laterTitle, list); fragment.append(laterSection); container.replaceChildren(fragment);
    let announce = document.getElementById('activity-announce');
    if (!announce) { announce = node('p', 'activity-sr-only'); announce.id = 'activity-announce'; announce.setAttribute('aria-live', 'polite'); announce.setAttribute('aria-atomic', 'true'); container.after(announce); }
    if (identity !== lastIdentity) announce.textContent = `${content.kicker} ${content.value} ${content.title}`;
    lastIdentity = identity;
    if (focused) ([...container.querySelectorAll('[data-activity-focus]')].find((el) => el.dataset.activityFocus === focused) || hero).focus({ preventScroll: true });
  }
  globalThis.ChonmageActivity = { adaptSchedule, timeToMinutes, getEventStatus, getPrimaryState, secondaryItems, formatRemaining, testTime, testClock, nextMinuteDelay, render, clear };
})();
