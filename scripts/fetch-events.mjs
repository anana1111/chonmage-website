import fs from 'node:fs';
import { normalizeScheduleText } from './normalize-events.mjs';
import { validateSchedule } from './validate-events.mjs';
import { readerCandidatesFromText } from './x-reader.mjs';

const HANDLE = 'ChonmageNiigata';
const PROFILE_URL = 'https://x.com/' + HANDLE;
const SYNDICATION_URL = 'https://syndication.twitter.com/srv/timeline-profile/screen-name/' + HANDLE;
const READER_URLS = [
  'https://r.jina.ai/https://x.com/' + HANDLE,
  'https://r.jina.ai/http://x.com/' + HANDLE,
];
const OUTPUT = 'data/events.auto.json';

function warn(message) {
  console.warn('::warning::' + message);
}

async function getText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ChonmageScheduleBot/1.0; +https://github.com/anana1111/chonmage-website)',
        'accept-language': 'ja,en;q=0.8',
      },
    });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function clean(value) {
  return String(value || '').replace(/\\n/g, '\n').replace(/\s+/g, ' ').trim();
}

function candidateFromObject(value, out, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);

  if (!Array.isArray(value)) {
    const text = typeof value.full_text === 'string' ? value.full_text :
      typeof value.text === 'string' ? value.text :
      typeof value.note_tweet?.text === 'string' ? value.note_tweet.text : null;
    if (text && /(OPEN|オープン|営業|トーナメント|フリー ?ロール|RING|リング)/i.test(text)) {
      const id = value.id_str || value.rest_id || value.id || value.tweet_id || null;
      out.push({
        text: clean(text),
        url: id ? ('https://x.com/' + HANDLE + '/status/' + String(id)) : PROFILE_URL
      });
    }
  }

  Object.values(value).forEach((child) => {
    if (child && typeof child === 'object') candidateFromObject(child, out, seen);
  });
}

async function syndicationCandidates() {
  const html = await getText(SYNDICATION_URL);
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('syndication __NEXT_DATA__ not found');
  const data = JSON.parse(match[1]);
  const out = [];
  candidateFromObject(data, out);
  return out;
}

function decodeJsonString(value) {
  try { return JSON.parse('"' + value.replace(/"/g, '\\"') + '"'); }
  catch { return value; }
}

async function profileCandidates() {
  const html = await getText(PROFILE_URL);
  const out = [];
  const patterns = [
    /"full_text":"((?:\\.|[^"\\])*)"/g,
    /"text":"((?:\\.|[^"\\])*)"/g,
  ];
  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(html))) {
      const text = clean(decodeJsonString(match[1]));
      if (text && /(OPEN|オープン|営業|トーナメント|フリー ?ロール|RING|リング)/i.test(text)) {
        out.push({ text, url: PROFILE_URL });
      }
      if (out.length > 500) break;
    }
  });
  return out;
}


async function readerCandidates() {
  for (const url of READER_URLS) {
    try {
      const text = await getText(url);
      const rows = readerCandidatesFromText(text, HANDLE);
      if (rows.length) {
        console.log('read ' + rows.length + ' candidate posts via Jina Reader fallback');
        return rows;
      }
      warn('Jina Reader returned no confident schedule candidates for ' + url);
    } catch (error) {
      warn('Jina Reader fallback could not be read. ' + (error?.message || String(error)));
    }
  }
  return [];
}

async function loadCandidates() {
  try {
    const rows = await syndicationCandidates();
    if (rows.length) {
      console.log('read ' + rows.length + ' candidate posts from X syndication');
      return rows;
    }
    warn('X syndication returned no schedule-like posts; trying profile HTML.');
  } catch (error) {
    warn('X syndication could not be read; trying profile HTML. ' + (error?.message || String(error)));
  }

  try {
    const rows = await profileCandidates();
    if (rows.length) {
      console.log('read ' + rows.length + ' candidate posts from X profile HTML');
      return rows;
    }
    warn('X profile HTML returned no schedule-like posts; trying Jina Reader.');
  } catch (error) {
    warn('X profile HTML could not be read; trying Jina Reader. ' + (error?.message || String(error)));
  }

  return await readerCandidates();
}

const candidates = await loadCandidates();
let normalized = null;
for (const candidate of candidates) {
  normalized = normalizeScheduleText(candidate.text, {
    profileUrl: PROFILE_URL,
    sourceUrl: candidate.url || PROFILE_URL
  });
  if (normalized) break;
}

if (!normalized) {
  warn('公式Xから当日のScheduleを十分な確度で識別できませんでした。既存のevents.auto.jsonを保持します。');
} else {
  validateSchedule(normalized);
  const text = JSON.stringify(normalized, null, 2) + '\n';
  const old = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (old === text) {
    console.log('events.auto.json unchanged');
  } else {
    fs.writeFileSync(OUTPUT, text);
    console.log('updated events.auto.json for ' + normalized.date + ' from ' + normalized.source.url);
  }
}
