# NOW SHUFFLING 预加载动画（2026-10-10 前的线上版本）

换成 KING 卡片预加载之前，网站一直用的就是这个动画：椅子人物摇晃，POKER ROOM / CHONMAGE 文字和进度条，最后翻花色牌幕。

- `head.html`：原来放在 `index.html` 的 `</head>` 前面那段（is-loading 样式、noscript、跳过判断脚本）。
- `body.html`：原来紧跟在 `<body>` 后面那段（`#preloader`、`.preloader-cards` 和动画脚本），到 `<div class="noise">` 之前为止。
- 用到的图片 `images/preloader-figure.webp` 还留在仓库里，没有删。

## 换回来

1. 在 `index.html` 里删掉 KING 预加载：`<head>` 里 `Opening preloader (KING card)` 那段到 `</head>` 前，和 `<body>` 里 `#king-preloader` 到 `king-preloader.js` 的 script 为止。
2. 把 `head.html` 原样贴回 `</head>` 前面，把 `body.html` 原样贴回 `<body>` 后面。
3. `king-preloader.js` 和 `images/king/` 可以留着，以后再换回 KING 时直接用。

原始版本也能在 git 里找到：提交 3ffb2d3 的 `index.html`。
