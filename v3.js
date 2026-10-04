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

  /* Regular hours as published by the shop (平日 17:00〜23:30／土日祝 13:00〜). Used only where the
     day's own schedule is missing, and always labelled 通常 or 予定 — never presented as fact. */
  const HOURS = { weekday: ['17:00', '23:30'], dayOff: ['13:00', ''] };
  // Japanese national holidays (current rules): fixed days, Happy Mondays, equinoxes, 振替休日, 国民の休日.
  const isHoliday = (y, m, d) => {
    const at = (k) => new Date(Date.UTC(y, m - 1, d + k));
    const listed = (t) => {
      const yy = t.getUTCFullYear(); const mm = t.getUTCMonth() + 1; const dd = t.getUTCDate();
      const firstMonday = 1 + ((8 - new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay()) % 7);
      const equinox = (c) => Math.floor(c + 0.242194 * (yy - 1980) - Math.floor((yy - 1980) / 4));
      const key = mm * 100 + dd;
      return [101, 211, 223, 429, 503, 504, 505, 811, 1103, 1123].includes(key)
        || ((mm === 1 || mm === 10) && dd === firstMonday + 7) || ((mm === 7 || mm === 9) && dd === firstMonday + 14)
        || key === 300 + equinox(20.8431) || key === 900 + equinox(23.2488);
    };
    if (listed(at(0))) return true;
    for (let k = -1; listed(at(k)); k -= 1) if (at(k).getUTCDay() === 0) return true;
    return listed(at(-1)) && listed(at(1));
  };
  // The regular day for a calendar date (UTC fields carry the Japanese date).
  const regularDay = (y, m, d) => {
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const dayOff = weekday === 0 || weekday === 6 || isHoliday(y, m, d);
    const [open, close] = dayOff ? HOURS.dayOff : HOURS.weekday;
    return { dayOff, open, close, label: `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}（${'日月火水木金土'[weekday]}）` };
  };

  /* Status band. Until today's schedule is published, "open today?" is answered from the regular hours. */
  const band = document.querySelector('.today .hero-schedule');
  const statusText = document.getElementById('hero-business-status-text');
  const regularLine = document.querySelector('.regular-line');
  if (band && statusText && dateLabel) {
    const fill = () => {
      // On the stamp the date is already beside it: "本日 13:00 OPEN" → "13:00 OPEN".
      if (!band.classList.contains('is-stale')) {
        const short = statusText.textContent.replace(/^本日\s+(\d{1,2}:\d{2} OPEN)$/, '$1');
        if (short !== statusText.textContent) statusText.textContent = short;
        return;
      }
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
        .formatToParts(new Date()).map((part) => [part.type, part.value]));
      const day = regularDay(Number(p.year), Number(p.month), Number(p.day));
      const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
      const minute = Number(p.hour) * 60 + Number(p.minute);
      const status = minute < toMin(day.open) ? `本日 ${day.open} OPEN 予定`
        : day.close && minute >= toMin(day.close) ? 'いつもなら営業を終えた時間' : 'いつもなら営業中の時間';
      if (dateLabel.textContent !== day.label) dateLabel.textContent = day.label;
      if (statusText.textContent !== status) statusText.textContent = status;
      const label = day.dayOff ? '土日祝' : '平日';
      if (regularLine && regularLine.dataset.label !== label) {
        regularLine.dataset.label = label;
        const time = el('b', 'rl-time', day.open);
        time.append(el('span', 'rl-tilde', '〜'), day.close);
        regularLine.replaceChildren(el('span', 'rl-label', label), time);
      }
    };
    fill();
    new MutationObserver(fill).observe(band, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
  }

  /* TODAY: one timeline. Finished games fold into a single row that opens in place. */
  const A = window.ChonmageActivity;
  if (A) {
    const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const stateOf = (row, now, selected, close) => {
      if (selected) return { key: 'plan', text: '予定' };
      if (close !== null && now >= close) return { key: 'done', text: '終了' }; // after closing time nothing is still on
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
      if (row.note) {
        const note = el('span', 'tl-note');
        // { nb } parts never break inside ("初めての方も" stays one phrase)
        note.append(...[].concat(row.note).map((part) => (typeof part === 'string' ? part : el('span', 'nb', part.nb))));
        body.append(note);
      }
      if (row.state.key === 'running') body.append(el('span', 'tl-xnote', '途中参加の締切は公式Xで ↗'));
      const time = el('time', 'tl-time', hhmm(row.start));
      if (row.kind === 'ring') time.append(el('span', 'tl-from', '〜')); // open-ended: runs from this time
      a.append(time, body, el('span', `tl-state is-${row.state.key}`, row.state.text));
      li.append(a);
      return li;
    };
    const nowMarker = (now) => {
      const marker = el('li', 'tl-now');
      marker.append(el('span', '', `いま ${hhmm(now)}`));
      return marker;
    };
    let expanded = false;
    const foldEl = (done, schedule) => {
      const li = el('li', 'tl-fold');
      const toggle = el('button', 'tl-fold-toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-controls', 'tl-fold-body');
      const icon = el('span', 'tl-fold-icon');
      icon.setAttribute('aria-hidden', 'true');
      const label = el('span', 'tl-fold-label');
      toggle.append(label, icon);
      // The body stays in the layout and grows from 0 height (CSS), so the rows below slide down instead of jumping.
      const body = el('div', 'tl-fold-body');
      body.id = 'tl-fold-body';
      const inner = el('ol', 'tl-fold-list');
      done.forEach((row) => inner.append(rowEl(row, schedule)));
      body.append(inner);
      const sync = () => {
        li.classList.toggle('is-open', expanded);
        toggle.setAttribute('aria-expanded', String(expanded));
        icon.textContent = expanded ? '－' : '＋';
        label.textContent = `終了した${done.length}件を${expanded ? 'とじる' : '見る'}`;
      };
      toggle.addEventListener('click', () => { expanded = !expanded; sync(); });
      sync();
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
      if (schedule.ring) rows.push({ ...schedule.ring, kind: 'ring', title: 'リングゲーム', note: ['いつでも途中参加OK。', { nb: '初めての方も' }, 'ここから。'] });
      schedule.events.forEach((event) => {
        const entry = event.facts.find((f) => /entry/i.test(f.label));
        rows.push({ ...event, kind: 'event', note: entry ? `参加費 ${entry.value === '¥0' ? '無料' : entry.value}` : '' });
      });
      rows.sort((a, b) => (b.kind === 'ring') - (a.kind === 'ring') || a.start - b.start);
      rows.forEach((row) => { row.state = stateOf(row, now, selected, schedule.close); });
      // Only the next game counts down; later ones already show their start time on the left.
      rows.filter((row) => row.state.key === 'soon').sort((a, b) => a.start - b.start).slice(1).forEach((row) => { row.state = { key: 'later', text: '' }; });

      const ol = el('ol', 'tl');
      const ended = !selected && schedule.close !== null && now >= schedule.close;
      const nextLine = (content) => { const li = el('li', 'tl-next'); li.append(content); ol.append(li); };
      if (schedule.closed) {
        // Closed today: the band already says 本日休業; the one useful line is where the next day is announced.
        const x = el('a', '', '次の営業は公式Xでお知らせします ↗');
        x.href = schedule.latestUrl; x.target = '_blank'; x.rel = 'noreferrer';
        nextLine(x);
        rows.length = 0;
      } else if (ended) {
        // After closing time: the next regular opening, marked 予定 (the next day's own schedule is not out yet).
        const [y, m, d] = schedule.date.split('-').map(Number);
        const after = new Date(Date.UTC(y, m - 1, d + 1)); // rolls over month and year ends
        if (y && m && d) {
          const day = regularDay(after.getUTCFullYear(), after.getUTCMonth() + 1, after.getUTCDate());
          nextLine(`次は ${day.label}${day.open} OPEN 予定`);
        }
      }
      const done = rows.filter((row) => row.state.key === 'done');
      let foldPlaced = false;
      let nowPlaced = selected || now < 0 || ended;
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
      phraseAll(ol, '.tl-title, .tl-note, .tl-next, .tl-empty');
      // Waitinglist counts players for today's games: say nothing about it on a day that is over or off.
      document.querySelector('.wl-line')?.toggleAttribute('hidden', !selected && (schedule.closed || ended));

      const hours = document.querySelector('.board-hours');
      if (hours) {
        const closing = !schedule.closed && schedule.closeTime && (now < 0 || now < schedule.close);
        hours.textContent = closing ? `${schedule.closeTime}まで` : '';
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
    // also: full-width brackets around short Japanese notes like (日), and no space after 】
    const clean = (text) => text.replace(emoji, '').replace(/^R to @\S+:\s*/, '').replace(/\(([^()\s]{1,3})\)/g, '（$1）').replace(/】\s+/g, '】').replace(/\s+/g, ' ').trim();
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
          if (`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` === today) visual.classList.add('v3-today');
          time.classList.add('sr');
        }
        const cat = card.querySelector('.news-meta > :last-child');
        if (cat && label[cat.textContent.trim()]) cat.textContent = label[cat.textContent.trim()];
      });
    };
    tidy();
    new MutationObserver(tidy).observe(grid, { childList: true });
  }

  /* Press: the control inverts in place, instantly; held at least 110ms so a quick tap still reads. */
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
    /* The phone dock steps aside only while the Google Maps button itself is on screen (not hidden under the header). */
    const dock = document.querySelector('.dock');
    const actions = document.querySelector('.access-actions');
    if (dock && actions) new IntersectionObserver(([entry]) => dock.classList.toggle('is-hidden', entry.isIntersecting), { rootMargin: '-72px 0px 0px 0px' }).observe(actions);
  }
})();
