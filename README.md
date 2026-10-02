# ちょんまげ 网站（POKER ROOM CHONMAGE）

新潟・古町的扑克室「ちょんまげ」的官网。纯静态网站，无需 npm 安装或构建，直接由 GitHub Pages 提供。

## 部署

- 公开站点由 GitHub Pages 从 `main` 分支的仓库根目录提供（Pages 的设置在仓库 Settings → Pages 里确认）。
- 推送到 `main` 后，Pages 会自动重新发布；`data/*.json` 的变更也一样。
- `hosting.json` 是旧 Sites 项目的配置，网页本身不读取它。

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
| `admin/` | 管理画面（编辑 TODAY / NEWS，生成公开用 JSON） |
| `data/` | 公开数据：`events.json`、`news.json`，以及 `events.auto.json`、`events.manual.json` |
| `scripts/` | 抓取、合并、校验脚本和测试（Node 22，无依赖） |
| `images/` | 网站使用的 WebP 图片（1448px / 800px 两种尺寸）和 PNG 原图 |
| `image-sources.json` | 图片清单：PNG 原图与对应的 WebP 发布文件 |

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
node scripts/test-schedule.mjs          # 数据校验、合并、抓取模拟（Actions 也会运行）
node scripts/validate-events.mjs data/events.json data/events.auto.json data/news.json
node scripts/test-browser.mjs [截图目录]  # 浏览器测试（需要本地安装 Playwright；Actions 不运行）
```

浏览器测试覆盖：固定日本时间下的 NOW / NEXT / 本日終了 / 休業 / 跨午夜、无 JS 时的安全 fallback、前台与 Node 校验规则一致性、320–1440px 布局（横向溢出、标题孤字、触控区域）、图片清晰度、Admin 导出与 merge 一致性、Admin 在 320–1440px 的布局与触控区域，以及 console error。

## 图片

`images/*.png` 是原图，网页只引用 WebP（`srcset`：800w / 1448w）。替换图片时请同时更新 WebP 和 `image-sources.json`。
