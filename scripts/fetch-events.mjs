import fs from 'node:fs';
import { normalizeScheduleText } from './normalize-events.mjs';
import { validateSchedule } from './validate-events.mjs';
import { readerCandidatesFromText, rssCandidatesFromText } from './x-reader.mjs';
import { syncNewsFile } from './sync-news.mjs';

const HANDLE = 'ChonmageNiigata';
const PROFILE_URL = 'https://x.com/' + HANDLE;
const SYNDICATION_URL = 'https://syndication.twitter.com/srv/timeline-profile/screen-name/' + HANDLE;
const READER_URLS = [
  'https://r.jina.ai/https://x.com/' + HANDLE,
  'https://r.jina.ai/http://x.com/' + HANDLE,
];
const TWIIIT_RSS_URL = 'https://twiiit.com/' + HANDLE + '/rss';
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

const SCHEDULE_WORDS = /(OPEN|オープン|営業|休業|定休日|臨時休|お休み|トーナメント|フリー ?ロール|RING|リング)/i;

// Keep line breaks: normalizeScheduleText() reads one schedule row per line.
function clean(value) {
  return String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\s\u3000]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function candidateFromObject(value, out, seen = new Set(), includeNews = false) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);

  if (!Array.isArray(value)) {
    const noteText = value.note_tweet?.note_tweet_results?.result?.text || value.note_tweet?.text;
    const text = typeof noteText === 'string' ? noteText : typeof value.full_text === 'string' ? value.full_text :
      typeof value.text === 'string' ? value.text :
      typeof value.note_tweet?.text === 'string' ? value.note_tweet.text : null;
    const author = value.user?.screen_name || value.user?.legacy?.screen_name || value.core?.user_results?.result?.legacy?.screen_name;
    if (text && (includeNews || SCHEDULE_WORDS.test(text)) && (!author || typeof author === 'string' && author.toLowerCase() === HANDLE.toLowerCase())) {
      const id = value.id_str || value.rest_id || value.id || value.tweet_id || null;
      const media = value.extended_entities?.media || value.entities?.media || value.mediaDetails;
      out.push({
        text: clean(text),
        url: id ? ('https://x.com/' + HANDLE + '/status/' + String(id)) : PROFILE_URL,
        newsText: clean(text),
        publishedAt: value.created_at || value.createdAt || value.legacy?.created_at || '',
        images: (Array.isArray(media) ? media : []).map((item) => item?.media_url_https || item?.media_url || '').filter((url) => /^https:\/\//.test(url)),
      });
    }
  }

  Object.values(value).forEach((child) => {
    if (child && typeof child === 'object') candidateFromObject(child, out, seen, includeNews);
  });
}

async function syndicationCandidates() {
  const html = await getText(SYNDICATION_URL);
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('syndication __NEXT_DATA__ not found');
  const data = JSON.parse(match[1]);
  const out = [];
  candidateFromObject(data, out, new Set(), true);
  return out;
}

// `value` is the raw body of a JSON string literal, so its quotes are already escaped.
function decodeJsonString(value) {
  try { return JSON.parse('"' + value + '"'); }
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
      if (text && SCHEDULE_WORDS.test(text)) {
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


async function twiiitCandidates() {
  const xml = await getText(TWIIIT_RSS_URL);
  return rssCandidatesFromText(xml, HANDLE, { includeNews: true });
}

async function withRssNews(rows) {
  // Loose HTML/Reader windows stay schedule-only; RSS has bounded post bodies.
  try { return [...rows, ...await twiiitCandidates()]; }
  catch (error) { warn('NEWS RSS fallback could not be read; keeping captured schedule. ' + (error?.message || String(error))); return rows; }
}

// Posts read with a logged-in X account by twitter-cli in Actions (`twitter user-posts --json`).
// Logged-out reading is often refused (403/429); this is the most reliable source when it is set up.
export function candidatesFromCliJson(value) {
  const tweets = Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];
  return tweets.filter((tweet) => tweet && typeof tweet.text === 'string' && /^\d+$/.test(String(tweet.id || '')) && !tweet.isRetweet &&
    String(tweet.author?.screenName || '').toLowerCase() === HANDLE.toLowerCase()).map((tweet) => ({
    text: clean(tweet.text), newsText: clean(tweet.text),
    url: 'https://x.com/' + HANDLE + '/status/' + tweet.id,
    publishedAt: tweet.createdAtISO || tweet.createdAt || '',
    images: (Array.isArray(tweet.media) ? tweet.media : []).filter((item) => item?.type === 'photo' && /^https:\/\//.test(item.url || '')).map((item) => item.url),
  }));
}

function loggedInCandidates() {
  const file = process.env.X_POSTS_PATH;
  if (!file || !fs.existsSync(file) || !fs.statSync(file).size) return null;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (parsed && parsed.ok === false) throw new Error(parsed.error?.code + ': ' + parsed.error?.message);
  return candidatesFromCliJson(parsed);
}

async function loadCandidates() {
  const collected = [];
  const keep = (rows) => { collected.push(...rows); return rows.some((row) => SCHEDULE_WORDS.test(row.text || '')); };
  try {
    const rows = loggedInCandidates();
    if (rows?.length) {
      console.log('read ' + rows.length + ' posts with the logged-in X account');
      if (keep(rows)) return collected;
    }
    if (rows) warn('Logged-in X reading returned no schedule-like posts; trying logged-out sources.');
  } catch (error) {
    warn('Logged-in X reading failed; trying logged-out sources. ' + (error?.message || String(error)));
  }
  try {
    const rows = await syndicationCandidates();
    if (rows.length) {
      console.log('read ' + rows.length + ' candidate posts from X syndication');
      if (keep(rows)) return collected;
    }
    warn('X syndication returned no schedule-like posts; trying profile HTML.');
  } catch (error) {
    warn('X syndication could not be read; trying profile HTML. ' + (error?.message || String(error)));
  }

  try {
    const rows = await profileCandidates();
    if (rows.length) {
      console.log('read ' + rows.length + ' candidate posts from X profile HTML');
      if (keep(rows)) return withRssNews(collected);
    }
    warn('X profile HTML returned no schedule-like posts; trying Jina Reader.');
  } catch (error) {
    warn('X profile HTML could not be read; trying Jina Reader. ' + (error?.message || String(error)));
  }

  const readerRows = await readerCandidates();
  if (readerRows.length) { collected.push(...readerRows); return withRssNews(collected); }

  try {
    const rows = await twiiitCandidates();
    if (rows.length) {
      console.log('read ' + rows.length + ' candidate posts via Twiiit/Nitter RSS fallback');
      collected.push(...rows); return collected;
    }
    warn('Twiiit/Nitter RSS returned no schedule-like posts.');
  } catch (error) {
    warn('Twiiit/Nitter RSS fallback could not be read. ' + (error?.message || String(error)));
  }
  return collected;
}

// One malformed post must not stop the run or hide the other posts.
export function pickSchedule(candidates, options = {}) {
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.text !== 'string') continue;
    const key = candidate.url + '\n' + candidate.text;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const normalized = normalizeScheduleText(candidate.text, {
        now: options.now,
        profileUrl: PROFILE_URL,
        sourceUrl: candidate.url || PROFILE_URL
      });
      if (normalized) return validateSchedule(normalized);
    } catch (error) {
      (options.warn || warn)('skipped a post that could not be parsed (' + (candidate.url || PROFILE_URL) + '): ' + (error?.message || String(error)));
    }
  }
  return null;
}

export function writeSchedule(normalized, output = OUTPUT) {
  const text = JSON.stringify(normalized, null, 2) + '\n';
  const old = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
  if (old === text) {
    console.log('events.auto.json unchanged');
    return false;
  }
  fs.writeFileSync(output, text);
  console.log('updated ' + output + ' for ' + normalized.date + ' from ' + normalized.source.url);
  return true;
}

async function main() {
  let candidates = [];
  try {
    candidates = await loadCandidates();
  } catch (error) {
    warn('candidate loading failed: ' + (error?.message || String(error)));
  }
  // Share the same free fetch run. Actions merges these snapshots into latest main.
  if (process.env.NEWS_CANDIDATES_PATH) fs.writeFileSync(process.env.NEWS_CANDIDATES_PATH, JSON.stringify(candidates) + '\n');
  else syncNewsFile(candidates);
  const normalized = pickSchedule(candidates);
  if (!normalized) {
    warn('公式Xから当日のScheduleを十分な確度で識別できませんでした。既存のevents.auto.jsonを保持します。');
    return;
  }
  writeSchedule(normalized);
}

export { clean as cleanPostText, candidateFromObject, decodeJsonString, loadCandidates };

if (process.argv[1] && process.argv[1].endsWith('fetch-events.mjs')) {
  await main();
}
