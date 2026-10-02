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
  if (/tournament|トーナメント|王者/i.test(title)) return 'tournament';
  return 'event';
}

function parseFacts(line) {
  const rows = [];
  const matches = [
    ['ENTRY', line.match(/(?:ENTRY|参加費|参加料金)\s*[:：]?\s*(¥?\s*[\d,]+(?:円)?|FREE|無料)/i)?.[1]],
    ['STARTING STACK', line.match(/(?:STARTING\s*STACK|STACK|持ち点)\s*[:：]?\s*([\d,]+\s*(?:pt|pts|点)?)/i)?.[1]],
    ['最終受付', line.match(/(?:LATE\s*REG(?:ISTRATION)?|最終受付)\s*[:：]?\s*([0-2]?\d:[0-5]\d)/i)?.[1]],
  ];
  matches.forEach(([label, value]) => { if (value) rows.push({ label, value: clean(value) }); });
  return rows;
}

export function normalizeScheduleText(rawText, options = {}) {
  const text = String(rawText || '').replace(/\\n/g, '\n');
  const now = options.now || new Date();
  const today = jstParts(now);
  const date = detectDate(text, now);
  if (!date || date !== today.iso) return null;
  if (!/(OPEN|オープン|営業|トーナメント|フリー ?ロール|RING|リング)/i.test(text)) return null;

  const lines = text.split(/\n|\r|[｜|]/).map(clean).filter(Boolean);
  let open = '';
  let close = '';
  let ringLine = '';
  const events = [];

  lines.forEach((line) => {
    const match = line.match(/(?:^|\s)([0-2]?\d:[0-5]\d)(?:\s|$)/);
    if (!match) return;
    const time = match[1].padStart(5, '0');
    if (/OPEN|オープン|営業開始/i.test(line)) {
      if (!open) open = time;
      return;
    }
    if (/CLOSE|クローズ|営業終了/i.test(line)) {
      if (!close) close = time;
      return;
    }
    if (/RING|リング/i.test(line)) {
      if (!ringLine) ringLine = line;
      if (!open) open = time;
      return;
    }

    let title = clean(line.replace(match[0], ' ').replace(/(?:ENTRY|参加費|参加料金|STARTING\s*STACK|STACK|持ち点|LATE\s*REG(?:ISTRATION)?|最終受付).*$/i, ''));
    if (!title || title.length < 2) title = 'EVENT';
    const type = eventType(title);
    const id = slug(title) + '-' + time.replace(':', '');
    events.push({
      id,
      time,
      type,
      title,
      heroTitle: type === 'free' ? 'FREE ROLL' : title.slice(0, 24),
      theme: type === 'free' ? 'blue' : 'orange',
      tags: type === 'free' ? ['BEGINNER OK'] : [],
      description: '詳細は公式Xで確認してください。',
      facts: parseFacts(line),
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
      start: ringLine?.match(/([0-2]?\d:[0-5]\d)/)?.[1]?.padStart(5, '0') || open,
      title: 'RING GAME',
      description: ringLine ? clean(ringLine.replace(/([0-2]?\d:[0-5]\d)/, '')) : '公式Xで確認'
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
