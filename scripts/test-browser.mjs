// Browser checks for the public page and /admin/ (run locally; needs Playwright).
//   node scripts/test-browser.mjs [screenshot-dir]
// Not run by GitHub Actions. Uses fixed Japan times and fixture JSON, blocks all
// external requests, and fails on any console error or page error.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { validateSchedule, mergeSchedule } from './schedule-core.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const shotDir = process.argv[2] || '';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  try { ({ chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'))); }
  catch { console.log('playwright is not installed; browser tests skipped'); process.exit(0); }
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = http.createServer((request, response) => {
  let file = path.join(root, decodeURIComponent(new URL(request.url, 'http://x').pathname));
  if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? {} : {});
const problems = [];
let checks = 0;
const ok = (condition, message) => { checks += 1; if (!condition) problems.push(message); };

const fixture = (overrides = {}) => ({
  version: 2,
  date: '2026-10-02',
  open: '17:00',
  close: '23:30',
  status: 'open',
  latestXUrl: 'https://x.com/ChonmageNiigata',
  schedulePostUrl: 'https://x.com/ChonmageNiigata/status/1',
  summary: ['本日の開催情報です。', '当日の変更は公式Xでお知らせします。'],
  ringGame: { enabled: true, start: '17:00', title: 'RING GAME', description: 'OPENから参加者募集中' },
  events: [
    { id: 'free-1800', time: '18:00', type: 'free', title: 'フリーロール', heroTitle: 'FREE ROLL', theme: 'blue', description: '詳細は公式Xで確認してください。', facts: [{ label: 'ENTRY', value: '¥0' }] },
    { id: 'event-1910', time: '19:10', type: 'tournament', title: 'ふるまちトーナメント', heroTitle: 'ふるまちトーナメント', theme: 'orange', description: '詳細は公式Xで確認してください。', facts: [], isMain: true },
  ],
  ...overrides,
});

async function openPage({ width = 390, time, events, javaScriptEnabled = true, url = '/' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 200, contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/plain', body: '' }));
  if (events) await page.route(/\/data\/events\.json/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events) }));
  if (time && javaScriptEnabled) await page.clock.setFixedTime(new Date(time));
  await page.goto(origin + url, { waitUntil: 'load' });
  if (javaScriptEnabled && url === '/') {
    await page.waitForFunction(() => document.querySelector('.timeline-rail, .timeline-empty') || !document.querySelector('.today-stale-message').hidden);
    await page.waitForTimeout(150);
  }
  return { page, context, errors };
}

async function heroState(page) {
  return page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent.trim();
    const item = (name) => {
      const el = document.querySelector(`[data-hero-event="${name}"]`);
      return el.hidden ? null : el.querySelector('span').textContent + ' ' + el.querySelector('strong').textContent;
    };
    const states = [...document.querySelectorAll('.timeline-card')].map((card) => card.querySelector('.timeline-card__time').textContent + ':' + (card.dataset.state || '-'));
    const rail = document.querySelector('.timeline-rail');
    const cards = [...document.querySelectorAll('.timeline-card')];
    const focused = rail ? cards.findIndex((card) => Math.abs(card.offsetLeft - cards[0].offsetLeft - rail.scrollLeft) < 4) : -1;
    return {
      date: text('#hero-schedule-date'),
      status: text('#hero-business-status-text'),
      open: item('open'), next: item('next'), main: item('main'),
      states, focused,
      stale: !document.querySelector('.today-stale-message').hidden,
      ended: Boolean(document.querySelector('.timeline-ended')),
      empty: text('.timeline-empty') || '',
      summary: text('.today-summary p'),
    };
  });
}

async function scenario(name, options, expect) {
  const { page, context, errors } = await openPage(options);
  const state = await heroState(page);
  try { expect(state, page); ok(true, name); }
  catch (error) { problems.push(name + ': ' + error.message + '\n' + JSON.stringify(state)); }
  ok(!errors.length, name + ': console errors ' + errors.join(' | '));
  await context.close();
}

// --- timeline / hero states ------------------------------------------------------
const jst = (clock, day = '2026-10-02') => day + 'T' + clock + ':00+09:00';
await scenario('before open', { time: jst('16:00'), events: fixture() }, (s) => {
  assert.equal(s.date, '2026.10.02 · FRI');
  assert.equal(s.status, '本日 17:00 OPEN');
  assert.equal(s.next, 'NEXT 18:00 FREE ROLL');
  assert.equal(s.main, 'MAIN 19:10 ふるまちトーナメント');
  assert.equal(s.stale, false);
  assert.equal(s.states[0], '17:00:next');
  assert.equal(s.focused, 0);
  assert.equal(s.summary, '本日の開催情報です。当日の変更は公式Xでお知らせします。');
});
await scenario('event without end just started stays NOW', { time: jst('18:05'), events: fixture() }, (s) => {
  assert.equal(s.status, '営業中');
  assert.deepEqual(s.states, ['17:00:past', '17:00:now', '18:00:now', '19:10:next', '23:30:-']);
  assert.equal(s.focused, 2, 'NOW event is scrolled into view');
  assert.equal(s.next, 'NEXT · MAIN 19:10 ふるまちトーナメント');
  assert.equal(s.main, null, 'MAIN is not repeated');
});
await scenario('NOW preferred over NEXT', { time: jst('19:30'), events: fixture() }, (s) => {
  assert.deepEqual(s.states, ['17:00:past', '17:00:now', '18:00:past', '19:10:now', '23:30:-']);
  assert.equal(s.focused, 3);
  assert.equal(s.next, 'NOW · MAIN 19:10 ふるまちトーナメント');
  assert.equal(s.main, null);
});
await scenario('after close shows 本日終了', { time: jst('23:45'), events: fixture() }, (s) => {
  assert.equal(s.status, '本日終了');
  assert.equal(s.next, null);
  assert.equal(s.ended, true);
  assert.ok(s.states.every((row) => row.endsWith(':past')));
  assert.equal(s.stale, false);
});
await scenario('closed day', { time: jst('18:00'), events: fixture({ status: 'closed', open: undefined, close: undefined, ringGame: { enabled: false }, events: [], summary: ['本日は休業です。'] }) }, (s) => {
  assert.equal(s.status, '本日休業');
  assert.equal(s.open, null);
  assert.equal(s.next, null);
  assert.equal(s.empty, '本日は休業です。');
});
await scenario('25時CLOSE is still today after midnight', { time: jst('00:30', '2026-10-03'), events: fixture({ close: '01:00', events: [...fixture().events, { id: 'late', time: '00:15', title: 'LATE', heroTitle: 'LATE', type: 'event', description: 'd' }] }) }, (s) => {
  assert.equal(s.stale, false);
  assert.equal(s.date, '2026.10.02 · FRI');
  assert.equal(s.status, '営業中');
  assert.deepEqual(s.states.map((row) => row.split(':').slice(0, 2).join(':')), ['17:00', '17:00', '18:00', '19:10', '00:15', '01:00']);
  assert.equal(s.states[4], '00:15:now');
});
await scenario('after 25時CLOSE the old day is stale', { time: jst('01:30', '2026-10-03'), events: fixture({ close: '01:00' }) }, (s) => {
  assert.equal(s.stale, true);
  assert.equal(s.date, 'LATEST INFO');
});
await scenario('old data is never shown as today', { time: jst('18:00'), events: fixture({ date: '2026-09-13' }) }, (s) => {
  assert.equal(s.stale, true);
  assert.equal(s.open, null);
  assert.equal(s.next, null);
});
await scenario('repository data (real events.json) at a later date', { time: jst('18:00') }, (s) => {
  assert.equal(s.stale, true);
});

// --- finished cards stay readable: no whole-card fade, explicit 「終了」 badge -------------
{
  const { page, context, errors } = await openPage({ time: jst('19:30'), events: fixture() });
  const past = await page.locator('.timeline-card[data-timeline-id="free-1800"]').evaluate((card) => ({
    state: card.dataset.state, opacity: getComputedStyle(card).opacity,
    badge: card.querySelector('.timeline-status--past')?.textContent || '',
  }));
  ok(past.state === 'past' && past.opacity === '1' && past.badge === '終了', 'past card is readable and marked 終了: ' + JSON.stringify(past));
  ok(!(await page.locator('.timeline-card[data-timeline-id="open"] .timeline-status--past').count()), 'OPEN card has no 終了 badge');
  ok(!errors.length, 'past card: console errors ' + errors.join(' | '));
  await context.close();
}

// --- page left open: the minute refresh follows the clock without closing open details ---
{
  const { page, context, errors } = await openPage({ time: jst('18:55'), events: fixture() });
  await page.locator('.timeline-card[data-timeline-id="free-1800"] summary').click();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  ok(await page.locator('.timeline-card[data-timeline-id="free-1800"] details').evaluate((d) => d.open), 'refresh without changes keeps details open');
  await page.clock.setFixedTime(new Date(jst('19:15')));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(100);
  const s = await heroState(page);
  ok(s.states[3] === '19:10:now' && s.states[2] === '18:00:past', 'refresh updates NOW/past after the clock moves: ' + s.states.join(','));
  ok(await page.locator('.timeline-card[data-timeline-id="free-1800"] details').evaluate((d) => d.open), 'refresh with changes keeps details open');
  ok(!errors.length, 'refresh: console errors ' + errors.join(' | '));
  await context.close();
}

// --- desktop mouse: click opens details, drag scrolls the rail without toggling ----------
{
  const { page, context, errors } = await openPage({ width: 1280, time: jst('12:00'), events: fixture() });
  const summary = page.locator('.timeline-card[data-timeline-id="ring"] summary');
  await summary.click();
  ok(await page.locator('.timeline-card[data-timeline-id="ring"] details').evaluate((d) => d.open), 'mouse click opens 詳細を見る');
  const box = await summary.boundingBox();
  const before = await page.locator('.timeline-rail').evaluate((rail) => rail.scrollLeft);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 150, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await page.locator('.timeline-rail').evaluate((rail) => rail.scrollLeft);
  ok(after > before, 'mouse drag scrolls the rail (' + before + ' -> ' + after + ')');
  ok(await page.locator('.timeline-card[data-timeline-id="ring"] details').evaluate((d) => d.open), 'drag does not toggle details');
  ok(!errors.length, 'mouse: console errors ' + errors.join(' | '));
  await context.close();
}

// --- no JavaScript: safe, undated fallback ------------------------------------------
{
  const { page, context } = await openPage({ javaScriptEnabled: false });
  const visible = await page.evaluate(() => document.body.innerText);
  ok(!/2026\.09\.13 · SUN|9月13日|13:30 フリーロール|18:00 王者決定戦|本日営業/.test(visible), 'no-JS page still shows dated schedule text');
  ok(await page.locator('.today-stale-message').isVisible(), 'no-JS: official X message visible');
  ok(!(await page.locator('.today-live-content').isVisible()), 'no-JS: live content hidden');
  ok(await page.locator('#hero-schedule-date').textContent() === 'LATEST INFO', 'no-JS hero date');
  await context.close();
}

// --- validator parity: public page vs Node --------------------------------------------
{
  const cases = [
    fixture(),
    fixture({ status: 'closed', open: undefined, events: [] }),
    fixture({ open: undefined }),
    fixture({ close: '' }),
    fixture({ events: [{ id: 'a', time: '18:00', title: 'T', description: 'd' }] }),
    fixture({ events: [{ id: 'a', time: '18:00', title: 'T', description: 'd', theme: 'green' }] }),
    fixture({ events: [{ id: 'a', time: '18:00', title: 'T', description: '詳細を入力してください。' }] }),
    fixture({ events: [{ id: 'a', time: '18:00', title: 'T', description: 'd' }, { id: 'a', time: '19:00', title: 'U', description: 'd' }] }),
    fixture({ events: [{ id: 'a', time: '18:00', title: 'T', description: 'd', hidden: true, theme: 'x' }] }),
    fixture({ events: [{ id: '', time: '18:00', title: 'T', description: 'd' }] }),
    fixture({ events: [{ id: 'a', time: '24:00', title: 'T', description: 'd' }] }),
    fixture({ events: [{ id: 'a', time: '18:00', title: 'T', description: 'd', heroTitle: '' }] }),
    fixture({ events: [{ id: 'a', time: '18:00', title: 'T', description: 'd', link: { label: 'L', url: 'tel:080-1' } }] }),
    fixture({ events: [{ id: 'a', time: '18:00', title: 'T', description: 'd', link: { label: 'L', url: 'http://x.com' } }] }),
    fixture({ ringGame: { enabled: true, title: '', description: 'd' } }),
    fixture({ latestXUrl: 'javascript:alert(1)' }),
    fixture({ date: '2026-02-30' }),
    fixture({ source: { url: 'http://bad' } }),
  ];
  const { page, context, errors } = await openPage({ time: jst('18:00'), events: fixture() });
  const browserResults = await page.evaluate((list) => list.map((item) => { try { window.validateEvents(item); return true; } catch { return false; } }), JSON.parse(JSON.stringify(cases)));
  const nodeResults = cases.map((item) => { try { validateSchedule(JSON.parse(JSON.stringify(item))); return true; } catch { return false; } });
  nodeResults.forEach((result, index) => ok(result === browserResults[index], 'validator mismatch for case ' + index + ': node=' + result + ' browser=' + browserResults[index]));
  ok(!errors.length, 'parity page console errors');
  await context.close();
}

// --- layout at each width ---------------------------------------------------------------
const widths = [320, 375, 390, 620, 768, 1024, 1440];
for (const width of widths) {
  for (const mode of ['live', 'stale']) {
    const { page, context, errors } = await openPage({ width, time: jst('18:05'), events: mode === 'live' ? fixture() : fixture({ date: '2026-09-13' }) });
    const report = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      const orphans = [];
      document.querySelectorAll('h1, h2, h3, .hero-bottom > p').forEach((heading) => {
        if (!heading.offsetParent || heading.closest('[hidden]')) return;
        // Flex/grid headings (e.g. FROM ¥500〜) place separate items side by side on purpose.
        if (/flex|grid/.test(getComputedStyle(heading).display)) return;
        const lines = new Map();
        const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const textNode = walker.currentNode;
          for (let index = 0; index < textNode.length; index += 1) {
            if (!textNode.data[index].trim()) continue;
            const range = document.createRange();
            range.setStart(textNode, index); range.setEnd(textNode, index + 1);
            const rect = range.getBoundingClientRect();
            if (!rect.width) continue;
            const key = Math.round(rect.top / 4);
            lines.set(key, (lines.get(key) || '') + textNode.data[index]);
          }
        }
        const rows = [...lines.values()];
        // A line holding one character, optionally followed by punctuation (「ト」「ぶ？」), is an orphan.
        const bare = (row) => [...row.replace(/[、。，．？！?!・」』）)〜~\-]/g, '')].length;
        if (rows.length > 1 && rows.some((row) => bare(row) <= 1)) orphans.push(rows.join(' / '));
      });
      const small = [];
      if (window.innerWidth <= 900) {
        document.querySelectorAll('.site-header a, .site-header button, .timeline-dot, .timeline-card__details summary').forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (!rect.width || el.closest('[hidden]') || getComputedStyle(el).display === 'none') return;
          // Dots sit in a row: 24px wide (WCAG 2.5.8) and 44px tall without overlapping.
          const tooSmall = el.classList.contains('timeline-dot') ? rect.width < 24 || rect.height < 44 : Math.min(rect.width, rect.height) < 44;
          if (tooSmall) small.push((el.className || el.tagName) + ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
        });
      }
      return { overflow, orphans, small };
    });
    ok(report.overflow <= 0, width + 'px ' + mode + ': horizontal overflow ' + report.overflow + 'px');
    ok(!report.orphans.length, width + 'px ' + mode + ': single-character line in ' + report.orphans.join(' | '));
    ok(!report.small.length, width + 'px ' + mode + ': touch targets under 44px: ' + report.small.join(', '));
    ok(!errors.length, width + 'px ' + mode + ': console errors ' + errors.join(' | '));
    if (shotDir) {
      fs.mkdirSync(shotDir, { recursive: true });
      await page.screenshot({ path: path.join(shotDir, mode + '-' + width + '.png'), fullPage: false });
      await page.evaluate(() => window.scrollTo(0, document.getElementById('today').offsetTop));
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(shotDir, mode + '-' + width + '-today.png'), fullPage: false });
    }
    await context.close();
  }
}

// --- images: modern format, loaded, and sharp (never shown larger than the chosen file) ----
for (const [width, deviceScaleFactor] of [[390, 3], [768, 2], [1440, 1]]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor });
  const page = await context.newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 200, body: '' }));
  await page.goto(origin + '/', { waitUntil: 'load' });
  for (let y = 0; y < 30; y += 1) { await page.mouse.wheel(0, 700); await page.waitForTimeout(60); }
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));
  const images = await page.evaluate(() => [...document.images].map((img) => ({
    src: img.currentSrc.split('/').pop(), natural: img.naturalWidth, shown: img.getBoundingClientRect().width,
    fit: getComputedStyle(img).objectFit, box: [img.getBoundingClientRect().width, img.getBoundingClientRect().height], ratio: img.naturalWidth / img.naturalHeight,
  })));
  images.forEach((img) => {
    ok(/\.webp$/.test(img.src) && img.natural > 0, width + 'px: image not loaded as webp ' + img.src);
    // object-fit: cover scales by the larger axis ratio.
    const needed = img.fit === 'cover' ? Math.max(img.box[0], img.box[1] * img.ratio) : img.shown;
    // naturalWidth is density-corrected for srcset images, so use the file's real width.
    const fileWidth = Number(img.src.match(/-(\d+)\.webp$/)?.[1] || (img.src.startsWith('chonmage-character') ? 1350 : 1448));
    const largest = fileWidth >= 1448 || img.src === 'chonmage-character-800.webp';
    ok(needed * deviceScaleFactor <= fileWidth * 1.05 || largest, width + 'px@' + deviceScaleFactor + 'x: ' + img.src + ' upscaled (' + Math.round(needed * deviceScaleFactor) + ' > ' + fileWidth + ')');
  });
  await context.close();
}

// --- admin flow -----------------------------------------------------------------------------
{
  const { page, context, errors } = await openPage({ width: 1280, url: '/admin/', time: jst('18:00') });
  page.on('dialog', (dialog) => dialog.accept());
  await page.waitForSelector('#editor-form:not([hidden])', { timeout: 20000 });
  const bodyText = await page.locator('body').innerText();
  ok(await page.locator('#prepare-publish').textContent() === '公開用ファイルを作成', 'admin: publish button renamed');
  ok(!bodyText.includes('GitHubに公開'), 'admin: misleading label removed');
  // Home answers "what needs attention": the published data (9/13) is not today.
  ok(/要確認/.test(bodyText) && /9月13日/.test(bodyText), 'admin home: stale published data is flagged');
  ok(await page.locator('.stat').count() === 4, 'admin home: four summary cards');

  await page.click('a[data-view-link="schedule"] >> visible=true');
  await page.waitForSelector('#view-schedule:not([hidden]) .event-card');
  ok(await page.locator('.field-source:visible').count() === 0, 'admin: no 手動編集 marks while nothing was changed');
  const before = await page.locator('.event-card').count();

  // Editing an automatic value shows 手動編集 and can be restored.
  await page.locator('.event-card[data-index="0"] .item-actions > .button').click();
  await page.fill('#field-events-events-0-title', 'フリーロール（手動）');
  ok(await page.locator('#drawer .field-source:visible').count() === 1, 'admin: 手動編集 appears on the changed field only');
  await page.locator('#drawer .field-source:visible .text-button').click();
  ok(await page.inputValue('#field-events-events-0-title') === 'フリーロールトーナメント', 'admin: 自動の値に戻す restores the automatic value');
  await page.click('#close-drawer');

  // A new event cannot be published with the placeholder text.
  await page.getByText('＋ イベントを追加').click();
  await page.getByRole('button', { name: 'EVENT', exact: true }).click();
  const index = before;
  await page.waitForSelector('#drawer[open]');
  await page.fill(`#field-events-events-${index}-time`, '20:30');
  await page.fill(`#field-events-events-${index}-description`, '詳細を入力してください。');
  await page.fill(`#field-events-events-${index}-new-参加費`, '¥3,000');
  ok(await page.inputValue(`#field-events-events-${index}-facts-0-value`) === '¥3,000', 'admin: 参加費 field creates a detail row');
  await page.click('#close-drawer');
  await page.click('#prepare-publish');
  ok(!(await page.locator('#export-dialog').evaluate((dialog) => dialog.open)), 'admin: placeholder text blocked export');
  ok(await page.locator('#drawer').evaluate((dialog) => dialog.open), 'admin: blocked export opens the item that needs fixing');
  ok(/仮の文言/.test(await page.locator(`#field-events-events-${index}-description-error`).textContent()), 'admin: placeholder error message shown');

  await page.fill(`#field-events-events-${index}-title`, 'ナイトトーナメント');
  await page.fill(`#field-events-events-${index}-description`, '20時半スタートです。');
  await page.click('#close-drawer');
  await page.locator('.event-card[data-index="0"] details.menu summary').click();
  await page.getByRole('button', { name: 'サイトで非表示' }).click();
  ok(await page.locator('.event-card[data-index="0"]').evaluate((card) => card.classList.contains('is-hidden')), 'admin: hidden event is marked in the list');
  await page.click('#prepare-publish');
  await page.waitForSelector('#export-dialog[open]');
  const exported = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#export-files textarea')].map((area) => [area.id, area.value])));
  const finalEvents = JSON.parse(exported['export-events']);
  const manual = JSON.parse(exported['export-events-manual']);
  const auto = JSON.parse(fs.readFileSync(path.join(root, 'data/events.auto.json'), 'utf8'));
  const expected = JSON.stringify(mergeSchedule(auto, manual), null, 2) + '\n';
  ok(exported['export-events'] === expected, 'admin: events.json differs from merge-events result');
  ok(!finalEvents.events.some((event) => event.hidden !== undefined), 'admin: hidden flag leaked into events.json');
  ok(!finalEvents.events.some((event) => event.id === auto.events[0].id), 'admin: hidden auto event still published');
  ok(manual.events[auto.events[0].id]?.hidden === true, 'admin: hidden override missing in manual');
  ok(finalEvents.events.some((event) => event.title === 'ナイトトーナメント' && event.facts.some((fact) => fact.value === '¥3,000')), 'admin: added event missing');
  ok(!exported['export-events'].includes('詳細を入力してください'), 'admin: placeholder exported');
  ok(/まだ公開されていません/.test(await page.locator('#publish-summary').innerText()), 'admin: dialog says nothing is published yet');
  ok(!(await page.locator('#export-details').evaluate((details) => details.open)), 'admin: JSON stays folded away by default');
  ok(!errors.length, 'admin: console errors ' + errors.join(' | '));
  await context.close();
}

// --- admin layout at each width ------------------------------------------------------------
for (const width of [320, 375, 390, 768, 1024, 1440]) {
  for (const view of ['home', 'schedule', 'news', 'settings']) {
    const { page, context, errors } = await openPage({ width, url: '/admin/#' + view, time: jst('18:00') });
    await page.waitForSelector('#editor-form:not([hidden])', { timeout: 20000 });
    if (view === 'schedule') {
      await page.locator('.event-card .item-actions > .button').first().click();
      await page.locator('#drawer .advanced summary').click();
    }
    const report = await page.evaluate(() => {
      const small = [];
      document.querySelectorAll('button, a, summary, input, select, textarea').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (!rect.width || el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden' || ['checkbox', 'radio'].includes(el.type) || el.classList.contains('skip-link')) return;
        if (el.closest('dialog') && !el.closest('dialog').open) return;
        if (document.querySelector('dialog[open]') && !el.closest('dialog[open]')) return;
        if (Math.min(rect.width, rect.height) < 44) small.push((el.id || el.textContent.trim().slice(0, 12) || el.tagName) + ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
      });
      return { overflow: document.documentElement.scrollWidth - window.innerWidth, small };
    });
    ok(report.overflow <= 0, 'admin ' + view + ' ' + width + 'px: horizontal overflow ' + report.overflow);
    ok(!report.small.length, 'admin ' + view + ' ' + width + 'px: small targets ' + report.small.join(', '));
    ok(!errors.length, 'admin ' + view + ' ' + width + 'px: console errors ' + errors.join(' | '));
    if (shotDir) await page.screenshot({ path: path.join(shotDir, 'admin-' + view + '-' + width + '.png') });
    await context.close();
  }
}

await browser.close();
server.close();
if (problems.length) {
  console.error(problems.length + ' browser check(s) failed:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('browser tests passed (' + checks + ' checks)');
