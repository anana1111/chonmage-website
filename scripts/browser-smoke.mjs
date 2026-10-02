import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:8125';
const widths = [320, 375, 390, 430, 620, 768, 1024, 1440];

function jstDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const o = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return o.year + '-' + o.month + '-' + o.day;
}

function time(h, m) {
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function dynamicSchedule() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const o = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  let now = Number(o.hour) * 60 + Number(o.minute);
  now = Math.max(180, Math.min(1200, now));
  const t = (offset) => {
    const v = Math.max(0, Math.min(1439, now + offset));
    return time(Math.floor(v / 60), v % 60);
  };
  return {
    version: 2,
    date: jstDate(),
    open: t(-150),
    close: t(210),
    status: 'open',
    latestXUrl: 'https://x.com/ChonmageNiigata',
    schedulePostUrl: 'https://x.com/ChonmageNiigata',
    summary: ['QA schedule', '当日の変更は公式Xでお知らせします。'],
    source: { type: 'x', url: 'https://x.com/ChonmageNiigata', mode: 'qa' },
    ringGame: { enabled: true, start: t(-150), title: 'RING GAME', description: 'OPENから参加者募集中' },
    events: [
      { id: 'next', time: t(60), type: 'tournament', title: 'NEXT TOURNAMENT', heroTitle: 'NEXT', theme: 'orange', description: 'next', facts: [{ label: 'ENTRY', value: '¥2,500' }], tags: [] },
      { id: 'past', time: t(-60), type: 'free', title: 'FREE ROLL', heroTitle: 'FREE', theme: 'blue', description: 'past', facts: [{ label: 'ENTRY', value: '¥0' }], tags: ['1 DRINK'] },
      { id: 'main', time: t(120), type: 'special', title: 'MAIN EVENT', heroTitle: 'MAIN', isMain: true, theme: 'orange', description: 'main', facts: [{ label: 'STARTING STACK', value: '25,000pt' }], tags: [] }
    ]
  };
}

const news = {
  items: [
    { date: jstDate(), category: 'SCHEDULE', visualLabel: 'TODAY', theme: 'schedule', title: 'QA NEWS', description: 'QA', url: 'https://x.com/ChonmageNiigata' }
  ]
};

async function noOverflow(page, width, label) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(120);
  const metrics = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    bw: document.body.scrollWidth
  }));
  assert.ok(metrics.sw <= metrics.cw + 1, label + ' html overflow @' + width + ': ' + JSON.stringify(metrics));
  assert.ok(metrics.bw <= metrics.cw + 1, label + ' body overflow @' + width + ': ' + JSON.stringify(metrics));
}

async function renderPreview(page, schedule, mode = 'actual') {
  await page.goto(base + '/?preview=1', { waitUntil: 'networkidle' });
  await page.evaluate(({ schedule, news, mode }) => {
    window.postMessage({
      type: 'CHONMAGE_PREVIEW',
      events: schedule,
      news,
      dateMode: mode,
      section: 'today',
      requestId: 91
    }, location.origin);
  }, { schedule, news, mode });
  await page.waitForSelector('.timeline-card');
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Existing stale fallback on the actual public data must remain safe.
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#today')?.classList.contains('is-stale'));
  assert.equal(await page.locator('.today-stale-message').isVisible(), true);
  assert.equal(await page.locator('.hero-event-detail:visible').count(), 0);

  // Synthetic current-day preview exercises the real renderer without changing repository data.
  const schedule = dynamicSchedule();
  await renderPreview(page, schedule, 'actual');

  const cardTypes = await page.locator('.timeline-card__type').allTextContents();
  assert.deepEqual(cardTypes.slice(0, 3), ['OPEN', 'RING GAME', 'FREE']);
  assert.ok(cardTypes.includes('MAIN'));
  assert.equal(cardTypes.at(-1), 'CLOSE');

  const statuses = await page.locator('.timeline-status').allTextContents();
  assert.ok(statuses.includes('NOW'), 'NOW badge missing');
  assert.ok(statuses.includes('NEXT'), 'NEXT badge missing');

  const heroNext = await page.locator('[data-hero-event="next"] strong').textContent();
  const heroMain = await page.locator('[data-hero-event="main"] strong').textContent();
  assert.ok(heroNext.includes('NEXT'), 'Hero NEXT not sourced from schedule');
  assert.ok(heroMain.includes('MAIN'), 'Hero MAIN not sourced from schedule');

  for (const width of widths) {
    await noOverflow(page, width, 'public live preview');
    const rail = page.locator('.timeline-rail');
    const snap = await rail.evaluate((el) => getComputedStyle(el).scrollSnapType);
    assert.ok(snap.includes('x'), 'scroll-snap missing @' + width);
    const pageWidth = await page.evaluate(() => innerWidth);
    const cardWidth = await page.locator('.timeline-card').first().evaluate((el) => el.getBoundingClientRect().width);
    assert.ok(cardWidth < pageWidth || width <= 320, 'card should not become full desktop grid @' + width);
  }

  // Mobile menu keyboard behavior.
  await page.setViewportSize({ width: 390, height: 900 });
  const menu = page.locator('.menu-button');
  if (await menu.count()) {
    await menu.click();
    assert.equal(await page.locator('#mobile-nav').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#mobile-nav').isVisible(), false);
  }

  // Arrow, dot and keyboard horizontal movement.
  await page.setViewportSize({ width: 390, height: 900 });
  const rail = page.locator('.timeline-rail');
  await rail.evaluate((el) => { el.scrollLeft = 0; });
  const nextArrow = page.locator('.timeline-arrow').nth(1);
  // arrows are hidden visually on mobile, so test desktop click.
  await page.setViewportSize({ width: 1024, height: 900 });
  await nextArrow.click();
  await page.waitForTimeout(450);
  assert.ok(await rail.evaluate((el) => el.scrollLeft > 0), 'next arrow did not scroll');
  const activeDots = await page.locator('.timeline-dot.is-active').count();
  assert.equal(activeDots, 1);
  await rail.focus();
  const before = await rail.evaluate((el) => el.scrollLeft);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(350);
  assert.ok(await rail.evaluate((el) => el.scrollLeft >= before), 'keyboard navigation regressed');

  // Admin layout, source indicators and live iframe preview.
  const admin = await context.newPage();
  await admin.goto(base + '/admin/', { waitUntil: 'networkidle' });
  await admin.waitForSelector('#editor-form:not([hidden])', { timeout: 15000 });
  await admin.waitForFunction(() => document.querySelector('#website-preview')?.contentDocument?.querySelector('.timeline-card'));
  for (const width of [320, 390, 768, 1440]) await noOverflow(admin, width, 'admin');
  assert.ok(await admin.locator('.source-badge').count() > 0, 'AUTO/MANUAL badges missing');
  assert.equal(await admin.locator('#restore-auto').isDisabled(), false);

  const beforeCount = Number(await admin.locator('#events-count').textContent());
  await admin.getByRole('button', { name: '＋ FREE ROLL' }).click();
  assert.equal(Number(await admin.locator('#events-count').textContent()), beforeCount + 1);
  assert.equal(await admin.locator('#save-state').textContent(), '未保存の変更');

  // Invalid input must block export and keep the editor usable.
  const xInput = admin.locator('[data-path="events.latestXUrl"]');
  await xInput.fill('javascript:alert(1)');
  await admin.locator('#export-json').click();
  assert.equal(await admin.locator('#export-dialog').getAttribute('open'), null);
  assert.equal(await xInput.getAttribute('aria-invalid'), 'true');

  // A failed required fetch must show an error instead of starting empty.
  const failed = await browser.newContext();
  const failedPage = await failed.newPage();
  await failedPage.route('**/data/events.json*', (route) => route.fulfill({ status: 503, body: 'nope' }));
  await failedPage.goto(base + '/admin/', { waitUntil: 'networkidle' });
  await failedPage.waitForSelector('#load-error:not([hidden])', { timeout: 15000 });
  assert.equal(await failedPage.locator('#editor-form').isVisible(), false);
  await failed.close();

  console.log('browser smoke tests passed');
  await context.close();
} finally {
  await browser.close();
}
