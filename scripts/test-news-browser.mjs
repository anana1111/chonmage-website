// Real browser checks for NEWS and the existing static editor. No live X required.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import '../news-core.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const core = globalThis.ChonmageNews;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = process.argv[2];
const clock = Date.parse('2026-10-03T13:00:00+09:00');
const record = (id, extra = {}) => ({ id, title: 'お知らせ ' + id, publishedAt: '2026-10-03T12:00:00+09:00', content: '日本語の本文。\n中文内容。\nEnglish content.', source: 'manual', published: true, ...extra });
const data = { items: [
  record('manual', { title: '10月イベントのお知らせ', publishedAt: '2026-10-03T12:59:00+09:00', sourceUrl: 'https://x.com/ChonmageNiigata/status/1' }),
  record('x', { publishedAt: '2026-10-03T12:58:00+09:00', source: 'x', sourceUrl: 'https://x.com/ChonmageNiigata/status/2', image: 'images/interior-wide.webp' }),
  record('noimage', { publishedAt: '2026-10-03T12:57:00+09:00' }),
  record('wide', { image: 'assets/test-wide.svg' }), record('tall', { image: 'assets/test-tall.svg' }),
  record('broken', { image: 'assets/broken.svg' }),
  { date: '2026-10-02', title: '旧データ（本文なし）', id: 'legacy-minimal' },
  record('long', { title: '非常に長い日本語中文EnglishTitle'.repeat(20), content: '日文正文\n中文正文\nEnglish long body\n' + 'https://example.test/' + 'a'.repeat(2000) + '\n<img src=x onerror="window.newsInjected=1">\n<script>window.newsInjected=1</script>' }),
  record('multi', { images: ['assets/test-wide.svg', 'assets/test-tall.svg'] }),
  record('missing-x', { source: 'x', sourceUrl: '' }),
  record('expired', { title: '掲載終了のNEWS', publishedAt: core.japanDateTime(clock - core.WINDOW_MS - 1) }),
  record('boundary', { publishedAt: core.japanDateTime(clock - core.WINDOW_MS) }),
  record('future', { publishedAt: '2026-10-04T00:00:00+09:00' }),
  record('draft', { published: false }),
  record('pinned-expired', { pinned: true, publishedAt: '2026-08-01' }),
] };
const validCount = core.visibleItems(data, clock).length;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((request, response) => {
  let pathname = new URL(request.url, 'http://local').pathname;
  if (pathname.startsWith('/chonmage-website/')) pathname = pathname.slice('/chonmage-website'.length);
  if (pathname.endsWith('/assets/test-wide.svg') || pathname.endsWith('/assets/test-tall.svg')) {
    const [w, h] = pathname.includes('wide') ? [1600, 120] : [120, 1600];
    response.writeHead(200, { 'content-type': 'image/svg+xml' }).end(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#273870"/></svg>`); return;
  }
  if (pathname.endsWith('/assets/broken.svg')) { response.writeHead(200, { 'content-type': 'image/svg+xml' }).end('invalid image'); return; }
  let file = path.join(root, decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep) && file !== root) { response.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks++; }
async function open(url, width = 390, fixture = data) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.clock.setFixedTime(new Date(clock));
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 200, contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/html', body: '' }));
  await page.route(/\/data\/news\.json/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
  await page.goto(origin + url, { waitUntil: 'load' });
  if (url.includes('/admin/')) await page.waitForFunction(() => !document.getElementById('editor-form').hidden);
  else if (url.includes('/news/')) await page.waitForFunction(() => document.getElementById('news-content-view').getAttribute('aria-busy') === 'false');
  else await page.waitForFunction(() => document.querySelector('.news-grid .news-card'));
  await page.waitForFunction(() => [...document.images].filter((image) => image.loading !== 'lazy').every((image) => image.complete));
  return { page, context, errors };
}
async function layout(page, scope = 'body') {
  return page.evaluate((selector) => {
    const area = document.querySelector(selector);
    const root = document.documentElement;
    const overflow = root.scrollWidth - root.clientWidth;
    const outside = [...area.querySelectorAll('h1,h3,p,.news-body,.news-photo,.news-button')].filter((el) => {
      const box = el.getBoundingClientRect(); return box.width && (box.left < -1 || box.right > innerWidth + 1);
    }).length;
    return { overflow, outside };
  }, scope);
}
try {
  if (!process.env.NEWS_LAYOUT_ONLY) {
  for (const width of [320, 360, 375, 390, 412, 768, 1024, 1440]) {
    for (const url of ['/', '/news/', '/news/?id=long', '/news/?id=x', '/news/?id=tall']) {
      const { page, context, errors } = await open(url, width);
      const report = await layout(page, url === '/' ? '#news' : 'main');
      check(report.overflow <= 0 && report.outside === 0, width + ' ' + url + ': no overflow');
      check(errors.length === 0, width + ' ' + url + ': no JS/console error ' + errors.join(';'));
      if (url === '/') {
        check(await page.locator('#news .news-card').count() === 3, 'Homepage caps NEWS at 3');
        const hrefs = await page.locator('#news .news-card a').evaluateAll((links) => links.map((link) => link.href));
        check(hrefs.every((url) => url.includes('/news/?id=') && !url.includes('x.com')), 'Home cards link internally');
        check(await page.locator('.all-news-link').getAttribute('href') === './news/', 'All NEWS uses relative directory');
      }
      if (url === '/news/') check(await page.locator('.news-card').count() === validCount, 'Only current published NEWS rendered');
      if (url.includes('id=long')) {
        check(await page.locator('.news-body').innerText() === data.items.find((item) => item.id === 'long').content, 'Multilingual long text and line breaks preserved');
        check(await page.evaluate(() => window.newsInjected === undefined), 'External HTML stays plain text');
        check(await page.locator('.news-source').count() === 0, 'Manual NEWS never has X button');
      }
      if (url.includes('id=x')) {
        check(await page.locator('.news-source').getAttribute('href') === 'https://x.com/ChonmageNiigata/status/2', 'Original X button uses captured URL');
        check((await page.title()).includes('お知らせ x'), 'Detail title uses NEWS heading');
        check(await page.locator('time').getAttribute('datetime') === '2026-10-03T12:58:00+09:00', 'Semantic Japan publication date');
        check((await page.locator('img').getAttribute('alt')).includes('お知らせ'), 'Image has alt');
      }
      if (url.includes('id=tall')) {
        await page.locator('.news-photo').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector('.news-photo img').naturalWidth > 0);
        const ratio = await page.locator('.news-photo img').evaluate((img) => { const r = img.getBoundingClientRect(); return [r.width / r.height, img.naturalWidth / img.naturalHeight]; });
        check(Math.abs(ratio[0] - ratio[1]) < .01, 'Tall image preserves ratio');
      }
      if (shotDir && [390, 768, 1440].includes(width) && url !== '/') {
        fs.mkdirSync(shotDir, { recursive: true });
        await page.screenshot({ path: path.join(shotDir, 'news-' + width + '-' + (url.includes('id=') ? url.split('id=')[1] : 'list') + '.png'), fullPage: false });
      }
      await context.close();
    }
  }
  for (const [id, message] of [['expired', 'このニュースは掲載終了しました。'], ['pinned-expired', 'このニュースは掲載終了しました。'], ['missing', 'ニュースが見つかりませんでした。'], ['future', 'このニュースは現在公開されていません。'], ['draft', 'このニュースは現在公開されていません。']]) {
    const { page, context, errors } = await open('/news/?id=' + id);
    check((await page.locator('h1').textContent()).includes(message), 'Friendly state for ' + id);
    check(await page.locator('.news-body,.news-source').count() === 0, 'Inactive detail does not expose body or X');
    check(await page.locator('.news-backlinks a').count() === 2, 'State has NEWS and HOME links');
    check(!errors.length, 'Inactive detail has no error'); await context.close();
  }
  for (const id of ['manual', 'missing-x', 'noimage', 'legacy-minimal', 'wide', 'multi']) {
    const { page, context, errors } = await open('/news/?id=' + id);
    check(await page.locator('.news-body').count() === 1, 'Valid detail ' + id);
    if (['manual', 'missing-x'].includes(id)) check(await page.locator('.news-source').count() === 0, 'No X button for manual/missing X');
    if (id === 'multi') check(await page.locator('.news-photo').count() === 2, 'All captured photos retained');
    check(!errors.length, 'Optional fields have no error'); await context.close();
  }
  {
    const { page, context, errors } = await open('/news/?id=broken');
    await page.waitForFunction(() => document.querySelector('.news-photo').hidden);
    check(await page.locator('.news-body').isVisible(), 'Broken image leaves readable body'); check(!errors.length, 'Broken image produces no JS error'); await context.close();
  }
  {
    const { page, context } = await open('/news/?id=boundary');
    check(await page.locator('.news-body').count() === 1, 'Exactly 30 days remains visible');
    await page.clock.setFixedTime(new Date(clock + 1));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    check((await page.locator('h1').innerText()).includes('掲載終了'), 'Open detail expires after boundary'); await context.close();
  }
  {
    const { page, context } = await open('/news/', 390, { items: [] });
    check((await page.locator('.news-empty').innerText()).includes('ニュースはありません'), 'Empty document has finished empty state'); await context.close();
  }
  {
    const { page, context } = await open('/news/', 390, { items: [...data.items, null, { publishedAt: 'bad' }, { date: 'bad', title: 'bad' }] });
    check(await page.locator('.news-card').count() === validCount, 'Damaged rows skipped independently'); await context.close();
  }
  {
    const { page, context } = await open('/chonmage-website/');
    await page.locator('.all-news-link').click(); await page.waitForURL('**/chonmage-website/news/');
    await page.locator('.news-card h3 a').first().click(); await page.waitForURL('**/news/?id=*');
    await page.locator('.news-backlinks a').first().click(); await page.waitForURL('**/chonmage-website/news/');
    await page.goBack(); check(page.url().includes('?id='), 'Browser Back restores detail');
    await page.reload(); await page.waitForSelector('.news-body'); check(page.url().includes('/chonmage-website/news/'), 'Project path direct refresh works');
    await page.locator('.news-backlinks a').nth(1).click(); await page.waitForURL('**/chonmage-website/'); check(true, 'NEWS navigation returns HOME'); await context.close();
  }
  {
    const { page, context } = await open('/news/?id=x');
    const popupPromise = page.waitForEvent('popup'); await page.locator('.news-source').click(); const popup = await popupPromise; await popup.waitForURL('https://x.com/ChonmageNiigata/status/2');
    check(popup.url().startsWith('https://x.com/ChonmageNiigata/status/2'), 'X opens only on explicit source-button click'); await popup.close(); await context.close();
  }
  // Reuse the existing editor, static export and public iframe rather than a second admin.
  {
    const { page, context, errors } = await open('/admin/#news');
    check(await page.locator('#view-news .news-card').count() === data.items.length, 'Admin retains every record including expired/draft/scheduled');
    check((await page.locator('#view-news').innerText()).includes('Expired / 掲載終了'), 'Admin labels expired NEWS');
    check((await page.locator('#view-news').innerText()).includes('Scheduled / 公開予約'), 'Admin labels scheduled NEWS');
    await page.getByRole('button', { name: '＋ News を追加', exact: true }).click();
    await page.locator('#field-news-items-0-title').fill('手動作成のNEWS');
    await page.locator('#field-news-items-0-content').fill('日本語\n中文\nEnglish');
    await page.locator('#field-news-items-0-summary').fill('短い説明');
    await page.locator('#drawer .publish-control label', { hasText: '今すぐ公開' }).click();
    await page.getByRole('button', { name: '本文プレビュー', exact: true }).click();
    const frame = page.frameLocator('#news-detail-preview');
    await frame.locator('.news-body').waitFor();
    check(await frame.locator('.news-body').innerText() === '日本語\n中文\nEnglish', 'Admin uses real detail renderer for unsaved manual NEWS');
    check(await frame.locator('.news-source').count() === 0, 'Manual preview has no X button');
    await page.locator('#field-news-items-0-publishedAt').fill('2026-10-04T12:00');
    check((await page.locator('#drawer-body').innerText()).includes('Scheduled / 公開予約'), 'Admin calculates future JST status');
    await page.locator('#field-news-items-0-publishedAt').fill('2026-09-01T12:00');
    check((await page.locator('#drawer-body').innerText()).includes('Expired / 掲載終了'), 'Admin calculates expired status');
    await page.locator('#field-news-items-0-publishedAt').fill('2026-10-03T12:30');
    check((await page.locator('#drawer-body').innerText()).includes('Published / 掲載中'), 'Changing publication time republishes same record');
    await page.locator('#close-drawer').click(); await page.locator('#prepare-publish').click();
    const newsText = await page.locator('#export-files textarea').nth(2).inputValue(); const exported = JSON.parse(newsText);
    check(exported.items[0].content === '日本語\n中文\nEnglish', 'Export stores full manual body');
    check(exported.items[0].publishedAt === '2026-10-03T12:30:00+09:00', 'Export stores explicit JST');
    check(exported.items.length === data.items.length + 1, 'Export keeps expired records');
    check(newsText.endsWith('\n'), 'JSON export newline preserved');
    await page.locator('#export-dialog').evaluate((dialog) => dialog.close());
    await page.locator('#save-draft').click();
    await page.reload(); await page.locator('#draft-dialog[open]').waitFor(); await page.locator('#restore-draft').click();
    await page.waitForFunction(() => !document.getElementById('editor-form').hidden);
    check((await page.locator('#view-news').innerText()).includes('手動作成のNEWS'), 'NEWS local draft survives refresh');
    const expiredCard = page.locator('#view-news .news-card').filter({ hasText: '掲載終了のNEWS' });
    await expiredCard.locator('summary').click(); await expiredCard.getByRole('button', { name: '今すぐ再公開', exact: true }).click();
    check((await page.locator('#view-news .news-card').filter({ hasText: '掲載終了のNEWS' }).innerText()).includes('Published / 掲載中'), 'Same expired record can be republished from menu');
    await page.getByRole('button', { name: '手動作成のNEWS を編集', exact: true }).click();
    await page.getByRole('button', { name: 'コピー', exact: true }).click();
    check((await page.locator('#drawer-body').innerText()).includes('Draft / 下書き'), 'Copy creates a draft');
    await page.locator('#close-drawer').click();
    const xCard = page.locator('#view-news .news-card').filter({ has: page.locator('.item-title', { hasText: /^お知らせ x$/ }) });
    await xCard.locator('summary').click(); page.once('dialog', (dialog) => dialog.accept());
    await xCard.getByRole('button', { name: '削除', exact: true }).click();
    await page.locator('#prepare-publish').click();
    const finalNews = JSON.parse(await page.locator('#export-news').inputValue());
    check(finalNews.items.find((item) => item.id === 'expired').published === true, 'Republished record keeps original ID');
    check(finalNews.items.filter((item) => item.title === '手動作成のNEWS').length === 2, 'Copied NEWS and original both retained');
    check(finalNews.excludedSourceUrls.includes('https://x.com/ChonmageNiigata/status/2'), 'Deleted X source is excluded from automatic re-import');
    check(!errors.length, 'Admin and both preview frames have no console error ' + errors.join(';'));
    if (shotDir) { await page.locator('#export-dialog').evaluate((dialog) => dialog.close()); await page.screenshot({ path: path.join(shotDir, 'news-admin-390.png'), fullPage: false }); }
    await context.close();
  }
  }
  for (const width of [320, 768, 1440]) {
    const { page, context, errors } = await open('/admin/#news', width);
    await page.getByRole('button', { name: '10月イベントのお知らせ を編集', exact: true }).click();
    await page.locator('#drawer').evaluate((dialog) => Promise.all(dialog.getAnimations().map((animation) => animation.finished)));
    const outside = await page.locator('#drawer').evaluate((dialog) => [...dialog.querySelectorAll('input,select,textarea,button')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > innerWidth + 1); }).map((el) => ({ id: el.id, type: el.type, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })));
    if (outside.length && shotDir) await page.screenshot({ path: path.join(shotDir, 'news-drawer-overflow.png') });
    check(outside.length === 0, 'NEWS drawer fields fit ' + width + 'px: ' + JSON.stringify(outside));
    let reached = false;
    for (let step = 0; step < 30 && !reached; step += 1) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement.id.endsWith('-publishedAt')); }
    check(reached, 'Keyboard navigation reaches publication date');
    check(!errors.length, 'NEWS drawer has no console error'); await context.close();
  }
  for (const invalid of [null, { items: 'bad' }, {}]) {
    const { page, context, errors } = await open('/news/', 390, invalid);
    check((await page.locator('h1').innerText()).includes('読み込めません'), 'Malformed NEWS document has readable error');
    check(!errors.length, 'Malformed document does not cause JS error'); await context.close();
  }
  {
    const { page, context, errors } = await open('/news/', 390, { items: [] });
    await page.route(/\/data\/news\.json/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{' }));
    await page.goto(origin + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('#news .news-empty')?.textContent.includes('読み込めません'));
    check(await page.locator('.site-header').isVisible(), 'Invalid NEWS JSON leaves homepage header working');
    check(await page.locator('#today').count() === 1, 'NEWS failure leaves activities on the page');
    check(!errors.length, 'Invalid JSON is caught without JS console error'); await context.close();
  }
  console.log('NEWS browser tests passed (' + checks + ' checks)');
} finally { await browser.close(); server.close(); }
