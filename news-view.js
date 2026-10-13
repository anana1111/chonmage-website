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
  // Card tiles are 104px on phones and a third of the page on desktops.
  const CARD_SIZES = '(max-width: 620px) 104px, (max-width: 1000px) 50vw, 33vw';
  // Photos copied from X into images/news/ have a 680px NAME-680 file next to them.
  const COPIED_PHOTO = /^(?:\.\/)?(images\/news\/[A-Za-z0-9_-]+)\.(webp|jpg|png)$/;
  function photo(url, alt, siteRoot, eager = false, sizes = '') {
    const figure = node('figure', 'news-photo');
    const image = node('img');
    image.alt = alt; image.decoding = 'async'; image.loading = eager ? 'eager' : 'lazy';
    const copied = sizes && url.match(COPIED_PHOTO);
    if (copied) {
      image.sizes = sizes;
      image.srcset = new URL(copied[1] + '-680.' + copied[2], siteRoot).href + ' 680w, ' + new URL(url, siteRoot).href + ' 1200w';
    }
    image.addEventListener('error', () => {
      // A missing small file falls back to the full photo before the photo is hidden.
      if (image.hasAttribute('srcset')) { image.removeAttribute('srcset'); image.removeAttribute('sizes'); return; }
      figure.hidden = true;
    });
    image.src = new URL(url, siteRoot).href;
    figure.append(image); return figure;
  }
  function card(item, siteRoot) {
    const result = node('article', 'news-card');
    const href = new URL('news/' + encodeURIComponent(item.id) + '/', siteRoot).href;
    const visual = link('', href, 'news-image news-image--' + item.theme);
    visual.setAttribute('aria-label', item.title + 'を読む');
    if (item.image) {
      visual.classList.add('news-image--photo');
      visual.append(photo(item.image, item.title, siteRoot, false, CARD_SIZES));
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
  // Homepage labels are Japanese; the stored category keys stay as they are.
  const CATEGORY_LABELS = { RESULT: '大会結果', SCHEDULE: '営業案内', EVENT: 'イベント' };
  const categoryLabel = (item) => CATEGORY_LABELS[item.category.toUpperCase()] || item.category;
  const FEATURE_SIZES = '(max-width: 900px) 100vw, 58vw';
  const ROW_SIZES = '(max-width: 620px) 92px, (max-width: 900px) 120px, 148px';
  // The large card takes the photo's own shape within limits (phones, wider screens), so
  // posters stay whole and portraits keep their heads; a blurred copy fills what is left.
  const clampRatio = (ratio, min) => String(Math.min(1.78, Math.max(min, ratio)));
  function fitRatio(visual, ratio) {
    visual.style.setProperty('--photo-ratio', clampRatio(ratio, 0.8));
    visual.style.setProperty('--photo-ratio-wide', clampRatio(ratio, 1.5));
  }
  // Pictures are decoration here: the title link covers the whole card or row.
  function homeVisual(item, siteRoot, className, sizes, fitted) {
    const visual = node('div', className + ' news-image--' + item.theme);
    visual.setAttribute('aria-hidden', 'true');
    const fallback = node('span', 'news-image-fallback', item.visualLabel);
    if (!item.image) {
      if (fitted) fitRatio(visual, 1.78);
      visual.append(fallback); return visual;
    }
    visual.classList.add('news-image--photo');
    const figure = photo(item.image, '', siteRoot, false, sizes);
    const image = figure.querySelector('img');
    image.addEventListener('error', () => {
      if (!figure.hidden) return;
      visual.classList.remove('news-image--photo');
      if (fitted) fitRatio(visual, 1.78);
    });
    if (fitted) {
      // Reuses the file the browser already chose, so the blur costs no extra download.
      const backdrop = node('img', 'news-photo-backdrop'); backdrop.alt = '';
      image.addEventListener('load', () => {
        fitRatio(visual, image.naturalWidth / image.naturalHeight);
        backdrop.src = image.currentSrc || image.src;
      });
      visual.append(backdrop);
    }
    visual.append(figure, fallback);
    return visual;
  }
  function homeTitle(item, siteRoot) {
    const heading = node('h3');
    heading.append(link(item.title, new URL('news/' + encodeURIComponent(item.id) + '/', siteRoot).href));
    return heading;
  }
  function homeMeta(item, badge) {
    const meta = node('div', 'news-meta');
    if (badge) meta.append(node('span', 'news-badge' + (item.pinned ? ' news-badge--pinned' : ''), badge));
    meta.append(date(item), node('span', 'news-category', categoryLabel(item)));
    return meta;
  }
  // The teaser leaves out bare links and a repeated title, so it adds to the heading.
  function lead(item) {
    const summary = item.summary.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    return summary.startsWith(item.title) ? summary.slice(item.title.length).trim() : summary;
  }
  // Homepage: one large card (a pinned post shows 注目, otherwise the latest shows 最新) and compact rows.
  function featured(item, siteRoot) {
    const result = node('article', 'news-feature');
    const body = node('div', 'news-feature-body');
    body.append(homeMeta(item, item.pinned ? '注目' : '最新'), homeTitle(item, siteRoot));
    const teaser = lead(item);
    if (teaser) body.append(node('p', 'news-summary', teaser));
    result.append(homeVisual(item, siteRoot, 'news-feature-image', FEATURE_SIZES, true), body);
    return result;
  }
  function row(item, siteRoot) {
    const result = node('article', 'news-row');
    const body = node('div', 'news-row-body');
    body.append(homeMeta(item, item.pinned ? '注目' : ''), homeTitle(item, siteRoot));
    result.append(homeVisual(item, siteRoot, 'news-row-image', ROW_SIZES, false), body);
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
  root.ChonmageNewsView = Object.freeze({ node, link, date, card, featured, row, categoryLabel, detail });
})(globalThis);
