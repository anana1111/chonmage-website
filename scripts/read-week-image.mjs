// Every Sunday the shop posts next week's schedule as one picture. This finds that post in the
// logged-in X read (X_POSTS_PATH), asks GitHub Models (free with the workflow's GITHUB_TOKEN)
// to read the picture, checks the answer strictly and saves it as data/week.json.
// Anything unclear keeps the old file; the daily OPEN post still corrects each day.
// Staff can also upload the picture to data/week-upload/ (from /admin/); the newest uploaded
// picture is read the same way and wins over an X post that is not newer than the upload.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { WEEK_FILE, weekDaySchedule } from './week-schedule.mjs';

export const UPLOAD_DIR = 'data/week-upload';
const PROFILE_URL = 'https://x.com/ChonmageNiigata';
const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const HANDLE = 'ChonmageNiigata';
const MODEL = 'openai/gpt-4.1';
// The second address is GitHub Models' older one; it is tried when the first answers oddly.
const ENDPOINTS = ['https://models.github.ai/inference/chat/completions', 'https://models.inference.ai.azure.com/chat/completions'];
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
// An X post comes a day before its week; an upload may come in the middle of the week (daysBefore 7).
export function weekFromAnswer(answer, post, { daysBefore = 1 } = {}) {
  const rows = answer?.days;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 14) throw new Error('expected 1-14 days');
  const posted = jstDate(post.postedAt);
  const year = Number(posted.slice(0, 4));
  const earliest = new Date(Date.parse(posted + 'T00:00:00+09:00') - daysBefore * DAY_MS);
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
  const problems = [];
  for (const endpoint of ENDPOINTS) {
    const legacy = !endpoint.includes('models.github.ai');
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: JSON.stringify({
        model: legacy ? MODEL.replace(/^openai\//, '') : MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: 'data:' + type + ';base64,' + imageBytes.toString('base64'), detail: 'high' } },
        ] }],
      }),
    }).catch((error) => ({ ok: false, status: 0, headers: new Headers(), text: async () => String(error?.message || error) }));
    const body = await response.text();
    let content;
    try { content = JSON.parse(body).choices[0].message.content; } catch {
      problems.push(endpoint + ' HTTP ' + response.status + ' ' + (response.headers.get('content-type') || '') + ': ' + body.slice(0, 200));
      continue;
    }
    return JSON.parse(String(content).replace(/^```(?:json)?\s*|\s*```$/g, ''));
  }
  // One small text-only request tells a size problem apart from no access at all.
  const probe = await fetchImpl(ENDPOINTS[0], { method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'Reply with the word ready.' }] }) })
    .then(async (r) => 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200), (error) => String(error?.message || error));
  throw new Error('GitHub Models did not answer: ' + problems.join(' | ') + ' | text-only probe: ' + probe + ' | picture ' + imageBytes.length + ' bytes');
}

// 表示時間帯 (days[].cards) are set by staff, not read from the picture. A new week keeps the
// cards of the same date, or else of the latest earlier day with the same weekday.
export function withCards(next, old) {
  const oldDays = (Array.isArray(old?.days) ? old.days : []).filter((day) => day && typeof day.date === 'string' && Array.isArray(day.cards) && day.cards.length)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const weekday = (date) => new Date(date + 'T12:00:00+09:00').getUTCDay();
  next.days.forEach((day) => {
    if (day.cards?.length) return;
    const source = oldDays.find((row) => row.date === day.date) || oldDays.find((row) => weekday(row.date) === weekday(day.date));
    if (source) day.cards = JSON.parse(JSON.stringify(source.cards));
  });
  return next;
}

const jstIso = (date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  .format(date).replace(' ', 'T') + '+09:00';

// The newest picture in data/week-upload/ (by commit time, else file time), or null.
export function findUpload(dir = UPLOAD_DIR) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return null; }
  return names.filter((name) => IMAGE_TYPES[path.extname(name).toLowerCase()])
    .map((name) => {
      const file = path.join(dir, name);
      let at = NaN;
      try { at = Date.parse(execFileSync('git', ['log', '-1', '--format=%cI', '--', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch {}
      if (Number.isNaN(at)) at = fs.statSync(file).mtimeMs;
      return { file: file.split(path.sep).join('/'), name, at: new Date(at), type: IMAGE_TYPES[path.extname(name).toLowerCase()] };
    })
    .sort((a, b) => b.at - a.at || (a.name < b.name ? 1 : -1))[0] || null;
}

async function readUpload({ upload, token, force, fetchImpl, file, current }) {
  const bytes = fs.readFileSync(upload.file);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (current?.imageSha256 === sha && !force) { console.log('Uploaded week picture already read: ' + upload.file); return false; }
  if (!token) throw new Error('GITHUB_TOKEN is missing');
  const post = { url: PROFILE_URL, postedAt: upload.at };
  const read = weekFromAnswer(await askModel(bytes, upload.type, token, fetchImpl), post, { daysBefore: 7 });
  const week = withCards({ version: 1, sourceUrl: PROFILE_URL, source: 'upload', image: upload.file, imageSha256: sha, uploadedAt: jstIso(upload.at), days: read.days }, current);
  fs.writeFileSync(file, JSON.stringify(week, null, 2) + '\n');
  console.log('read the week schedule from the uploaded picture ' + upload.file + ':');
  for (const day of week.days) console.log('  ' + day.date + ' ' + (day.open || '休業') + (day.close ? '-' + day.close : '') + ' | ' + day.events.map((event) => event.time + ' ' + event.title).join(' | '));
  return true;
}

export async function readWeekImage({ postsPath = process.env.X_POSTS_PATH, weekPostsPath = process.env.X_WEEK_POSTS_PATH, token = process.env.GITHUB_TOKEN, force = process.env.REREAD_WEEK === 'true', fetch: fetchImpl = globalThis.fetch, file = WEEK_FILE, uploadDir = UPLOAD_DIR, now = new Date() } = {}) {
  let current = null;
  try { current = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  // A picture uploaded by staff is read first; an unread one always wins.
  const upload = findUpload(uploadDir);
  if (upload && now - upload.at < 8 * DAY_MS) {
    const changed = await readUpload({ upload, token, force, fetchImpl, file, current });
    if (changed) return true;
  }
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
  if (current?.sourceUrl === post.url && !force) { console.log('Week schedule already read from ' + post.url); return false; }
  if (current?.source === 'upload' && post.postedAt <= Date.parse(current.uploadedAt)) { console.log('The uploaded week picture is newer than ' + post.url + '; keeping it.'); return false; }
  if (!token) throw new Error('GITHUB_TOKEN is missing');
  const image = await fetchImpl(post.image + '?format=jpg&name=medium', { signal: AbortSignal.timeout(20000) });
  if (!image.ok) throw new Error('picture HTTP ' + image.status);
  const bytes = Buffer.from(await image.arrayBuffer());
  const type = (image.headers.get('content-type') || 'image/jpeg').split(';')[0];
  const week = withCards(weekFromAnswer(await askModel(bytes, type, token, fetchImpl), post), current);
  fs.writeFileSync(file, JSON.stringify(week, null, 2) + '\n');
  console.log('read the week schedule from ' + post.url + ':');
  for (const day of week.days) console.log('  ' + day.date + ' ' + (day.open || '休業') + (day.close ? '-' + day.close : '') + ' | ' + day.events.map((event) => event.time + ' ' + event.title + ' ' + event.entry + '/' + event.reentry).join(' | '));
  return true;
}

if (process.argv[1]?.endsWith('read-week-image.mjs')) {
  const changed = await readWeekImage();
  if (changed && process.env.WEEK_CHANGED_PATH) fs.writeFileSync(process.env.WEEK_CHANGED_PATH, '1');
}
