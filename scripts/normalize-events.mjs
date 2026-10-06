import { validateSchedule, scheduleMinutes } from './schedule-core.mjs';

function jstParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { year: values.year, month: values.month, day: values.day, iso: values.year + '-' + values.month + '-' + values.day };
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

const pad2 = (value) => String(value).padStart(2, '0');

// 24時〜29時 are written by shops for after-midnight times (25時CLOSE = 01:00 next day).
function clockText(hour, minute) {
  const value = Number(hour);
  return pad2(value >= 24 ? value - 24 : value) + ':' + pad2(minute);
}

function normalizeClockText(value) {
  return String(value || '')
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0))
    // 「3時間」「24時間」 are durations, not clock times.
    .replace(/(?<!\d)([0-2]?\d)時半(?!間)/g, (_, hour) => clockText(hour, 30))
    .replace(/(?<!\d)([0-2]?\d)時\s*([0-5]?\d)分(?!間)/g, (_, hour, minute) => clockText(hour, minute))
    .replace(/(?<!\d)([0-2]?\d)時(?!間)/g, (_, hour) => clockText(hour, 0))
    .replace(/(?<!\d)([0-2]?\d)[：:]([0-5]\d)(?!\d)/g, (match, hour, minute) => Number(hour) <= 29 ? clockText(hour, minute) : match);
}

function firstTime(value) {
  const match = String(value || '').match(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
  return match ? pad2(match[1]) + ':' + match[2] : '';
}

const CLOSE_WORD = /CLOSE|クローズ|閉店|営業終了/i;
const OPEN_WORD = /OPEN|オープン|営業開始|開店/i;
// A post saying the shop is closed. "CLOSE" alone is a closing time, so it is not here.
const DETAIL_LINE = /まで|締切|締め切り|〆切|最終受付|受付終了|LATE\s*REG/i;
const CLOSED_DAY = /休業|定休日|店休日|臨時休|お休み|CLOSED\b/i;

function closeTimeIn(line) {
  const after = line.match(/(?<!\d)((?:[01]?\d|2[0-3]):[0-5]\d)\s*(?:CLOSE|クローズ|閉店|営業終了)/i);
  if (after) return firstTime(after[1]);
  const before = line.match(/(?:CLOSE|クローズ|閉店|営業終了)\s*[:：]?\s*((?:[01]?\d|2[0-3]):[0-5]\d)/i);
  if (before) return firstTime(before[1]);
  return '';
}

function rangeIn(line) {
  const match = line.match(/(?<!\d)((?:[01]?\d|2[0-3]):[0-5]\d)\s*[〜～~\-–—]\s*((?:[01]?\d|2[0-3]):[0-5]\d)(?!\d)/);
  return match ? [firstTime(match[1]), firstTime(match[2])] : null;
}

function slug(value) {
  const ascii = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  return ascii || 'event';
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function jstWeekday(iso) {
  return WEEKDAYS[new Date(iso + 'T12:00:00+09:00').getUTCDay()];
}

// Returns today's date when any date in the text is today, otherwise the first date found.
function detectDate(text, now) {
  const today = jstParts(now);
  const found = [];
  for (const full of text.matchAll(/(20\d{2})[\/.\-年]\s*(\d{1,2})[\/.\-月]\s*(\d{1,2})日?/g)) {
    found.push(full[1] + '-' + pad2(full[2]) + '-' + pad2(full[3]));
  }
  for (const short of text.matchAll(/(?:^|\D)(\d{1,2})月\s*(\d{1,2})日/g)) {
    found.push(today.year + '-' + pad2(short[1]) + '-' + pad2(short[2]));
  }
  // Daily posts often omit the month: 「2日(金)17時OPEN」. Accept that only when
  // both the day and the weekday match today's Japan date.
  for (const dayOnly of text.matchAll(/(?:^|\D)(\d{1,2})日\s*[（(]\s*([月火水木金土日])\s*[）)]/g)) {
    if (Number(dayOnly[1]) === Number(today.day) && dayOnly[2] === jstWeekday(today.iso)) found.push(today.iso);
  }
  if (found.includes(today.iso)) return today.iso;
  return found[0] || null;
}

function eventType(title) {
  if (/free\s*roll|フリー ?ロール/i.test(title)) return 'free';
  if (/special|スペシャル/i.test(title)) return 'special';
  if (/tournament|トーナメント|トナメ|王者/i.test(title)) return 'tournament';
  return 'event';
}

function parseFacts(block) {
  const rows = [];
  // Lines like 「レベル2（18:45）までの着席でエントリー無料」 are an early-bird condition, not the price.
  const priceLines = block.split('\n').filter((line) => !/まで|着席|EARLY\s*BIRD|早割|限定|以内/i.test(line)).join('\n');
  const entry = priceLines.match(/(?:ENTRY|エントリー|参加費|参加料金)\s*[:：]?\s*(¥?\s*[\d,]+(?:円)?|FREE|無料)/i)?.[1];
  const explicitStack = block.match(/(?:STARTING\s*STACK|STACK|持ち点)\s*[:：]?\s*([\d,]+\s*(?:pt|pts|点)?)/i)?.[1];
  const slashStack = block.match(/(?:ENTRY|エントリー|参加費|参加料金)[^/\n]{0,50}\/\s*([\d,]+\s*(?:pt|pts|点))/i)?.[1];
  const facility = block.match(/施設利用料\s*[:：]?\s*(¥?\s*[\d,]+(?:円)?)/i)?.[1];
  const late = block.match(/(?:LATE\s*REG(?:ISTRATION)?|最終受付)\s*[:：]?\s*([0-2]?\d:[0-5]\d)/i)?.[1];
  if (entry) rows.push({ label: 'ENTRY', value: /FREE|無料/i.test(entry) ? '¥0' : clean(entry) });
  if (explicitStack || slashStack) rows.push({ label: 'STARTING STACK', value: clean(explicitStack || slashStack) });
  if (facility) rows.push({ label: '施設利用料', value: clean(facility) });
  if (late) rows.push({ label: '最終受付', value: clean(late) });
  return rows;
}

function eventTitle(line, time) {
  return clean(line
    .replace(/(?<!\d)(?:[01]?\d|2[0-3]):[0-5]\d\s*[〜～~\-–—]\s*(?:[01]?\d|2[0-3]):[0-5]\d(?!\d)/, ' ')
    .replace(time, ' ')
    .replace(/(?:ENTRY|エントリー|参加費|参加料金|STARTING\s*STACK|STACK|持ち点|LATE\s*REG(?:ISTRATION)?|最終受付).*$/i, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[～〜\-–—]+$/u, ''));
}

function lineMentionsOtherDay(line, today) {
  const dayOnly = line.match(/(?:^|\D)(\d{1,2})日\s*[（(]\s*[月火水木金土日]\s*[）)]/);
  if (dayOnly && Number(dayOnly[1]) !== Number(today.day)) return true;
  const date = line.match(/(?:^|\D)(\d{1,2})月\s*(\d{1,2})日/);
  return Boolean(date && (Number(date[1]) !== Number(today.month) || Number(date[2]) !== Number(today.day)));
}

function uniqueId(base, used) {
  let id = base;
  let index = 2;
  while (used.has(id)) id = base + '-' + index++;
  used.add(id);
  return id;
}

export function normalizeScheduleText(rawText, options = {}) {
  const text = normalizeClockText(String(rawText || '').replace(/\\n/g, '\n'));
  const now = options.now || new Date();
  const today = jstParts(now);
  const date = detectDate(text, now);
  if (!date || date !== today.iso) return null;
  if (!/(OPEN|オープン|営業|トーナメント|トナメ|フリー ?ロール|RING|リング)/i.test(text) && !CLOSED_DAY.test(text)) return null;

  const allLines = text.split(/\n|\r|[｜|]/).map(clean).filter(Boolean);
  // A post can mention several days (「3日は休業、4日は13時OPEN」). Only the rows
  // between today's date and the next different date describe today.
  const lineDates = allLines.map((line) => detectDate(line, now) || (lineMentionsOtherDay(line, today) ? 'other' : null));
  const first = lineDates.findIndex((value) => value === today.iso);
  const start = first >= 0 ? first : 0;
  let end = allLines.length;
  for (let index = start + 1; index < allLines.length; index += 1) {
    if (lineDates[index] && lineDates[index] !== today.iso) { end = index; break; }
  }
  const lines = allLines.slice(start, end);
  const sectionText = lines.join('\n');
  let open = '';
  let close = '';
  const ringLine = lines.find((line) => /RING|リング/i.test(line)) || '';
  const events = [];
  const usedIds = new Set();

  // Deadline rows (「置きバケ連絡 17:00まで」「最終受付 21:00」) belong to the event above them.
  const startsRow = (line) => firstTime(line) && (OPEN_WORD.test(line) || CLOSE_WORD.test(line) || !DETAIL_LINE.test(line));
  const timedIndexes = lines.map((line, index) => startsRow(line) ? index : -1).filter((index) => index >= 0);
  timedIndexes.forEach((lineIndex, position) => {
    const line = lines[lineIndex];
    const time = firstTime(line);
    const nextIndex = position + 1 < timedIndexes.length ? timedIndexes[position + 1] : lines.length;
    const block = lines.slice(lineIndex, nextIndex).join(' ');
    const lineClose = closeTimeIn(line);
    if (lineClose && !close) close = lineClose;

    if (OPEN_WORD.test(line) && !/RING|リング/i.test(line)) {
      const range = rangeIn(line);
      if (!open) open = range ? range[0] : time;
      if (range && !close) close = range[1];
      return;
    }
    if (CLOSE_WORD.test(line) && lineClose === time) return;
    if (/RING|リング/i.test(line)) {
      if (!open) open = time;
      return;
    }
    if (/^営業時間/.test(line)) {
      const range = rangeIn(line);
      if (range) { if (!open) open = range[0]; if (!close) close = range[1]; }
      return;
    }

    let title = eventTitle(line, time);
    // 「🆕🏆 THE DAILY」 then 「🕕18:00〜」: the name sits on the line above the time.
    const above = lineIndex > 0 ? lines[lineIndex - 1] : '';
    if ((!title || title.length < 2) && above && !firstTime(above) && !OPEN_WORD.test(above) && !detectDate(above, now) && !/こちら|本日|今日/.test(above)) title = eventTitle(above, '');
    if (!title || title.length < 2) title = 'EVENT';
    const type = eventType(title);
    const id = uniqueId(slug(title) + '-' + time.replace(':', ''), usedIds);
    const tags = [];
    if (type === 'free' && /1\s*DRINK|1ドリンク/i.test(block)) tags.push('1 DRINK');
    const event = {
      id,
      time,
      type,
      title,
      heroTitle: type === 'free' ? 'FREE ROLL' : title.slice(0, 24),
      theme: type === 'free' ? 'blue' : 'orange',
      tags,
      description: '詳細は公式Xで確認してください。',
      facts: parseFacts(block),
    };
    const range = rangeIn(line);
    if (range && range[0] === time) event.end = range[1];
    if (options.sourceUrl) event.link = { label: '最新情報 ↗', url: options.sourceUrl };
    events.push(event);
  });

  const base = {
    version: 2,
    date,
    latestXUrl: options.profileUrl || 'https://x.com/ChonmageNiigata',
    schedulePostUrl: options.sourceUrl || options.profileUrl || 'https://x.com/ChonmageNiigata',
    updatedAt: new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).format(now).replace(' ', 'T') + '+09:00',
    source: { type: 'x', url: options.sourceUrl || options.profileUrl || 'https://x.com/ChonmageNiigata', mode: 'auto' },
  };

  // 「本日は休業」: never publish a closed-day post as an open day.
  if (!open && CLOSED_DAY.test(sectionText)) {
    const closed = {
      ...base,
      status: 'closed',
      summary: ['本日は休業です。', '最新情報は公式Xでお知らせします。'],
      ringGame: { enabled: false },
      events: [],
    };
    validateSchedule(closed);
    return closed;
  }

  if (!open && !events.length && !ringLine) return null;
  if (!open && events.length) open = events.slice().sort((a, b) => scheduleMinutes(a.time) - scheduleMinutes(b.time))[0].time;
  if (!open) return null;

  events.sort((a, b) => scheduleMinutes(a.time, open) - scheduleMinutes(b.time, open));
  const schedule = {
    ...base,
    open,
    status: 'open',
    summary: ['本日の開催情報です。', '当日の変更は公式Xでお知らせします。'],
    ringGame: {
      enabled: Boolean(ringLine),
      start: firstTime(ringLine) || open,
      title: 'RING GAME',
      description: (ringLine ? clean(ringLine.replace(firstTime(ringLine), '')) : '') || '公式Xで確認'
    },
    events,
  };
  if (close && close !== open) schedule.close = close;
  events.forEach((event, index) => {
    if (index === events.length - 1 && ['tournament', 'special'].includes(event.type)) event.isMain = true;
  });
  validateSchedule(schedule);
  return schedule;
}
