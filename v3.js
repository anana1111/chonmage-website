// v3 design lab: display-only enhancements for index.v3.html (data and shared scripts untouched).
// The shop's Waitinglist page. Leave empty to keep the plain-text line.
const WAITINGLIST_URL = '';

(() => {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /* Japanese line breaking: break only between phrases (文節), never inside a word.
     A light BudouX-style pass: kanji/katakana/latin + following hiragana form one phrase. */
  const PARTICLES = 'はがをにでともへやかの';
  const isHira = (c) => c >= 'ぁ' && c <= 'ゟ';
  const splitPhrases = (text) => {
    const out = [];
    let cur = '';
    let hira = '';
    let content = false;
    for (const ch of text) {
      if (/\s/.test(ch)) { out.push(cur + ch); cur = ''; hira = ''; content = false; continue; }
      if ('「『（【〈《〔'.includes(ch)) { if (cur) out.push(cur); cur = ch; hira = ''; content = false; continue; }
      if ('、。！？・'.includes(ch)) { out.push(cur + ch); cur = ''; hira = ''; content = false; continue; }
      if ('」』）】〉》〕〜…'.includes(ch)) { cur += ch; continue; }
      if (isHira(ch)) { cur += ch; hira += ch; continue; }
      const ascii = /[A-Za-z0-9]/.test(ch);
      if (hira && !ascii && (content || cur.length > hira.length || hira.length >= 2) && (hira.length >= 2 || PARTICLES.includes(hira))) {
        out.push(cur); cur = ch; hira = ''; content = true; continue;
      }
      cur += ch; hira = ''; content = true;
    }
    if (cur) out.push(cur);
    return out.filter(Boolean);
  };
  const phrase = (root) => {
    if (!root || root.classList.contains('phrased')) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('.nb')) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const parts = splitPhrases(node.textContent);
      if (parts.length < 2) return;
      const frag = document.createDocumentFragment();
      parts.forEach((part, i) => {
        frag.append(part);
        if (i < parts.length - 1 && !/\s$/.test(part)) frag.append(document.createElement('wbr'));
      });
      node.replaceWith(frag);
    });
    root.classList.add('phrased');
  };
  const phraseAll = (scope, selector) => scope.querySelectorAll(selector).forEach(phrase);
  phraseAll(document, '.q, .a, .route, .access-list dd, .inside figcaption, .wl-line, .colophon dd, .footer-note');

  /* Waitinglist: plain text until the shop's page URL is configured. */
  const wl = document.querySelector('.wl-line');
  if (wl && WAITINGLIST_URL) {
    const link = el('a', 'wl-link', 'Waitinglistで今の人数を見る ↗');
    link.href = WAITINGLIST_URL; link.target = '_blank'; link.rel = 'noreferrer';
    wl.replaceChildren(link);
  }

  /* Board date: "2026.10.04 · SUN" -> "10.04（日）". */
  const dateLabel = document.getElementById('hero-schedule-date');
  if (dateLabel) {
    const days = { SUN: '日', MON: '月', TUE: '火', WED: '水', THU: '木', FRI: '金', SAT: '土' };
    const format = () => {
      const m = dateLabel.textContent.match(/^\d{4}\.(\d{2})\.(\d{2}) · ([A-Z]{3})$/);
      if (m && days[m[3]]) dateLabel.textContent = `${m[1]}.${m[2]}（${days[m[3]]}）`;
    };
    format();
    new MutationObserver(format).observe(dateLabel, { childList: true, characterData: true, subtree: true });
  }

  /* TODAY: one timeline. Finished games fold into a single row that opens in place. */
  const A = window.ChonmageActivity;
  if (A) {
    const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const stateOf = (row, now, selected) => {
      if (selected) return { key: 'plan', text: '予定' };
      if (row.kind === 'ring') return now >= row.start ? { key: 'live', text: '参加受付中' } : { key: 'soon', text: `あと${A.formatRemaining(row.start - now)}` };
      const s = A.getEventStatus(row, now);
      if (s.status === 'upcoming') return { key: 'soon', text: `あと${A.formatRemaining(s.remaining)}` };
      if (s.status === 'finished') return { key: 'done', text: '終了' };
      if (s.status === 'registering' || s.status === 'last-call') return { key: 'live', text: `受付中・あと${A.formatRemaining(s.remaining)}` };
      return { key: 'running', text: '開催中' };
    };
    const rowEl = (row, schedule) => {
      const li = el('li', `tl-row is-${row.state.key}${row.kind === 'ring' ? ' is-ring' : ''}`);
      const a = el('a', 'tl-link');
      a.href = row.link?.url || schedule.latestUrl; a.target = '_blank'; a.rel = 'noreferrer';
      const body = el('span', 'tl-body');
      body.append(el('strong', 'tl-title', row.title));
      if (row.note) body.append(el('span', 'tl-note', row.note));
      if (row.state.key === 'running') body.append(el('span', 'tl-xnote', '途中参加の締切は公式Xで ↗'));
      a.append(el('time', 'tl-time', hhmm(row.start)), body, el('span', `tl-state is-${row.state.key}`, row.state.text));
      li.append(a);
      return li;
    };
    const nowMarker = (now) => {
      const marker = el('li', 'tl-now');
      marker.append(el('span', '', `いま ${hhmm(now)}`));
      return marker;
    };
    let expanded = false;
    let firstRender = true;
    const foldEl = (done, schedule) => {
      const li = el('li', 'tl-fold');
      const toggle = el('button', 'tl-fold-toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-controls', 'tl-fold-body');
      const icon = el('span', 'tl-fold-icon');
      icon.setAttribute('aria-hidden', 'true');
      const text = el('span', 'tl-fold-text');
      text.append(el('span', 'tl-fold-times', done.map((row) => hhmm(row.start)).join('・')), el('span', 'tl-fold-label', `終了 ${done.length}件`));
      toggle.append(text, icon);
      const body = el('div', 'tl-fold-body');
      body.id = 'tl-fold-body';
      const inner = el('ol', 'tl-fold-list');
      done.forEach((row, i) => { const r = rowEl(row, schedule); r.style.setProperty('--i', i); inner.append(r); });
      body.append(inner);
      const sync = (animate) => {
        li.classList.toggle('is-open', expanded);
        li.classList.toggle('is-opening', expanded && animate);
        body.hidden = !expanded;
        toggle.setAttribute('aria-expanded', String(expanded));
        icon.textContent = expanded ? '－' : '＋';
      };
      toggle.addEventListener('click', () => { expanded = !expanded; sync(true); });
      sync(false);
      li.append(toggle, body);
      return li;
    };
    A.render = (data, options = {}) => {
      const list = document.querySelector('#today .event-list');
      if (!list) return;
      const schedule = A.adaptSchedule(data);
      const now = Number.isFinite(options.minute) ? options.minute : -1;
      const selected = Boolean(options.selected);
      const rows = [];
      if (schedule.ring) rows.push({ ...schedule.ring, kind: 'ring', title: 'リングゲーム', note: '好きなタイミングで途中参加OK・初めての方もここから' });
      schedule.events.forEach((event) => {
        const entry = event.facts.find((f) => /entry/i.test(f.label));
        rows.push({ ...event, kind: 'event', note: entry ? `参加費 ${entry.value === '¥0' ? '無料' : entry.value}` : '' });
      });
      rows.sort((a, b) => (b.kind === 'ring') - (a.kind === 'ring') || a.start - b.start);
      rows.forEach((row) => { row.state = stateOf(row, now, selected); });

      const ol = el('ol', 'tl');
      if (schedule.closed) ol.append(el('li', 'tl-empty', '本日は休業です。次回の営業は公式Xでお知らせします。'));
      const done = rows.filter((row) => row.state.key === 'done');
      let foldPlaced = false;
      let nowPlaced = selected || now < 0;
      rows.forEach((row) => {
        if (row.state.key === 'done') {
          if (!foldPlaced) { ol.append(foldEl(done, schedule)); foldPlaced = true; }
          return;
        }
        if (!nowPlaced && row.start > now) { ol.append(nowMarker(now)); nowPlaced = true; }
        ol.append(rowEl(row, schedule));
      });
      if (!nowPlaced && rows.length) ol.append(nowMarker(now));
      if (!rows.length && !schedule.closed) ol.append(el('li', 'tl-empty', '開催内容は公式Xでご確認ください。'));
      phraseAll(ol, '.tl-title, .tl-note');

      // The single stamp: pressed once, on the first thing you can join now.
      if (firstRender && !selected && document.documentElement.dataset.intro) ol.querySelector('.tl-state.is-live')?.classList.add('is-stamp');
      firstRender = false;

      const hours = document.querySelector('.board-hours');
      if (hours) {
        hours.textContent = !schedule.closed && schedule.closeTime ? `${schedule.closeTime}まで` : '';
        hours.hidden = !hours.textContent;
      }
      list.className = 'event-list v3-timeline';
      list.replaceChildren(ol);
      const title = document.getElementById('today-title'); if (title) title.textContent = '今日のゲーム';
    };
  }

  /* NEWS: clean X-derived titles, hide replies, typographic date blocks. */
  const grid = document.querySelector('.news-grid');
  if (grid) {
    const emoji = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}\u{FFFD}]/gu;
    const clean = (text) => text.replace(emoji, '').replace(/^R to @\S+:\s*/, '').replace(/\s+/g, ' ').trim();
    const shorten = (text, max = 30) => {
      if (text.length <= max) return text;
      const cut = text.slice(0, max).search(/[\s　。！!](?=[^\s　。！!]*$)/);
      return cut >= 10 ? text.slice(0, cut).replace(/[\s　]+$/, '') : text.slice(0, max - 1) + '…';
    };
    const label = { SCHEDULE: '営業', EVENT: 'イベント', RESULT: '結果' };
    const tidy = () => {
      grid.querySelectorAll('.news-card:not([data-v3])').forEach((card) => {
        card.dataset.v3 = '1';
        const link = card.querySelector('h3 a');
        if (!link) return;
        if (/^R to @/.test(link.textContent)) { card.hidden = true; return; }
        link.textContent = shorten(clean(link.textContent));
        phrase(link);
        const time = card.querySelector('.news-meta time, .news-meta > :first-child');
        const visual = card.querySelector('.news-image');
        const match = time?.textContent.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
        if (visual && match) {
          const stamp = el('span', 'v3-date');
          stamp.setAttribute('aria-hidden', 'true');
          stamp.append(el('b', '', String(Number(match[3]))), el('small', '', `${Number(match[2])}月`));
          visual.append(stamp);
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
          if (`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` === today) { visual.classList.add('v3-today'); stamp.lastChild.textContent = '今日'; }
          time.classList.add('sr');
        }
        const cat = card.querySelector('.news-meta > :last-child');
        if (cat && label[cat.textContent.trim()]) cat.textContent = label[cat.textContent.trim()];
      });
    };
    tidy();
    new MutationObserver(tidy).observe(grid, { childList: true });
  }

  /* Press: ink fills instantly and the control sinks 2px; held at least 110ms so a quick tap still reads. */
  document.addEventListener('pointerdown', (event) => {
    const target = event.target.closest('.btn, .dock a, .tl-fold-toggle');
    if (!target) return;
    const start = performance.now();
    target.classList.add('is-pressed');
    const release = () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      setTimeout(() => target.classList.remove('is-pressed'), Math.max(0, 110 - (performance.now() - start)));
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  });

  if ('IntersectionObserver' in window) {
    /* Header rule appears only once the page has scrolled, so it never doubles the cover frame. */
    const header = document.querySelector('.masthead');
    const sentinel = document.querySelector('.top-sentinel');
    if (header && sentinel) new IntersectionObserver(([entry]) => header.toggleAttribute('data-stuck', !entry.isIntersecting)).observe(sentinel);
    /* The phone dock steps aside while ACCESS shows the same actions. */
    const dock = document.querySelector('.dock');
    const actions = document.querySelector('.access-actions');
    if (dock && actions) new IntersectionObserver(([entry]) => dock.classList.toggle('is-hidden', entry.isIntersecting)).observe(actions);
  }
})();
