// KING page: renders data/king.json (monthly tournament winners), newest month first.
(function () {
  'use strict';
  const view = document.getElementById('king-view');
  const siteRoot = new URL('../', location.href);
  const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
  const PHOTO = /^(?:\.\/)?images\/[A-Za-z0-9_\/-]+\.(?:webp|avif|jpg|png)$/;
  const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  const node = (tag, className, text) => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  };
  const text = (value) => (typeof value === 'string' ? value.trim() : '');

  function clean(data) {
    const rows = Array.isArray(data && data.items) ? data.items : [];
    return rows
      .filter((row) => row && MONTH.test(text(row.month)) && text(row.name))
      .map((row) => ({
        month: text(row.month), name: text(row.name), prize: text(row.prize),
        photo: PHOTO.test(text(row.photo)) ? text(row.photo) : '', comment: text(row.comment),
        placeholder: row.placeholder === true
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }

  function monthParts(month) {
    const [, year, mm] = month.match(MONTH);
    return { year, number: Number(mm), en: MONTH_EN[Number(mm) - 1] };
  }

  function time(month, className, label) {
    const result = node('time', className, label); result.dateTime = month; return result;
  }

  function portrait(item, className, eager) {
    const figure = node('figure', className);
    if (item.photo) {
      const image = node('img');
      image.src = new URL(item.photo, siteRoot).href;
      image.alt = item.name + '様（' + monthParts(item.month).number + '月のKING）';
      image.decoding = 'async'; image.loading = eager ? 'eager' : 'lazy';
      figure.append(image);
    } else {
      figure.classList.add('is-empty');
      const initial = node('span', 'king-initial', Array.from(item.name)[0].toUpperCase());
      initial.setAttribute('aria-hidden', 'true');
      figure.append(initial);
    }
    return figure;
  }

  // How many times each player has won, so repeat champions get a ×N badge.
  function crownCounts(items) {
    const counts = new Map();
    items.forEach((item) => counts.set(item.name, (counts.get(item.name) || 0) + 1));
    return counts;
  }

  function featured(item, counts) {
    const part = monthParts(item.month);
    const card = node('article', 'king-latest');
    card.setAttribute('aria-labelledby', 'king-latest-name');
    const body = node('div', 'king-latest-body');
    const label = node('p', 'king-latest-label');
    label.append(node('span', '', 'LATEST KING'), time(item.month, '', part.year + '.' + String(part.number).padStart(2, '0')));
    const big = node('p', 'king-latest-month');
    big.append(node('span', 'king-latest-num', String(part.number)), node('span', 'king-latest-unit', '月のKING'));
    const name = node('h2', 'king-latest-name');
    name.id = 'king-latest-name';
    name.append(node('span', '', item.name), node('small', '', '様'));
    body.append(label, big, name);
    const total = counts.get(item.name);
    if (total > 1) body.append(node('p', 'king-badge', '通算 ' + total + ' 回目のKING'));
    if (item.prize) {
      const prize = node('dl', 'king-prize');
      const row = node('div');
      row.append(node('dt', '', 'PRIZE'), node('dd', '', item.prize));
      prize.append(row); body.append(prize);
    }
    if (item.comment) body.append(node('p', 'king-comment', item.comment));
    card.append(portrait(item, 'king-latest-photo', true), body);
    return card;
  }

  function card(item, counts) {
    const part = monthParts(item.month);
    const li = node('li', 'king-card');
    const head = node('div', 'king-card-month');
    head.append(node('span', 'king-card-num', String(part.number).padStart(2, '0')), time(item.month, 'king-card-date', part.en + ' ' + part.year));
    const body = node('div', 'king-card-body');
    const name = node('h3', 'king-card-name');
    name.append(node('span', '', item.name), node('small', '', '様'));
    body.append(name);
    const total = counts.get(item.name);
    if (total > 1) body.append(node('span', 'king-badge king-badge--small', '×' + total));
    if (item.prize) body.append(node('p', 'king-card-prize', item.prize));
    li.append(head, portrait(item, 'king-card-photo', false), body);
    return li;
  }

  function render(items) {
    const fragment = document.createDocumentFragment();
    if (!items.length) {
      fragment.append(node('p', 'king-state', 'チャンピオンの記録を準備中です。'));
    } else {
      const counts = crownCounts(items);
      if (items.some((item) => item.placeholder)) {
        fragment.append(node('p', 'king-preview-note', 'プレビュー：名前と賞品は仮の内容です。'));
      }
      fragment.append(featured(items[0], counts));
      const players = counts.size;
      const stats = node('p', 'king-stats');
      stats.append(node('strong', '', String(items.length)), node('span', '', '回の開催'), node('strong', '', String(players)), node('span', '', '人のKING'));
      fragment.append(stats);
      if (items.length > 1) {
        const heading = node('h2', 'king-list-title', 'HALL OF KINGS');
        const list = node('ol', 'king-list');
        list.setAttribute('aria-label', '歴代のKING（新しい順）');
        items.slice(1).forEach((item) => list.append(card(item, counts)));
        fragment.append(heading, list);
      }
    }
    view.replaceChildren(fragment);
    view.setAttribute('aria-busy', 'false');
  }

  fetch(new URL('data/king.json', siteRoot).href, { cache: 'no-cache' })
    .then((response) => { if (!response.ok) throw new Error(response.status); return response.json(); })
    .then((data) => render(clean(data)))
    .catch(() => {
      view.replaceChildren(node('p', 'king-state', '記録を読み込めませんでした。時間をおいて再度お試しください。'));
      view.setAttribute('aria-busy', 'false');
    });
}());
