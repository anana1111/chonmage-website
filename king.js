// KING: the champions of the monthly ranking final (ランキング王者決定戦), from data/king.json.
// /king/ fills #king-view (latest KING, every past KING by year, most crowns, how to take part);
// the homepage fills #home-king with the latest KING only. Every KING has a shareable #YYYY-MM link.
(function () {
  'use strict';
  const view = document.getElementById('king-view');
  const home = document.getElementById('home-king');
  if (!view && !home) return;
  const siteRoot = new URL(home ? './' : '../', location.href);
  const pageUrl = new URL('king/', siteRoot).href;
  const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const PHOTO = /^(?:\.\/)?images\/[A-Za-z0-9_\/-]+\.(?:webp|avif|jpg|png)$/;
  const POST = /^https:\/\/(?:x|twitter)\.com\/(?:ChonmageNiigata|Old_Chonmage)\/status\/\d+\/?$/;
  const LINK = /^https:\/\/[^\s"<>]+$/;
  const CROWN = 'M4 38 0 8l17 13L32 0l15 21L64 8l-4 30zM4 40h56v4H4z';
  const EVENT = 'ランキング王者決定戦';

  const node = (tag, className, text) => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  };
  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  const count = (value) => (Number.isInteger(value) && value > 0 ? value : 0);

  function crown(className) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 64 44'); svg.setAttribute('aria-hidden', 'true');
    if (className) svg.setAttribute('class', className);
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', CROWN); path.setAttribute('fill', 'currentColor');
    svg.append(path); return svg;
  }

  // Only real champions are published: rows marked "placeholder" are dropped, except with ?demo=1
  // (a preview of how a fuller wall looks).
  const demo = new URLSearchParams(location.search).has('demo');
  function clean(data) {
    const rows = Array.isArray(data && data.items) ? data.items : [];
    const items = rows
      .filter((row) => row && (demo || row.placeholder !== true) && MONTH.test(text(row.month)) && text(row.name))
      .map((row) => ({
        month: text(row.month), period: text(row.period), name: text(row.name), prize: text(row.prize), entries: count(row.entries),
        photo: PHOTO.test(text(row.photo)) ? text(row.photo) : '', card: PHOTO.test(text(row.card)) ? text(row.card) : '', comment: text(row.comment),
        post: POST.test(text(row.post)) ? text(row.post) : '', won: DAY.test(text(row.won)) ? text(row.won) : ''
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
    const raw = (data && data.next) || {};
    const next = {
      date: DAY.test(text(raw.date)) ? text(raw.date) : '', time: /^\d{1,2}:\d{2}$/.test(text(raw.time)) ? text(raw.time) : '',
      ranking: LINK.test(text(raw.ranking)) ? text(raw.ranking) : ''
    };
    return { items, next };
  }

  const monthTitle = (month) => { const [, y, m] = month.match(MONTH); return y + '年' + Number(m) + '月度'; };
  // A KING that covered more than one ranking month carries its own label, e.g. "2025年9・10月度".
  const label = (item) => item.period || monthTitle(item.month);
  const dotted = (day) => day.replaceAll('-', '.');
  function time(value, className, label) { const result = node('time', className, label); result.dateTime = value; return result; }

  // "2026年8月度 KING"
  function title(item, className) {
    const result = node('p', className);
    result.append(time(item.month, '', label(item)), node('span', '', ' KING'));
    return result;
  }
  function name(item, tag, className) {
    const result = node(tag, className);
    result.append(node('span', '', item.name), node('small', '', '様'));
    return result;
  }
  // "ランキング王者決定戦 · 2026.09.13 優勝"
  function won(item, className) {
    const result = node('p', className);
    result.append(node('span', '', EVENT));
    if (item.won) result.append(time(item.won, '', dotted(item.won) + ' 優勝'));
    return result;
  }

  // The champion card (portrait 4:5, shown whole) when there is one, then the X picture;
  // otherwise a placeholder in the shop colors with the initial.
  function photo(item, className, eager) {
    const source = item.card || item.photo;
    const figure = node('figure', className + (item.card ? ' is-card' : source ? '' : ' is-blank'));
    if (source) {
      const image = node('img');
      image.src = new URL(source, siteRoot).href;
      image.alt = label(item) + ' KING ' + item.name + '様';
      image.decoding = 'async'; image.loading = eager ? 'eager' : 'lazy';
      figure.append(image);
    } else {
      figure.setAttribute('aria-hidden', 'true');
      figure.append(crown('king-photo-crown'), node('span', 'king-photo-initial', Array.from(item.name)[0].toUpperCase()));
    }
    return figure;
  }

  function copyButton(item) {
    const button = node('button', 'king-copy', 'リンクをコピー');
    button.type = 'button';
    button.addEventListener('click', () => {
      const url = pageUrl + '#' + item.month;
      const done = () => { button.textContent = 'コピーしました'; setTimeout(() => { button.textContent = 'リンクをコピー'; }, 2000); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, () => { location.hash = item.month; });
      else location.hash = item.month;
    });
    return button;
  }
  function postLink(item, className) {
    const link = node('a', className, 'Xの投稿を見る ↗');
    link.href = item.post; link.target = '_blank'; link.rel = 'noopener';
    return link;
  }

  function facts(item) {
    const list = node('dl', 'king-facts');
    const fact = (label, value) => { const row = node('div'); row.append(node('dt', '', label), node('dd', '', value)); list.append(row); };
    if (item.prize) fact('PRIZE', item.prize);
    if (item.entries) fact('ENTRIES', item.entries + '名');
    return list.childElementCount ? list : null;
  }
  function comment(item) {
    if (!item.comment) return null;
    const quote = node('blockquote', 'king-comment'); quote.append(node('p', '', item.comment)); return quote;
  }

  // Homepage: photo, name, which month, when, and the way to the whole history.
  function homeCard(item) {
    const card = node('article', 'home-king-card');
    card.setAttribute('aria-labelledby', 'home-king-name');
    const body = node('div', 'home-king-body');
    const heading = name(item, 'h3', 'home-king-name'); heading.id = 'home-king-name';
    const link = node('a', 'home-king-more', '歴代のKINGを見る'); link.href = pageUrl;
    link.append(node('span', '', ' →'));
    body.append(title(item, 'home-king-title'), heading, won(item, 'home-king-won'), link);
    card.append(photo(item, 'home-king-photo', false), body);
    return card;
  }

  // /king/ first screen: the latest KING, large.
  function latest(item, counts) {
    const card = node('article', 'king-latest');
    card.id = item.month; card.setAttribute('aria-labelledby', 'king-latest-name');
    const body = node('div', 'king-latest-body');
    const label = node('p', 'king-latest-label'); label.append(crown('king-latest-crown'), node('span', '', '最新のKING'));
    const heading = name(item, 'h2', 'king-latest-name'); heading.id = 'king-latest-name';
    body.append(label, title(item, 'king-latest-title'), heading, won(item, 'king-latest-won'));
    if (counts.get(item.name) > 1) body.append(node('p', 'king-badge', '通算 ' + counts.get(item.name) + ' 回目のKING'));
    [facts(item), comment(item)].forEach((part) => { if (part) body.append(part); });
    const actions = node('div', 'king-actions');
    if (item.post) actions.append(postLink(item, 'king-action'));
    actions.append(copyButton(item));
    body.append(actions);
    card.append(photo(item, 'king-latest-photo', true), body);
    return card;
  }

  // Past KINGs: photo, name, month and date always shown; the rest folds into "大会の記録を見る".
  function past(item, counts) {
    const card = node('article', 'king-card');
    card.id = item.month; card.setAttribute('aria-labelledby', 'king-name-' + item.month);
    const body = node('div', 'king-card-body');
    const heading = name(item, 'h4', 'king-card-name'); heading.id = 'king-name-' + item.month;
    body.append(title(item, 'king-card-title'), heading, won(item, 'king-card-won'));
    if (counts.get(item.name) > 1) body.append(node('p', 'king-badge', '♛ ×' + counts.get(item.name)));
    const record = node('details', 'king-record');
    const parts = [facts(item), comment(item), item.post ? postLink(item, 'king-record-link') : null].filter(Boolean);
    if (parts.length) { record.append(node('summary', '', '大会の記録を見る'), ...parts); body.append(record); }
    body.append(copyButton(item));
    card.append(photo(item, 'king-card-photo', false), body);
    return card;
  }

  // Players with more than one crown, most first (ties: the more recent KING first).
  function ranking(items, counts) {
    const players = [...counts].filter(([, total]) => total > 1).map(([player, total]) => ({
      player, total, last: items.find((item) => item.name === player).month
    })).sort((a, b) => b.total - a.total || b.last.localeCompare(a.last)).slice(0, 5);
    if (!players.length) return null;
    const section = node('section', 'king-section king-ranking');
    section.setAttribute('aria-labelledby', 'king-ranking-title');
    const heading = node('h2', 'king-section-title', '最多戴冠'); heading.id = 'king-ranking-title';
    const list = node('ol', 'king-ranking-list');
    players.forEach((row) => {
      const li = node('li', 'king-ranking-row');
      const crowns = node('span', 'king-ranking-crowns'); crowns.setAttribute('aria-label', row.total + '回');
      for (let i = 0; i < row.total; i += 1) crowns.append(crown());
      const who = node('span', 'king-ranking-name'); who.append(node('span', '', row.player), node('small', '', '様'));
      li.append(who, crowns, node('span', 'king-ranking-total', '×' + row.total));
      list.append(li);
    });
    section.append(heading, list);
    return section;
  }

  // How to become the next KING, then where to go next.
  function nextKing(next) {
    const section = node('section', 'king-next');
    section.setAttribute('aria-labelledby', 'king-next-title');
    const heading = node('h2', 'king-next-title', '次のKINGは、あなた。'); heading.id = 'king-next-title';
    const steps = node('ol', 'king-steps');
    ['月間ランキングに挑戦', '出場資格を獲得', '王者決定戦へ'].forEach((step, index) => {
      const li = node('li'); li.append(node('span', 'king-step-num', String(index + 1)), node('span', '', step)); steps.append(li);
    });
    section.append(heading, steps);
    if (next.date) {
      const [y, m, d] = next.date.split('-').map(Number);
      const week = '日月火水木金土'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
      const line = node('p', 'king-next-date');
      line.append(node('span', '', '次回の' + EVENT), time(next.date, '', m + '月' + d + '日（' + week + '）' + (next.time ? ' ' + next.time : '')));
      section.append(line);
    }
    const actions = node('div', 'king-next-actions');
    if (next.ranking) {
      const rankingLink = node('a', 'king-next-button is-primary', 'ランキングを見る'); rankingLink.href = next.ranking;
      actions.append(rankingLink);
    }
    const schedule = node('a', 'king-next-button' + (next.ranking ? '' : ' is-primary'), '開催スケジュールを見る');
    schedule.href = new URL('./#today', siteRoot).href;
    actions.append(schedule);
    section.append(actions);
    return section;
  }

  function render({ items, next }) {
    const fragment = document.createDocumentFragment();
    if (demo) fragment.append(node('p', 'king-preview-note', 'デモ表示：仮のKINGを含みます。'));
    if (!items.length) {
      fragment.append(node('p', 'king-state', '歴代KINGの記録を準備中です。'));
    } else {
      const counts = new Map();
      items.forEach((item) => counts.set(item.name, (counts.get(item.name) || 0) + 1));
      fragment.append(latest(items[0], counts));
      if (items.length > 1) {
        const section = node('section', 'king-section');
        section.setAttribute('aria-labelledby', 'king-history-title');
        const heading = node('h2', 'king-section-title', '歴代KING'); heading.id = 'king-history-title';
        section.append(heading);
        let year = '', grid = null;
        items.slice(1).forEach((item) => {
          if (item.month.slice(0, 4) !== year) {
            year = item.month.slice(0, 4);
            section.append(node('h3', 'king-year', year));
            grid = node('div', 'king-grid'); section.append(grid);
          }
          grid.append(past(item, counts));
        });
        fragment.append(section);
      }
      const top = ranking(items, counts);
      if (top) fragment.append(top);
    }
    fragment.append(nextKing(next));
    view.replaceChildren(fragment);
    view.setAttribute('aria-busy', 'false');
    // A shared link (/king/#2026-08) lands on that KING once the records are in the page.
    const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target && MONTH.test(target.id)) { target.classList.add('is-target'); target.scrollIntoView(); }
  }

  fetch(new URL('data/king.json', siteRoot).href, { cache: 'no-cache' })
    .then((response) => { if (!response.ok) throw new Error(response.status); return response.json(); })
    .then((data) => {
      const cleaned = clean(data);
      if (view) render(cleaned);
      else if (cleaned.items.length) home.replaceChildren(homeCard(cleaned.items[0]));
    })
    .catch(() => {
      // The homepage keeps its static link to /king/.
      if (!view) return;
      view.replaceChildren(node('p', 'king-state', '記録を読み込めませんでした。時間をおいて再度お試しください。'));
      view.setAttribute('aria-busy', 'false');
    });
}());
