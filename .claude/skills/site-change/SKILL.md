---
name: site-change
description: 改 chonmagepoker.com 网站时用：新增或修改页面、CSS、页脚、文案，以及提交、推送、开 PR、合并之前。
---

# 改网站并上线

这是纯静态的 GitHub Pages 网站，`main` 一更新就会自动发布。每天还有 Actions 机器人往 `main` 推送营业信息和 NEWS，所以本地的 `main` 经常落后。

## 1. 开分支

```sh
git fetch origin main
git checkout -b claude/<主题> origin/main
```

完成标准：新分支基于最新的 `origin/main`。

## 2. 按改动类型照做

只看跟这次改动有关的小节。

### 新增公开页面

- 以 `rules/index.html` 为模板：复制它的 `<head>`（canonical、og、JSON-LD 的 Article 和 BreadcrumbList）、`body.news-page` 的页头、以及页尾的 `news-page-end`（含 `Designed & Developed by ANNA`）。GA4 不要手写，交给第 3 步的脚本补。
- 把新地址加进 `scripts/generate-news-pages.mjs` 里 `sitemapXml()` 的固定列表，然后运行 `node scripts/generate-news-pages.mjs`。**只改 `sitemap.xml` 没用**：每天的自动更新会用这个脚本重新生成它，手改的内容会被覆盖。
- 想想从哪里链到它：首页、`/beginner/`、`/rules/` 或页脚。

### 修改现有文章页

- 把页面 JSON-LD 里的 `dateModified` 改成今天。

### 修改 CSS 源文件（`styles.css`、`v2.css`、`news.css`、`king.css` 等）

- 运行 `node scripts/build-home-css.mjs`，首页用的 `home.css` 会重新生成，`index.html` 里的 `?v=` 也会一起更新。
- 其他页面直接引用源文件，后面带 `?v=版本号`。改了哪个文件，就给它换一个新版本号，所有页面都要换，`scripts/generate-news-pages.mjs` 的模板里也要换，然后运行一次生成脚本。否则客人的手机可能还在用缓存里的旧样式。用 `grep -rn "styles.css?v=" --include=*.html .` 可以找出所有引用。

### 修改所有页面共用的页脚（`news-page-end`）

- 静态页面要逐个改；NEWS 详情页的页脚来自 `scripts/generate-news-pages.mjs` 里的模板，改模板之后运行这个脚本。

### 不要手改的文件

这些都是脚本生成的，要改就去改它们的来源：

| 文件 | 来源 |
| --- | --- |
| `home.css` | `scripts/build-home-css.mjs` |
| `news/x-*/index.html`、`sitemap.xml` | `scripts/generate-news-pages.mjs` |
| `schedule/index.html` | `scripts/generate-schedule-page.mjs`（数据来自 `data/week.json`、`data/events.json`，每天由 Actions 重新生成） |
| `data/events.json` | `scripts/merge-events.mjs`（手动修改写进 `data/events.manual.json`） |

## 3. 检查

全部通过才算完成：

```sh
node scripts/ensure-ga4.mjs && node scripts/ensure-ga4.mjs --check   # 结果必须是 missing 0
node scripts/build-home-css.mjs --check                              # 改过 CSS 源文件时
```

- 动了营业信息、NEWS 或时间轴的逻辑时，跑 `README.md` 里对应的测试。
- 看画面：用 `python3 -m http.server 8765` 启动本地预览，再用 Playwright 在 400px 宽度下给改动的部分截图。亲眼看过截图，并确认 `document.documentElement.scrollWidth` 等于 400（没有横向滚动）。

## 4. 提交和开 PR

- 提交信息用英文，格式跟历史记录一致：`区域: 改了什么`，例如 `rules: show hand rankings as playing cards`。
- 推送前再 `git fetch origin main && git rebase origin/main`，机器人可能刚推过新提交。然后 `git push -u origin <分支>`。
- 用 REST API 开 PR（Claude 会话里 `gh pr create` 走的 GraphQL 会被拦截）：

```sh
gh api repos/anana1111/chonmage-website/pulls \
  -f base=main -f head=<分支> -f title="<日文标题>" -f body="<改了什么、跑了哪些检查>" --jq .html_url
```

完成标准：拿到 PR 链接，并告诉用户改了什么。

## 5. 合并

只有用户说合并才合并：

```sh
gh api -X PUT repos/anana1111/chonmage-website/pulls/<编号>/merge -f merge_method=merge
git checkout main && git fetch origin main && git reset --hard origin/main && git branch -D <分支>
```

完成标准：本地 `main` 和 `origin/main` 一致，工作分支已删除。GitHub Pages 一两分钟后自动上线。
