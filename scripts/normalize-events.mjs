import { validateSchedule } from './validate-events.mjs';

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

function normalizeClockText(value) {
  return String(value || '')
    .replace(/([0-2]?\d)時半/g, (_, hour) => String(hour).padStart(2, '0') + ':30')
    .replace(/([0-2]?\d)時\s*([0-5]?\d)分/g, (_, hour, minute) => String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0'))
    .replace(/([0-2]?\d)時/g, (_, hour) => String(hour).padStart(2, '0') + ':00')
    .replace(/([0-2]?\d)：([0-5]\d)/g, (_, hour, minute) => String(hour).padStart(2, '0') + ':' + minute);
}

function firstTime(value) {
  const match = String(value || '').match(/([0-2]?\d:[0-5]\d)/);
  return match ? match[1].padStart(5, '0') : '';
}

function slug(value) {
  const ascii = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  return ascii || 'event';
}

function detectDate(text, now) {
  const today = jstParts(now);
  const full = text.match(/(20\d{2})[\/.\-年]\s*(\d{1,2})[\/.\-月]\s*(\d{1,2})日?/);
  if (full) return full[1] + '-' + String(full[2]).padStart(2, '0') + '-' + String(full[3]).padStart(2, '0');
  const short = text.match(/(?:^|\D)(\d{1,2})月\s*(\d{1,2})日/);
  if (short) return today.year + '-' + String(short[1]).padStart(2, '0') + '-' + String(short[2]).padStart(2, '0');
  return null;
}

function eventType(title) {
  if (/free\s*roll|フリー ?ロール/i.test(title)) return 'free';
  if (/special|スペシャル/i.test(title)) return 'special';
  if (/tournament|トーナメント|トナメ|王者/i.test(title)) return 'tournament';
  return 'event';
}

function parseFacts(block) {
  const rows = [];
  const entry = block.match(/(?:ENTRY|エントリー|参加費|参加料金)\s*[:：]?\s*(¥?\s*[\d,]+(?:円)?|FREE|無料)/i)?.[1];
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
  return clean(line.replace(time, ' ')
    .replace(/(?:ENTRY|エントリー|参加費|参加料金|STARTING\s*STACK|STACK|持ち点|LATE\s*REG(?:ISTRATION)?|最終受付).*$/i, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[～〜\-–—]+$/u, ''));
}

export function normalizeScheduleText(rawText, options = {}) {
  const text = normalizeClockText(String(rawText || '').replace(/\\n/g, '\n'));
  const now = options.now || new Date();
  const today = jstParts(now);
  const date = detectDate(text, now);
  if (!date || date !== today.iso) return null;
  if (!/(OPEN|オープン|営業|トーナメント|トナメ|フリー ?ロール|RING|リング)/i.test(text)) return null;

  const lines = text.split(/\n|\r|[｜|]/).map(clean).filter(Boolean);
  let open = '';
  let close = '';
  const ringLine = lines.find((line) => /RING|リング/i.test(line)) || '';
  const events = [];

  const timedIndexes = lines.map((line, index) => firstTime(line) ? index : -1).filter((index) => index >= 0);
  timedIndexes.forEach((lineIndex, position) => {
    const line = lines[lineIndex];
    const time = firstTime(line);
    const nextIndex = position + 1 < timedIndexes.length ? timedIndexes[position + 1] : lines.length;
    const block = lines.slice(lineIndex, nextIndex).join(' ');

    if (/OPEN|オープン|営業開始/i.test(line)) {
      if (!open) open = time;
      return;
    }
    if (/CLOSE|クローズ|営業終了/i.test(line)) {
      if (!close) close = time;
      return;
    }
    if (/RING|リング/i.test(line)) {
      if (!open) open = time;
      return;
    }

    let title = eventTitle(line, time);
    if (!title || title.length < 2) title = 'EVENT';
    const type = eventType(title);
    const id = slug(title) + '-' + time.replace(':', '');
    const tags = [];
    if (type === 'free' && /1\s*DRINK|1ドリンク/i.test(block)) tags.push('1 DRINK');
    events.push({
      id,
      time,
      type,
      title,
      heroTitle: type === 'free' ? 'FREE ROLL' : title.slice(0, 24),
      theme: type === 'free' ? 'blue' : 'orange',
      tags,
      description: '詳細は公式Xで確認してください。',
      facts: parseFacts(block),
      link: options.sourceUrl ? { label: '最新情報 ↗', url: options.sourceUrl } : undefined,
    });
  });

  if (!open && !events.length && !ringLine) return null;
  if (!open && events.length) open = events[0].time;
  if (!open) return null;

  const schedule = {
    version: 2,
    date,
    open,
    status: 'open',
    latestXUrl: options.profileUrl || 'https://x.com/ChonmageNiigata',
    schedulePostUrl: options.sourceUrl || options.profileUrl || 'https://x.com/ChonmageNiigata',
    updatedAt: new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).format(now).replace(' ', 'T') + '+09:00',
    source: { type: 'x', url: options.sourceUrl || options.profileUrl || 'https://x.com/ChonmageNiigata', mode: 'auto' },
    summary: ['本日の開催情報です。', '当日の変更は公式Xでお知らせします。'],
    ringGame: {
      enabled: Boolean(ringLine),
      start: firstTime(ringLine) || open,
      title: 'RING GAME',
      description: ringLine ? clean(ringLine.replace(firstTime(ringLine), '')) : '公式Xで確認'
    },
    events,
  };
  if (close) schedule.close = close;
  events.forEach((event, index) => {
    if (index === events.length - 1 && ['tournament', 'special'].includes(event.type)) event.isMain = true;
  });
  validateSchedule(schedule);
  return schedule;
}
