// KING page: renders data/king.json — every monthly champion as a poster on a timeline, newest month first.
(function () {
  'use strict';
  const view = document.getElementById('king-view');
  const siteRoot = new URL('../', location.href);
  const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const PHOTO = /^(?:\.\/)?images\/[A-Za-z0-9_\/-]+\.(?:webp|avif|jpg|png)$/;
  const POST = /^https:\/\/(?:x|twitter)\.com\/ChonmageNiigata(?:\/status\/\d+)?\/?$/;
  const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const CROWN = 'M4 38 0 8l17 13L32 0l15 21L64 8l-4 30z';

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
    path.setAttribute('d', CROWN + 'M4 40h56v4H4z'); path.setAttribute('fill', 'currentColor');
    svg.append(path); return svg;
  }

  function clean(data) {
    const rows = Array.isArray(data && data.items) ? data.items : [];
    const items = rows
      .filter((row) => row && MONTH.test(text(row.month)) && text(row.name))
      .map((row) => ({
        month: text(row.month), name: text(row.name), prize: text(row.prize), entries: count(row.entries),
        photo: PHOTO.test(text(row.photo)) ? text(row.photo) : '', comment: text(row.comment),
        post: POST.test(text(row.post)) ? text(row.post) : '', placeholder: row.placeholder === true
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
    items.forEach((item, index) => { item.round = index + 1; });
    // The yearly final appears only once data/king.json has a "final" entry.
    const raw = data && data.final;
    const final = raw && {
      title: text(raw.title) || 'KING OF KINGS', lead: text(raw.lead), date: DAY.test(text(raw.date)) ? text(raw.date) : '',
      seats: count(raw.seats) || 12, winner: text(raw.winner), prize: text(raw.prize)
    };
    return { items: items.reverse(), final, placeholder: items.some((item) => item.placeholder) || Boolean(raw && raw.placeholder === true) };
  }

  const parts = (month) => { const [, year, mm] = month.match(MONTH); return { year, number: Number(mm), en: MONTH_EN[Number(mm) - 1] }; };
  const nextMonth = (month) => { const p = parts(month); return p.number === 12 ? (Number(p.year) + 1) + '-01' : p.year + '-' + String(p.number + 1).padStart(2, '0'); };
  function time(value, className, label) { const result = node('time', className, label); result.dateTime = value; return result; }

  // Top banner: the yearly final, with one seat per monthly KING (empty seats for months still to come).
  function finalBanner(final, items) {
    const section = node('section', 'kok-final');
    section.setAttribute('aria-labelledby', 'kok-title');
    const head = node('div', 'kok-head');
    const label = node('p', 'kok-label', final.winner ? 'ANNUAL CHAMPION' : 'COMING SOON');
    const title = node('h2', 'kok-title'); title.id = 'kok-title';
    title.append(crown('kok-crown'), node('span', '', final.title));
    head.append(label, title);
    if (final.winner) {
      const winner = node('p', 'kok-winner'); winner.append(node('span', '', final.winner), node('small', '', '様')); head.append(winner);
      if (final.prize) head.append(node('p', 'kok-lead', 'PRIZE　' + final.prize));
    } else {
      if (final.lead) head.append(node('p', 'kok-lead', final.lead));
      const when = node('p', 'kok-date');
      if (final.date) { const [y, m, d] = final.date.split('-'); when.append(time(final.date, '', y + '.' + m + '.' + d)); when.append(' 開催'); }
      else when.textContent = '開催日は決まり次第お知らせします';
      head.append(when);
    }
    const seats = node('ol', 'kok-seats'); seats.setAttribute('aria-label', 'KING OF KINGS の出場者');
    const chronological = items.slice().reverse().slice(-final.seats);
    let month = chronological.length ? chronological[0].month : '';
    for (let i = 0; i < final.seats; i += 1) {
      const item = chronological[i];
      const seat = node('li', 'kok-seat' + (item ? '' : ' is-open'));
      if (item) month = item.month;
      else if (month) month = nextMonth(month);
      const p = month ? parts(month) : null;
      seat.append(node('span', 'kok-seat-month', p ? p.number + '月' : ''));
      const mark = node('span', 'kok-seat-mark', item ? Array.from(item.name)[0].toUpperCase() : '?'); mark.setAttribute('aria-hidden', 'true');
      seat.append(mark, node('span', 'kok-seat-name', item ? item.name : '挑戦者募集中'));
      seats.append(seat);
    }
    const filled = Math.min(chronological.length, final.seats);
    const progress = node('p', 'kok-progress');
    progress.append(node('strong', '', String(filled)), node('span', '', ' / ' + final.seats + ' 人のKINGが決定'));
    section.append(head, progress, seats);
    return section;
  }

  // A poster: the X picture when there is one, otherwise a typeset poster in the shop colors.
  function poster(item, eager) {
    const p = parts(item.month);
    const figure = node('figure', 'king-poster' + (item.photo ? '' : ' is-typeset'));
    if (item.photo) {
      const image = node('img');
      image.src = new URL(item.photo, siteRoot).href;
      image.alt = p.number + '月のKING、' + item.name + '様';
      image.decoding = 'async'; image.loading = eager ? 'eager' : 'lazy';
      figure.append(image);
    } else {
      figure.setAttribute('aria-hidden', 'true');
      figure.append(node('span', 'king-poster-round', 'No.' + String(item.round).padStart(2, '0')), crown('king-poster-crown'),
        node('span', 'king-poster-word', 'KING'), node('span', 'king-poster-month', p.en + ' ' + p.year), node('span', 'king-poster-name', item.name));
    }
    return figure;
  }

  function entry(item, counts, latest) {
    const p = parts(item.month);
    const li = node('li', 'king-entry' + (latest ? ' is-latest' : ''));
    const marker = node('div', 'king-entry-marker');
    marker.append(node('span', 'king-entry-num', String(p.number)), time(item.month, 'king-entry-date', p.year + '.' + String(p.number).padStart(2, '0')));
    const card = node('article', 'king-entry-card');
    const body = node('div', 'king-entry-body');
    const meta = node('p', 'king-entry-meta');
    meta.append(node('span', '', '第' + item.round + '回'));
    if (latest) meta.append(node('span', 'king-entry-new', 'LATEST'));
    const name = node('h3', 'king-entry-name'); name.append(node('span', '', item.name), node('small', '', '様'));
    body.append(meta, name);
    const total = counts.get(item.name);
    if (total > 1) body.append(node('p', 'king-badge', '通算 ' + total + ' 回目のKING'));
    const facts = node('dl', 'king-facts');
    const fact = (label, value) => { const row = node('div'); row.append(node('dt', '', label), node('dd', '', value)); facts.append(row); };
    if (item.prize) fact('PRIZE', item.prize);
    if (item.entries) fact('ENTRIES', item.entries + '名');
    if (facts.childElementCount) body.append(facts);
    if (item.comment) { const quote = node('blockquote', 'king-comment'); quote.append(node('p', '', item.comment)); body.append(quote); }
    if (item.post) {
      const link = node('a', 'king-post', 'Xの投稿を見る ↗'); link.href = item.post; link.target = '_blank'; link.rel = 'noopener';
      body.append(link);
    }
    card.append(poster(item, latest), body);
    li.append(marker, card);
    return li;
  }

  function render(data) {
    const { items, final, placeholder } = data;
    const fragment = document.createDocumentFragment();
    if (placeholder) fragment.append(node('p', 'king-preview-note', 'プレビュー：名前・賞品・人数・コメントは仮の内容です。'));
    if (final) fragment.append(finalBanner(final, items));
    if (!items.length) {
      fragment.append(node('p', 'king-state', 'チャンピオンの記録を準備中です。'));
    } else {
      const counts = new Map();
      items.forEach((item) => counts.set(item.name, (counts.get(item.name) || 0) + 1));
      const heading = node('div', 'king-timeline-head' + (final ? '' : ' is-first'));
      heading.append(node('h2', 'king-timeline-title', 'MONTHLY KINGS'), node('p', '', items.length + '回の開催 · ' + counts.size + '人のKING'));
      const list = node('ol', 'king-timeline'); list.setAttribute('aria-label', '歴代のKING（新しい順）');
      items.forEach((item, index) => list.append(entry(item, counts, index === 0)));
      fragment.append(heading, list);
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
