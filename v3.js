// v3 design lab: display-only enhancements for index.v3.html (data and shared scripts untouched).
(() => {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /* TODAY: one vertical timeline instead of hero card + cards + list. */
  const A = window.ChonmageActivity;
  if (A) {
    const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const stateLabel = (item, now, selected) => {
      if (selected) return { key: 'plan', text: '予定' };
      if (item.kind === 'ring') return now >= item.start ? { key: 'live', text: '参加受付中' } : { key: 'soon', text: `あと${A.formatRemaining(item.start - now)}` };
      const s = A.getEventStatus(item, now);
      if (s.status === 'upcoming') return { key: 'soon', text: `あと${A.formatRemaining(s.remaining)}` };
      if (s.status === 'finished') return { key: 'done', text: '終了' };
      if (s.status === 'registering' || s.status === 'last-call') return { key: 'live', text: `受付中・あと${A.formatRemaining(s.remaining)}` };
      return { key: 'running', text: '開催中' };
    };
    const nowMarker = (now) => {
      const marker = el('li', 'tl-now');
      const pic = el('img', 'tl-now-mascot'); pic.src = './images/chonmage-character-400.webp'; pic.alt = ''; pic.width = 400; pic.height = 345;
      marker.append(el('span', '', `いま ${hhmm(now)}`), pic);
      return marker;
    };
    A.render = (data, options = {}) => {
      const list = document.querySelector('#today .event-list');
      if (!list) return;
      const schedule = A.adaptSchedule(data);
      const now = Number.isFinite(options.minute) ? options.minute : -1;
      const selected = Boolean(options.selected);
      const rows = [];
      if (schedule.ring) rows.push({ ...schedule.ring, kind: 'ring', title: 'リングゲーム', note: '好きなタイミングで途中参加OK' });
      schedule.events.forEach((event) => {
        const entry = event.facts.find((f) => /entry/i.test(f.label));
        rows.push({ ...event, kind: 'event', note: entry ? `参加費 ${entry.value.replace('¥0', '無料')}` : '' });
      });
      rows.sort((a, b) => a.start - b.start);
      const ol = el('ol', 'tl');
      if (schedule.closed) {
        ol.append(el('li', 'tl-empty', '本日は休業です。次回の営業は公式Xでお知らせします。'));
      }
      let nowPlaced = selected || now < 0;
      rows.forEach((row) => {
        if (!nowPlaced && row.start > now) {
          const marker = nowMarker(now); ol.append(marker); nowPlaced = true;
        }
        const st = stateLabel(row, now, selected);
        const li = el('li', `tl-row is-${st.key}`);
        const a = el('a', 'tl-link'); a.href = row.link?.url || schedule.latestUrl; a.target = '_blank'; a.rel = 'noreferrer';
        const body = el('span', 'tl-body');
        body.append(el('strong', 'tl-title', row.title));
        if (row.note) body.append(el('span', 'tl-note', row.note));
        a.append(el('time', 'tl-time', hhmm(row.start)), body, el('span', `tl-state is-${st.key}`, st.text));
        li.append(a); ol.append(li);
      });
      if (!nowPlaced && rows.length) { const marker = nowMarker(now); ol.append(marker); }
      if (!rows.length && !schedule.closed) ol.append(el('li', 'tl-empty', '開催内容は公式Xでご確認ください。'));
      list.className = 'event-list v3-timeline';
      list.replaceChildren(ol);
      const title = document.getElementById('today-title'); if (title) title.textContent = '今日のゲーム';
    };
  }

  /* NEWS: clean X-derived titles, hide replies, typographic date thumbnails. */
  const grid = document.querySelector('.news-grid');
  if (!grid) return;
  const emoji = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}\u{FFFD}]/gu;
  const clean = (text) => text.replace(emoji, '').replace(/^R to @\S+:\s*/, '').replace(/\s+/g, ' ').trim();
  const shorten = (text, max = 40) => (text.length > max ? text.slice(0, max - 1) + '…' : text);
  const label = { SCHEDULE: '営業', EVENT: 'イベント', RESULT: '結果' };
  const tidy = () => {
    grid.querySelectorAll('.news-card:not([data-v3])').forEach((card) => {
      card.dataset.v3 = '1';
      const link = card.querySelector('h3 a');
      if (!link) return;
      if (/^R to @/.test(link.textContent)) { card.hidden = true; return; }
      link.textContent = shorten(clean(link.textContent));
      const time = card.querySelector('.news-meta time, .news-meta > :first-child');
      const visual = card.querySelector('.news-image');
      const match = time?.textContent.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
      if (visual && match) {
        const stamp = el('span', 'v3-date');
        stamp.append(el('b', '', String(Number(match[3]))), el('small', '', `${Number(match[2])}月`));
        visual.append(stamp);
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
        if (`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` === today) { visual.classList.add('v3-today'); stamp.lastChild.textContent = '今日'; }
      }
      const cat = card.querySelector('.news-meta > :last-child');
      if (cat && label[cat.textContent.trim()]) cat.textContent = label[cat.textContent.trim()];
    });
  };
  tidy();
  new MutationObserver(tidy).observe(grid, { childList: true });
})();
