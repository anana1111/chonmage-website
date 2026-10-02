const SCHEDULE_HINT = /(OPEN|オープン|営業|トーナメント|フリー ?ロール|RING|リング)/i;
const DATE_HINT = /(20\d{2}[/.\-年]\s*\d{1,2}[/.\-月]\s*\d{1,2}日?|(?:^|\D)\d{1,2}月\s*\d{1,2}日)/;
const TIME_HINT = /(?:^|\D)[0-2]?\d:[0-5]\d(?:\D|$)/;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanBlock(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 $2')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function useful(text) {
  return SCHEDULE_HINT.test(text) && DATE_HINT.test(text) && TIME_HINT.test(text);
}

export function readerCandidatesFromText(rawText, handle = 'ChonmageNiigata') {
  const text = cleanBlock(rawText);
  if (!text || /Don[’']t miss what[’']s happening/i.test(text)) return [];

  const escaped = escapeRegExp(handle);
  const statusPattern = new RegExp('https?://(?:x|twitter)\\.com/' + escaped + '/status/(\\d+)', 'gi');
  const matches = [...text.matchAll(statusPattern)];
  const out = [];
  const seen = new Set();

  matches.forEach((match, index) => {
    const id = match[1];
    if (seen.has(id)) return;
    const previous = index > 0 ? matches[index - 1].index + matches[index - 1][0].length : 0;
    const next = index + 1 < matches.length ? matches[index + 1].index : text.length;
    const start = Math.max(previous, match.index - 1800);
    const end = Math.min(next, match.index + match[0].length + 2200);
    const block = cleanBlock(text.slice(start, end));
    if (!useful(block)) return;
    seen.add(id);
    out.push({ text: block, url: 'https://x.com/' + handle + '/status/' + id });
  });

  if (out.length) return out;

  // Reader output formats can change. Accept an URL-less block only when it
  // independently contains a date, a time and a schedule keyword; otherwise
  // return no candidates so the caller keeps the previous known-good JSON.
  text.split(/\n\s*\n/).forEach((block) => {
    const cleaned = cleanBlock(block);
    if (useful(cleaned)) out.push({ text: cleaned, url: 'https://x.com/' + handle });
  });
  return out.slice(0, 20);
}
