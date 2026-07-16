# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Run the full pipeline locally: `node index.js` (requires `.env` with all secrets below and `ffmpeg` installed).
- Force a re-run even if today's Notion page already exists: `FORCE_RUN=true node index.js`.
- Install deps: `npm ci`.
- No test suite, linter, or build step is configured. `npm test` is a placeholder that exits 1.
- `dry-run.js` was meant to generate only the script (skipping audio/Notion/R2), but it is **stale and broken**: it still `require`s the deleted `./src/gemini` and passes `GEMINI_API_KEY`. Repoint it at `./src/script` + `ANTHROPIC_API_KEY` before relying on it.

The same entry point runs in CI via `.github/workflows/daily-radio.yml` (cron: daily 21:00 UTC = 06:00 JST, plus `workflow_dispatch`). CI installs `ffmpeg` via apt before running.

### Required environment variables

`ANTHROPIC_API_KEY` (script), `OPENAI_API_KEY` (TTS), `NOTION_API_KEY`, `NOTION_DATABASE_ID`, `CF_ACCOUNT_ID`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `CF_BUCKET_NAME`, `CF_PUBLIC_URL`.

Optional overrides: `FORCE_RUN=true` (bypass the "already ran today" skip check), `ANTHROPIC_WRITER_MODEL` (default `claude-opus-4-8`), `ANTHROPIC_AUX_MODEL` (default `claude-haiku-4-5`), `OPENAI_TTS_MODEL` (default `gpt-4o-mini-tts`).

`@google/generative-ai` is still in `package.json` but nothing imports it — script generation moved from Gemini to Claude. `GEMINI_API_KEY` is no longer used.

`index.js` deletes the `http_proxy` / `https_proxy` / `HTTP_PROXY` / `HTTPS_PROXY` env vars at startup — corporate proxy settings are stripped before any HTTP call.

## Architecture

This is a single-shot Node.js script (no server, no persistent state) that runs the daily radio pipeline end-to-end. `index.js` orchestrates the stages; each `src/*.js` module is one stage. State that must survive between days (which articles were already used, whether today already ran) lives in **Notion**, which is queried at startup — there is no local database.

The program is a **two-host dialogue radio show**. The script is written as alternating `話者名: セリフ` lines, and the audio stage re-reads those speaker labels to pick a voice per line. This contract between `script.js` and `audio.js` is the single most important invariant in the repo.

### Startup guard & dedup (`index.js` + `notion.js`)

Before doing any work, `index.js` calls `findTodayPage`: if a Notion page titled `【Radio】YYYY-MM-DD` already exists, the run exits early (unless `FORCE_RUN=true`). It then fetches `fetchRecentArticleURLs` (URLs used in the last 14 days, read out of the link bullets of past Notion pages) and passes them to the selection phase as an exclusion set so the same article isn't picked twice within two weeks.

### Pipeline (`index.js` → `src/`)

1. **`rss.js` — fetchNews**: Takes `RSS_AXES` and returns one `{name, selectionHint, items}` object per axis, where `items` is a structured array of `{site, title, link, snippet}` (max 5 items/feed; `snippet` is a 300-char, tag-stripped excerpt used later to keep the writing factual). Parallelized across feeds with `Promise.all`; per-feed failures are logged and degrade silently to `[]`.
2. **`script.js` — generateScript**: Four-phase Claude call using the Anthropic SDK. Every phase must obey `DIALOGUE_RULES` (speaker-labelled lines only; no stage directions, no Markdown, no placeholders, no self-introductions) because `audio.js` parses the output.
   - **Phase 0 (aux model)** writes the opening dialogue from live weather (`weather.js`, Open-Meteo, hardcoded Kawasaki coords) plus an "on this day" tidbit (`onThisDay.js`, scraped from the Japanese Wikipedia `M月D日` page). Both degrade gracefully if unavailable; the prompt forbids inventing events not present in the scraped source.
   - **Phase 1 (aux model, parallel per axis)** selects 1 article per axis as JSON `{title, url, reason}`, honoring the axis's `selectionHint` and avoiding `excludedUrls`. A parse failure here **throws** and aborts the run.
   - **Phase 2 (writer model, sequential)** writes a 1200–1600 char dialogue segment per axis (~25 min total across 5 axes).
   - A fixed two-line ending is appended, then **Phase 3 (aux model)** extracts tags + takeaway via custom `---TAGS_START---`/`---TAKEAWAY_START---` delimiters.
   - Returns `{script, tags, takeaway, linksRaw}` where `linksRaw` is `title|url\n` lines consumed by Notion.
3. **`hosts.js` — HOST_A / HOST_B**: The two personalities (ミナ / リク), each with a `name`, OpenAI TTS `voice`, `persona` (injected into the writing prompts) and `ttsInstructions` (injected into the TTS call). **Shared by `script.js` and `audio.js`** — changing a host's `name` changes both what the model writes and what the dialogue parser looks for, so they can never drift apart.
4. **`audio.js` — generateAudio**: `parseDialogue` splits the script into per-speaker segments by matching `^(ミナ|リク)\s*[:：]`; unlabelled continuation lines attach to the previous speaker, and leading unlabelled text defaults to HOST_A. Each segment is synthesized with that host's voice/instructions (segments over 4000 chars are split at `。`), the raw MP3 buffers are concatenated with no re-encode, saved to `output/radio_YYYY-MM-DD.mp3` (JST date), mixed with BGM in place, then uploaded via `r2.js`. If no segments parse out, it throws.
5. **`bgm.js` — mixBGM**: Shells out to `ffmpeg` to loop `assets/bgm.mp3` under the speech at volume 0.12 (`amix duration=first`), re-encoding with libmp3lame, and overwrites the original file. Skips silently if `assets/bgm.mp3` is missing or ffmpeg fails (audio-only fallback).
6. **`r2.js`**: Cloudflare R2 via the AWS S3 SDK (`region: "auto"`, R2 endpoint). Three functions: `uploadToR2` (audio MP3), `downloadExistingRSS` (fetches `podcast.xml`, returns `null` on `NoSuchKey`/404), `uploadRSSToR2`. Public URLs are formed as `${CF_PUBLIC_URL}/${key}`.
7. **`rss_generator.js` — generateRSS**: Builds the full `podcast.xml` from scratch each run. Preserves history by regex-extracting up to 29 `<item>...</item>` blocks from the existing XML and appending them after the new item. iTunes namespace included; `<itunes:image>` points at `${CF_PUBLIC_URL}/thumbnail.png` (must be uploaded out-of-band to R2). `durationSec` is currently always passed as 0 — duration is not computed from the actual MP3.
8. **`notion.js` — saveToNotion**: Creates one page per run in the configured database. Splits the script into ≤1800-char paragraph-aligned chunks (Notion's 2000-char per-rich-text limit). `linksRaw` lines that are not valid `http(s)://` URLs are written as plain bulleted text rather than failing the Notion API call.

### Cross-cutting notes

- **News axes live in `src/axes.js`.** `RSS_AXES` is 5 themed groups, each `{name, urls, selectionHint?}`. `selectionHint` is free-text steering injected into the Phase-1 selection prompt. To add an axis, edit this file — Phase 1 runs one selection call per axis in parallel; Phase 2 runs one writer-model call per axis sequentially, so writer cost scales linearly with axis count. Note the hardcoded ending line in `script.js` says "5つのコーナー" and won't follow an axis-count change on its own.
- **Notion uses the data-sources API (`@notionhq/client` v5).** Queries go through `getPrimaryDataSourceId` → `notion.dataSources.query({ data_source_id })`, not the legacy `databases.query`. `NOTION_DATABASE_ID` is resolved to its first data source at runtime. Keep this in mind when adding queries.
- **Ordering matters**: Notion save happens *after* R2 upload so a Notion failure does not lose the audio. RSS upload happens before Notion save for the same reason — but `existingXML` is fetched (`downloadExistingRSS`) *before* the new audio upload, then the new episode is prepended in memory and the whole feed is re-uploaded as `podcast.xml`.
- **Date handling**: Filenames and RSS pubDate strings are computed in JST by adding 9h to UTC (`audio.js`, `rss_generator.js`, `onThisDay.js`). Notion's own page title uses `new Date()` local parts (relies on `TZ=Asia/Tokyo`, set in CI). When changing date logic keep the 9h offset consistent or filenames, RSS titles, and the Notion skip check will diverge.
- **`output/` is local-only scratch**: R2 is the source of truth for distribution. The directory is recreated on each run if missing.
- **Failure philosophy is deliberately mixed**: peripheral enrichment (weather, on-this-day, individual RSS feeds, BGM, the past-URL exclusion set) degrades silently, while anything that would ship a broken episode (article selection, TTS, R2, Notion) throws. Preserve that split when adding code.
