// Copy the X photos of current NEWS into images/news/ so visitors never load pbs.twimg.com.
// X itself serves WebP at fixed sizes, so no image tool is needed: name=medium (up to 1200px,
// the size the old direct links showed) is the file news.json points at, and name=small
// (up to 680px) sits next to it as NAME-680.webp for the small card tiles.
// Files are named x-<media id>: an id may start with "_", which GitHub Pages would not publish.
import fs from 'node:fs';
import path from 'node:path';
import '../news-core.js';
const core = globalThis.ChonmageNews;
export const NEWS_IMAGE_DIR = 'images/news';
const TYPES = ['webp', 'jpg', 'png'];
const MAX_BYTES = 8 * 1024 * 1024;
// Keeps a slow X from holding up the schedule update; the rest is copied on the next run.
const TIME_BUDGET_MS = 90 * 1000;

export function xImageName(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'pbs.twimg.com') return '';
  return parsed.pathname.match(/^\/media\/([A-Za-z0-9_-]+)(?:\.(?:jpe?g|png|webp))?$/)?.[1] || '';
}

function imageType(bytes) {
  if (bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47) return 'png';
  return '';
}

async function download(fetchImpl, name, size, format) {
  const url = 'https://pbs.twimg.com/media/' + name + '?format=' + format + '&name=' + size;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error('too large: ' + url);
  const type = imageType(bytes);
  if (!type) throw new Error('not an image: ' + url);
  return { bytes, type };
}

// Both sizes must exist for a copy to count, so a half-finished download is simply retried.
function storedType(dir, name) {
  return TYPES.find((type) => fs.existsSync(path.join(dir, name + '.' + type)) && fs.existsSync(path.join(dir, name + '-680.' + type))) || '';
}

async function copyImage(fetchImpl, dir, id, stats, deadline) {
  const name = 'x-' + id;
  const stored = storedType(dir, name);
  if (stored) { stats.reused++; return name + '.' + stored; }
  if (Date.now() > deadline) throw new Error('out of time for this run');
  const large = await download(fetchImpl, id, 'medium', 'webp');
  // The thumbnail is asked for in the same format so its path can be derived from the large one.
  const small = await download(fetchImpl, id, 'small', large.type);
  if (small.type !== large.type) throw new Error('sizes came back in different formats for ' + id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name + '-680.' + small.type), small.bytes);
  fs.writeFileSync(path.join(dir, name + '.' + large.type), large.bytes);
  stats.downloaded++; stats.bytes += large.bytes.length; stats.smallBytes += small.bytes.length;
  stats.types[large.type] = (stats.types[large.type] || 0) + 1;
  return name + '.' + large.type;
}

// Expired NEWS stays in the archive with its original links; nobody outside the admin sees it.
export async function mirrorNewsImages(data, { fetch: fetchImpl = globalThis.fetch, dir = NEWS_IMAGE_DIR, now = Date.now(), warn = console.warn, timeBudgetMs = TIME_BUDGET_MS } = {}) {
  core.validateNews(data);
  const result = JSON.parse(JSON.stringify(data));
  const stats = { downloaded: 0, reused: 0, failed: 0, bytes: 0, smallBytes: 0, types: {} };
  const copies = new Map();
  const deadline = Date.now() + timeBudgetMs;
  async function local(url) {
    const id = xImageName(url);
    if (!id) return url;
    if (!copies.has(id)) {
      copies.set(id, copyImage(fetchImpl, dir, id, stats, deadline).then((file) => NEWS_IMAGE_DIR + '/' + file, (error) => {
        stats.failed++; warn('NEWS photo not copied, keeping the X link: ' + url + ' (' + (error?.message || error) + ')'); return '';
      }));
    }
    return (await copies.get(id)) || url;
  }
  const rows = Array.isArray(result) ? result : result.items;
  for (const item of rows) {
    if (!item || typeof item !== 'object' || ['Expired', 'Invalid'].includes(core.status(item, now))) continue;
    if (typeof item.image === 'string' && item.image) item.image = await local(item.image);
    if (Array.isArray(item.images)) {
      const images = [];
      for (const url of item.images) images.push(typeof url === 'string' ? await local(url) : url);
      item.images = images;
    }
  }
  core.validateNews(result);
  return { data: result, stats };
}

export async function mirrorNewsFile(file = 'data/news.json', options = {}) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { data: next, stats } = await mirrorNewsImages(data, options);
  const kib = (bytes) => Math.round(bytes / 1024) + ' KiB';
  console.log('NEWS photos: ' + stats.downloaded + ' copied ' + JSON.stringify(stats.types) + ' (full size ' + kib(stats.bytes) + ', 680px ' + kib(stats.smallBytes) + '), ' + stats.reused + ' already copied, ' + stats.failed + ' kept as X links');
  if (JSON.stringify(data) === JSON.stringify(next)) return false;
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  console.log('updated ' + file + ' to use the copied photos');
  return true;
}

if (process.argv[1]?.endsWith('news-images.mjs')) {
  await mirrorNewsFile(process.argv[2] || 'data/news.json');
}
