// KING page: renders data/king.json — the reigning KING, the most-crowned players, every earlier
// champion as a poster on a timeline split by year (newest first), and the next KING tournament.
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
    const rawNext = (data && data.next) || {};
    const next = {
      date: DAY.test(text(rawNext.date)) ? text(rawNext.date) : '', time: /^\d{1,2}:\d{2}$/.test(text(rawNext.time)) ? text(rawNext.time) : '',
      entry: text(rawNext.entry), note: text(rawNext.note)
    };
    return { items: items.reverse(), final, next, placeholder: items.some((item) => item.placeholder) || Boolean(raw && raw.placeholder === true) || rawNext.placeholder === true };
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

  // Name, round, prize, entries, comment and X link: shared by the reigning KING and the timeline cards.
  function details(item, counts, body, headingTag) {
    const meta = node('p', 'king-entry-meta');
    meta.append(node('span', '', '第' + item.round + '回'));
    const name = node(headingTag, 'king-entry-name'); name.append(node('span', '', item.name), node('small', '', '様'));
    body.append(meta, name);
    const total = counts.get(item.name);
    if (total > 1) body.append(node('p', 'king-badge', '♛ 通算 ' + total + ' 回目のKING'));
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
    return body;
  }

  // The current champion, shown big above everything else.
  function reign(item, counts) {
    const p = parts(item.month);
    const section = node('section', 'king-reign');
    section.setAttribute('aria-labelledby', 'king-reign-title');
    const body = node('div', 'king-reign-body');
    const label = node('p', 'king-reign-label');
    label.append(crown('king-reign-crown'), node('span', '', 'NOW REIGNING'));
    const title = node('h2', 'king-reign-title'); title.id = 'king-reign-title';
    title.append(time(item.month, '', p.year + '年' + p.number + '月'), node('span', '', '現在のKING'));
    body.append(label, title);
    details(item, counts, body, 'p');
    section.append(poster(item, true), body);
    return section;
  }

  // Players with more than one crown, most crowns first (ties: the more recent KING first).
  function ranking(items, counts) {
    const players = [...counts].filter(([, total]) => total > 1).map(([name, total]) => ({
      name, total, last: items.find((item) => item.name === name).month
    })).sort((a, b) => b.total - a.total || b.last.localeCompare(a.last)).slice(0, 5);
    if (!players.length) return null;
    const section = node('section', 'king-ranking');
    section.setAttribute('aria-labelledby', 'king-ranking-title');
    const heading = node('div', 'king-section-head');
    heading.append(node('h2', 'king-section-title', 'MOST CROWNS'), node('p', '', '最多戴冠'));
    heading.firstChild.id = 'king-ranking-title';
    const list = node('ol', 'king-ranking-list');
    players.forEach((player, index) => {
      const row = node('li', 'king-ranking-row' + (index === 0 ? ' is-top' : ''));
      const crowns = node('span', 'king-ranking-crowns');
      crowns.setAttribute('aria-label', player.total + '回');
      for (let i = 0; i < player.total; i += 1) crowns.append(crown());
      const name = node('span', 'king-ranking-name'); name.append(node('span', '', player.name), node('small', '', '様'));
      row.append(node('span', 'king-ranking-rank', String(index + 1)), name, crowns, node('span', 'king-ranking-total', '×' + player.total));
      list.append(row);
    });
    section.append(heading, list);
    return section;
  }

  function entry(item, counts) {
    const p = parts(item.month);
    const li = node('li', 'king-entry');
    const marker = node('div', 'king-entry-marker');
    marker.append(node('span', 'king-entry-num', String(p.number)), time(item.month, 'king-entry-date', p.year + '.' + String(p.number).padStart(2, '0')));
    const card = node('article', 'king-entry-card');
    card.append(poster(item, false), details(item, counts, node('div', 'king-entry-body'), 'h3'));
    li.append(marker, card);
    return li;
  }

  // Closing call to action: when the next KING tournament is, and where to check the schedule.
  function nextKing(next) {
    const section = node('section', 'king-next');
    section.setAttribute('aria-labelledby', 'king-next-title');
    section.append(node('p', 'king-next-label', 'NEXT KING'));
    const title = node('h2', 'king-next-title'); title.id = 'king-next-title';
    title.append(node('span', '', '次のKINGは、'), node('span', '', 'あなた。'));
    section.append(title);
    const facts = node('dl', 'king-next-facts');
    const fact = (label, value) => { const row = node('div'); row.append(node('dt', '', label), node('dd', '', value)); facts.append(row); };
    if (next.date) {
      const [y, m, d] = next.date.split('-').map(Number);
      const week = '日月火水木金土'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
      fact('DATE', m + '月' + d + '日（' + week + '）' + (next.time ? ' ' + next.time + ' START' : ''));
    } else {
      fact('DATE', '毎月開催。日程は公式Xとスケジュールでお知らせします。');
    }
    if (next.entry) fact('ENTRY', next.entry);
    section.append(facts);
    if (next.note) section.append(node('p', 'king-next-note', next.note));
    const actions = node('div', 'king-next-actions');
    const schedule = node('a', 'king-next-button is-primary', 'スケジュールを見る'); schedule.href = new URL('./#today', siteRoot).href;
    const x = node('a', 'king-next-button', '公式Xを見る ↗'); x.href = 'https://x.com/ChonmageNiigata'; x.target = '_blank'; x.rel = 'noopener';
    actions.append(schedule, x);
    section.append(actions);
    return section;
  }

  function render(data) {
    const { items, final, next, placeholder } = data;
    const fragment = document.createDocumentFragment();
    if (placeholder) fragment.append(node('p', 'king-preview-note', 'プレビュー：名前・賞品・人数・コメント・日程は仮の内容です。'));
    if (final) fragment.append(finalBanner(final, items));
    if (!items.length) {
      fragment.append(node('p', 'king-state', 'チャンピオンの記録を準備中です。'));
    } else {
      const counts = new Map();
      items.forEach((item) => counts.set(item.name, (counts.get(item.name) || 0) + 1));
      fragment.append(reign(items[0], counts));
      const top = ranking(items, counts);
      if (top) fragment.append(top);
      if (items.length > 1) {
        const heading = node('div', 'king-section-head');
        heading.append(node('h2', 'king-section-title', 'HALL OF KINGS'), node('p', '', items.length + '回の開催 · ' + counts.size + '人のKING'));
        const list = node('ol', 'king-timeline'); list.setAttribute('aria-label', 'これまでのKING（新しい順）');
        let year = '';
        items.slice(1).forEach((item) => {
          const itemYear = item.month.slice(0, 4);
          if (itemYear !== year) {
            year = itemYear;
            const divider = node('li', 'king-year'); divider.setAttribute('aria-hidden', 'true');
            divider.append(node('span', '', year));
            list.append(divider);
          }
          list.append(entry(item, counts));
        });
        fragment.append(heading, list);
      }
    }
    fragment.append(nextKing(next));
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
