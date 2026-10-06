# ちょんまげ 网站（POKER ROOM CHONMAGE）

新潟・古町的扑克室「ちょんまげ」的官网。纯静态网站，无需 npm 安装或构建，直接由 GitHub Pages 提供。

## 部署

- 公开站点由 GitHub Pages 从 `main` 分支的仓库根目录提供（Pages 的设置在仓库 Settings → Pages 里确认）。
- 推送到 `main` 后，Pages 会自动重新发布；`data/*.json` 的变更也一样。
- 正式域名是 https://chonmagepoker.com/ （`CNAME` 文件；DNS 在 Cloudflare，旧的 github.io 地址会自动跳转）。
- `_config.yml` 只用来让 Pages 不发布各处的 README（内部说明）。

本地预览：

```sh
python3 -m http.server 8000
# 打开 http://localhost:8000/ （管理画面：http://localhost:8000/admin/）
```

Google Fonts、X、Google Maps 的链接需要联网。

## 文件结构

| 路径 | 用途 |
| --- | --- |
| `index.html` | 页面内容和结构 |
| `styles.css` / `v2.css` / `timeline.css` | 基础样式 / v2 页面样式 / TODAY 时间轴与 Hero 状态样式 |
| `timeline.js` | TODAY 时间轴、NOW / NEXT / 本日終了 判定、Hero 的日期与营业状态 |
| `script.js` | 菜单、滚动动效、读取并校验 `data/*.json`、日期过期判断、预览模式 |
| `news/` / `news-core.js` / `news-view.js` / `news.css` | 站内 NEWS 列表和详情、统一 30 天规则、共享渲染与样式 |
| `publish-core.js` | 予约公开（`publishAt`）的统一判定：公开页、管理画面和 Node 共用 |
| `admin/` | 管理画面（编辑 TODAY / NEWS，生成公开用 JSON） |
| `data/` | 公开数据：`events.json`、`news.json`，以及 `events.auto.json`、`events.manual.json` |
| `scripts/` | 抓取、合并、校验脚本和测试（Node 22，无依赖） |
| `images/` | 网站使用的 WebP 图片（1448px / 800px 两种尺寸），以及分享预览图 `og-image.jpg`（1200×630） |
| `robots.txt` / `sitemap.xml` | 给搜索引擎的抓取规则和页面清单（新增公开页面时一起更新 sitemap） |
| `_originals/` | 不发布的原始素材：`images/*.png` 原图、`image-sources.json` 图片清单（PNG 原图与对应的 WebP 发布文件），以及分享预览图 `images/og-image.jpg` 的源文件 `og-image.html`（用本地预览打开后截 1200×630 的图即可重新生成。LINE 只显示中间的正方形，文字要放在中间 630×630 以内；换图后把 `index.html` 和 `news/index.html` 里 og:image 的 `?v=` 加 1） |

## 营业信息数据流

```
公式 X（best effort）──> data/events.auto.json
                               +
管理画面 / 手动修改 ──────> data/events.manual.json   （只保存与 auto 的差异）
                               │  scripts/merge-events.mjs（manual 优先）
                               v
                         data/events.json  ──> 前台 timeline.js / script.js
```

- 前台只读取 `data/events.json` 和 `data/news.json`。
- `events.json` 的日期不是日本时间的“今天”时（含 `25時CLOSE` 这类跨午夜营业到 CLOSE 为止），前台不会把它当成今天显示，而是显示“公式Xをご確認ください”。
- 没有 JavaScript 或数据读取失败时，页面同样只显示指向公式 X 的安全提示，不显示任何带日期的旧营业信息。
- 详细字段与规则见 [`data/README.md`](data/README.md)。

## 自动更新（GitHub Actions）

`.github/workflows/update-events.yml`：

- 运行时间（日本时间）：每天 09:07 / 12:07 / 13:07 / 15:07；平日 16:17–19:47 每 30 分钟；周末 11:17–13:47 每 30 分钟。也可手动运行（workflow_dispatch）。
- `main` 上 `scripts/**`、`data/events.manual.json` 或 workflow 本身有变更时也会运行。
- 步骤：测试 → 抓取公式 X → 合并 manual → 校验 → 只有数据真的变化时才 commit。
- push 前会重新同步最新的 `main` 并重新合并，因此运行期间上传的 `events.manual.json` 不会被覆盖；push 被拒时最多重试 3 次。
- 权限只有 `contents: write`。
- 抓取不到当天信息（X 返回 403/429、格式变化等）时不会清空现有数据。

## 管理画面 `/admin/`

分为 ホーム / 今日の予定 / News / 設定 四页。ホーム集中显示需要处理的事项（例如公开中的数据不是今天的）；事件用卡片列表加右侧编辑面板，常用字段在前、其余放在「詳細設定」里。“公開用ファイルを作成”只会生成并下载 `events.json`、`events.manual.json`、`news.json`，**不会自动上传**，需要在 GitHub 的 `data/` 上传并 commit 同名文件后才会公开。导出的 `events.json` 与 `scripts/merge-events.mjs` 的结果一致（同一份合并代码 `scripts/schedule-core.mjs`）。详见 [`admin/README.md`](admin/README.md)。

## 测试

```sh
node scripts/test-activity.mjs          # TODAY 优先级、截止边界、跨零点和数据适配
node scripts/test-activity-browser.mjs [截图目录] # 七个时刻、九个宽度、时钟和后台预览
node scripts/test-news.mjs              # NEWS 日期边界、兼容、抓取及去重
node scripts/test-news-browser.mjs [截图目录] # NEWS 页面和后台的浏览器验收
node scripts/test-schedule.mjs          # 数据校验、合并、抓取模拟（Actions 也会运行）
node scripts/validate-events.mjs data/events.json data/events.auto.json data/news.json
node scripts/test-browser.mjs [截图目录]  # 浏览器测试（需要本地安装 Playwright；Actions 不运行）
```

浏览器测试覆盖：固定日本时间下的 NOW / NEXT / 本日終了 / 休業 / 跨午夜、无 JS 时的安全 fallback、前台与 Node 校验规则一致性、320–1440px 布局（横向溢出、标题孤字、触控区域）、图片清晰度、Admin 导出与 merge 一致性、Admin 在 320–1440px 的布局与触控区域，以及 console error。

## 图片

`_originals/images/*.png` 是原图，网页只引用 `images/` 里的 WebP（`srcset`：800w / 1448w）。替换图片时请同时更新 WebP 和 `_originals/image-sources.json`。以 `_` 或 `.` 开头的目录不会被 GitHub Pages 发布（仓库里没有 `.nojekyll`，请不要添加）。

## TODAY 动态优先级

`activity.js` 通过 adapter 读取现有 `data/events.json`，`activity.css` 复用原有配色。TODAY 显示主要信息、其他可玩内容与下一场、以及「今日このあと」。活动详情、费用、标签、来源链接仍可展开查看，主活动不会在其他层重复出现。首页图片区的手动 Hero override 仍独立工作。

- 单场状态：upcoming → registering → last-call（最后10分钟，含10分钟整）→ running → finished。结束时间优先读取 `events[].end`，没有则为报名截止后180分钟。
- 主要信息优先级：营业开始/结束 → 最近截止的报名中比赛 → 已开始的 Ring Game → 下一场。没有可用比赛不代表关店；休业和缺信息有独立提示。不会编造次日营业时间。
- 继续使用后台「今日の予定」中的 OPEN、CLOSE、开始时间、最終受付和结束时间。报名截止读取 `facts` 的 `最終受付` / `LATE REG` / `LATE REGISTRATION`，也兼容明确的 `registrationEnd`。置きバケ联络截止不会用于报名倒计时。没有明确截止时显示「受付はXで確認」，不宣称仍可报名；此类活动没有结束时间时最多展示开始后180分钟。
- 日本时间与跨零点沿用既有营业日判断。后台的25时仍填写 `01:00`，adapter 与状态函数也支持 `25:00`；不改变现有数据或后台校验结构。缺失 CLOSE 时不推测关店时刻。
- `?now=13:55#today` 可查看当前数据文件对应营业日的指定时刻，页面明确标示测试日期和时间；此模式冻结活动时钟，不改变 NEWS 时间、不保存数据。普通 URL 仍检查真实日本日期并使用过期数据的 X 提示。
- 正常页面对齐整分钟刷新，并在返回标签页时复核。更新保留展开详情与焦点，读屏只在主要状态/活动变化时播报；0.25秒轻微动画尊重减少动态效果设置。
- `scripts/test-activity.mjs` 覆盖纯逻辑，浏览器测试使用明确的报名截止测试数据。仓库真实业务数据不会被测试样例覆盖。可通过 `BROWSER_CHANNEL=chrome` 使用已安装的 Chrome。

## 站内 NEWS

- 首页 NEWS 卡片进入 `news/?id=<id>`；`news/` 是真实目录，可直接打开和刷新，支持 GitHub Pages 的仓库路径前缀。
- 数据仍是 `data/news.json` 的 `items`。`news-core.js` 在首页、列表、详情、后台和 Node 中共用：`published !== false`、已到发布时间、经过时间不超过 30 × 24 小时。30 天整仍显示，再过 1 毫秒为 Expired。时间含明确 JST 偏移；旧 `date` 按日本零点兼容。
- 首页最多 3 条；列表按置顶优先、发布时间倒序。置顶同样过期。后台保留所有历史。前台在发布时间和过期边界更新，也在返回标签页时复核。
- 管理画面 News 可手动创建、编辑正文/图片/摘要/JST 时间、发布或下架、预览、复制、重新发布、删除。公开仍需导出并上传 JSON；本地保存不会直接修改 GitHub。
- 同一次免费 X 抓取可从有明确投稿边界的 syndication/RSS 保存全文、图片 URL、原始链接与发布时间。松散 profile HTML/Jina Reader 仍用于原有活动解析，不把可能混入相邻帖子的窗口当成 NEWS 正文；尝试原有 RSS fallback 补充 NEWS。
- `sync-news.mjs` 使用规范化 X URL 去重。编辑过的 NEWS 设 `autoUpdate: false`，避免自动覆盖；删除来源进入 `excludedSourceUrls`，避免重新抓取后恢复。失败、源帖子删除、30 天到期都不会清空历史。图片为来源 URL；源图片失效时隐藏该图片，正文仍保留。
- 旧 NEWS 保留已有描述作为正文；未抓到的原帖全文不做补写。站内正文只使用 `textContent`，不解析外部 HTML。无图片、坏图、坏数据或不存在/过期 ID 都有可读状态。
- NEWS 的期限不参与 `events.*`、Hero、Tournament、Ring 或营业时间判断。新功能没有 npm 生产依赖、服务器或数据库。
