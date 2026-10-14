# Repository editing rules

- This is a static GitHub Pages site. Do not change the site's appearance just to add analytics.
- All public HTML pages must contain exactly one GA4 Google tag with measurement ID \`G-LW40HNQ1PL\`.
- Whenever adding or editing a public HTML page, run \`node scripts/ensure-ga4.mjs\` **before committing or pushing**, then run \`node scripts/ensure-ga4.mjs --check\`. This ensures the first GitHub Pages deployment already includes GA4.
- The script automatically discovers HTML pages at any nesting depth, excluding the internal \`admin/\` and Jekyll-unpublished \`_...\` / \`....\` directories.
- NEWS detail pages are produced by \`scripts/generate-news-pages.mjs\` with GA4 already built in. Never manually edit generated NEWS details.
- Do not duplicate an existing analytics tag. Keep preview, \`?now=\` test sessions and local copies excluded from GA4 metrics.
- GitHub Actions \`.github/workflows/ensure-ga4.yml\` checks on HTML pushes and repairs forgotten tags as a fallback. **Bot-written commits using GITHUB_TOKEN do not themselves trigger a branch-source Pages build**; therefore run the script before the initial push whenever possible.
