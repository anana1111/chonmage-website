'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const frame = $('website-preview');
  const keys = ['chonmage-admin-events-draft', 'chonmage-admin-news-draft'];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const state = { data: null, snapshot: '', local: false, tab: 'today', request: 0, api: null };
  let timer, readyResolve, readyTimer;
  const controls = new Map();
  const node = (tag, text, className) => {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
  };
  const button = (text, action, className) => {
    const result = node('button', text, className);
    result.type = 'button'; result.addEventListener('click', action); return result;
  };
  function notice(text) { $('notice').textContent = text; $('notice').hidden = !text; }
  function dirty() { return state.data && JSON.stringify(state.data) !== state.snapshot; }
  function savedState() {
    $('save-state').textContent = dirty() ? '未保存の変更' : state.local ? 'ブラウザに保存済み' : '公開データを読み込み済み';
    $('save-state').classList.toggle('unsaved', Boolean(dirty()));
    $('events-count').textContent = state.data.events.events.length;
    $('news-count').textContent = state.data.news.items.length;
  }
  function get(path) { return path.split('.').reduce((value, key) => value?.[key], state.data); }
  function set(path, value) {
    const parts = path.split('.'); let target = state.data;
    parts.slice(0, -1).forEach((key) => { if (!target[key]) target[key] = {}; target = target[key]; });
    target[parts.at(-1)] = value;
  }
  function field(path, label, type = 'text', options = {}) {
    const wrap = node('div', undefined, 'field');
    const id = `field-${path.replaceAll('.', '-')}`;
    const caption = node('label', label); caption.htmlFor = id;
    if (options.required) caption.append(node('span', '必須', 'required'));
    let input;
    if (type === 'textarea') input = node('textarea');
    else if (type === 'select') {
      input = node('select');
      options.values.forEach(([value, text]) => { const option = node('option', text); option.value = value; input.append(option); });
    } else { input = node('input'); input.type = type; }
    input.id = id; input.dataset.path = path;
    if (type === 'checkbox') input.checked = Boolean(get(path)); else input.value = get(path) ?? '';
    if (options.required) input.required = true;
    const hint = node('p', options.hint || '', 'field-hint'); hint.id = `${id}-hint`; hint.hidden = !options.hint;
    const error = node('p', '', 'error-text'); error.id = `${id}-error`; error.hidden = true;
    input.setAttribute('aria-describedby', `${hint.id} ${error.id}`);
    wrap.append(caption, input, hint, error);
    controls.set(path, { input, hint, error }); return wrap;
  }
  function section(title, description) {
    const result = node('section', undefined, 'form-section'); result.append(node('h2', title));
    if (description) result.append(node('p', description, 'section-description')); return result;
  }
  function changed() {
    savedState(); validate(); clearTimeout(timer); timer = setTimeout(sendPreview, 200);
  }
  function rebuild(focusPath) {
    const editor = document.querySelector('.editor'); const scroll = editor.scrollTop;
    render(); changed(); editor.scrollTop = scroll;
    if (focusPath) controls.get(focusPath)?.input.focus({ preventScroll: true });
  }
  function repeatRows(parent, path, title, fact = false) {
    parent.append(node('h3', title, 'subheading'));
    (get(path) || []).forEach((value, index) => {
      const row = node('div', undefined, `repeat-row${fact ? ' facts' : ''}`);
      if (fact) row.append(field(`${path}.${index}.label`, '項目名', 'text', { required: true }), field(`${path}.${index}.value`, '内容', 'text', { required: true }));
      else row.append(field(`${path}.${index}`, `${title} ${index + 1}`, 'text', { required: true }));
      row.append(button('削除', () => { get(path).splice(index, 1); rebuild(path.split('.').slice(0, 3).join('.') + '.title'); }));
      parent.append(row);
    });
    parent.append(button(`＋ ${title}を追加`, () => {
      if (!get(path)) set(path, []); get(path).push(fact ? { label: '', value: '' } : '');
      rebuild(`${path}.${get(path).length - 1}${fact ? '.label' : ''}`);
    }, 'add-item'));
  }
  function itemActions(path, index, count, kind) {
    const result = node('div', undefined, 'row-actions');
    const up = button('↑', () => move(-1)); up.disabled = index === 0; up.setAttribute('aria-label', `${kind} ${index + 1}を上へ`);
    const down = button('↓', () => move(1)); down.disabled = index === count - 1; down.setAttribute('aria-label', `${kind} ${index + 1}を下へ`);
    result.append(up, down, button('削除', () => {
      if (!window.confirm(`この${kind}を削除しますか？`)) return;
      get(path).splice(index, 1); rebuild();
    }));
    function move(offset) {
      const list = get(path); [list[index], list[index + offset]] = [list[index + offset], list[index]];
      rebuild(`${path}.${index + offset}.title`);
    }
    return result;
  }
  function render() {
    controls.clear(); const today = $('today-panel'), news = $('news-panel'); today.replaceChildren(); news.replaceChildren();
    const basic = section('基本情報', '開催日と営業時間を設定します。曜日は自動で表示されます。');
    basic.append(field('events.date', '開催日', 'date', { required: true }));
    const status = node('fieldset', undefined, 'status-options'); status.append(node('legend', '営業状態'));
    ['open', 'closed'].forEach((value) => {
      const label = node('label'); const input = node('input'); input.type = 'radio'; input.name = 'business-status'; input.value = value; input.dataset.path = 'events.status'; input.checked = get('events.status') === value;
      label.append(input, document.createTextNode(value === 'open' ? '営業' : '休業')); status.append(label);
    });
    basic.append(status, field('events.open', 'OPEN', 'time', { required: true }), field('events.latestXUrl', '公式X', 'url', { required: true, hint: 'https:// で始まる公式プロフィールURL' }), field('events.schedulePostUrl', '本日の告知投稿（任意）', 'url'));
    today.append(basic);
    const summary = section('TODAY説明'); repeatRows(summary, 'events.summary', '行'); today.append(summary);
    const ring = section('リングゲーム'); ring.append(field('events.ringGame.enabled', '表示する', 'checkbox'));
    const ringFields = node('div'); ringFields.id = 'ring-fields'; ringFields.hidden = !get('events.ringGame.enabled');
    ringFields.append(field('events.ringGame.title', 'タイトル', 'text', { required: true }), field('events.ringGame.description', '説明', 'textarea', { required: true })); ring.append(ringFields); today.append(ring);
    today.append(node('h2', 'イベント', 'list-title'));
    if (!get('events.events').length) today.append(node('p', 'イベントはありません。必要なときに追加してください。', 'empty-state'));
    get('events.events').forEach((event, index, list) => {
      const card = node('section', undefined, 'item-card'); const heading = node('div', undefined, 'item-heading');
      heading.append(node('h3', `EVENT ${String(index + 1).padStart(2, '0')}`), itemActions('events.events', index, list.length, 'イベント')); card.append(heading);
      const base = `events.events.${index}`;
      card.append(field(`${base}.time`, 'START', 'time', { required: true }), field(`${base}.title`, 'イベント名', 'text', { required: true }), field(`${base}.heroTitle`, 'Hero短縮名（任意）', 'text', { hint: '未入力の場合はイベント名を使います。' }), field(`${base}.theme`, 'テーマ', 'select', { values: [['blue', 'Blue'], ['orange', 'Orange']] }));
      repeatRows(card, `${base}.tags`, 'タグ'); card.append(field(`${base}.description`, '説明', 'textarea', { required: true })); repeatRows(card, `${base}.facts`, '料金・詳細', true);
      card.append(field(`${base}.link.label`, 'リンク文言（任意）'), field(`${base}.link.url`, 'リンク（任意）', 'text', { hint: 'https:// または tel:。文言とURLを一緒に入力してください。' })); today.append(card);
    });
    today.append(button('＋ EVENT', () => {
      get('events.events').push({ time: '', title: '', heroTitle: '', theme: 'blue', tags: [], description: '', facts: [] }); rebuild(`events.events.${get('events.events').length - 1}.time`);
    }, 'add-item'));
    news.append(node('h2', 'ニュース', 'list-title'), node('p', '配列の順番で公開サイトに表示されます。', 'section-description'));
    if (!get('news.items').length) news.append(node('p', 'ニュースはありません。必要なときに追加してください。', 'empty-state'));
    get('news.items').forEach((item, index, list) => {
      const card = node('section', undefined, 'item-card'); const heading = node('div', undefined, 'item-heading');
      heading.append(node('h3', `NEWS ${String(index + 1).padStart(2, '0')}`), itemActions('news.items', index, list.length, 'ニュース')); card.append(heading);
      const base = `news.items.${index}`;
      card.append(field(`${base}.date`, '投稿日', 'date', { required: true }), field(`${base}.category`, 'カテゴリー', 'text', { required: true }), field(`${base}.visualLabel`, '表示ラベル', 'text', { required: true }), field(`${base}.theme`, 'テーマ', 'select', { values: [['schedule', 'schedule'], ['event', 'event'], ['result', 'result']] }), field(`${base}.title`, 'タイトル', 'text', { required: true }), field(`${base}.description`, '説明', 'textarea', { required: true }), field(`${base}.url`, 'X投稿URL', 'url', { required: true })); news.append(card);
    });
    news.append(button('＋ NEWS', () => {
      get('news.items').push({ date: '', category: '', visualLabel: '', theme: 'schedule', title: '', description: '', url: '' }); rebuild(`news.items.${get('news.items').length - 1}.date`);
    }, 'add-item'));
    validate(); savedState();
  }
  function normalized() {
    const data = clone(state.data);
    if (!data.events.schedulePostUrl?.trim()) delete data.events.schedulePostUrl;
    data.events.events.forEach((event) => {
      if (!event.heroTitle?.trim()) delete event.heroTitle;
      if (event.link && !event.link.label?.trim() && !event.link.url?.trim()) delete event.link;
    }); return data;
  }
  function validate() {
    if (!state.data || !state.api) return { valid: false, errors: new Map() };
    const errors = new Map(); const api = state.api;
    const check = (path, fn, message) => { try { fn(get(path)); } catch { errors.set(path, message); } };
    check('events.date', api.dateValue, '有効な開催日を入力してください。');
    check('events.open', api.requireTime, '時刻を HH:MM 形式で入力してください。');
    check('events.latestXUrl', api.safeUrl, 'https:// で始まるURLを入力してください。');
    if (get('events.schedulePostUrl')?.trim()) check('events.schedulePostUrl', api.safeUrl, 'https:// で始まるURLを入力してください。');
    const text = (path) => check(path, api.requireText, '内容を入力してください。');
    (get('events.summary') || []).forEach((_, index) => text(`events.summary.${index}`));
    if (get('events.ringGame.enabled')) { text('events.ringGame.title'); text('events.ringGame.description'); }
    get('events.events').forEach((event, index) => {
      const base = `events.events.${index}`;
      check(`${base}.time`, api.requireTime, '時刻を HH:MM 形式で入力してください。'); text(`${base}.title`); text(`${base}.description`);
      (event.tags || []).forEach((_, i) => text(`${base}.tags.${i}`));
      (event.facts || []).forEach((_, i) => { text(`${base}.facts.${i}.label`); text(`${base}.facts.${i}.value`); });
      if (event.link?.label?.trim() || event.link?.url?.trim()) {
        text(`${base}.link.label`); check(`${base}.link.url`, (url) => api.safeUrl(url, true), 'https:// または有効な tel: リンクを入力してください。');
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
    try { api.validateEvents(data.events); api.validateNews(data.news); } catch { structural = true; }
    return { valid: !errors.size && !structural, errors, data };
  }
  function sendPreview() {
    const result = validate();
    if (!result.valid) {
      $('preview-feedback').textContent = '入力を確認してください。最後の有効なプレビューを表示しています。'; $('preview-feedback').classList.add('error'); return;
    }
    $('preview-feedback').classList.remove('error'); $('preview-feedback').textContent = 'プレビューを更新しています…';
    frame.contentWindow.postMessage({ type: 'CHONMAGE_PREVIEW', events: result.data.events, news: result.data.news, dateMode: $('date-mode').value, section: state.tab, requestId: ++state.request }, location.origin);
  }
  function selectTab(tab, focus = false) {
    state.tab = tab;
    ['today', 'news'].forEach((name) => {
      $(name + '-panel').hidden = name !== tab;
      $(name + '-tab').setAttribute('aria-selected', String(name === tab)); $(name + '-tab').tabIndex = name === tab ? 0 : -1;
    });
    if (focus) $(tab + '-tab').focus(); if (state.data) sendPreview();
  }
  $('editor-form').addEventListener('submit', (event) => event.preventDefault());
  const inputChanged = (event) => {
    const input = event.target; if (!input.dataset.path || !state.data) return;
    if (input.type === 'radio' && !input.checked) return;
    set(input.dataset.path, input.type === 'checkbox' ? input.checked : input.value);
    if (input.dataset.path === 'events.ringGame.enabled') $('ring-fields').hidden = !input.checked;
    changed();
  };
  $('editor-form').addEventListener('input', inputChanged);
  $('editor-form').addEventListener('change', inputChanged);
  ['today', 'news'].forEach((tab) => {
    $(tab + '-tab').addEventListener('click', () => selectTab(tab));
    $(tab + '-tab').addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); selectTab(event.key === 'Home' ? 'today' : event.key === 'End' ? 'news' : tab === 'today' ? 'news' : 'today', true);
    });
  });
  document.querySelectorAll('[data-width]').forEach((control) => control.addEventListener('click', () => {
    $('preview-canvas').style.width = control.dataset.width === 'full' ? '100%' : `${control.dataset.width}px`;
    document.querySelectorAll('[data-width]').forEach((other) => other.setAttribute('aria-pressed', String(other === control))); updateSize();
  }));
  function updateSize() { $('preview-size').textContent = `${Math.round($('preview-canvas').getBoundingClientRect().width)}px`; }
  new ResizeObserver(updateSize).observe($('preview-canvas'));
  $('date-mode').addEventListener('change', sendPreview);
  $('jump-preview').addEventListener('click', () => $('preview-panel').scrollIntoView({ behavior: 'instant' }));
  window.addEventListener('beforeunload', (event) => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'CHONMAGE_PREVIEW_READY') {
      const api = frame.contentWindow;
      if (typeof api.validateEvents !== 'function' || typeof api.validateNews !== 'function') return;
      state.api = api; if (readyResolve) { readyResolve(); readyResolve = null; } clearTimeout(readyTimer);
    } else if (event.data.requestId === state.request && event.data.type === 'CHONMAGE_PREVIEW_RENDERED') {
      $('preview-feedback').textContent = '下書きを表示しています。公開サイトには反映されません。';
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
    const result = await Promise.all(['events', 'news'].map(async (name) => {
      const response = await fetch(`../data/${name}.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${name}.json を読み込めませんでした（${response.status}）。`);
      try { return await response.json(); } catch { throw new Error(`${name}.json の形式を確認してください。`); }
    }));
    state.api.validateEvents(result[0]); state.api.validateNews(result[1]); return { events: result[0], news: result[1] };
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
    try { stored = keys.map((key) => localStorage.getItem(key)); } catch { notice('このブラウザでは下書きを保存できません。JSONの書き出しをご利用ください。'); return { data: live, local: false }; }
    if (!stored.some(Boolean)) return { data: live, local: false };
    let draft; try { draft = { events: JSON.parse(stored[0]), news: JSON.parse(stored[1]) }; } catch { /* visible warning below */ }
    const usable = acceptableDraft(draft);
    $('draft-warning').hidden = usable; $('draft-warning').textContent = '保存された下書きの形式が不完全です。公開中のデータを読み込んでください。'; $('restore-draft').disabled = !usable;
    return new Promise((resolve) => {
      const dialog = $('draft-dialog');
      dialog.oncancel = (event) => event.preventDefault();
      const done = (data, local) => { dialog.close(); $('use-live').onclick = null; $('restore-draft').onclick = null; resolve({ data, local }); };
      $('use-live').onclick = () => done(live, false); $('restore-draft').onclick = () => done(draft, true); dialog.showModal();
    });
  }
  async function load() {
    $('load-error').hidden = true; $('loading').hidden = false;
    try {
      await prepareFrame(); const live = await fetchPublished(); const choice = await chooseDraft(live);
      state.data = clone(choice.data); state.local = choice.local; state.snapshot = JSON.stringify(state.data);
      render(); $('editor-form').hidden = false; $('loading').hidden = true;
      ['reset', 'save-draft', 'export-json', 'prepare-publish'].forEach((id) => $(id).disabled = false); sendPreview();
    } catch (error) {
      $('loading').hidden = true; $('load-error').hidden = false; $('load-error-text').textContent = `公開データを読み込めません。空のデータでは編集を開始しません。${error.message}`;
      $('save-state').textContent = '読み込みエラー';
    }
  }
  function saveDraft() {
    let previous;
    try {
      previous = keys.map((key) => localStorage.getItem(key));
      localStorage.setItem(keys[0], JSON.stringify(state.data.events)); localStorage.setItem(keys[1], JSON.stringify(state.data.news));
      state.snapshot = JSON.stringify(state.data); state.local = true; savedState(); notice('下書きをこのブラウザに保存しました。公開データは変更されていません。'); return true;
    } catch {
      if (previous) { try { keys.forEach((key, index) => previous[index] === null ? localStorage.removeItem(key) : localStorage.setItem(key, previous[index])); } catch { /* storage remains unavailable */ } }
      notice('下書きを保存できません。ブラウザの保存設定や容量を確認し、有効なデータはJSONで書き出してください。'); return false;
    }
  }
  $('save-draft').addEventListener('click', saveDraft);
  $('retry').addEventListener('click', load);
  $('reset').addEventListener('click', async () => {
    if (!window.confirm('編集中の内容と保存した下書きを破棄し、公開中のデータに戻しますか？')) return;
    const startingData = JSON.stringify(state.data);
    $('reset').disabled = true;
    try {
      const live = await fetchPublished();
      if (JSON.stringify(state.data) !== startingData) {
        notice('読み込み中に編集されたため、リセットを中止して変更を保持しました。');
        return;
      }
      let cleared = true;
      try { keys.forEach((key) => localStorage.removeItem(key)); } catch { cleared = false; }
      state.data = clone(live); state.local = false; state.snapshot = JSON.stringify(state.data); render(); sendPreview();
      notice(cleared ? '公開中のデータに戻しました。' : '公開データに戻しましたが、保存済み下書きを削除できませんでした。');
    } catch (error) { notice(`公開データを読み込めないため、編集中の内容を保持しました。${error.message}`); }
    finally { $('reset').disabled = false; }
  });
  function exportData(publish = false) {
    const result = validate();
    if (!result.valid) {
      notice('書き出し前に、エラーのある項目を修正してください。'); const path = result.errors.keys().next().value;
      if (path) { selectTab(path.startsWith('news.') ? 'news' : 'today'); controls.get(path)?.input.focus(); } return;
    }
    if (publish && !saveDraft()) return;
    $('export-title').textContent = publish ? '公開準備' : 'JSONを書き出す'; $('publish-summary').hidden = !publish; $('export-status').textContent = '';
    $('summary-list').replaceChildren();
    [['開催日', state.api.formatJapaneseDate(result.data.events.date)], ['営業状態 / OPEN', `${result.data.events.status === 'open' ? '営業' : '休業'} / ${result.data.events.open}`], ['イベント数', result.data.events.events.length], ['ニュース数', result.data.news.items.length]].forEach(([label, value]) => $('summary-list').append(node('dt', label), node('dd', String(value))));
    $('export-files').replaceChildren();
    ['events', 'news'].forEach((name) => {
      const card = node('section', undefined, 'export-file'); const text = `${JSON.stringify(result.data[name], null, 2)}\n`;
      const label = node('label', `${name}.json`); label.htmlFor = `export-${name}`;
      const textarea = node('textarea'); textarea.id = label.htmlFor; textarea.readOnly = true; textarea.value = text; textarea.spellcheck = false;
      const actions = node('div', undefined, 'dialog-actions');
      actions.append(button('ダウンロード', () => {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
        const link = node('a'); link.href = url; link.download = `${name}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }), button('コピー', async () => {
        try { await navigator.clipboard.writeText(text); $('export-status').textContent = `${name}.json をコピーしました。`; }
        catch { textarea.focus(); textarea.select(); $('export-status').textContent = 'コピーできませんでした。選択したJSONを手動でコピーしてください。'; }
      })); card.append(label, textarea, actions); $('export-files').append(card);
    }); $('export-dialog').showModal();
  }
  $('export-json').addEventListener('click', () => exportData()); $('prepare-publish').addEventListener('click', () => exportData(true));
  $('close-export').addEventListener('click', () => $('export-dialog').close());
  load();
})();
