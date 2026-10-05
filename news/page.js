(function () {
  'use strict';
  const core = window.ChonmageNews;
  const view = window.ChonmageNewsView;
  const container = document.getElementById('news-content-view');
  const siteRoot = new URL('../', location.href);
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  let data = null, timer;
  const title = (value) => { document.title = value + '｜ポーカールーム ちょんまげ'; };
  function state(message) {
    title('NEWS');
    const panel = view.node('section', 'news-state'); panel.append(view.node('h1', '', message));
    container.replaceChildren(panel);
  }
  function render(now = Date.now()) {
    if (!data) return;
    if (params.has('id')) {
      const item = core.itemsOf(data).find((row) => row.id === id);
      if (!item) state('ニュースが見つかりませんでした。');
      else if (core.status(item, now) === 'Expired') state('このニュースは掲載終了しました。');
      else if (core.status(item, now) !== 'Published') state('このニュースは現在公開されていません。');
      else { title(item.title); container.replaceChildren(view.detail(item, siteRoot)); }
    } else {
      title('NEWS');
      const fragment = document.createDocumentFragment();
      fragment.append(view.node('h1', 'news-page-title', 'NEWS'), view.node('p', 'news-page-lead', 'ちょんまげから、最近30日間のお知らせ。'));
      const grid = view.node('div', 'news-grid');
      const items = core.visibleItems(data, now);
      if (!items.length) grid.append(view.node('p', 'news-empty', '最近30日間のニュースはありません。'));
      items.forEach((item) => grid.append(view.card(item, siteRoot)));
      fragment.append(grid); container.replaceChildren(fragment);
    }
    container.setAttribute('aria-busy', 'false');
  }
  let signature = null;
  function refresh() {
    if (!data) return;
    const next = core.itemsOf(data).map((item) => item.id + ':' + core.status(item)).join('|');
    if (next !== signature) { render(); signature = next; }
    clearTimeout(timer); timer = setTimeout(refresh, core.nextRefreshDelay(data));
  }
  async function load() {
    try {
      const response = await fetch(new URL('data/news.json?v=' + Date.now(), siteRoot), { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      data = await response.json();
      if (!data || !Array.isArray(data.items)) throw new Error('Invalid NEWS document');
      refresh();
    } catch (error) {
      state('ニュースを読み込めませんでした。時間をおいて再度お試しください。');
      container.setAttribute('aria-busy', 'false');
      console.warn('NEWS data could not be loaded.', error);
    }
  }
  // Preview uses the same renderer but never exposes drafts on the public route.
  if (params.get('preview') === '1' && window.parent !== window) {
    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'CHONMAGE_NEWS_PREVIEW') return;
      try {
        core.validateNews(event.data.news);
        data = event.data.news;
        const item = core.itemsOf(data).find((row) => row.id === id);
        if (!item) state('ニュースが見つかりませんでした。');
        else { title(item.title + '（プレビュー）'); container.replaceChildren(view.detail(item, siteRoot)); }
        container.setAttribute('aria-busy', 'false');
      } catch { state('プレビューする内容を確認してください。'); }
    });
    window.parent.postMessage({ type: 'CHONMAGE_NEWS_PREVIEW_READY' }, location.origin);
  } else {
    load();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.addEventListener('pageshow', refresh);
  }
})();
