// Actual browser QA using the production renderers and existing admin. No live-data writes.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { fixture } from './test-activity.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv.slice(2).find((value) => !value.startsWith('--'));
const fontCheck = process.argv.includes('--font-check');
if (shots) fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let file = path.join(root, new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
let checks = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const yes = (actual, label) => { assert(actual, label); checks++; };
async function open({ width = 390, time = '13:55', data = fixture(), zone = 'Asia/Tokyo', url = '/', reducedMotion = 'no-preference', ticking = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: zone, reducedMotion });
  await context.addInitScript(() => { try { localStorage.setItem('chonmage-admin-unlock', '9e06018654272ea14463bc3c1652fd88ac344865948d75336ccf7b8f21c04360'); } catch {} });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    if (fontCheck && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(new URL(route.request().url()).hostname)) return route.continue();
    return route.fulfill({ status: 200, contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/plain', body: '' });
  });
  await page.route(/\/data\/events(?:\.auto)?\.json/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
  await page.route(/\/data\/events\.manual\.json/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, date: data.date }) }));
  if (ticking) { await page.clock.install({ time: new Date('2026-10-04T13:49:57+09:00') }); await page.clock.pauseAt(new Date('2026-10-04T13:49:59.800+09:00')); }
  else await page.clock.setFixedTime(new Date(`2026-10-04T${time}:00+09:00`));
  await page.goto(origin + url, { waitUntil: 'load' });
  await page.locator(url.startsWith('/admin/') ? '#editor-form:not([hidden])' : '#activity-hero').waitFor({ state: 'attached' });
  return { page, context, errors };
}
async function geometry(page) {
  return page.evaluate(() => {
    const hero = document.getElementById('activity-hero').getBoundingClientRect();
    const overflowing = [...document.querySelectorAll('.activity-enhanced *')].filter((el) => {
      if (el.closest('details:not([open])') && el.tagName !== 'SUMMARY' && !el.closest('summary')) return false;
      const r = el.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > innerWidth + 1);
    }).map((el) => el.className);
    const ids = [...document.querySelectorAll('[data-activity-event]')].map((el) => el.dataset.activityEvent);
    return { overflow: document.documentElement.scrollWidth - innerWidth, overflowing, ratio: hero.height / innerHeight, ids, unique: new Set(ids).size };
  });
}
try {
  if (fontCheck) {
    for (const width of [320, 390, 768, 1440]) {
      const { page, context, errors } = await open({ width, url: '/?now=13:50#today' });
      await page.evaluate(() => document.fonts.ready);
      yes(await page.evaluate(() => document.fonts.check('136px "Archivo Black"') && document.fonts.check('16px "Noto Sans JP"')), 'Real website fonts loaded');
      equal(await page.locator('.activity-count').textContent(), '10');
      const layout = await geometry(page); equal(layout.overflowing, []); yes(layout.overflow <= 0);
      if (width <= 620) yes(layout.ratio <= .55, `${width}px real-font last-call height ${layout.ratio}`);
      const countLayout = await page.locator('.activity-value--count').evaluate((el) => ({ countRight: el.children[1].getBoundingClientRect().right, unitLeft: el.children[2].getBoundingClientRect().left, countSize: parseFloat(getComputedStyle(el.children[1]).fontSize), otherSize: Math.max(...[...document.querySelectorAll('h1,h2,.footer-word')].map((other) => parseFloat(getComputedStyle(other).fontSize))) }));
      yes(countLayout.unitLeft >= countLayout.countRight, `${width}px countdown unit wrapped ${JSON.stringify(countLayout)}`);
      yes(countLayout.countSize > countLayout.otherSize, `${width}px real-font countdown remains the largest text`);
      if (shots) await page.locator('#activity-hero').screenshot({ path: path.join(shots, `real-font-last-call-${width}.png`) });
      equal(errors, []); await context.close();
    }
  }
  if (!fontCheck && !process.argv.includes('--admin-only')) {
  const scenarios = [['12:00', 'before-open', '13:00 OPEN', 'あと1時間'], ['13:17', 'open-ring', 'RING GAME', '今すぐ参加できます'], ['13:32', 'tournament-open', 'フリーロール', '受付終了まであと28分'], ['13:42', 'tournament-open', 'フリーロール', '受付終了まであと18分'], ['13:55', 'last-call', 'あと5分', 'まだ間に合います'], ['14:05', 'open-ring', 'RING GAME', '今すぐ参加できます'], ['23:10', 'after-close', 'またのご来店を', '本日の営業は終了しました']];
  for (const width of [320, 360, 375, 390, 412, 620, 768, 1024, 1440]) {
    for (const [time, state, value, copy] of scenarios) {
      const { page, context, errors } = await open({ width, url: `/?now=${time}#today` });
      equal(await page.locator('body').getAttribute('data-activity-state'), state, `${width} ${time} primary`);
      equal(await page.locator('#activity-value').textContent(), value, `${width} ${time} value`);
      yes((await page.locator('#activity-hero').textContent()).includes(copy), 'Expected state description');
      const layout = await geometry(page);
      yes(layout.overflow <= 0, `${width} ${time} page overflow: ${layout.overflow}`);
      equal(layout.overflowing, [], `${width} ${time} clipped content`);
      equal(layout.ids.length, layout.unique, `${width} ${time} duplicate events`);
      if (width <= 620 && state !== 'after-close') yes(layout.ratio >= .40 && layout.ratio <= .55, `${width} ${time} hero height ${layout.ratio}`);
      if (state === 'last-call') {
        const sizes = await page.evaluate(() => ({ countdown: parseFloat(getComputedStyle(document.querySelector('.activity-count')).fontSize), other: Math.max(...[...document.querySelectorAll('h1,h2,.footer-word')].map((el) => parseFloat(getComputedStyle(el).fontSize))) }));
        yes(sizes.countdown > sizes.other, `${width} countdown is largest text ${JSON.stringify(sizes)}`);
      }
      if (state === 'after-close') equal(await page.locator('#secondary-cards article').count(), 0, 'No secondary after close');
      if (time === '14:05') yes((await page.locator('[data-activity-event="free-roll"]').textContent()).includes('開催中 · 受付終了'), 'Registration ended card');
      if (shots && [390, 768, 1440].includes(width)) await page.locator('.event-list').screenshot({ path: path.join(shots, `activity-${width}-${time.replace(':', '')}.png`) });
      equal(errors, [], `${width} ${time} console`); await context.close();
    }
    console.log(`Activity rendered states passed at ${width}px`);
  }
  for (const zone of ['America/Los_Angeles', 'Europe/London', 'Asia/Tokyo']) {
    const { page, context, errors } = await open({ zone });
    equal(await page.locator('body').getAttribute('data-activity-state'), 'last-call', `${zone}: Japan clock`);
    equal(await page.locator('.activity-count').textContent(), '5'); equal(errors, []); await context.close();
  }
  {
    const { page, context } = await open({ ticking: true });
    equal(await page.locator('body').getAttribute('data-activity-state'), 'tournament-open');
    await page.clock.runFor(219);
    equal(await page.locator('body').getAttribute('data-activity-state'), 'tournament-open');
    await page.clock.runFor(1);
    equal(await page.locator('body').getAttribute('data-activity-state'), 'last-call', 'Aligned minute refresh');
    equal(await page.locator('.activity-count').textContent(), '10');
    const announcement = await page.locator('#activity-announce').textContent();
    await page.clock.runFor(60000);
    equal(await page.locator('.activity-count').textContent(), '9');
    equal(await page.locator('#activity-announce').textContent(), announcement, 'No screen-reader repeat each minute');
    await context.close();
  }
  {
    const { page, context } = await open({ time: '13:49', reducedMotion: 'reduce' });
    await page.locator('[data-activity-details="free-roll"] summary').click();
    await page.clock.setFixedTime(new Date('2026-10-04T13:55:00+09:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    equal(await page.locator('.activity-count').textContent(), '5', 'Refresh on visibility');
    yes(await page.locator('[data-activity-details="free-roll"]').evaluate((el) => el.open), 'Open details preserved');
    equal(await page.evaluate(() => document.activeElement.dataset.activityFocus), 'free-roll-details', 'Keyboard focus preserved');
    equal(await page.locator('#activity-hero').evaluate((el) => getComputedStyle(el).animationName), 'none', 'Reduced motion');
    await context.close();
  }
  {
    const data = fixture({ events: [{ id: 'unknown', time: '13:30', title: '受付時間が不明なゲーム', facts: [{ label: '置きバケ連絡締切', value: '14:00' }], description: '詳細' }] });
    const { page, context } = await open({ data });
    equal(await page.locator('body').getAttribute('data-activity-state'), 'open-ring');
    yes((await page.locator('[data-activity-event="unknown"]').textContent()).includes('受付はXで確認'), 'No invented registration deadline');
    await context.close();
  }
  for (const width of [320, 390, 768, 1440]) {
    const data = fixture(); data.events[0].title = '超長い日本語中文EnglishTitle'.repeat(30) + '<img src=x onerror="window.activityInjected=1">';
    data.events[0].description = '<script>window.activityInjected=1</script>';
    const { page, context, errors } = await open({ width, data, time: '13:42' });
    await page.locator('#activity-hero summary').click();
    const layout = await geometry(page); yes(layout.overflow <= 0); equal(layout.overflowing, []);
    equal(await page.locator('.activity-enhanced img, .activity-enhanced script').count(), 0); equal(await page.evaluate(() => window.activityInjected), undefined); equal(errors, []);
    await context.close();
  }
  {
    const data = fixture({ close: '01:00', events: [{ id: 'late', time: '23:30', title: '深夜のゲーム', description: '詳細', facts: [{ label: '最終受付', value: '00:30' }] }] });
    const { page, context } = await open({ data, url: '/?now=24:25' });
    equal(await page.locator('body').getAttribute('data-activity-state'), 'last-call'); equal(await page.locator('.activity-count').textContent(), '5');
    await page.goto(origin + '/?now=25:10'); await page.locator('#activity-hero').waitFor();
    equal(await page.locator('body').getAttribute('data-activity-state'), 'after-close'); await context.close();
  }
  }
  if (!fontCheck) {
    const { page, context, errors } = await open({ width: 1440, url: '/admin/#schedule', time: '13:42' });
    await page.locator('.event-card[data-index="0"] .item-actions > .button').click();
    await page.fill('#field-events-events-0-title', '未保存のゲーム');
    await page.fill('#field-events-events-0-facts-0-value', '13:47');
    await page.click('#close-drawer'); await page.click('#toggle-preview');
    const preview = page.frameLocator('#website-preview');
    await preview.locator('.activity-count').getByText('5', { exact: true }).waitFor();
    yes((await preview.locator('#activity-hero').textContent()).includes('未保存のゲーム'), 'Existing admin draft updates activity');
    const previewTop = await preview.locator('#activity-hero').evaluate((el) => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(el.getBoundingClientRect().top)))));
    yes(Math.abs(previewTop) < 5, 'Schedule preview starts at the dynamic card: ' + previewTop);
    equal(await page.evaluate(() => localStorage.getItem('chonmage-admin-events-draft')), null, 'Unsaved data is previewed');
    for (const width of [390, 768, 1440]) {
      await page.locator(`[data-width="${width}"]`).click();
      yes(await preview.locator('html').evaluate((el) => el.scrollWidth <= innerWidth), `${width} admin preview overflow`);
    }
    equal(errors, []); await context.close();
  }
  console.log(`Activity browser tests passed (${checks} checks)`);
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
