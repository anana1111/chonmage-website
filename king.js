// KING: the champions of the monthly ranking final (ランキング最強決定戦), from data/king.json.
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
  const EVENT = 'ランキング最強決定戦';

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
  // The players who earned a seat in the next final: the month's top 8 of each ranking.
  function qualifiers(raw) {
    if (!raw || !MONTH.test(text(raw.month))) return null;
    const list = (rows) => (Array.isArray(rows) ? rows : [])
      .filter((row) => row && text(row.name)).slice(0, 8)
      .map((row) => ({ name: text(row.name), points: Number.isInteger(row.points) && row.points >= 0 ? row.points : null }));
    const tournament = list(raw.tournament), ring = list(raw.ring);
    if (!tournament.length && !ring.length) return null;
    return { month: text(raw.month), post: POST.test(text(raw.post)) ? text(raw.post) : '', tournament, ring };
  }

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
      ranking: LINK.test(text(raw.ranking)) ? text(raw.ranking) : '',
      qualifiers: qualifiers(raw.qualifiers)
    };
    const given = (data && data.rules) || {};
    const number = (value, fallback) => (Number.isInteger(value) && value >= 0 ? value : fallback);
    const rules = {
      top: number(given.top, 8), stack: number(given.stack, 30000), bonus: number(given.bonus, 0), fee: number(given.fee, 0),
      feeNote: text(given.feeNote), late: /^\d{1,2}:\d{2}$/.test(text(given.late)) ? text(given.late) : '', note: text(given.note)
    };
    return { items, next, rules };
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
  // "ランキング最強決定戦 · 2026.09.13 優勝"
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
      if (eager) image.fetchPriority = 'high';
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

  // Homepage: the next final. "10.25 SUN 18:00", days left (Japan time) and the way to its entrants.
  // From the day after the final the block stays hidden until data/king.json names the next one.
  function homeNext(next) {
    const box = document.getElementById('home-king-next');
    if (!box || !next.date) return;
    const [y, m, d] = next.date.split('-').map(Number);
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const days = Math.round((Date.UTC(y, m - 1, d) - today) / 86400000);
    if (days < 0) return;
    const week = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    // Date and time lead; the days left sit underneath as a small tag next to the entrants link.
    const when = node('p', 'home-king-when');
    when.append(time(next.date, 'home-king-date', m + '.' + String(d).padStart(2, '0')), node('span', 'home-king-week', week));
    if (next.time) when.append(node('span', 'home-king-time', next.time));
    const left = node('p', 'home-king-left');
    if (days === 0) left.append(node('b', 'is-today', '本日開催'));
    else left.append('あと', node('b', '', String(days)), '日');
    const meta = node('div', 'home-king-meta');
    meta.append(left);
    if (next.qualifiers) {
      const link = node('a', 'home-king-entrants', '出場者' + (next.qualifiers.tournament.length + next.qualifiers.ring.length) + '名を見る');
      link.href = pageUrl + '#king-next-title'; link.append(node('span', '', '→'));
      meta.append(link);
    }
    box.replaceChildren(node('p', 'home-king-label', '次回の最強決定戦'), when, meta);
    box.hidden = false;
  }

  // Homepage: the latest KING. The winning photo (not the designed card) on top, then a warm white panel.
  function homeCard(item) {
    const card = node('article', 'home-king-card');
    card.setAttribute('aria-labelledby', 'home-king-name');
    const figure = photo(item.photo ? Object.assign({}, item, { card: '' }) : item, 'home-king-photo', false);
    figure.append(node('span', 'home-king-badge', '最新の王者'));
    const body = node('div', 'home-king-body');
    const month = node('p', 'home-king-title');
    month.append(crown('home-king-crown'), time(item.month, '', label(item)), node('span', '', ' KING'));
    const heading = name(item, 'h3', 'home-king-name'); heading.id = 'home-king-name';
    const result = node('p', 'home-king-won');
    if (item.won) result.append(time(item.won, 'home-king-day', dotted(item.won)));
    const event = node('span', 'home-king-event', EVENT + ' ');
    event.append(node('em', '', '優勝'));
    result.append(event);
    const link = node('a', 'home-king-more', '歴代のKINGを見る'); link.href = pageUrl;
    link.append(node('span', '', '→'));
    body.append(month, heading, result, link);
    card.append(figure, body);
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
  // "出場者": both top-8 lists side by side; players in both get the 同時ランクイン mark.
  function entrants(q) {
    const box = node('div', 'king-entrants');
    const [, , mm] = q.month.match(MONTH);
    const head = node('div', 'king-entrants-head');
    head.append(node('h3', '', Number(mm) + '月ランキング確定　出場者'));
    if (q.post) { const link = node('a', 'king-entrants-link', 'Xの発表を見る ↗'); link.href = q.post; link.target = '_blank'; link.rel = 'noopener'; head.append(link); }
    box.append(head);
    const both = new Set(q.tournament.map((row) => row.name).filter((name) => q.ring.some((row) => row.name === name)));
    const lists = node('div', 'king-entrants-lists');
    // Ring-game points are chip counts, so they carry no "pt" unit.
    [['トーナメント部門', q.tournament, 'pt'], ['リングゲーム部門', q.ring, '']].forEach(([label, rows, unit]) => {
      if (!rows.length) return;
      const column = node('div', 'king-entrants-col');
      column.append(node('h4', '', label));
      const ol = node('ol');
      rows.forEach((row) => {
        const li = node('li');
        const who = node('span', 'king-entrant-name', row.name);
        if (both.has(row.name)) { who.append(node('b', 'king-entrant-both', 'W')); li.classList.add('is-both'); }
        li.append(who);
        if (row.points !== null) li.append(node('span', 'king-entrant-pt', row.points.toLocaleString('ja-JP') + unit));
        ol.append(li);
      });
      column.append(ol); lists.append(column);
    });
    box.append(lists);
    if (both.size) box.append(node('p', 'king-entrants-note', 'W＝両部門にランクイン（' + Array.from(both).join('・') + '）'));
    return box;
  }

  // How to become the next KING: the qualifying rule, the two-stage final, and the house rules,
  // as on the shop's poster. Numbers come from data/king.json "rules".
  function nextKing(next, rules) {
    const section = node('section', 'king-next');
    section.setAttribute('aria-labelledby', 'king-next-title');
    const heading = node('h2', 'king-next-title', '次にここに載るのは、'); heading.id = 'king-next-title';
    heading.append(document.createElement('wbr'), 'あなたかも。');
    const lead = node('p', 'king-next-lead', '各部門の月間ランキング上位' + rules.top + '名に、翌月の' + EVENT + 'の出場権利が与えられます。');
    section.append(heading, lead);

    const steps = node('ol', 'king-steps');
    const step = (title, body) => {
      const li = node('li');
      const text = node('div', 'king-step-text');
      text.append(node('strong', '', title));
      body.forEach((line) => text.append(node('span', '', line)));
      li.append(node('span', 'king-step-num', String(steps.children.length + 1)), text);
      steps.append(li);
    };
    step('出場権利を獲得', ['トーナメント部門 上位' + rules.top + '名', 'リングゲーム部門 上位' + rules.top + '名']);
    step('サテライト形式トーナメント', ['出場者の中から上位4名のみが勝ち残り']);
    step('ヘッズアップトーナメント', ['勝ち残った4名で対戦', '開始時にスタックは' + rules.stack.toLocaleString('ja-JP') + '点にリセット']);
    section.append(steps);

    if (rules.bonus) {
      const bonus = node('p', 'king-bonus');
      const text = node('span', '', '両方の部門にランクインした方は、サテライトで');
      text.append(node('strong', '', rules.bonus.toLocaleString('ja-JP') + '点'), 'アドオン');
      bonus.append(node('b', '', '同時ランクイン特典'), text);
      section.append(bonus);
    }

    if (next.qualifiers) section.append(entrants(next.qualifiers));

    const facts = node('dl', 'king-next-facts');
    const fact = (label, value) => { const row = node('div'); row.append(node('dt', '', label), node('dd', '', value)); facts.append(row); };
    if (next.date) {
      const [y, m, d] = next.date.split('-').map(Number);
      const week = '日月火水木金土'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
      const row = node('div', 'is-date'); const value = node('dd');
      value.append(time(next.date, '', m + '月' + d + '日（' + week + '）'));
      row.append(node('dt', '', '次回開催'), value); facts.append(row);
    }
    if (next.time) fact('START', next.time + (rules.late ? '（レイトレジスト ' + rules.late + '）' : ''));
    fact('初期スタック', rules.stack.toLocaleString('ja-JP') + '点');
    if (rules.fee) fact('施設利用料', rules.fee.toLocaleString('ja-JP') + '円' + (rules.feeNote ? '（' + rules.feeNote + '）' : ''));
    section.append(facts);
    if (rules.note) section.append(node('p', 'king-next-note', rules.note));

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


  // Champion cards behave like a real foil card: they tilt toward the pointer with a moving shine,
  // and on touch screens the foil sweeps once as each card scrolls into view (tap to sweep again).
  // Nothing moves for visitors who ask for reduced motion.
  function foil(root) {
    const figures = root.querySelectorAll('.is-card');
    if (!figures.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const sweep = (figure) => {
      figure.classList.remove('is-shining'); void figure.offsetWidth; figure.classList.add('is-shining');
    };
    const seen = 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        seen.unobserve(entry.target); afterOpening(() => setTimeout(() => sweep(entry.target), 250));
      });
    }, { threshold: 0.6 });
    figures.forEach((figure) => {
      figure.append(node('span', 'king-foil'), node('span', 'king-glare'));
      figure.addEventListener('animationend', () => figure.classList.remove('is-shining'));
      if (seen) seen.observe(figure);
      const card = figure.closest('.king-card, .king-latest, .home-king-card') || figure;
      card.classList.add('is-foil');
      const max = card === figure || card.classList.contains('king-card') ? 9 : 4;
      card.addEventListener('pointermove', (event) => {
        if (event.pointerType === 'touch') return;
        const box = card.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height;
        const spot = figure.getBoundingClientRect();
        card.style.setProperty('--ry', ((x - 0.5) * 2 * max).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((0.5 - y) * 2 * max).toFixed(2) + 'deg');
        figure.style.setProperty('--mx', (((event.clientX - spot.left) / spot.width) * 100).toFixed(1) + '%');
        figure.style.setProperty('--my', (((event.clientY - spot.top) / spot.height) * 100).toFixed(1) + '%');
        card.classList.add('is-tilting');
      });
      card.addEventListener('pointerleave', () => {
        card.classList.remove('is-tilting');
        card.style.removeProperty('--rx'); card.style.removeProperty('--ry');
      });
      figure.addEventListener('pointerup', (event) => { if (event.pointerType === 'touch') sweep(figure); });
    });
  }

  // Runs fn now, or once the /king/ opening card has gone.
  function afterOpening(fn) {
    if (document.documentElement.classList.contains('is-king-loading')) document.addEventListener('king:opened', fn, { once: true });
    else fn();
  }

  // The /king/ opening card. It waits for the page top and the first KING picture only (the rest load as
  // the visitor scrolls), at most 2.5s, then flips to K♦. Shown once per tab session.
  function openPage() {
    const root = document.documentElement;
    const loader = document.getElementById('king-loader');
    if (!loader || !root.classList.contains('is-king-loading')) return;
    const started = window.kingT0 || Date.now();
    const first = view.querySelector('.king-latest img');
    const ready = !first ? Promise.resolve()
      : first.complete ? Promise.resolve()
      : new Promise((done) => { first.addEventListener('load', done, { once: true }); first.addEventListener('error', done, { once: true }); });
    try { sessionStorage.setItem('king-opened', '1'); } catch (error) { /* private mode: the card shows again next time */ }
    // The card shows for at least 1.5s so the gold line and the flip are seen; later visits in the same tab skip it.
    const shown = new Promise((done) => setTimeout(done, Math.max(0, 1500 - (Date.now() - started))));
    Promise.all([Promise.race([ready, new Promise((done) => setTimeout(done, 2500))]), shown]).then(() => {
      const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const finish = () => {
        loader.classList.add('is-leaving');
        const latestCard = view.querySelector('.king-latest');
        if (!quick && latestCard) latestCard.classList.add('is-arriving');
        setTimeout(() => {
          root.classList.remove('is-king-loading'); loader.remove();
          document.dispatchEvent(new Event('king:opened'));
        }, 450);
      };
      if (quick) finish();
      else { loader.classList.add('is-flipped'); setTimeout(finish, 1000); }
    });
  }

  // A round ↓ button that takes the visitor to the bottom of the page; it hides once they are there.
  function jumpButton() {
    const button = node('button', 'king-jump');
    button.type = 'button'; button.setAttribute('aria-label', 'ページの一番下へ');
    button.append(node('span', '', '↓'));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    button.addEventListener('click', () => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
    });
    const update = () => {
      const left = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      button.hidden = left < 160;
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    document.body.append(button); update();
  }

  function render({ items, next, rules }) {
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
        // Oldest first, from the 初代 down to the most recent.
        items.slice(1).reverse().forEach((item) => {
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
    fragment.append(nextKing(next, rules));
    view.replaceChildren(fragment);
    foil(view);
    jumpButton();
    view.setAttribute('aria-busy', 'false');
    openPage();
    // A shared link (/king/#2026-08, or #king-next-title from the homepage) lands there once the records are in the page.
    const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) { if (MONTH.test(target.id)) target.classList.add('is-target'); target.scrollIntoView(); }
  }

  fetch(new URL('data/king.json', siteRoot).href, { cache: 'no-cache' })
    .then((response) => { if (!response.ok) throw new Error(response.status); return response.json(); })
    .then((data) => {
      const cleaned = clean(data);
      if (view) render(cleaned);
      else {
        if (cleaned.items.length) home.replaceChildren(homeCard(cleaned.items[0]));
        homeNext(cleaned.next);
        const total = document.getElementById('home-king-count');
        if (total && cleaned.items.length) total.replaceChildren(String(cleaned.items.length), node('small', '', '回'));
        foil(document.getElementById('king') || home);
      }
    })
    .catch(() => {
      // The homepage keeps its static link to /king/.
      if (!view) return;
      view.replaceChildren(node('p', 'king-state', '記録を読み込めませんでした。時間をおいて再度お試しください。'));
      view.setAttribute('aria-busy', 'false');
      openPage();
    });
}());
