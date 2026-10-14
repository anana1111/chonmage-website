'use strict';
// 週間スケジュール (data/week.json): the week picture read from X or from an uploaded image,
// shown as a calendar, editable per day, with 表示時間帯 that decide what the home card shows
// from when to when. This page keeps its own draft and makes week.json; it never uploads.
(() => {
  const week = window.ChonmageWeek;
  const DRAFT_KEY = 'chonmage-admin-week-draft';
  const UPLOAD_URL = 'https://github.com/anana1111/chonmage-website/upload/main/data/week-upload';
  const DATA_UPLOAD_URL = 'https://github.com/anana1111/chonmage-website/upload/main/data';
  const PROFILE_URL = 'https://x.com/ChonmageNiigata';
  const STATUS_LABELS = { open: '本日営業', ongoing: '開催中', ended: '本日終了', closed: '休業' };
  const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const state = { live: null, data: null, snapshot: '', loaded: false, loading: null, error: '', dayIndex: null, focus: null, staleDraft: null };
  let host = null; // helpers from admin.js: { notice }

  // ---------- small helpers ----------
  const node = (tag, text, className) => {
    const result = document.createElement(tag);
    if (text !== undefined && text !== null) result.textContent = text;
    if (className) result.className = className;
    return result;
  };
  const button = (text, action, className = 'button secondary') => {
    const result = node('button', text, className); result.type = 'button'; result.addEventListener('click', action); return result;
  };
  const chip = (text, tone = 'neutral') => node('span', text, `chip chip-${tone}`);
  const notice = (text, tone) => host?.notice?.(text, tone);
  const noon = (iso) => new Date(iso + 'T12:00:00+09:00');
  const isoDate = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const addDays = (iso, days) => isoDate(new Date(noon(iso).getTime() + days * 86400000));
  const weekdayOf = (iso) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(noon(iso));
  const weekdayIndex = (iso) => noon(iso).getUTCDay();
  const dayLabel = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}（${weekdayOf(iso)}）`;
  const today = () => isoDate(new Date());
  const minutes = (value) => (value === '24:00' ? 1440 : TIME.test(value || '') ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN);
  const days = () => (Array.isArray(state.data?.days) ? state.data.days : []);
  const dirty = () => state.data && JSON.stringify(state.data) !== state.snapshot;
  const differsFromLive = () => state.data && JSON.stringify(state.data) !== JSON.stringify(state.live);
  function get(path) { return path.split('.').reduce((value, key) => value?.[key], state.data); }
  function set(path, value) {
    const parts = path.split('.'); let target = state.data;
    parts.slice(0, -1).forEach((key) => { if (!target[key]) target[key] = {}; target = target[key]; });
    target[parts.at(-1)] = value;
  }

  // ---------- validation (same limits as scripts/read-week-image.mjs and week-core.js) ----------
  function problems() {
    const errors = new Map();
    const add = (path, message) => { if (!errors.has(path)) errors.set(path, message); };
    const seen = new Set();
    days().forEach((day, index) => {
      const base = `days.${index}`;
      if (seen.has(day.date)) add(`${base}.date`, '同じ日付が2回あります。'); seen.add(day.date);
      if (day.open && !TIME.test(day.open)) add(`${base}.open`, '時刻を入力してください（例：17:00）。');
      if (day.close && !TIME.test(day.close)) add(`${base}.close`, '時刻を入力してください（例：23:30）。');
      if (!day.open && (day.events || []).length) add(`${base}.open`, '休業日にはイベントを入れられません。営業にするか、イベントを削除してください。');
      (day.events || []).forEach((event, eventIndex) => {
        if (!TIME.test(event.time || '')) add(`${base}.events.${eventIndex}.time`, '開始時間を入力してください（例：19:10）。');
        const title = String(event.title || '').trim();
        if (!title) add(`${base}.events.${eventIndex}.title`, 'イベント名を入力してください。');
        else if (title.length > 40) add(`${base}.events.${eventIndex}.title`, '40文字以内にしてください。');
      });
      week.dayCardProblems(day.cards || []).forEach((list, cardIndex) => list.forEach(({ key, message }) => add(`${base}.cards.${cardIndex}${key ? '.' + key : ''}`, message)));
    });
    return errors;
  }
  function exportable() {
    const result = clone(state.data);
    result.days = result.days.map((day) => {
      const row = { date: day.date, open: day.open || '', close: day.open ? day.close || '' : '', ringGame: Boolean(day.open && day.ringGame),
        events: day.open ? (day.events || []).map((event) => ({ time: event.time, title: String(event.title).trim(), entry: String(event.entry || '').trim(), reentry: String(event.reentry || '').trim() })) : [] };
      const cards = (day.cards || []).map((card) => {
        const out = { start: card.start, end: card.end, status: card.status };
        if (card.open) out.open = card.open;
        if (card.mainTime || card.mainTitle) Object.assign(out, { mainTime: card.mainTime, mainTitle: card.mainTitle.trim() });
        out.latestText = card.latestText.trim();
        if (card.latestUrl) out.latestUrl = card.latestUrl.trim();
        return out;
      }).sort((a, b) => minutes(a.start) - minutes(b.start));
      if (cards.length) row.cards = cards;
      return row;
    }).sort((a, b) => a.date.localeCompare(b.date));
    const notes = (result.notes || []).map((note) => String(note).trim()).filter(Boolean).slice(0, 5);
    if (notes.some((note) => note.length > 120)) throw new Error('注意書きは1行120文字以内にしてください。');
    if (notes.length) result.notes = notes; else delete result.notes;
    // The public page and Actions turn each day into events.json; it must pass the same checks.
    if (state.core) result.days.forEach((day) => state.core.validateSchedule(state.core.fillClose(week.daySchedule(result, day.date))));
    return result;
  }

  // ---------- loading ----------
  function liveStamp(value) { return JSON.stringify(value || null); }
  async function load() {
    try {
      if (!state.core) state.core = await import('../scripts/schedule-core.mjs?v=20261009week');
      const response = await fetch(`../data/week.json?t=${Date.now()}`, { cache: 'no-store' });
      const live = response.ok ? await response.json() : null;
      state.live = live && Array.isArray(live.days) ? live : { version: 1, sourceUrl: PROFILE_URL, days: [] };
      let draft = null;
      try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { /* no saved draft */ }
      if (draft && Array.isArray(draft.week?.days) && draft.liveStamp === liveStamp(state.live)) state.data = clone(draft.week);
      else {
        state.data = clone(state.live);
        // The published week changed after this draft (for example a new picture was read).
        if (draft && Array.isArray(draft.week?.days)) state.staleDraft = draft.week;
      }
      state.snapshot = JSON.stringify(draft && state.data && JSON.stringify(state.data) === JSON.stringify(draft.week) ? draft.week : state.live);
      state.loaded = true; state.error = '';
    } catch (error) {
      state.error = `week.json を読み込めませんでした。（${error.message}）`;
    }
  }
  function saveDraft(quiet = false) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ liveStamp: liveStamp(state.live), week: state.data }));
      state.snapshot = JSON.stringify(state.data);
      if (!quiet) notice('週間スケジュールの下書きをこのブラウザに保存しました。サイトはまだ変わりません。');
      return true;
    } catch {
      notice('下書きを保存できませんでした。ブラウザの保存設定を確認してください。', 'error'); return false;
    }
  }
  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
  }
  window.addEventListener('beforeunload', (event) => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });

  // ---------- page ----------
  let view = null;
  async function render(target, helpers) {
    view = target; host = helpers || host;
    view.classList.add('view-wide');
    if (!state.loaded && !state.error) {
      view.replaceChildren(node('p', '週間スケジュールを読み込んでいます…', 'panel-description'));
      state.loading = state.loading || load();
      await state.loading; state.loading = null;
      if (view !== target || target.hidden) return;
    }
    draw();
  }
  function draw() {
    if (!view) return;
    view.replaceChildren();
    if (state.error) {
      const card = node('div', undefined, 'state-card error-card');
      card.append(node('h2', 'データを読み込めませんでした'), node('p', state.error), button('再読み込み', () => { state.error = ''; render(view); }, 'button primary'));
      view.append(card); return;
    }
    const errors = problems();
    if (state.staleDraft) view.append(staleDraftBanner());
    view.append(calendarPanel(errors), cardsPanel(), publishPanel(errors), sourcePanel());
  }

  function staleDraftBanner() {
    const box = node('div', undefined, 'alert alert-info');
    const body = node('div', undefined, 'alert-body');
    body.append(chip('下書き', 'neutral'), node('p', '公開中の週間スケジュールが新しくなりました。', 'alert-title'), node('p', '以前保存した下書きは古い週のものなので、公開中の内容を表示しています。', 'alert-text'));
    const actions = node('div', undefined, 'button-row');
    actions.append(button('古い下書きを開く', () => { state.data = clone(state.staleDraft); state.staleDraft = null; draw(); }), button('下書きを捨てる', () => { discardDraft(); state.staleDraft = null; draw(); }, 'text-button danger'));
    box.append(body, actions); return box;
  }

  function sourcePanel() {
    const card = node('section', undefined, 'panel'); card.id = 'week-source';
    const head = node('div', undefined, 'panel-head');
    head.append(node('h2', '週間スケジュール画像', 'panel-title'));
    card.append(head);
    const live = state.live || {};
    const source = node('p', undefined, 'panel-description');
    if (!days().length) source.textContent = 'まだ週間スケジュールがありません。';
    else if (live.source === 'upload') {
      source.append('いま公開中：アップロードした画像から読み取り');
      if (live.uploadedAt) source.append(`（${live.uploadedAt.slice(0, 16).replace('T', ' ')}）`);
    } else {
      source.append('いま公開中：公式X の週間スケジュール投稿から自動で読み取り ');
      if (/^https:\/\/x\.com\/.+\/status\//.test(live.sourceUrl || '')) { const link = node('a', '投稿を見る ↗'); link.href = live.sourceUrl; link.target = '_blank'; link.rel = 'noreferrer'; source.append(link); }
    }
    card.append(source);
    if (live.source === 'upload' && /^data\/week-upload\/[^/]+$/.test(live.image || '')) {
      const figure = node('figure', undefined, 'week-image');
      const img = node('img'); img.src = `../${live.image.split('/').map(encodeURIComponent).join('/')}`; img.alt = '読み取りに使った週間スケジュール画像'; img.loading = 'lazy';
      figure.append(img); card.append(figure);
    }
    card.append(node('p', '毎週日曜に公式X に出る週間スケジュール画像は自動で読み取ります。読み取れなかったときや内容が違うときは、画像をアップロードするとそちらが優先されます。', 'field-hint'));
    const steps = node('ol', undefined, 'steps');
    const step = (title, text, action) => { const li = node('li'); li.append(node('strong', title), node('span', text)); if (action) li.append(action); steps.append(li); };
    step('画像を保存', '公式X の週間スケジュール画像を長押し（PC は右クリック）で保存します。JPG / PNG / WebP。');
    const open = node('a', 'アップロード画面 ↗', 'button secondary'); open.href = UPLOAD_URL; open.target = '_blank'; open.rel = 'noreferrer';
    step('GitHub にアップロード', 'data/week-upload フォルダに画像を入れて commit します。ファイル名はそのままで大丈夫です。', open);
    step('数分後にこのページを再読み込み', 'AI が画像を読み取り、下のカレンダーに反映されます。違うところはここで直せます。', button('再読み込み', reload));
    card.append(steps);
    return card;
  }
  async function reload() {
    if (dirty() && !window.confirm('保存していない変更があります。破棄して読み込み直しますか？')) return;
    state.loaded = false; state.staleDraft = null; await render(view);
  }

  // The 7 days shown: the week picture's days, or this week (Mon–Sun) when there is none yet.
  function calendarPanel(errors) {
    const card = node('section', undefined, 'panel');
    const head = node('div', undefined, 'panel-head');
    const title = node('div');
    const list = days();
    title.append(node('h2', list.length ? `${dayLabel(list[0].date)} 〜 ${dayLabel(list.at(-1).date)}` : '週間スケジュール', 'panel-title'));
    const badges = node('div', undefined, 'item-meta');
    badges.append(dirty() ? chip('未保存の変更', 'warning') : differsFromLive() ? chip('下書き保存済み・未公開', 'neutral') : chip('公開中と同じ', 'success'));
    if (errors.size) badges.append(chip(`要確認 ${errors.size}件`, 'danger'));
    title.append(badges);
    const actions = node('div', undefined, 'button-row');
    const current = list.some((day) => day.date >= today());
    if (!current) actions.append(button('今週の枠を作る', newWeek, 'button primary-soft'));
    head.append(title, actions);
    card.append(head);
    const lead = node('p', undefined, 'panel-description');
    const jump = button('画像をアップロード', () => document.getElementById('week-source')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 'text-button');
    lead.append('X の週間スケジュール画像から読み取った一週間です。各日の「編集」で直せます。', jump);
    card.append(lead);
    if (!list.length) {
      const empty = node('div', undefined, 'empty');
      empty.append(node('p', '週間スケジュールはまだありません。', 'empty-title'), node('p', '画像をアップロードするか、「今週の枠を作る」から手で入力できます。'));
      card.append(empty); return card;
    }
    if (!current) card.append(node('p', 'この週はもう終わっています。サイトの「今週のスケジュール」には表示されません。', 'callout'));
    const grid = node('ol', undefined, 'week-calendar');
    list.forEach((day, index) => grid.append(dayColumn(day, index, errors)));
    card.append(grid, notesField());
    return card;
  }
  function dayColumn(day, index, errors) {
    const base = `days.${index}`;
    const isToday = day.date === today();
    const column = node('li', undefined, `week-col${isToday ? ' is-today' : ''}${day.date < today() ? ' is-past' : ''}${day.open ? '' : ' is-closed'}`);
    const head = node('div', undefined, 'week-col-head');
    const date = node('p', undefined, 'week-col-date');
    date.append(node('strong', String(Number(day.date.slice(8)))), node('span', weekdayOf(day.date)));
    if (isToday) date.append(chip('今日', 'scheduled'));
    head.append(date, node('p', day.open ? `${day.open}${day.close ? '–' + day.close : ' OPEN'}` : '休業', 'week-col-hours'));
    column.append(head);
    const items = node('ul', undefined, 'week-col-list');
    if (day.open && day.ringGame) items.append(listRow('終日', 'リングゲーム', '', 'is-ring'));
    (day.open ? day.events || [] : []).slice().sort((a, b) => minutes(a.time) - minutes(b.time))
      .forEach((event) => items.append(listRow(event.time || '--:--', event.title || '（名前なし）', [event.entry && `ENTRY ${event.entry}`, event.reentry && `RE ${event.reentry}`].filter(Boolean))));
    if (items.children.length) column.append(items);
    const cards = (day.cards || []).slice().sort((a, b) => minutes(a.start) - minutes(b.start));
    if (cards.length) {
      const block = node('div', undefined, 'week-col-cards');
      block.append(node('p', 'カード表示', 'week-col-label'));
      cards.forEach((card) => {
        const row = node('p', undefined, `week-card-chip status-${card.status}`);
        row.append(node('span', `${card.start || '--:--'}–${card.end || '--:--'}`), node('strong', cardLabel(card)));
        block.append(row);
      });
      column.append(block);
    }
    const bad = [...errors.keys()].some((path) => path === base || path.startsWith(base + '.'));
    const foot = node('div', undefined, 'week-col-foot');
    if (bad) foot.append(chip('要確認', 'danger'));
    const edit = button('編集', () => openDay(index), 'button secondary'); edit.setAttribute('aria-label', `${dayLabel(day.date)} を編集`);
    foot.append(edit); column.append(foot);
    return column;
  }
  // The ※ notes under the picture (施設利用料 etc.), one per line; shown under the site's week card.
  function notesField() {
    const wrap = node('div', undefined, 'field');
    const label = node('label', '注意書き（※）'); label.htmlFor = 'week-notes';
    const input = node('textarea'); input.id = 'week-notes'; input.rows = 3;
    input.value = (state.data.notes || []).join('\n');
    input.placeholder = '例：施設利用料（500円）とワンドリンクオーダー制となっております。';
    input.addEventListener('input', () => {
      const notes = input.value.split('\n').map((line) => line.replace(/^※\s*/, '').trim()).filter(Boolean);
      if (notes.length) state.data.notes = notes; else delete state.data.notes;
      refreshBadges();
    });
    wrap.append(label, input, node('p', '1行に1つ。画像の下にある「※」の文をそのまま入れます。サイトの「今週のスケジュール」の下に表示されます（5件まで）。', 'field-hint'));
    return wrap;
  }
  // Keeps the typing focus: only the status chips and the save buttons follow the change.
  function refreshBadges() {
    const fresh = calendarPanel(problems()).querySelector('.item-meta');
    view?.querySelector('.week-calendar')?.closest('.panel')?.querySelector('.item-meta')?.replaceWith(fresh);
    const save = [...(view?.querySelectorAll('.button') || [])].find((item) => item.textContent === '下書き保存');
    if (save) save.disabled = !dirty();
  }
  function listRow(time, title, detail, className = '') {
    const row = node('li', undefined, `week-col-item ${className}`.trim());
    row.append(node('span', time, 'week-col-time'));
    const body = node('span', undefined, 'week-col-title'); body.append(node('span', title));
    (Array.isArray(detail) ? detail : [detail]).filter(Boolean).forEach((text) => body.append(node('small', text)));
    row.append(body); return row;
  }
  function cardLabel(card) {
    if (card.mainTitle) return `${STATUS_LABELS[card.status] || ''} · ${card.mainTitle}`;
    return `${STATUS_LABELS[card.status] || ''}${card.latestText ? ' · ' + card.latestText : ''}`;
  }
  function newWeek() {
    const start = (() => { const now = today(); const shift = (weekdayIndex(now) + 6) % 7; return addDays(now, -shift); })();
    const old = days();
    const fresh = Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(start, offset);
      const same = old.slice().reverse().find((day) => weekdayIndex(day.date) === weekdayIndex(date));
      const day = { date, open: same?.open || '', close: same?.close || '', ringGame: Boolean(same?.ringGame), events: clone(same?.events || []) };
      if (same?.cards?.length) day.cards = clone(same.cards);
      return day;
    });
    if (old.length && !window.confirm('いまの週を置き換えて、今週（月〜日）の枠を作りますか？前の週と同じ曜日の内容をコピーします。')) return;
    state.data = { ...clone(state.data || {}), version: 1, sourceUrl: state.data?.sourceUrl || PROFILE_URL, source: 'manual', days: fresh };
    delete state.data.image; delete state.data.imageSha256; delete state.data.uploadedAt;
    draw(); notice('今週の枠を作りました。内容を確認して、下書き保存と week.json の作成をしてください。');
  }

  // 表示時間帯: one row per day, 0:00–24:00, each card a block at its time.
  function cardsPanel() {
    const card = node('section', undefined, 'panel');
    card.append(node('h2', 'カード表示の時間割', 'panel-title'),
      node('p', 'トップのホームカード（営業状況・OPEN・MAIN・LATEST）を、何時から何時まで何を表示するか決めます。時間帯の外は、これまで通り自動の表示です。その日のホームカードを「ホーム」で手動設定している日は、そちらが優先されます。', 'panel-description'));
    const list = days();
    if (!list.length) return card;
    const nowDate = today(); const nowMinute = week.japanMinute();
    const table = node('div', undefined, 'week-timeline');
    const scale = node('div', undefined, 'week-timeline-scale'); scale.setAttribute('aria-hidden', 'true');
    scale.append(node('span'));
    const axis = node('div', undefined, 'week-timeline-axis');
    [0, 6, 12, 18, 24].forEach((hour) => { const tick = node('span', `${hour}:00`); tick.style.left = `${hour / 24 * 100}%`; axis.append(tick); });
    scale.append(axis); table.append(scale);
    list.forEach((day, index) => {
      const row = node('div', undefined, `week-timeline-row${day.date === nowDate ? ' is-today' : ''}`);
      row.append(node('span', dayLabel(day.date), 'week-timeline-day'));
      const track = node('div', undefined, 'week-timeline-track');
      if (day.date === nowDate) { const line = node('span', undefined, 'week-timeline-now'); line.style.left = `${nowMinute / 1440 * 100}%`; line.title = '現在'; track.append(line); }
      (day.cards || []).forEach((item, cardIndex) => {
        const start = minutes(item.start); const end = minutes(item.end);
        if (!(start < end)) return;
        const active = day.date === nowDate && start <= nowMinute && nowMinute < end;
        const block = button('', () => openDay(index, `days.${index}.cards.${cardIndex}.start`), `week-timeline-block status-${item.status}${active ? ' is-active' : ''}`);
        block.style.left = `${start / 1440 * 100}%`; block.style.width = `${(end - start) / 1440 * 100}%`;
        block.append(node('span', `${item.start}–${item.end}`), node('strong', cardLabel(item)));
        block.title = `${item.start}–${item.end} ${cardLabel(item)}`;
        block.setAttribute('aria-label', `${dayLabel(day.date)} ${item.start}–${item.end} ${cardLabel(item)}${active ? '（表示中）' : ''} を編集`);
        track.append(block);
      });
      if (!(day.cards || []).length) track.append(node('span', '自動の表示', 'week-timeline-empty'));
      row.append(track, button('＋', () => addCard(index), 'icon-button week-timeline-add'));
      row.lastChild.setAttribute('aria-label', `${dayLabel(day.date)} に表示時間帯を追加`);
      table.append(row);
    });
    card.append(table);
    const active = week.activeCard(state.data, nowDate, nowMinute);
    card.append(node('p', active ? `いまの表示：${active.start}–${active.end}「${cardLabel(active)}」（公開すると反映）` : 'いまは表示時間帯の外です（自動の表示）。', 'field-hint'));
    return card;
  }

  function publishPanel(errors) {
    const card = node('section', undefined, 'panel');
    card.append(node('h2', '保存と公開', 'panel-title'), node('p', '「下書き保存」はこのブラウザだけに保存します。サイトに反映するには week.json を作成して GitHub の data フォルダにアップロードします（既存の week.json を置き換え）。', 'panel-description'));
    const actions = node('div', undefined, 'button-row');
    const save = button('下書き保存', () => { saveDraft(); draw(); }); save.disabled = !dirty();
    const make = button('week.json を作成', () => {
      const found = problems();
      if (found.size) { notice('「要確認」の項目を直してから作成してください。', 'error'); const first = found.keys().next().value; openDay(Number(first.split('.')[1]), first); return; }
      let payload;
      try { payload = exportable(); } catch (error) { notice(`week.json を作成できません。（${error.message}）`, 'error'); return; }
      payload.editedAt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date()).replace(' ', 'T') + '+09:00';
      const text = `${JSON.stringify(payload, null, 2)}\n`;
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
      const link = node('a'); link.href = url; link.download = 'week.json'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      saveDraft(true); draw();
      notice('week.json を保存しました。まだ公開されていません。GitHub の data フォルダに week.json をアップロードして commit すると反映されます。');
    }, 'button primary');
    make.id = 'week-export'; make.disabled = Boolean(errors.size) || !days().length;
    const upload = node('a', 'アップロード画面 ↗', 'button ghost'); upload.href = DATA_UPLOAD_URL; upload.target = '_blank'; upload.rel = 'noreferrer';
    actions.append(save, make, upload);
    if (differsFromLive()) actions.append(button('公開中の内容に戻す', () => {
      if (!window.confirm('週間スケジュールの編集を破棄して、公開中の内容に戻しますか？')) return;
      discardDraft(); state.data = clone(state.live); state.snapshot = JSON.stringify(state.data); draw();
    }, 'text-button danger'));
    card.append(actions, node('p', 'ファイル名に「(1)」が付いたものはアップロードしないでください。次の週の画像を読み取ったときも、カード表示の時間割は同じ曜日のものが引き継がれます。', 'field-hint'));
    return card;
  }

  // ---------- day editor ----------
  const dialog = () => document.getElementById('week-dialog');
  function openDay(index, focusPath) {
    state.dayIndex = index; state.focus = focusPath || null;
    drawDialog();
    if (!dialog().open) dialog().showModal();
    const target = focusPath && dialog().querySelector(`[data-week-path="${CSS.escape(focusPath)}"]`);
    (target || dialog().querySelector('input, select, textarea'))?.focus();
  }
  function field(path, label, type = 'text', options = {}) {
    const wrap = node('div', undefined, 'field');
    const id = `week-${path.replaceAll('.', '-')}`;
    const caption = node('label', label); caption.htmlFor = id;
    if (options.required) caption.append(node('span', '必須', 'required'));
    let input;
    if (type === 'select') {
      input = node('select');
      options.values.forEach(([value, text]) => { const option = node('option', text); option.value = value; input.append(option); });
    } else { input = node('input'); input.type = type; }
    if (type === 'checkbox') input.checked = Boolean(get(path)); else input.value = get(path) ?? '';
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.list) input.setAttribute('list', options.list);
    input.id = id; input.dataset.weekPath = path;
    const hint = node('p', options.hint || '', 'field-hint'); hint.hidden = !options.hint;
    const error = node('p', '', 'error-text'); error.id = `${id}-error`; error.hidden = true; error.dataset.weekError = path;
    input.setAttribute('aria-describedby', error.id);
    if (type === 'checkbox') { wrap.classList.add('field-check'); const line = node('div', undefined, 'check-line'); line.append(input, caption); wrap.append(line); }
    else wrap.append(caption, input);
    wrap.append(hint, error);
    return wrap;
  }
  const pair = (...children) => { const result = node('div', undefined, 'field-grid'); result.append(...children); return result; };
  function drawDialog() {
    const index = state.dayIndex; const base = `days.${index}`; const day = get(base);
    if (!day) return;
    document.getElementById('week-dialog-title').textContent = `${dayLabel(day.date)} の予定`;
    const body = document.getElementById('week-dialog-body');
    const scroll = body.scrollTop;
    body.replaceChildren();
    // 営業
    const status = node('fieldset', undefined, 'segmented-field'); status.append(node('legend', '営業'));
    const options = node('div', undefined, 'segmented');
    [['open', '営業'], ['closed', '休業']].forEach(([value, text]) => {
      const label = node('label'); const input = node('input'); input.type = 'radio'; input.name = 'week-business'; input.value = value; input.checked = (value === 'open') === Boolean(day.open);
      input.addEventListener('change', () => {
        if (value === 'closed') { day._open = day.open; day.open = ''; }
        else day.open = day._open || '17:00';
        delete day._open; changed(true);
      });
      label.append(input, node('span', text)); options.append(label);
    });
    status.append(options); body.append(status);
    if (day.open) {
      body.append(pair(field(`${base}.open`, 'OPEN', 'time', { required: true }), field(`${base}.close`, 'CLOSE', 'time', { hint: '25時は 01:00 と入力。' })),
        field(`${base}.ringGame`, '終日リングゲームあり', 'checkbox'));
      const events = node('div', undefined, 'drawer-section');
      events.append(node('h3', 'イベント', 'drawer-subtitle'));
      (day.events || []).forEach((event, eventIndex) => {
        const path = `${base}.events.${eventIndex}`;
        const row = node('div', undefined, 'week-edit-row');
        row.append(pair(field(`${path}.time`, '開始', 'time', { required: true }), field(`${path}.title`, 'イベント名', 'text', { required: true })),
          pair(field(`${path}.entry`, 'ENTRY', 'text', { placeholder: '例：¥2,500 / 無料' }), field(`${path}.reentry`, 'RE-ENTRY', 'text', { placeholder: '例：¥2,500' })));
        const remove = button('このイベントを削除', () => { day.events.splice(eventIndex, 1); changed(true); }, 'text-button danger');
        row.append(remove); events.append(row);
      });
      events.append(button('＋ イベントを追加', () => { day.events = day.events || []; day.events.push({ time: '', title: '', entry: '', reentry: '' }); changed(true, `${base}.events.${day.events.length - 1}.time`); }, 'button dashed'));
      body.append(events);
    }
    // 表示時間帯
    const cards = node('div', undefined, 'drawer-section');
    cards.append(node('h3', 'カード表示（何時から何時まで、何を表示するか）', 'drawer-subtitle'),
      node('p', 'この時間帯だけ、トップのホームカードをここで決めた内容にします。時間帯の外は自動の表示です。日付が変わるまでは 24:00、深夜は翌日の欄に 00:00 から作ります。', 'field-hint'));
    (day.cards || []).forEach((card, cardIndex) => {
      const path = `${base}.cards.${cardIndex}`;
      const box = node('div', undefined, 'week-edit-row week-edit-card');
      box.append(node('p', `表示時間帯 ${cardIndex + 1}`, 'week-edit-card-title'),
        pair(field(`${path}.start`, '表示開始', 'time', { required: true }), field(`${path}.end`, '表示終了', 'text', { required: true, placeholder: '19:00 / 24:00', list: 'week-end-times' })),
        pair(field(`${path}.status`, '営業状況', 'select', { values: Object.entries(STATUS_LABELS) }), field(`${path}.open`, 'OPEN', 'time', { required: card.status !== 'closed' })),
        pair(field(`${path}.mainTime`, 'MAIN TIME', 'time'), field(`${path}.mainTitle`, 'MAIN EVENT', 'text', { hint: '両方空欄なら MAIN を出しません。' })),
        pair(field(`${path}.latestText`, 'LATEST の文言', 'text', { required: true, placeholder: '例：Xで確認 / 受付中' }), field(`${path}.latestUrl`, 'LATEST のリンク', 'url', { hint: '空欄なら公式X。' })),
        cardPreview(card));
      const actions = node('div', undefined, 'button-row');
      actions.append(button('複製', () => { day.cards.splice(cardIndex + 1, 0, { ...clone(card), start: card.end === '24:00' ? card.start : card.end, end: card.end === '24:00' ? '24:00' : '' }); changed(true, `${base}.cards.${cardIndex + 1}.end`); }, 'text-button'),
        button('削除', () => { day.cards.splice(cardIndex, 1); if (!day.cards.length) delete day.cards; changed(true); }, 'text-button danger'));
      box.append(actions); cards.append(box);
    });
    cards.append(button('＋ 表示時間帯を追加', () => addCard(index), 'button dashed'));
    if ((day.cards || []).length && days().length > 1) cards.append(button('この日のカード表示をほかの日にもコピー', () => copyCards(index), 'button secondary'));
    body.append(cards);
    const list = node('datalist'); list.id = 'week-end-times';
    ['12:00', '13:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '23:30', '24:00'].forEach((value) => { const option = node('option'); option.value = value; list.append(option); });
    body.append(list);
    body.scrollTop = scroll;
    showErrors();
  }
  // A small copy of the home card, so the content is easy to check while typing.
  function cardPreview(card) {
    const box = node('div', undefined, 'week-card-preview'); box.setAttribute('aria-label', 'ホームカードの見え方');
    const cell = (label, value) => { const item = node('div'); item.append(node('span', label), node('strong', value)); return item; };
    box.append(cell('STATUS', STATUS_LABELS[card.status] || '—'));
    if (card.status !== 'closed' && card.open) box.append(cell('OPEN', card.open));
    if (card.status !== 'closed' && card.mainTime && card.mainTitle) box.append(cell('MAIN', `${card.mainTime} ${card.mainTitle}`));
    box.append(cell('LATEST', `${(card.latestText || '').replace(/\s*↗$/, '') || '—'} ↗`));
    return box;
  }
  function addCard(index) {
    const day = get(`days.${index}`);
    day.cards = day.cards || [];
    const last = day.cards.slice().sort((a, b) => minutes(a.start) - minutes(b.start)).at(-1);
    const start = last ? (last.end === '24:00' ? '' : last.end) : day.open || '';
    day.cards.push({ start, end: '', status: day.open ? 'open' : 'closed', open: day.open || '', mainTime: '', mainTitle: '', latestText: 'Xで確認', latestUrl: '' });
    const path = `days.${index}.cards.${day.cards.length - 1}.${start ? 'end' : 'start'}`;
    if (dialog().open && state.dayIndex === index) changed(true, path); else { draw(); openDay(index, path); }
  }
  function copyCards(index) {
    const source = get(`days.${index}.cards`) || [];
    if (!window.confirm(`${dayLabel(get(`days.${index}.date`))} のカード表示（${source.length}件）を、この週のほかの日すべてにコピーしますか？ほかの日のカード表示は置き換わります。`)) return;
    days().forEach((day, other) => { if (other !== index) day.cards = clone(source); });
    changed(true); notice('ほかの日にもコピーしました。休業日などは個別に直してください。');
  }
  function showErrors() {
    const errors = problems();
    dialog().querySelectorAll('[data-week-error]').forEach((error) => {
      const path = error.dataset.weekError; const message = errors.get(path);
      error.textContent = message || ''; error.hidden = !message;
      dialog().querySelector(`[data-week-path="${CSS.escape(path)}"]`)?.setAttribute('aria-invalid', String(Boolean(message)));
    });
  }
  // Redraws after a change; `rebuildDialog` when rows were added or removed.
  function changed(rebuildDialog = false, focusPath) {
    draw();
    if (dialog().open && rebuildDialog) {
      drawDialog();
      if (focusPath) dialog().querySelector(`[data-week-path="${CSS.escape(focusPath)}"]`)?.focus();
    } else showErrors();
  }
  function onInput(event) {
    const input = event.target; const path = input.dataset?.weekPath;
    if (!path || !state.data) return;
    const value = input.type === 'checkbox' ? input.checked : input.value.trim() === '' ? '' : input.value;
    set(path, typeof value === 'string' ? value.replace(/^(\d):/, '0$1:').replace(/^24:0$/, '24:00') : value);
    // Status and OPEN change which fields are required; the card preview follows every keystroke.
    const rebuild = event.type === 'change' && (/\.status$/.test(path) || /^days\.\d+\.open$/.test(path));
    if (rebuild) { changed(true, path); return; }
    const box = input.closest('.week-edit-card');
    const card = box && get(path.split('.').slice(0, 4).join('.'));
    if (card) box.querySelector('.week-card-preview')?.replaceWith(cardPreview(card));
    changed(false);
  }

  function setup() {
    const el = dialog();
    if (!el || el.dataset.ready) return;
    el.dataset.ready = '1';
    ['input', 'change'].forEach((type) => el.addEventListener(type, onInput));
    document.getElementById('week-dialog-form').addEventListener('submit', (event) => event.preventDefault());
    document.getElementById('close-week-dialog').addEventListener('click', () => el.close());
    el.addEventListener('close', () => { state.dayIndex = null; draw(); });
  }
  document.addEventListener('DOMContentLoaded', setup);
  if (document.readyState !== 'loading') setup();

  window.ChonmageWeekAdmin = { render };
})();
