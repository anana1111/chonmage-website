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

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function xmlTag(item, tag) {
  const escaped = tag.replace(':', '\\:');
  const match = item.match(new RegExp('<' + escaped + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + escaped + '>', 'i'));
  return match ? match[1].replace(/^<!\[CDATA\[|\]\]>$/g, '') : '';
}

function plainXml(value) {
  return cleanBlock(decodeEntities(String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')));
}

export function rssCandidatesFromText(rawText, handle = 'ChonmageNiigata') {
  const xml = String(rawText || '');
  const out = [];
  const seen = new Set();
  for (const match of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const item = match[0];
    const title = plainXml(xmlTag(item, 'title'));
    const description = plainXml(xmlTag(item, 'description') || xmlTag(item, 'content:encoded'));
    const text = cleanBlock([title, description].filter(Boolean).join('\n'));
    if (!SCHEDULE_HINT.test(text) || !TIME_HINT.test(text)) continue;
    const link = plainXml(xmlTag(item, 'link') || xmlTag(item, 'guid'));
    const id = link.match(/\/status\/(\d+)/)?.[1] || '';
    const key = id || text;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      text,
      url: id ? ('https://x.com/' + handle + '/status/' + id) : ('https://x.com/' + handle),
    });
  }
  return out.slice(0, 50);
}
