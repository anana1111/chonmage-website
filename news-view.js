// Small, text-only DOM renderer shared by the homepage and the NEWS page.
(function (root) {
  'use strict';
  const core = root.ChonmageNews;
  const node = (tag, className, text) => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  };
  function link(label, href, className) {
    const result = node('a', className, label); result.href = href; return result;
  }
  function date(item) {
    const result = node('time', '', item.date.replaceAll('-', '.'));
    result.dateTime = item.publishedAt; return result;
  }
  function photo(url, alt, siteRoot, eager = false) {
    const figure = node('figure', 'news-photo');
    const image = node('img');
    image.alt = alt; image.decoding = 'async'; image.loading = eager ? 'eager' : 'lazy';
    image.addEventListener('error', () => { figure.hidden = true; }, { once: true });
    image.src = new URL(url, siteRoot).href;
    figure.append(image); return figure;
  }
  function card(item, siteRoot) {
    const result = node('article', 'news-card');
    const href = new URL('news/?id=' + encodeURIComponent(item.id), siteRoot).href;
    const visual = link('', href, 'news-image news-image--' + item.theme);
    visual.setAttribute('aria-label', item.title + 'を読む');
    if (item.image) {
      visual.classList.add('news-image--photo');
      visual.append(photo(item.image, item.title, siteRoot));
      const fallback = node('span', 'news-image-fallback', item.visualLabel);
      fallback.setAttribute('aria-hidden', 'true'); visual.append(fallback);
    } else {
      const arrow = node('span', 'news-image-arrow', '→'); arrow.setAttribute('aria-hidden', 'true');
      visual.append(node('span', 'news-image-category', item.category), node('strong', '', item.visualLabel), arrow);
    }
    const meta = node('div', 'news-meta'); meta.append(date(item), node('span', '', item.category));
    const heading = node('h3'); heading.append(link(item.title, href));
    result.append(visual, meta, heading, node('p', 'news-summary', item.summary));
    return result;
  }
  function detail(item, siteRoot) {
    const article = node('article', 'news-detail');
    const meta = node('div', 'news-meta'); meta.append(date(item), node('span', '', item.category));
    article.append(meta, node('h1', '', item.title));
    item.images.forEach((url, index) => article.append(photo(url, item.title + (index ? '（' + (index + 1) + '）' : ''), siteRoot, index === 0)));
    // No scraped HTML is ever parsed. Newlines and long URLs are handled in CSS.
    article.append(node('div', 'news-body', item.content || '本文はまだ登録されていません。'));
    if (item.source === 'x' && item.sourceUrl && item.sourceUnavailable !== true) {
      const source = link('Xで元の投稿を見る', item.sourceUrl, 'news-button news-source');
      source.target = '_blank'; source.rel = 'noopener noreferrer'; article.append(source);
    }
    return article;
  }
  root.ChonmageNewsView = Object.freeze({ node, link, date, card, detail });
})(globalThis);
