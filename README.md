# ちょんまげ网站文件

来自 Sites 网站 chonmage-niigata 的已保存版本。
源提交：9f693705fe038babce964a9c05b364405fbdb1df
导出日期：2026-09-30

## 手动上传到 GitHub

1. 下载 chonmage-website.zip 并解压。
2. 打开 https://github.com/anana1111/chonmage-website 。
3. 有文件时选择 Add file → Upload files；空仓库点击 uploading an existing file。
4. 上传解压后的文件。index.html、styles.css、v2.css、script.js 和图片应放在仓库根目录。
   在电脑浏览器里可以把解压目录内的所有文件和 .openai 文件夹拖入上传区域。
   不要把整个 ZIP 当作网站上传，也不要额外套一层 chonmage-website 文件夹。
5. 提交说明可填 Add chonmage website files，按页面按钮提交保存。

在手机或 iPad 上，选择文件时可先上传全部可见文件。
.openai/hosting.json 是继续使用 Sites 的配置，不影响普通网页显示。
若文件选择器隐藏了 .openai 文件夹，可在 GitHub 使用 Add file → Create new file，
文件名填 .openai/hosting.json，再粘贴下面内容并保存：

```json
{
  "project_id": "appgprj_6aa630c2edb081918d56fc52f82f2730",
  "static": {
    "directory": "."
  }
}
```

## 文件说明

- index.html：页面内容和链接。
- styles.css：基础样式。
- v2.css：页面版本的附加样式。
- script.js：滚动动效和图片横向拖动。
- JPG / WebP：成功下载的网站图片；页面已改为引用这些本地文件。
- image-sources.json：图片原始网址及下载结果。
- .openai/hosting.json：原网站的 Sites 项目配置。

为了方便手动上传，原 dist 目录的网页文件已移到导出包根目录；配置中的目录随之改为「.」。
这是单纯的静态网站，不需要 npm 安装或构建。可在电脑浏览器中打开 index.html 预览，
也可在当前文件夹运行 python3 -m http.server 8000，然后访问 http://localhost:8000 。

Google 字体和 X / Google Maps 跳转仍需要网络。
网页文案、X 账号和活动日期沿用该网站的已保存版本；此包没有更新营业信息或高清图片。
上传文件到 GitHub 是保存代码，不会自动发布或同步回 Sites。

GitHub 官方上传说明：
https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
