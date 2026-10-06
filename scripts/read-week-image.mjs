// Every Sunday the shop posts next week's schedule as one picture. This finds that post in the
// logged-in X read (X_POSTS_PATH), asks GitHub Models (free with the workflow's GITHUB_TOKEN)
// to read the picture, checks the answer strictly and saves it as data/week.json.
// Anything unclear keeps the old file; the daily OPEN post still corrects each day.
import fs from 'node:fs';
import { WEEK_FILE, weekDaySchedule } from './week-schedule.mjs';

const HANDLE = 'ChonmageNiigata';
const MODEL = 'openai/gpt-4.1';
const ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const WEEK_POST = /からのスケジュール|OPENスケジュール|週間スケジュール|今週のスケジュール/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const jstDate = (date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);

// Newest own post from the last 8 days that announces a week and carries a photo.
export function findWeekPost(value, now = new Date()) {
  const tweets = Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];
  return tweets
    .filter((tweet) => tweet && !tweet.isRetweet && /^\d+$/.test(String(tweet.id || '')) &&
      String(tweet.author?.screenName || '').toLowerCase() === HANDLE.toLowerCase() &&
      WEEK_POST.test(String(tweet.text || '')) &&
      (tweet.media || []).some((item) => item?.type === 'photo' && /^https:\/\/pbs\.twimg\.com\/media\//.test(item.url || '')))
    .map((tweet) => ({
      url: 'https://x.com/' + HANDLE + '/status/' + tweet.id,
      text: String(tweet.text),
      postedAt: new Date(tweet.createdAtISO || tweet.createdAt || 0),
      image: tweet.media.find((item) => item?.type === 'photo' && /^https:\/\/pbs\.twimg\.com\/media\//.test(item.url || '')).url,
    }))
    .filter((post) => !Number.isNaN(post.postedAt.getTime()) && now - post.postedAt < 8 * DAY_MS && post.postedAt - now < DAY_MS)
    .sort((a, b) => b.postedAt - a.postedAt)[0] || null;
}

// Turns the model's {days:[{month, day, ...}]} into week.json, or throws on anything doubtful.
export function weekFromAnswer(answer, post) {
  const rows = answer?.days;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 14) throw new Error('expected 1-14 days');
  const posted = jstDate(post.postedAt);
  const year = Number(posted.slice(0, 4));
  const earliest = new Date(Date.parse(posted + 'T00:00:00+09:00') - DAY_MS);
  const latest = new Date(Date.parse(posted + 'T00:00:00+09:00') + 14 * DAY_MS);
  const seen = new Set();
  const days = rows.map((row) => {
    const month = Number(row?.month);
    const day = Number(row?.day);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) throw new Error('bad date');
    // A week posted in late December can run into January.
    const y = month < Number(posted.slice(5, 7)) - 6 ? year + 1 : year;
    const date = y + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const at = new Date(date + 'T12:00:00+09:00');
    if (jstDate(at) !== date || at < earliest || at > latest) throw new Error('date outside the posted week: ' + date);
    if (seen.has(date)) throw new Error('duplicate date ' + date);
    seen.add(date);
    if (row.open ? !TIME.test(row.open) : (row.events || []).length) throw new Error('bad open time on ' + date);
    if (row.close && !TIME.test(row.close)) throw new Error('bad close time on ' + date);
    const events = (Array.isArray(row.events) ? row.events : []).map((event) => {
      if (!TIME.test(event?.time || '')) throw new Error('bad event time on ' + date);
      const title = String(event.title || '').trim();
      if (!title || title.length > 40) throw new Error('bad event title on ' + date);
      const money = (value) => String(value || '').trim().slice(0, 20);
      return { time: event.time, title, entry: money(event.entry), reentry: money(event.reentry) };
    });
    return { date, open: row.open || '', close: row.close || '', ringGame: Boolean(row.ringGame), events };
  }).sort((a, b) => a.date.localeCompare(b.date));
  const week = { version: 1, sourceUrl: post.url, days };
  for (const row of days) weekDaySchedule(week, row.date);
  return week;
}

const PROMPT = `This picture is a poker room's opening schedule for one week (Japanese).
Return JSON only: {"days":[{"month":10,"day":5,"open":"17:00","close":"23:30","ringGame":true,
"events":[{"time":"18:00","title":"THE DAILY","entry":"¥1,500〜","reentry":"¥2,000"}]}]}
Rules: one row per date shown, in order. open/close are the business hours (24h HH:MM).
ringGame is true when a ring game runs all day (終日 NLHリングゲーム); do not list it as an event.
Each timed row is an event: copy the title exactly as printed, entry from the ENTRY column and
reentry from the RENTRY column exactly as printed (無料 stays 無料; empty string if none).
If a date says closed (休業/定休日), give it "open":"" and no events. Do not guess unreadable text.`;

async function askModel(imageBytes, type, token, fetchImpl) {
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(60000),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: 'data:' + type + ';base64,' + imageBytes.toString('base64'), detail: 'high' } },
      ] }],
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error('GitHub Models HTTP ' + response.status + ': ' + body.slice(0, 300));
  let content;
  try { content = JSON.parse(body).choices[0].message.content; } catch { throw new Error('GitHub Models gave an unexpected answer (HTTP ' + response.status + ', ' + (response.headers.get('content-type') || '') + '): ' + body.slice(0, 200)); }
  return JSON.parse(String(content).replace(/^```(?:json)?\s*|\s*```$/g, ''));
}

export async function readWeekImage({ postsPath = process.env.X_POSTS_PATH, weekPostsPath = process.env.X_WEEK_POSTS_PATH, token = process.env.GITHUB_TOKEN, force = process.env.REREAD_WEEK === 'true', fetch: fetchImpl = globalThis.fetch, file = WEEK_FILE, now = new Date() } = {}) {
  const files = [postsPath, weekPostsPath].filter((file) => file && fs.existsSync(file));
  if (!files.length) { console.log('No logged-in X posts; week picture not checked.'); return false; }
  const tweets = files.flatMap((file) => { try { const value = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(value?.data) ? value.data : []; } catch { return []; } });
  const post = findWeekPost(tweets, now);
  if (!post) {
    const rows = tweets;
    const oldest = rows.map((tweet) => tweet.createdAtISO || tweet.createdAt).filter(Boolean).sort()[0] || '?';
    console.log('No week schedule picture in the recent ' + rows.length + ' posts (oldest ' + oldest + ').');
    for (const tweet of rows.filter((row) => /スケジュール/.test(row.text || ''))) console.log('  schedule-like post ' + tweet.id + ' ' + (tweet.createdAtISO || '') + ' media=' + (tweet.media || []).map((item) => item.type).join(',') + ': ' + String(tweet.text).replace(/\s+/g, ' ').slice(0, 80));
    return false;
  }
  let current = null;
  try { current = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (current?.sourceUrl === post.url && !force) { console.log('Week schedule already read from ' + post.url); return false; }
  if (!token) throw new Error('GITHUB_TOKEN is missing');
  const image = await fetchImpl(post.image + '?format=jpg&name=large', { signal: AbortSignal.timeout(20000) });
  if (!image.ok) throw new Error('picture HTTP ' + image.status);
  const bytes = Buffer.from(await image.arrayBuffer());
  const type = (image.headers.get('content-type') || 'image/jpeg').split(';')[0];
  const week = weekFromAnswer(await askModel(bytes, type, token, fetchImpl), post);
  fs.writeFileSync(file, JSON.stringify(week, null, 2) + '\n');
  console.log('read the week schedule from ' + post.url + ':');
  for (const day of week.days) console.log('  ' + day.date + ' ' + (day.open || '休業') + (day.close ? '-' + day.close : '') + ' | ' + day.events.map((event) => event.time + ' ' + event.title + ' ' + event.entry + '/' + event.reentry).join(' | '));
  return true;
}

if (process.argv[1]?.endsWith('read-week-image.mjs')) {
  const changed = await readWeekImage();
  if (changed && process.env.WEEK_CHANGED_PATH) fs.writeFileSync(process.env.WEEK_CHANGED_PATH, '1');
}
