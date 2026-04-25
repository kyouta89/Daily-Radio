# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Run the full pipeline locally: `node index.js` (requires `.env` with all secrets below and `ffmpeg` installed).
- Install deps: `npm ci`.
- No test suite, linter, or build step is configured. `npm test` is a placeholder that exits 1.

The same entry point runs in CI via `.github/workflows/daily-radio.yml` (cron: daily 21:00 UTC = 06:00 JST, plus `workflow_dispatch`). CI installs `ffmpeg` via apt before running.

### Required environment variables

`GEMINI_API_KEY`, `OPENAI_API_KEY`, `NOTION_API_KEY`, `NOTION_DATABASE_ID`, `CF_ACCOUNT_ID`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `CF_BUCKET_NAME`, `CF_PUBLIC_URL`.

`index.js` deletes all `*_proxy` env vars at startup — corporate proxy settings will be stripped before any HTTP call.

## Architecture

This is a single-shot Node.js script (no server, no persistent state) that runs the daily radio pipeline end-to-end. `index.js` orchestrates six stages; each `src/*.js` module is one stage and is invoked exactly once per run.

Pipeline (`index.js` → `src/`):

1. **`rss.js` — fetchNews**: Pulls items from `RSS_AXES` (5 themed groups of feeds, defined inline in `index.js`). Returns one concatenated string per axis, NOT structured items. Parallelized across feeds with `Promise.all`; per-feed failures are logged and degrade silently to `[]`.
2. **`gemini.js` — generateScript**: Three-phase Gemini call. Phase 0 (Flash) writes the opening using live weather from `weather.js` (Open-Meteo, hardcoded Kawasaki coords). Phase 1 (Flash, parallel per axis) selects 1 article per axis as JSON `{title, url, reason}`. Phase 2 (Pro, sequential) writes a 1000–1500 char segment per axis. Phase 3 (Flash) extracts tags + takeaway via custom `---TAGS_START---`/`---TAKEAWAY_START---` delimiters. Returns `{script, tags, takeaway, linksRaw}` where `linksRaw` is `title|url\n` lines consumed by Notion.
3. **`audio.js` — generateAudio**: Splits the script into ≤4000-char paragraph-aligned chunks, calls OpenAI `tts-1-hd` (voice `nova`, speed 1.1) per chunk, concatenates the raw MP3 buffers (no re-encode), saves to `output/radio_YYYY-MM-DD.mp3` (JST date), then calls `bgm.js` to mix in BGM in place, then uploads via `r2.js`.
4. **`bgm.js` — mixBGM**: Shells out to `ffmpeg` to loop `assets/bgm.mp3` under the speech at volume 0.12, `amix duration=first`. Overwrites the original file. Skips silently if `assets/bgm.mp3` is missing or ffmpeg fails (audio-only fallback).
5. **`r2.js`**: Cloudflare R2 via the AWS S3 SDK (`region: "auto"`, R2 endpoint). Three functions: `uploadToR2` (audio MP3), `downloadExistingRSS` (fetches `podcast.xml`, returns `null` on `NoSuchKey`/404), `uploadRSSToR2`. Public URLs are formed as `${CF_PUBLIC_URL}/${key}`.
6. **`rss_generator.js` — generateRSS**: Builds the full `podcast.xml` from scratch each run. Preserves history by regex-extracting up to 29 `<item>...</item>` blocks from the existing XML and appending them after the new item. iTunes namespace included; `<itunes:image>` points at `${CF_PUBLIC_URL}/thumbnail.png` (must be uploaded out-of-band to R2). `durationSec` is currently always passed as 0 — duration is not computed from the actual MP3.
7. **`notion.js` — saveToNotion**: Creates one page per run in the configured database. Splits the script into ≤1800-char paragraph-aligned chunks (Notion's 2000-char per-rich-text limit). `linksRaw` lines that are not valid `http(s)://` URLs are written as plain bulleted text rather than failing the Notion API call.

### Cross-cutting notes

- **Ordering matters**: Notion save happens *after* R2 upload so a Notion failure does not lose the audio. RSS upload must happen before Notion save for the same reason — but currently `existingXML` is fetched before the new audio upload, so the new episode is added to the in-memory feed and re-uploaded as `podcast.xml`.
- **Date handling**: Filenames and RSS pubDate strings are computed in JST by adding 9h to UTC (`audio.js`, `rss_generator.js`). When changing date logic, keep this offset consistent across both files or filenames and RSS `<title>` will diverge.
- **Adding a news axis**: Edit `RSS_AXES` in `index.js`. Phase 1 of `gemini.js` runs one selection call per axis in parallel; Phase 2 runs one writing call per axis sequentially — total Gemini Pro calls scale linearly with axis count.
- **`output/` is local-only scratch**: R2 is the source of truth for distribution. The directory is recreated on each run if missing.
