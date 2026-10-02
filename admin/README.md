# CHONMAGE ADMIN

Open `/admin/` on the published site. The editor loads the current `data/events.json` and `data/news.json` without a cache. It does not publish changes or provide authentication.

## Drafts

Save Draft stores both editor documents in this browser's localStorage (`chonmage-admin-events-draft` and `chonmage-admin-news-draft`). Unfinished fields can be saved. On reopening, choose the saved draft or published content. Reset asks for confirmation, reloads published data and deletes local drafts. If editing continues while Reset is loading, it cancels the reset and retains those edits and saved drafts. Only changes since the last save trigger the leave-page warning.

## Preview

The iframe loads the real site with `?preview=1`. Valid edits are sent after 200ms. Invalid edits keep the last valid preview. The iframe uses the existing production validators, DOM renderers and CSS. Both sides verify origin and frame identity. Ordinary public visits never install the preview message listener.

390, 768 and 1440 controls set the actual iframe width. Full uses the available panel width. The selected date is treated as the event date by default; the alternative uses the real Japan date and the production stale state.

## Export and publication

Export validates both documents and offers readable JSON, copy and download. Downloads end with a newline. Optional blank event links, Hero short names and announcement URLs are omitted. Publish preparation also saves the draft, shows counts and opens the repository's data folder. Replace both JSON files there, commit, then verify GitHub Pages. No token, password or direct repository write is stored in this frontend. Secure one-click publication requires a separate authenticated publishing service.

The admin is `noindex,nofollow` and has no public navigation link. That is discoverability control, not access control; this static tool contains no secrets.
