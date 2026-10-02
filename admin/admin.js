'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const frame = $('website-preview');
  const keys = ['chonmage-admin-events-draft', 'chonmage-admin-news-draft'];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const VIEWS = { home: 'ホーム', schedule: '今日の予定', news: 'News', settings: '設定' };
  const TYPE_LABELS = { free: 'FREE ROLL', tournament: 'TOURNAMENT', special: 'SPECIAL', event: 'EVENT' };
  const NEWS_THEMES = [['schedule', 'スケジュール（青）'], ['event', 'イベント（オレンジ）'], ['result', '結果（黒）']];
  // Well-known detail rows that get their own field instead of the generic list.
  const ENTRY_FACT = /^(entry|参加費|参加料金)$/i;
  const LATE_FACT = /^(最終受付|late\s*reg(istration)?)$/i;
  const state = {
    data: null, snapshot: '', local: false, view: 'home', request: 0, api: null, core: null,
    autoEvents: null, manualEvents: null, live: null, publishFiles: [], drawer: null, errors: new Map(),
  };
  let timer, readyResolve, readyTimer, noticeTimer;
  const controls = new Map();

  // ---------- small DOM helpers ----------
  const node = (tag, text, className) => {
    const result = document.createElement(tag);
    if (text !== undefined && text !== null) result.textContent = text;
    if (className) result.className = className;
    return result;
  };
  const button = (text, action, className = 'button secondary') => {
    const result = node('button', text, className);
    result.type = 'button'; result.addEventListener('click', action); return result;
  };
  const chip = (text, tone = 'neutral') => node('span', text, `chip chip-${tone}`);
  function menu(label, items) {
    const wrap = node('details', undefined, 'menu');
    const summary = node('summary', '…', 'icon-button'); summary.setAttribute('aria-label', label);
    const list = node('div', undefined, 'menu-list');
    items.filter(Boolean).forEach(([text, action, tone]) => {
      list.append(button(text, () => { wrap.open = false; action(); }, `menu-item${tone === 'danger' ? ' danger' : ''}`));
    });
    wrap.append(summary, list);
    return wrap;
  }
  document.addEventListener('click', (event) => {
    document.querySelectorAll('details.menu[open]').forEach((open) => { if (!open.contains(event.target)) open.open = false; });
  });
  document.addEventListener('keydown', (event) => {
    const open = document.querySelector('details.menu[open]');
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault(); event.stopPropagation();
    open.open = false; open.querySelector('summary').focus();
  }, true);

  function notice(text, tone = 'info') {
    clearTimeout(noticeTimer);
    $('notice-text').textContent = text; $('notice').hidden = !text;
    $('notice').classList.toggle('is-error', tone === 'error');
    if (text && tone !== 'error') noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 8000);
  }
  $('close-notice').addEventListener('click', () => { $('notice').hidden = true; });

  // ---------- dates in Japan time ----------
  function japanNow() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((part) => [part.type, part.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
  }
  function dateLabel(iso) {
    try { return state.api.formatJapaneseDate(iso); } catch { return iso || '日付未設定'; }
  }
  function timeOf(isoDateTime) {
    const match = String(isoDateTime || '').match(/T(\d{2}:\d{2})/);
    return match ? match[1] : '';
  }

  // ---------- data access ----------
  function dirty() { return state.data && JSON.stringify(state.data) !== state.snapshot; }
  function differsFromLive() { return state.data && state.live && JSON.stringify(state.data) !== JSON.stringify(state.live); }
  function get(path) { return path.split('.').reduce((value, key) => value?.[key], state.data); }
  function set(path, value) {
    const parts = path.split('.'); let target = state.data;
    parts.slice(0, -1).forEach((key) => { if (!target[key]) target[key] = {}; target = target[key]; });
    target[parts.at(-1)] = value;
  }
  function autoEventFor(event) {
    return event?.id ? state.autoEvents?.events?.find((item) => item.id === event.id) : undefined;
  }
  function autoValue(path) {
    if (!state.autoEvents || !path.startsWith('events.')) return undefined;
    const parts = path.split('.');
    if (parts[1] === 'events' && /^\d+$/.test(parts[2])) {
      const autoEvent = autoEventFor(state.data?.events?.events?.[Number(parts[2])]);
      return parts.slice(3).reduce((value, key) => value?.[key], autoEvent);
    }
    return parts.slice(1).reduce((value, key) => value?.[key], state.autoEvents);
  }
  // 「手動編集」 only where an automatic value exists and was changed.
  function isOverridden(path) {
    const automatic = autoValue(path);
    return automatic !== undefined && JSON.stringify(get(path)) !== JSON.stringify(automatic);
  }
  function eventOverridden(event) {
    const automatic = autoEventFor(event);
    if (!automatic) return false;
    const keysToCompare = new Set([...Object.keys(automatic), ...Object.keys(event)]);
    keysToCompare.delete('hidden');
    return [...keysToCompare].some((key) => JSON.stringify(event[key] ?? null) !== JSON.stringify(automatic[key] ?? null));
  }
  function newEventId(type = 'event') { return 'manual-' + type + '-' + Date.now().toString(36); }
  function minutesOf(time) {
    return state.core && /^\d{2}:\d{2}$/.test(time || '') ? state.core.scheduleMinutes(time, get('events.open')) : Number.POSITIVE_INFINITY;
  }
  function sortedEventIndexes() {
    return (get('events.events') || []).map((event, index) => index)
      .sort((a, b) => minutesOf(get(`events.events.${a}.time`)) - minutesOf(get(`events.events.${b}.time`)) || a - b);
  }
  function factIndex(eventIndex, matcher) {
    return (get(`events.events.${eventIndex}.facts`) || []).findIndex((fact) => matcher.test(String(fact?.label || '').trim()));
  }
  function factValue(event, matcher) {
    return (event.facts || []).find((fact) => matcher.test(String(fact?.label || '').trim()))?.value || '';
  }
  function errorsUnder(prefix) {
    return [...state.errors.keys()].filter((path) => path === prefix || path.startsWith(prefix + '.')).length;
  }

  // ---------- form fields ----------
  function field(path, label, type = 'text', options = {}) {
    const wrap = node('div', undefined, 'field');
    const id = options.id || `field-${path.replaceAll('.', '-')}`;
    const caption = node('label', label); caption.htmlFor = id;
    if (options.required) caption.append(node('span', '必須', 'required'));
    let input;
    if (type === 'textarea') input = node('textarea');
    else if (type === 'select') {
      input = node('select');
      options.values.forEach(([value, text]) => { const option = node('option', text); option.value = value; input.append(option); });
    } else { input = node('input'); input.type = type; }
    input.id = id; input.dataset.path = path;
    if (options.optionalFact) input.dataset.optionalFact = 'true';
    if (options.placeholder) input.placeholder = options.placeholder;
    if (type === 'checkbox') input.checked = Boolean(get(path)); else input.value = get(path) ?? '';
    if (options.required) input.required = true;
    const hint = node('p', options.hint || '', 'field-hint'); hint.id = `${id}-hint`; hint.hidden = !options.hint;
    const error = node('p', '', 'error-text'); error.id = `${id}-error`; error.hidden = true;
    input.setAttribute('aria-describedby', `${hint.id} ${error.id}`);
    let source = null;
    if (path.startsWith('events.')) {
      source = node('div', undefined, 'field-source');
      source.append(chip('手動編集', 'manual'), button('自動の値に戻す', () => restoreField(path), 'text-button'));
    }
    if (type === 'checkbox') {
      wrap.classList.add('field-check');
      const line = node('div', undefined, 'check-line'); line.append(input, caption);
      wrap.append(line);
    } else wrap.append(caption, input);
    if (source) wrap.append(source);
    wrap.append(hint, error);
    controls.set(path, { input, hint, error, source });
    refreshSource(path);
    return wrap;
  }
  function refreshSource(path) {
    const control = controls.get(path);
    if (control?.source) control.source.hidden = !isOverridden(path);
  }
  function restoreField(path) {
    const automatic = autoValue(path);
    if (automatic === undefined) return;
    set(path, clone(automatic));
    rebuild(path);
    notice('自動取得の値に戻しました。公開するまでは下書きです。');
  }
  function grid(...children) { const result = node('div', undefined, 'field-grid'); result.append(...children); return result; }
  function panel(title, description) {
    const result = node('section', undefined, 'panel');
    if (title) result.append(node('h2', title, 'panel-title'));
    if (description) result.append(node('p', description, 'panel-description'));
    return result;
  }
  function repeatRows(parent, path, title, { fact = false, skip = new Set(), addLabel } = {}) {
    const list = node('div', undefined, 'repeat-list');
    (get(path) || []).forEach((value, index) => {
      if (skip.has(index)) return;
      const row = node('div', undefined, `repeat-row${fact ? ' facts' : ''}`);
      if (fact) row.append(field(`${path}.${index}.label`, '項目名', 'text', { required: true }), field(`${path}.${index}.value`, '内容', 'text', { required: true }));
      else row.append(field(`${path}.${index}`, `${title} ${index + 1}`, 'text', { required: true }));
      const remove = button('削除', () => { get(path).splice(index, 1); rebuild(); }, 'text-button danger');
      remove.setAttribute('aria-label', `${title} ${index + 1} を削除`);
      row.append(remove);
      list.append(row);
    });
    parent.append(list, button(addLabel || `＋ ${title}を追加`, () => {
      if (!get(path)) set(path, []); get(path).push(fact ? { label: '', value: '' } : '');
      rebuild(`${path}.${get(path).length - 1}${fact ? '.label' : ''}`);
    }, 'button dashed'));
  }
  // A featured detail row (参加費, 最終受付) shown as a normal field; created on first input.
  function factField(eventIndex, matcher, label, newLabel, hint) {
    const base = `events.events.${eventIndex}`;
    const index = factIndex(eventIndex, matcher);
    if (index >= 0) return field(`${base}.facts.${index}.value`, label, 'text', { optionalFact: true, hint });
    const wrap = node('div', undefined, 'field');
    const id = `field-${base.replaceAll('.', '-')}-new-${newLabel}`;
    const caption = node('label', label); caption.htmlFor = id;
    const input = node('input'); input.type = 'text'; input.id = id;
    const hintNode = node('p', hint || '', 'field-hint'); hintNode.hidden = !hint;
    input.addEventListener('input', () => {
      if (!input.value) return;
      if (!get(`${base}.facts`)) set(`${base}.facts`, []);
      get(`${base}.facts`).push({ label: newLabel, value: input.value });
      rebuild(`${base}.facts.${get(`${base}.facts`).length - 1}.value`);
    });
    wrap.append(caption, input, hintNode);
    return wrap;
  }

  // ---------- views ----------
  function renderHome(view) {
    const now = japanNow();
    const greeting = now.hour >= 5 && now.hour < 11 ? 'おはようございます' : now.hour >= 11 && now.hour < 17 ? 'こんにちは' : 'こんばんは';
    const head = node('div', undefined, 'home-head');
    head.append(node('p', `${greeting} 👋`, 'greeting'), node('p', dateLabel(now.date), 'today-date'));
    view.append(head);

    const alerts = node('div', undefined, 'alerts');
    const live = state.live?.events;
    const liveCurrent = live && (state.api?.ChonmageSchedule?.businessClock?.(live).current ?? live.date === now.date);
    if (live && !liveCurrent) {
      alerts.append(alert('warning', '要確認', `公開中の予定は ${dateLabel(live.date)} のものです。`, 'サイトの TODAY には「公式Xをご確認ください」と表示されています。', ['今日の予定を作る', () => { location.hash = '#schedule'; openDrawer('hours', null, 'events.date'); }]));
    }
    if (state.errors.size) {
      alerts.append(alert('danger', '要確認', `入力の確認が必要な項目が ${state.errors.size} 件あります。`, '修正するまで公開用ファイルは作成できません。', ['確認する', () => jumpToError()]));
    }
    if (differsFromLive()) {
      alerts.append(alert('info', '未公開', 'まだサイトに公開されていない変更があります。', '公開用ファイルを作成し、GitHub にアップロードすると反映されます。', ['公開用ファイルを作成', () => exportData(true)]));
    }
    if (get('events.date') > now.date) {
      alerts.append(alert('scheduled', '予約', `${dateLabel(get('events.date'))} の予定を編集中です。`, '公開しておくと、その日になったときにサイトへ表示されます。'));
    }
    if (alerts.children.length) view.append(alerts);

    const editingToday = get('events.date') === now.date;
    const dayWord = editingToday ? '本日' : dateLabel(get('events.date'));
    const events = (get('events.events') || []).filter((event) => !event.hidden);
    const closed = get('events.status') === 'closed';
    const cards = node('div', undefined, 'stat-grid');
    cards.append(
      stat(`${dayWord}の営業`, closed ? '休業' : `${get('events.open') || '—'}${get('events.close') ? '–' + get('events.close') : ' OPEN'}`, closed ? chip('休業', 'neutral') : chip('営業', 'success'), () => openDrawer('hours')),
      stat('イベント', `${events.length}件`, null, () => { location.hash = '#schedule'; }),
      stat('リングゲーム', get('events.ringGame.enabled') ? `${get('events.ringGame.start') || get('events.open') || ''}〜` : 'なし', null, () => openDrawer('hours', null, 'events.ringGame.enabled')),
      stat('公開状態', differsFromLive() ? '未公開の変更' : '公開中と同じ', differsFromLive() ? chip('下書き', 'neutral') : chip('公開中', 'success'), () => exportData(true)),
    );
    view.append(cards);

    const timeline = panel(`${dayWord}のスケジュール`);
    const list = node('ol', undefined, 'timeline');
    if (closed) list.append(timelineRow('', '休業日', 'この日はイベントを表示しません。'));
    else {
      if (get('events.open')) list.append(timelineRow(get('events.open'), 'OPEN'));
      if (get('events.ringGame.enabled')) list.append(timelineRow(get('events.ringGame.start') || get('events.open'), 'リングゲーム', get('events.ringGame.title')));
      sortedEventIndexes().forEach((index) => {
        const event = get(`events.events.${index}`);
        if (event.hidden) return;
        const detail = [factValue(event, ENTRY_FACT) && `参加費 ${factValue(event, ENTRY_FACT)}`, factValue(event, LATE_FACT) && `最終受付 ${factValue(event, LATE_FACT)}`].filter(Boolean).join(' · ');
        list.append(timelineRow(event.time || '--:--', event.title || '（名前なし）', detail, () => { location.hash = '#schedule'; openDrawer('event', index); }));
      });
      if (get('events.close')) list.append(timelineRow(get('events.close'), 'CLOSE'));
    }
    timeline.append(list);
    view.append(timeline);
  }
  function alert(tone, label, title, text, action) {
    const box = node('div', undefined, `alert alert-${tone}`);
    const body = node('div', undefined, 'alert-body');
    body.append(chip(label, tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : tone === 'scheduled' ? 'scheduled' : 'neutral'), node('p', title, 'alert-title'));
    if (text) body.append(node('p', text, 'alert-text'));
    box.append(body);
    if (action) box.append(button(action[0], action[1], 'button secondary'));
    return box;
  }
  function stat(label, value, badge, action) {
    const card = node('button', undefined, 'stat'); card.type = 'button'; card.addEventListener('click', action);
    const top = node('span', undefined, 'stat-top'); top.append(node('span', label, 'stat-label'));
    if (badge) top.append(badge);
    card.append(top, node('span', value, 'stat-value'));
    return card;
  }
  function timelineRow(time, title, detail, edit) {
    const row = node('li', undefined, 'timeline-row');
    row.append(node('span', time, 'timeline-time'));
    const body = node('div', undefined, 'timeline-body'); body.append(node('span', title, 'timeline-title'));
    if (detail) body.append(node('span', detail, 'timeline-detail'));
    row.append(body);
    if (edit) { const b = button('編集', edit, 'text-button'); b.setAttribute('aria-label', `${title} を編集`); row.append(b); }
    return row;
  }

  function renderSchedule(view) {
    const closed = get('events.status') === 'closed';
    const hours = node('section', undefined, 'panel hours-card');
    const head = node('div', undefined, 'panel-head');
    const title = node('div'); title.append(node('h2', dateLabel(get('events.date')), 'panel-title'));
    head.append(title, button('編集', () => openDrawer('hours'), 'button secondary'));
    const facts = node('dl', undefined, 'facts-row');
    const addFact = (label, value, badge) => { const row = node('div'); const dd = node('dd', value); if (badge) dd.append(badge); row.append(node('dt', label), dd); facts.append(row); };
    addFact('営業', closed ? '休業' : `${get('events.open') || '—'}${get('events.close') ? ' – ' + get('events.close') : ' OPEN'}`, ['events.status', 'events.open', 'events.close'].some(isOverridden) ? chip('手動編集', 'manual') : null);
    addFact('リングゲーム', get('events.ringGame.enabled') ? `${get('events.ringGame.start') || get('events.open') || ''}〜 ${get('events.ringGame.title') || ''}` : 'なし');
    hours.append(head, facts);
    if (errorsUnder('events.date') + errorsUnder('events.open') + errorsUnder('events.close') + errorsUnder('events.ringGame')) hours.append(chip('要確認', 'danger'));
    view.append(hours);

    const listHead = node('div', undefined, 'list-head');
    listHead.append(node('h2', 'イベント', 'section-title'), menu('イベントを追加', [
      ['EVENT', () => addEvent('event')], ['TOURNAMENT', () => addEvent('tournament')], ['FREE ROLL', () => addEvent('free')],
    ]));
    listHead.querySelector('summary').textContent = '＋ イベントを追加';
    listHead.querySelector('summary').className = 'button primary-soft';
    view.append(listHead);

    const list = node('div', undefined, 'card-list');
    const indexes = sortedEventIndexes();
    if (!indexes.length) {
      const empty = node('div', undefined, 'empty');
      empty.append(node('p', 'イベントはまだありません。', 'empty-title'), node('p', '営業時間とリングゲームだけでも公開できます。トーナメントやフリーロールがある日は追加してください。'));
      list.append(empty);
    }
    indexes.forEach((index) => list.append(eventCard(index)));
    view.append(list);
  }
  function eventCard(index) {
    const event = get(`events.events.${index}`);
    const card = node('article', undefined, `item-card event-card${event.hidden ? ' is-hidden' : ''}`);
    card.dataset.index = String(index);
    card.append(node('span', event.time || '--:--', 'event-time'));
    const main = node('div', undefined, 'item-main');
    const meta = node('div', undefined, 'item-meta');
    meta.append(chip(TYPE_LABELS[event.type] || 'EVENT', 'type'));
    if (!autoEventFor(event)) meta.append(chip('手動で追加', 'manual'));
    else if (eventOverridden(event)) meta.append(chip('手動編集', 'manual'));
    if (event.isMain) meta.append(chip('MAIN', 'scheduled'));
    if (event.hidden) meta.append(chip('非表示', 'neutral'));
    if (errorsUnder(`events.events.${index}`)) meta.append(chip('要確認', 'danger'));
    main.append(meta, node('h3', event.title || '（名前なし）', 'item-title'));
    const detail = [factValue(event, ENTRY_FACT) && `参加費 ${factValue(event, ENTRY_FACT)}`, factValue(event, LATE_FACT) && `最終受付 ${factValue(event, LATE_FACT)}`].filter(Boolean).join(' · ');
    if (detail) main.append(node('p', detail, 'item-detail'));
    card.append(main);
    const actions = node('div', undefined, 'item-actions');
    const edit = button('編集', () => openDrawer('event', index)); edit.setAttribute('aria-label', `${event.title || 'イベント'} を編集`);
    actions.append(edit, menu(`${event.title || 'イベント'} のその他の操作`, eventMenuItems(index)));
    card.append(actions);
    return card;
  }
  function eventMenuItems(index) {
    const event = get(`events.events.${index}`);
    return [
      ['複製', () => duplicateEvent(index)],
      [event.hidden ? 'サイトに表示する' : 'サイトで非表示', () => { set(`events.events.${index}.hidden`, !event.hidden); rebuild(); notice(event.hidden ? 'サイトに表示します。' : 'サイトでは非表示にしました。データは残ります。'); }],
      ['削除', () => deleteItem('events.events', index, 'このイベント'), 'danger'],
    ];
  }
  function addEvent(type) {
    get('events.events').push({ id: newEventId(type), time: '', type, title: TYPE_LABELS[type] || 'EVENT', theme: type === 'free' ? 'blue' : 'orange', tags: [], description: '', facts: [] });
    const index = get('events.events').length - 1;
    render(); changed();
    openDrawer('event', index, `events.events.${index}.time`);
  }
  function duplicateEvent(index) {
    const copy = clone(get(`events.events.${index}`));
    copy.id = newEventId(copy.type || 'event');
    get('events.events').push(copy);
    render(); changed();
    openDrawer('event', get('events.events').length - 1, `events.events.${get('events.events').length - 1}.title`);
  }
  function deleteItem(path, index, label) {
    if (!window.confirm(`${label}を削除しますか？公開するまではサイトに影響しません。`)) return;
    // Clear the drawer first: its close event arrives later and must not re-render the removed item.
    state.drawer = null;
    if ($('drawer').open) $('drawer').close();
    get(path).splice(index, 1); rebuild();
  }

  function renderNews(view) {
    const listHead = node('div', undefined, 'list-head');
    listHead.append(node('p', '上から順にサイトの NEWS に表示されます。', 'panel-description'), button('＋ News を追加', () => {
      get('news.items').unshift({ date: japanNow().date, category: 'EVENT', visualLabel: 'NEWS', theme: 'event', title: '', description: '', url: '' });
      render(); changed(); openDrawer('news', 0, 'news.items.0.title');
    }, 'button primary-soft'));
    view.append(listHead);
    const list = node('div', undefined, 'card-list');
    const items = get('news.items') || [];
    if (!items.length) {
      const empty = node('div', undefined, 'empty');
      empty.append(node('p', 'News はまだありません。', 'empty-title'), node('p', '公式Xの投稿を紹介するときに追加してください。'));
      list.append(empty);
    }
    const liveItems = state.live?.news?.items || [];
    items.forEach((item, index) => {
      const card = node('article', undefined, 'item-card news-card');
      const thumb = node('span', item.visualLabel || 'NEWS', `news-thumb news-thumb-${item.theme || 'event'}`); thumb.setAttribute('aria-hidden', 'true');
      const main = node('div', undefined, 'item-main');
      const meta = node('div', undefined, 'item-meta');
      const published = liveItems.some((liveItem) => JSON.stringify(liveItem) === JSON.stringify(item));
      meta.append(published ? chip('公開中', 'success') : chip(liveItems.some((liveItem) => liveItem.url && liveItem.url === item.url) ? '変更あり' : '下書き', 'neutral'));
      if (errorsUnder(`news.items.${index}`)) meta.append(chip('要確認', 'danger'));
      meta.append(node('span', `${(item.date || '').replaceAll('-', '.')} · ${item.category || ''}`, 'item-sub'));
      main.append(meta, node('h3', item.title || '（タイトルなし）', 'item-title'));
      if (item.description) main.append(node('p', item.description, 'item-detail clamp'));
      const actions = node('div', undefined, 'item-actions');
      const edit = button('編集', () => openDrawer('news', index)); edit.setAttribute('aria-label', `${item.title || 'News'} を編集`);
      const move = (offset) => { const list2 = get('news.items'); [list2[index], list2[index + offset]] = [list2[index + offset], list2[index]]; rebuild(); };
      actions.append(edit, menu(`${item.title || 'News'} のその他の操作`, [
        index > 0 && ['上へ移動', () => move(-1)],
        index < items.length - 1 && ['下へ移動', () => move(1)],
        ['削除', () => deleteItem('news.items', index, 'この News'), 'danger'],
      ]));
      card.append(thumb, main, actions);
      list.append(card);
    });
    view.append(list);
  }

  function renderSettings(view) {
    const links = panel('公式X', 'サイトの「Xで確認」ボタンなどのリンク先です。');
    links.append(
      field('events.latestXUrl', '公式Xのプロフィール', 'url', { required: true, hint: 'https:// で始まるURL' }),
      field('events.schedulePostUrl', '本日の告知投稿（任意）', 'url', { hint: '分かる場合だけ入力してください。' }),
    );
    view.append(links);
    const summary = panel('TODAY の説明文', 'サイトの TODAY 欄に表示される短い文章です。');
    repeatRows(summary, 'events.summary', '行', { addLabel: '＋ 行を追加' });
    view.append(summary);
    const data = panel('データの扱い');
    const order = node('ol', undefined, 'priority');
    [['手動編集', 'この画面で変更した内容。最優先で表示されます。'], ['自動取得', '公式Xの投稿から自動で読み取った内容。'], ['公式X案内', 'どちらもない日は「公式Xをご確認ください」と表示します。']]
      .forEach(([title, text]) => { const li = node('li'); li.append(node('strong', title), node('span', text)); order.append(li); });
    data.append(order, node('p', autoStatusText(), 'panel-description'));
    const actions = node('div', undefined, 'button-row');
    const restore = button('自動取得の内容に戻す', restoreAuto); restore.id = 'restore-auto';
    const reset = button('公開中の内容に戻す', resetToLive); reset.id = 'reset';
    const show = button('ファイルの中身を見る', () => exportData(false)); show.id = 'export-json';
    actions.append(restore, reset, show);
    data.append(actions);
    view.append(data);
  }

  // ---------- drawer ----------
  function openDrawer(kind, index = null, focusPath) {
    state.drawer = { kind, index };
    renderDrawer();
    const dialog = $('drawer');
    if (!dialog.open) dialog.showModal();
    const target = focusPath && controls.get(focusPath)?.input;
    if (target) {
      target.closest('details')?.setAttribute('open', '');
      target.focus();
    } else $('drawer-body').querySelector('input, select, textarea')?.focus();
  }
  function renderDrawer() {
    const body = $('drawer-body');
    [...controls.keys()].forEach((path) => { if (body.contains(controls.get(path).input)) controls.delete(path); });
    const openDetails = body.querySelector('details.advanced')?.open;
    body.replaceChildren();
    const { kind, index } = state.drawer;
    if (kind === 'hours') {
      $('drawer-title').textContent = '営業時間・リングゲーム';
      body.append(field('events.date', '日付', 'date', { required: true }));
      const status = node('fieldset', undefined, 'segmented-field'); status.append(node('legend', '営業'));
      const options = node('div', undefined, 'segmented');
      ['open', 'closed'].forEach((value) => {
        const label = node('label'); const input = node('input'); input.type = 'radio'; input.name = 'business-status'; input.value = value; input.dataset.path = 'events.status'; input.checked = get('events.status') === value;
        label.append(input, node('span', value === 'open' ? '営業' : '休業')); options.append(label);
      });
      status.append(options); body.append(status);
      body.append(grid(
        field('events.open', 'OPEN', 'time', { required: get('events.status') !== 'closed', hint: get('events.status') === 'closed' ? '休業日は空欄でも構いません。' : '' }),
        field('events.close', 'CLOSE', 'time', { hint: '分かる場合だけ。25時は 01:00 と入力。' }),
      ));
      const ring = node('div', undefined, 'drawer-section'); ring.append(node('h3', 'リングゲーム', 'drawer-subtitle'), field('events.ringGame.enabled', 'リングゲームを表示する', 'checkbox'));
      const ringFields = node('div'); ringFields.id = 'ring-fields'; ringFields.hidden = !get('events.ringGame.enabled');
      ringFields.append(
        field('events.ringGame.start', '開始時間', 'time', { hint: '空欄なら OPEN と同じ時間です。' }),
        field('events.ringGame.title', 'タイトル', 'text', { required: true }),
        field('events.ringGame.description', '説明', 'textarea', { required: true }),
      );
      ring.append(ringFields); body.append(ring);
      if (state.autoEvents) body.append(node('p', '自動取得した値に変更を加えると「手動編集」になり、自動取得より優先されます。', 'drawer-note'));
    } else if (kind === 'event') {
      const base = `events.events.${index}`;
      const event = get(base);
      $('drawer-title').textContent = event.title || 'イベント';
      if (autoEventFor(event)) body.append(node('p', '公式Xから自動取得したイベントです。変更すると「手動編集」になり、自動取得より優先されます。', 'drawer-note'));
      body.append(
        field(`${base}.title`, 'イベント名', 'text', { required: true }),
        grid(field(`${base}.time`, '開始時間', 'time', { required: true }), field(`${base}.type`, '種類', 'select', { values: [['tournament', 'TOURNAMENT'], ['free', 'FREE ROLL'], ['special', 'SPECIAL'], ['event', 'EVENT']] })),
        grid(factField(index, ENTRY_FACT, '参加費', '参加費', '例：¥2,500 / 無料'), factField(index, LATE_FACT, '最終受付', '最終受付', '例：21:00')),
        field(`${base}.description`, '短い説明', 'textarea', { required: true }),
      );
      const advanced = node('details', undefined, 'advanced'); advanced.open = Boolean(openDetails);
      advanced.append(node('summary', '詳細設定'));
      const inner = node('div', undefined, 'advanced-body');
      inner.append(
        grid(field(`${base}.end`, '終了時間（任意）', 'time', { hint: '空欄なら次のイベントまで「開催中」' }), field(`${base}.theme`, 'カードの色', 'select', { values: [['blue', '青'], ['orange', 'オレンジ']] })),
        field(`${base}.heroTitle`, 'トップ用の短い名前（任意）', 'text', { hint: '空欄ならイベント名を使います。' }),
        field(`${base}.isMain`, 'トップの MAIN に表示する', 'checkbox'),
      );
      const skip = new Set([factIndex(index, ENTRY_FACT), factIndex(index, LATE_FACT)].filter((value) => value >= 0));
      inner.append(node('h3', 'その他の料金・詳細', 'drawer-subtitle'), node('p', 'Starting Stack、施設利用料、Re-entry、ドリンクなど。', 'field-hint'));
      repeatRows(inner, `${base}.facts`, '詳細', { fact: true, skip, addLabel: '＋ 詳細を追加' });
      inner.append(node('h3', 'タグ', 'drawer-subtitle'));
      repeatRows(inner, `${base}.tags`, 'タグ', { addLabel: '＋ タグを追加' });
      inner.append(node('h3', 'リンク', 'drawer-subtitle'), grid(field(`${base}.link.label`, 'リンクの文言'), field(`${base}.link.url`, 'URL', 'text', { hint: 'https:// または tel:' })));
      advanced.append(inner); body.append(advanced);
      const footer = node('div', undefined, 'drawer-footer');
      eventMenuItems(index).forEach(([text, action, tone]) => footer.append(button(text, action, `text-button${tone === 'danger' ? ' danger' : ''}`)));
      body.append(footer);
    } else if (kind === 'news') {
      const base = `news.items.${index}`;
      $('drawer-title').textContent = get(`${base}.title`) || 'News';
      body.append(
        field(`${base}.title`, 'タイトル', 'text', { required: true }),
        grid(field(`${base}.date`, '投稿日', 'date', { required: true }), field(`${base}.url`, 'X の投稿 URL', 'url', { required: true })),
        field(`${base}.description`, '説明', 'textarea', { required: true }),
      );
      const advanced = node('details', undefined, 'advanced'); advanced.open = Boolean(openDetails);
      advanced.append(node('summary', '詳細設定'));
      const inner = node('div', undefined, 'advanced-body');
      inner.append(grid(field(`${base}.category`, 'カテゴリー', 'text', { required: true, hint: '例：SCHEDULE / EVENT / RESULT' }), field(`${base}.visualLabel`, '画像の大きな文字', 'text', { required: true, hint: '例：TODAY / SPECIAL' })), field(`${base}.theme`, '画像の色', 'select', { values: NEWS_THEMES }));
      advanced.append(inner); body.append(advanced);
      const footer = node('div', undefined, 'drawer-footer');
      footer.append(button('削除', () => deleteItem('news.items', index, 'この News'), 'text-button danger'));
      body.append(footer);
    }
    validate();
  }
  $('close-drawer').addEventListener('click', () => $('drawer').close());
  $('drawer').addEventListener('close', () => { state.drawer = null; render(); });
  $('drawer-form').addEventListener('submit', (event) => event.preventDefault());

  // ---------- render cycle ----------
  function render() {
    if (!state.data) return;
    const view = $(`view-${state.view}`);
    [...controls.keys()].forEach((path) => { if (!$('drawer-body').contains(controls.get(path).input)) controls.delete(path); });
    Object.keys(VIEWS).forEach((name) => { $(`view-${name}`).replaceChildren(); $(`view-${name}`).hidden = name !== state.view; });
    validate();
    ({ home: renderHome, schedule: renderSchedule, news: renderNews, settings: renderSettings })[state.view](view);
    if (state.drawer) renderDrawer();
    validate(); savedState(); updateDataStatus();
  }
  function changed() {
    savedState(); validate(); clearTimeout(timer); timer = setTimeout(sendPreview, 200);
  }
  function rebuild(focusPath) {
    const content = $('main'); const scroll = content.scrollTop; const pageScroll = window.scrollY;
    const drawerScroll = $('drawer-body').scrollTop;
    render(); changed(); content.scrollTop = scroll; window.scrollTo(0, pageScroll); $('drawer-body').scrollTop = drawerScroll;
    if (focusPath) {
      const input = controls.get(focusPath)?.input;
      if (input) { input.closest('details')?.setAttribute('open', ''); input.focus({ preventScroll: true }); if (input.setSelectionRange && input.type === 'text') input.setSelectionRange(input.value.length, input.value.length); }
    }
  }
  function savedState() {
    if (!state.data) return;
    const label = dirty() ? '未保存の変更' : differsFromLive() ? '下書き保存済み' : '公開中と同じ';
    $('save-state').textContent = label;
    $('save-state').className = `chip ${dirty() ? 'chip-warning' : differsFromLive() ? 'chip-neutral' : 'chip-success'}`;
    $('events-count').textContent = state.data.events.events.length;
    $('news-count').textContent = state.data.news.items.length;
  }
  function autoStatusText() {
    const auto = state.autoEvents;
    if (!auto?.updatedAt) return '自動取得：公式Xの投稿はまだ読み取れていません。';
    const when = `${dateLabel(auto.updatedAt.slice(0, 10))} ${timeOf(auto.updatedAt)}`;
    return auto.date === japanNow().date ? `自動取得：正常（最終更新 ${when}）` : `自動取得：本日の投稿はまだ読み取れていません（前回 ${when}）`;
  }
  function updateDataStatus() {
    const auto = state.autoEvents;
    const ok = auto?.updatedAt && auto.date === japanNow().date;
    $('data-status').className = `data-status ${ok ? 'is-ok' : auto?.updatedAt ? 'is-idle' : 'is-warning'}`;
    $('data-status-text').textContent = ok ? `自動取得 正常 · ${timeOf(auto.updatedAt)}` : auto?.updatedAt ? '自動取得 本日分待ち' : '自動取得 未取得';
    $('data-status').title = autoStatusText();
  }

  // ---------- routing ----------
  function setView(name, { focus = false } = {}) {
    state.view = VIEWS[name] ? name : 'home';
    $('page-title').textContent = VIEWS[state.view];
    document.title = `${VIEWS[state.view]} · ちょんまげ 管理画面`;
    document.querySelectorAll('[data-view-link]').forEach((link) => {
      if (link.dataset.viewLink === state.view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    render();
    $('main').scrollTop = 0;
    if (focus) $('main').focus({ preventScroll: true });
    if (state.data) sendPreview();
  }
  window.addEventListener('hashchange', () => setView(location.hash.slice(1), { focus: true }));

  // ---------- validation (unchanged rules) ----------
  function normalized() {
    const data = clone(state.data);
    if (!data.events.schedulePostUrl?.trim()) delete data.events.schedulePostUrl;
    if (!data.events.close?.trim()) delete data.events.close;
    if (data.events.status === 'closed' && !data.events.open?.trim()) delete data.events.open;
    if (data.events.ringGame && !data.events.ringGame.start?.trim()) delete data.events.ringGame.start;
    data.events.events.forEach((event) => {
      if (!event.heroTitle?.trim()) delete event.heroTitle;
      if (!event.end?.trim()) delete event.end;
      if (event.link && !event.link.label?.trim() && !event.link.url?.trim()) delete event.link;
    }); return data;
  }
  function validate() {
    if (!state.data || !state.api) return { valid: false, errors: new Map() };
    const errors = new Map(); const api = state.api;
    const check = (path, fn, message) => { try { fn(get(path)); } catch { errors.set(path, message); } };
    check('events.date', api.dateValue, '有効な日付を入力してください。');
    if (get('events.status') !== 'closed' || get('events.open')?.trim()) check('events.open', api.requireTime, '時刻を入力してください（例：17:00）。');
    if (get('events.close')?.trim()) check('events.close', api.requireTime, '時刻を入力してください（例：23:30）。');
    check('events.latestXUrl', api.safeUrl, 'https:// で始まるURLを入力してください。');
    if (get('events.schedulePostUrl')?.trim()) check('events.schedulePostUrl', api.safeUrl, 'https:// で始まるURLを入力してください。');
    const placeholder = (value) => state.core?.isPlaceholderText(value);
    const text = (path) => {
      if (placeholder(get(path))) errors.set(path, '「' + get(path).trim() + '」は仮の文言です。公開する内容に書き換えてください。');
      else check(path, api.requireText, '入力してください。');
    };
    (get('events.summary') || []).forEach((_, index) => text(`events.summary.${index}`));
    if (get('events.ringGame.enabled')) {
      if (get('events.ringGame.start')?.trim()) check('events.ringGame.start', api.requireTime, '時刻を入力してください（例：17:00）。');
      text('events.ringGame.title'); text('events.ringGame.description');
    }
    get('events.events').forEach((event, index) => {
      const base = `events.events.${index}`;
      check(`${base}.time`, api.requireTime, '開始時間を入力してください（例：19:10）。'); text(`${base}.title`); text(`${base}.description`);
      if (event.end?.trim()) check(`${base}.end`, api.requireTime, '時刻を入力してください。');
      (event.tags || []).forEach((_, i) => text(`${base}.tags.${i}`));
      (event.facts || []).forEach((_, i) => { text(`${base}.facts.${i}.label`); text(`${base}.facts.${i}.value`); });
      if (event.link?.label?.trim() || event.link?.url?.trim()) {
        text(`${base}.link.label`); check(`${base}.link.url`, (url) => api.safeUrl(url, true), 'https:// または tel: で始まるリンクを入力してください。');
      }
    });
    get('news.items').forEach((item, index) => {
      const base = `news.items.${index}`;
      check(`${base}.date`, api.dateValue, '有効な投稿日を入力してください。');
      ['category', 'visualLabel', 'title', 'description'].forEach((key) => text(`${base}.${key}`));
      check(`${base}.url`, api.safeUrl, 'https:// で始まるURLを入力してください。');
    });
    controls.forEach(({ input, error, hint }, path) => {
      error.textContent = errors.get(path) || ''; error.hidden = !errors.has(path); input.setAttribute('aria-invalid', String(errors.has(path)));
      if (input.type === 'date') {
        try { hint.textContent = api.formatJapaneseDate(get(path)); hint.hidden = false; } catch { hint.textContent = ''; hint.hidden = true; }
      }
    });
    let structural = false; const data = normalized();
    // The public page validator and the Node/Actions validator must both accept the draft.
    try {
      api.validateEvents(data.events); api.validateNews(data.news);
      if (state.core) { state.core.validateSchedule(data.events); state.core.validateNews(data.news); }
    } catch { structural = true; }
    state.errors = errors;
    return { valid: !errors.size && !structural, errors, data };
  }
  function jumpToError(errors = state.errors) {
    const path = errors.keys().next().value;
    if (!path) return;
    const eventMatch = path.match(/^events\.events\.(\d+)\./);
    const newsMatch = path.match(/^news\.items\.(\d+)\./);
    if (eventMatch) { location.hash = '#schedule'; openDrawer('event', Number(eventMatch[1]), path); }
    else if (newsMatch) { location.hash = '#news'; openDrawer('news', Number(newsMatch[1]), path); }
    else if (/^events\.(date|status|open|close|ringGame)/.test(path)) { location.hash = '#schedule'; openDrawer('hours', null, path); }
    else { location.hash = '#settings'; setView('settings'); controls.get(path)?.input.focus(); }
  }

  // ---------- preview ----------
  function sendPreview() {
    const result = validate();
    if (!result.valid) {
      $('preview-feedback').textContent = '入力を確認してください。最後の正しいプレビューを表示しています。'; $('preview-feedback').classList.add('error'); return;
    }
    $('preview-feedback').classList.remove('error'); $('preview-feedback').textContent = 'プレビューを更新しています…';
    frame.contentWindow.postMessage({ type: 'CHONMAGE_PREVIEW', events: result.data.events, news: result.data.news, dateMode: $('date-mode').value, section: state.view === 'news' ? 'news' : 'today', requestId: ++state.request }, location.origin);
  }
  function setPreview(open) {
    $('preview-panel').hidden = !open;
    document.body.classList.toggle('preview-open', open);
    $('toggle-preview').setAttribute('aria-expanded', String(open));
    if (open) { sendPreview(); $('close-preview').focus(); } else $('toggle-preview').focus();
  }
  $('toggle-preview').addEventListener('click', () => setPreview($('preview-panel').hidden));
  $('close-preview').addEventListener('click', () => setPreview(false));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('preview-panel').hidden && !document.querySelector('dialog[open]')) setPreview(false); });
  document.querySelectorAll('[data-width]').forEach((control) => control.addEventListener('click', () => {
    $('preview-canvas').style.width = `${control.dataset.width}px`;
    document.querySelectorAll('[data-width]').forEach((other) => other.setAttribute('aria-pressed', String(other === control)));
    $('preview-size').textContent = `${control.dataset.width}px`;
  }));
  $('date-mode').addEventListener('change', sendPreview);

  // ---------- input handling (views and drawer) ----------
  const inputChanged = (event) => {
    const input = event.target; if (!input.dataset?.path || !state.data) return;
    if (input.type === 'radio' && !input.checked) return;
    const path = input.dataset.path;
    // Clearing 参加費 / 最終受付 removes that row instead of leaving an empty one.
    if (input.dataset.optionalFact && event.type === 'change' && !input.value.trim()) {
      const parts = path.split('.'); get(parts.slice(0, 4).join('.')).splice(Number(parts[4]), 1); rebuild(); return;
    }
    set(path, input.type === 'checkbox' ? input.checked : input.value);
    if (path === 'events.ringGame.enabled') $('ring-fields').hidden = !input.checked;
    if (path === 'events.status') { rebuild(); return; }
    if (state.drawer?.kind === 'event' && path === `events.events.${state.drawer.index}.title`) $('drawer-title').textContent = input.value || 'イベント';
    refreshSource(path);
    changed();
  };
  ['input', 'change'].forEach((type) => { $('editor-form').addEventListener(type, inputChanged); $('drawer-form').addEventListener(type, inputChanged); });
  $('editor-form').addEventListener('submit', (event) => event.preventDefault());
  window.addEventListener('beforeunload', (event) => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });

  // ---------- loading ----------
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'CHONMAGE_PREVIEW_READY') {
      const api = frame.contentWindow;
      if (typeof api.validateEvents !== 'function' || typeof api.validateNews !== 'function') return;
      state.api = api; if (readyResolve) { readyResolve(); readyResolve = null; } clearTimeout(readyTimer);
    } else if (event.data.requestId === state.request && event.data.type === 'CHONMAGE_PREVIEW_RENDERED') {
      $('preview-feedback').textContent = '下書きを表示しています。公開サイトはまだ変わりません。';
    } else if (event.data.requestId === state.request && event.data.type === 'CHONMAGE_PREVIEW_ERROR') {
      $('preview-feedback').textContent = 'プレビューを更新できません。入力内容を確認してください。'; $('preview-feedback').classList.add('error');
    }
  });
  frame.addEventListener('load', () => frame.contentWindow.postMessage({ type: 'CHONMAGE_PREVIEW_REQUEST_READY' }, location.origin));
  function prepareFrame() {
    if (state.api) return Promise.resolve();
    return new Promise((resolve, reject) => {
      readyResolve = resolve; readyTimer = setTimeout(() => { readyResolve = null; reject(new Error('プレビューを読み込めませんでした。')); }, 15000);
      frame.src = `../?preview=1&admin=${Date.now()}`;
    });
  }
  async function fetchPublished() {
    async function fetchJson(name, required = true) {
      const response = await fetch(`../data/${name}.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) {
        if (!required) return null;
        throw new Error(`${name}.json を読み込めませんでした（${response.status}）。`);
      }
      try { return await response.json(); }
      catch {
        if (!required) return null;
        throw new Error(`${name}.json の形式を確認してください。`);
      }
    }
    const [events, news, autoEvents, manualEvents] = await Promise.all([
      fetchJson('events'), fetchJson('news'), fetchJson('events.auto', false), fetchJson('events.manual', false),
    ]);
    state.api.validateEvents(events);
    state.api.validateNews(news);
    if (autoEvents) state.api.validateEvents(autoEvents);
    state.autoEvents = clone(autoEvents || events);
    state.manualEvents = manualEvents || { version: 1, date: events.date, fields: {}, ringGame: {}, events: {}, extraEvents: [] };
    state.live = clone({ events, news });
    return { events, news };
  }
  function acceptableDraft(data) {
    if (!data || !data.events || !data.news || !Array.isArray(data.events.events) || !Array.isArray(data.news.items)) return false;
    const strings = (obj, names) => obj && names.every((key) => obj[key] === undefined || typeof obj[key] === 'string');
    return strings(data.events, ['date', 'open', 'status', 'latestXUrl', 'schedulePostUrl']) &&
      (!data.events.summary || Array.isArray(data.events.summary) && data.events.summary.every((row) => typeof row === 'string')) &&
      (!data.events.ringGame || typeof data.events.ringGame === 'object' && typeof data.events.ringGame.enabled === 'boolean' && strings(data.events.ringGame, ['title', 'description'])) &&
      data.events.events.every((item) => strings(item, ['time', 'title', 'heroTitle', 'theme', 'description']) && (!item.tags || Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === 'string')) && (!item.facts || Array.isArray(item.facts) && item.facts.every((fact) => strings(fact, ['label', 'value']))) && (!item.link || strings(item.link, ['label', 'url']))) &&
      data.news.items.every((item) => strings(item, ['date', 'category', 'visualLabel', 'theme', 'title', 'description', 'url']));
  }
  async function chooseDraft(live) {
    let stored;
    try { stored = keys.map((key) => localStorage.getItem(key)); } catch { notice('このブラウザでは下書きを保存できません。公開用ファイルの作成はご利用いただけます。', 'error'); return { data: live, local: false }; }
    if (!stored.some(Boolean)) return { data: live, local: false };
    let draft; try { draft = { events: JSON.parse(stored[0]), news: JSON.parse(stored[1]) }; } catch { /* visible warning below */ }
    const usable = acceptableDraft(draft);
    $('draft-warning').hidden = usable; $('draft-warning').textContent = '保存された下書きを開けませんでした。公開中の内容から始めてください。'; $('restore-draft').disabled = !usable;
    return new Promise((resolve) => {
      const dialog = $('draft-dialog');
      dialog.oncancel = (event) => event.preventDefault();
      const done = (data, local) => { dialog.close(); $('use-live').onclick = null; $('restore-draft').onclick = null; resolve({ data, local }); };
      $('use-live').onclick = () => done(live, false); $('restore-draft').onclick = () => done(draft, true); dialog.showModal();
    });
  }
  async function load() {
    $('load-error').hidden = true; $('loading').hidden = false; $('editor-form').hidden = true;
    try {
      if (!state.core) state.core = await import('../scripts/schedule-core.mjs?v=2');
      await prepareFrame(); const live = await fetchPublished(); const choice = await chooseDraft(live);
      state.data = clone(choice.data); state.local = choice.local; state.snapshot = JSON.stringify(state.data);
      $('editor-form').hidden = false; $('loading').hidden = true;
      ['save-draft', 'prepare-publish'].forEach((id) => { $(id).disabled = false; });
      setView(location.hash.slice(1));
    } catch (error) {
      $('loading').hidden = true; $('load-error').hidden = false; $('load-error-text').textContent = error.message;
      $('save-state').textContent = '読み込みエラー'; $('save-state').className = 'chip chip-danger';
      $('data-status').className = 'data-status is-warning'; $('data-status-text').textContent = 'データを読み込めません';
    }
  }
  function saveDraft() {
    let previous;
    try {
      previous = keys.map((key) => localStorage.getItem(key));
      localStorage.setItem(keys[0], JSON.stringify(state.data.events)); localStorage.setItem(keys[1], JSON.stringify(state.data.news));
      state.snapshot = JSON.stringify(state.data); state.local = true; savedState(); notice('下書きをこのブラウザに保存しました。サイトはまだ変わりません。'); return true;
    } catch {
      if (previous) { try { keys.forEach((key, index) => previous[index] === null ? localStorage.removeItem(key) : localStorage.setItem(key, previous[index])); } catch { /* storage remains unavailable */ } }
      notice('下書きを保存できませんでした。ブラウザの保存設定や空き容量を確認してください。', 'error'); return false;
    }
  }
  $('save-draft').addEventListener('click', saveDraft);
  $('retry').addEventListener('click', load);
  function restoreAuto() {
    if (!state.autoEvents) return;
    if (!window.confirm('手動で変えた内容を外して、自動取得の内容から編集し直しますか？')) return;
    state.data.events = clone(state.autoEvents);
    rebuild();
    notice('自動取得の内容に戻しました。公開するまでは下書きです。');
  }
  async function resetToLive() {
    if (!window.confirm('編集中の内容と保存した下書きを破棄して、公開中の内容に戻しますか？')) return;
    const startingData = JSON.stringify(state.data);
    try {
      const live = await fetchPublished();
      if (JSON.stringify(state.data) !== startingData) {
        notice('読み込み中に編集されたため、戻す操作を中止して変更を残しました。', 'error');
        return;
      }
      let cleared = true;
      try { keys.forEach((key) => localStorage.removeItem(key)); } catch { cleared = false; }
      state.data = clone(live); state.local = false; state.snapshot = JSON.stringify(state.data); rebuild(); sendPreview();
      notice(cleared ? '公開中の内容に戻しました。' : '公開中の内容に戻しましたが、保存済みの下書きは削除できませんでした。');
    } catch (error) { notice(`公開中の内容を読み込めなかったため、編集中の内容を残しました。（${error.message}）`, 'error'); }
  }

  // ---------- export (same merge as GitHub Actions) ----------
  function buildManualOverrides(finalEvents) {
    const auto = state.autoEvents;
    if (!auto) return { version: 1, date: finalEvents.date, replacement: clone(finalEvents) };
    if (finalEvents.date !== auto.date) {
      return { version: 1, date: finalEvents.date, replacement: clone(finalEvents) };
    }
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const fields = {};
    ['open', 'close', 'status', 'latestXUrl', 'schedulePostUrl', 'summary'].forEach((key) => {
      if (!equal(finalEvents[key], auto[key])) fields[key] = finalEvents[key] === undefined ? null : clone(finalEvents[key]);
    });
    const ringGame = {};
    const ringKeys = new Set([...Object.keys(auto.ringGame || {}), ...Object.keys(finalEvents.ringGame || {})]);
    ringKeys.forEach((key) => {
      if (!equal(finalEvents.ringGame?.[key], auto.ringGame?.[key])) {
        ringGame[key] = finalEvents.ringGame?.[key] === undefined ? null : clone(finalEvents.ringGame[key]);
      }
    });
    const events = {};
    const extraEvents = [];
    const autoById = new Map((auto.events || []).filter((event) => event.id).map((event) => [event.id, event]));
    (finalEvents.events || []).forEach((event) => {
      const automatic = event.id ? autoById.get(event.id) : null;
      if (!automatic) { extraEvents.push(clone(event)); return; }
      autoById.delete(event.id);
      const override = {};
      const eventKeys = new Set([...Object.keys(automatic), ...Object.keys(event)]);
      eventKeys.delete('id');
      eventKeys.forEach((key) => {
        if (!equal(event[key], automatic[key])) override[key] = event[key] === undefined ? null : clone(event[key]);
      });
      if (Object.keys(override).length) events[event.id] = override;
    });
    autoById.forEach((event, id) => { events[id] = { hidden: true }; });
    return { version: 1, date: finalEvents.date, fields, ringGame, events, extraEvents };
  }
  function downloadFile(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const link = node('a'); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function exportData(publish = false) {
    const result = validate();
    if (!result.valid) {
      notice('公開の前に、「要確認」の項目を修正してください。', 'error');
      jumpToError(result.errors); return;
    }
    // events.json is produced by the same mergeSchedule() that GitHub Actions runs
    // (scripts/merge-events.mjs), so the uploaded file matches what Actions would write.
    const manual = buildManualOverrides(result.data.events);
    let finalEvents;
    try {
      if (state.autoEvents && result.data.events.date < state.autoEvents.date) {
        throw new Error(`日付が自動取得の予定（${dateLabel(state.autoEvents.date)}）より前なので、この内容は公開されません。日付を確認してください。`);
      }
      finalEvents = state.core.mergeSchedule(state.autoEvents || result.data.events, manual);
    } catch (error) {
      notice(`公開用ファイルを作成できません。${error.message}`, 'error'); return;
    }
    if (publish && !saveDraft()) return;
    $('export-title').textContent = publish ? '公開用ファイルを作成' : 'ファイルの中身';
    $('publish-summary').hidden = !publish; $('export-details').open = !publish; $('export-status').textContent = '';
    $('summary-list').replaceChildren();
    [['日付', dateLabel(finalEvents.date)], ['営業', finalEvents.status === 'open' ? `${finalEvents.open}${finalEvents.close ? '–' + finalEvents.close : ' OPEN'}` : '休業'], ['イベント', `${finalEvents.events.length}件`], ['News', `${result.data.news.items.length}件`]]
      .forEach(([label, value]) => { const row = node('div'); row.append(node('dt', label), node('dd', String(value))); $('summary-list').append(row); });
    $('export-files').replaceChildren();
    const exportFiles = [['events', finalEvents, 'events.json'], ['events-manual', manual, 'events.manual.json'], ['news', result.data.news, 'news.json']];
    state.publishFiles = exportFiles.map(([name, payload, filename]) => ({ name, filename, text: `${JSON.stringify(payload, null, 2)}\n` }));
    exportFiles.forEach(([name, , filename]) => {
      const card = node('section', undefined, 'export-file'); const text = state.publishFiles.find((file) => file.name === name).text;
      const label = node('label', filename); label.htmlFor = `export-${name}`;
      const textarea = node('textarea'); textarea.id = label.htmlFor; textarea.readOnly = true; textarea.value = text; textarea.spellcheck = false;
      const actions = node('div', undefined, 'button-row');
      actions.append(button('ダウンロード', () => downloadFile(filename, text)), button('コピー', async () => {
        try { await navigator.clipboard.writeText(text); $('export-status').textContent = `${filename} をコピーしました。`; }
        catch { textarea.focus(); textarea.select(); $('export-status').textContent = 'コピーできませんでした。選択した内容を手動でコピーしてください。'; }
      }));
      card.append(label, textarea, actions); $('export-files').append(card);
    });
    $('export-dialog').showModal();
  }
  $('download-publish-files').addEventListener('click', async () => {
    if (!state.publishFiles.length) { $('export-status').textContent = '先に公開用ファイルを作成してください。'; return; }
    state.publishFiles.forEach((file, index) => setTimeout(() => downloadFile(file.filename, file.text), index * 250));
    const commitMessage = 'Update schedule data for ' + (state.data?.events?.date || 'today');
    try { await navigator.clipboard.writeText(commitMessage); } catch { /* clipboard is optional */ }
    $('export-status').textContent = '3ファイルを保存しました。まだ公開されていません。GitHub のアップロード画面で data フォルダの同名ファイルを置き換えて commit すると公開されます（コミット文はコピー済み）。';
  });
  $('prepare-publish').addEventListener('click', () => exportData(true));
  $('close-export').addEventListener('click', () => $('export-dialog').close());

  setView(location.hash.slice(1));
  load();
})();
