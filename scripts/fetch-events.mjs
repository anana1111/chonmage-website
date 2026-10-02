import fs from 'node:fs';
import { normalizeScheduleText } from './normalize-events.mjs';
import { validateSchedule } from './validate-events.mjs';

const PROFILE_URL = 'https://x.com/ChonmageNiigata';
const OUTPUT = 'data/events.auto.json';

function warn(message) {
  console.warn('::warning::' + message);
}

function cleanCandidate(value) {
  return String(value || '')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
    .replace(/\\n/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
}

function decodeJsonString(value) {
  try {
    return JSON.parse('"' + value.replace(/"/g, '\\"') + '"');
  } catch {
    return value;
  }
}

function extractCandidates(html) {
  const values = [];
  const patterns = [
    /"full_text":"((?:\\.|[^"\\])*)"/g,
    /"text":"((?:\\.|[^"\\])*)"/g,
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/gi,
  ];
  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(html))) {
      const raw = pattern.source.startsWith('<meta') ? match[1] : decodeJsonString(match[1]);
      const value = cleanCandidate(raw);
      if (value && !values.includes(value)) values.push(value);
      if (values.length > 500) break;
    }
  });
  return values;
}

async function fetchProfile() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(PROFILE_URL, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ChonmageScheduleBot/1.0; +https://github.com/anana1111/chonmage-website)',
        'accept-language': 'ja,en;q=0.8',
      },
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

try {
  const html = await fetchProfile();
  const candidates = extractCandidates(html)
    .filter((text) => /(OPEN|オープン|営業|トーナメント|フリー ?ロール|RING|リング)/i.test(text))
    .sort((a, b) => b.length - a.length);

  let normalized = null;
  for (const candidate of candidates) {
    normalized = normalizeScheduleText(candidate, { profileUrl: PROFILE_URL, sourceUrl: PROFILE_URL });
    if (normalized) break;
  }

  if (!normalized) {
    warn('公式Xから当日のScheduleを十分な確度で識別できませんでした。既存のevents.auto.jsonを保持します。');
    process.exitCode = 0;
  } else {
    validateSchedule(normalized);
    const text = JSON.stringify(normalized, null, 2) + '\n';
    const old = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
    if (old === text) {
      console.log('events.auto.json unchanged');
    } else {
      fs.writeFileSync(OUTPUT, text);
      console.log('updated events.auto.json for ' + normalized.date);
    }
  }
} catch (error) {
  warn('公式Xの取得に失敗しました。既存データを保持します。' + (error?.message || String(error)));
  process.exitCode = 0;
}
