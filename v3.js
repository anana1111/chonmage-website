// v3 design lab: tidy NEWS cards rendered by news-view.js (display only; data untouched).
(() => {
  const grid = document.querySelector('.news-grid');
  if (!grid) return;
  const emoji = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}\u{FFFD}]/gu;
  const clean = (text) => text
    .replace(emoji, '')
    .replace(/^R to @\S+:\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const shorten = (text, max = 42) => {
    const first = text.split(/(?<=[。！？!?])\s*/)[0] || text;
    const value = first.length >= 12 ? first : text;
    return value.length > max ? value.slice(0, max - 1) + '…' : value;
  };
  const tidy = () => {
    grid.querySelectorAll('.news-card:not([data-v3])').forEach((card) => {
      card.dataset.v3 = '1';
      const link = card.querySelector('h3 a');
      if (!link) return;
      if (/^R to @/.test(link.textContent)) { card.hidden = true; return; }
      link.textContent = shorten(clean(link.textContent));
    });
  };
  tidy();
  new MutationObserver(tidy).observe(grid, { childList: true });
})();
