# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Run the full pipeline locally: `node index.js` (requires `.env` with all secrets below and `ffmpeg` installed).
- Force a run even if it's a weekend/holiday or today's Notion page already exists: `FORCE_RUN=true node index.js` (bypasses **both** the weekday-only guard and the "already ran today" skip).
- Install deps: `npm ci`.
- No test suite, linter, or build step is configured. `npm test` is a placeholder that exits 1.
- `dry-run.js` is **stale and broken** (still `require`s the deleted `./src/gemini`). Ignore or repoint it before use.

The same entry point runs in CI via `.github/workflows/daily-radio.yml` (cron `0 21 * * 0-4` = **JST weekday mornings 06:00**, plus `workflow_dispatch`). CI installs `ffmpeg` via apt, sets `TZ=Asia/Tokyo`, and has `timeout-minutes: 60`.

### Required environment variables

`ANTHROPIC_API_KEY` (script generation), `GEMINI_API_KEY` (TTS), `NOTION_API_KEY`, `NOTION_DATABASE_ID`, `CF_ACCOUNT_ID`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `CF_BUCKET_NAME`, `CF_PUBLIC_URL`.

Optional overrides: `FORCE_RUN=true`, `ANTHROPIC_WRITER_MODEL` (default `claude-opus-4-8`), `ANTHROPIC_AUX_MODEL` (default `claude-haiku-4-5`), `GEMINI_TTS_MODEL` (default `gemini-2.5-flash-preview-tts`).

- **`GEMINI_API_KEY` is an AI Studio key** used to call the Gemini-TTS **`generativelanguage.googleapis.com`** REST endpoint directly — NOT the Vertex AI path (Vertex rejects API keys) and NOT the `@google/generative-ai` SDK.
- **Vestigial**: `OPENAI_API_KEY` / `OPENAI_TTS_MODEL` and the `openai` + `@google/generative-ai` packages are no longer used by the code (TTS moved OpenAI→Gemini; script moved Gemini→Claude). The workflow still passes `OPENAI_API_KEY` harmlessly.
- `index.js` deletes `http_proxy` / `https_proxy` / `HTTP_PROXY` / `HTTPS_PROXY` at startup.

## Architecture

Single-shot Node.js script (no server, no persistent state) that runs the daily radio pipeline end-to-end. `index.js` orchestrates the stages; each `src/*.js` module is one stage. Cross-day state (which articles were used, whether today ran) lives in **Notion**, queried at startup — there is no local database.

The program is a **two-host dialogue radio show**. The script is written as alternating `話者名: セリフ` lines, and the audio stage re-reads those speaker labels to pick a voice per line. This contract between `script.js` and `audio.js` is the single most important invariant.

### Daily variation (`src/variant.js`)

`getDailyVariant(jstDateStr)` deterministically (date-seeded, so a given day is fixed/reproducible) picks **today's mood** (7 presets) and **voices** (female pool for ミナ, male pool for リク, from the Gemini/Chirp star-name voices). Each mood carries a `style` (TTS delivery/acting) and a `tone` (how the script is written). The variant is computed once in `index.js` and threaded into `script.js` (tone), `audio.js` (voice + style), and `notion.js` (recorded on the page). This is what makes each day sound different.

### Startup guards (`index.js`)

`index.js` computes the JST date, then — unless `FORCE_RUN=true`:
1. **Weekday-only skip**: if today (JST) is Saturday, Sunday, or a Japanese public holiday (`@holiday-jp/holiday_jp`), it exits early. (Weekends are also excluded at the cron level; the code guard covers holidays + manual dispatch + cron-delay edge cases.)
2. **Dedup skip**: if a Notion page `【Radio】YYYY-MM-DD` already exists, it exits.

It then fetches `fetchRecentArticleURLs` (URLs used in the last 14 days) and passes them as an exclusion set. **On any thrown error, `main` sets `process.exitCode = 1`** so the CI job goes red (a notification fires) instead of silently succeeding.

### Pipeline (`index.js` → `src/`)

1. **`rss.js` — fetchNews**: one `{name, selectionHint, priority?, items}` per axis. `items` is `{site, title, link, snippet, isoDate, ageDays}` (max 5/feed), **sorted newest-first** so stale feed ordering can't bury fresh news. `rss-parser` has a 15s timeout. Per-feed failures degrade to `[]`.
2. **`script.js` — generateScript(axes, apiKey, excludedUrls, variant)**: four-phase Claude call (Anthropic SDK, `maxRetries:3`, `timeout:180s`). Every phase obeys `DIALOGUE_RULES` (speaker-labelled lines only) because `audio.js` parses it. The day's `variant.mood.tone` is injected into the writing prompts.
   - **Phase 0 (aux)** opening from live weather (`weather.js`) + "on this day" (`onThisDay.js`).
   - **Phase 1 (aux, parallel per axis)** selects 1 article as JSON. The list shows each item's **age (「◯日前」)**. If an axis has `priority: {keyword, maxAgeDays}` (currently ServiceNow / 7 days), a **code-side freshness gate** runs: if a matching article ≤`maxAgeDays` old AND not in `excludedUrls` exists, candidates are restricted to those (keyword wins); otherwise keyword items are removed so a general article is picked. Combined with the 14-day dedup, this means "feature ServiceNow only when it's fresh AND not recently used." A parse failure throws.
   - **Phase 2 (writer, sequential)** writes a 1200–1600 char dialogue per axis.
   - Fixed ending, then **Phase 3 (aux)** extracts tags + takeaway via `---TAGS_START---`/`---TAKEAWAY_START---` delimiters.
   - Returns `{script, tags, takeaway, linksRaw}`.
3. **`hosts.js` — HOST_A / HOST_B** (ミナ / リク): `name`, `persona`, `ttsInstructions`. **Shared by `script.js` and `audio.js`** (changing a `name` changes both what's written and what the parser matches). Note the `voice` field is now legacy/unused — actual voices come from `variant`.
4. **`audio.js` — generateAudio(script, GEMINI_API_KEY, dir, variant, dateStr)**: `parseDialogue` splits by `^(ミナ|リク)\s*[:：]`. Each segment is synthesized with **Gemini-TTS** (`generativelanguage` API), using `variant.voiceA/voiceB` and a style prompt of `host.ttsInstructions + variant.mood.style`. Guards: a "you are a read-aloud machine, do not reply" prompt wrap (Gemini otherwise 400s on short exclamations), up to 3 retries, and a 120s fetch timeout. Gemini returns 24kHz/16-bit PCM; all segments are concatenated then **encoded to MP3 once via ffmpeg**, saved to `output/radio_YYYY-MM-DD.mp3` (JST), mixed with BGM, and uploaded via `r2.js`.
5. **`bgm.js` — mixBGM(speechPath, seed)**: picks one track by date seed from a **pool** = `assets/bgm/*.mp3` **plus** the legacy `assets/bgm.mp3` (anchor); falls back to the anchor if the pool is empty. ffmpeg loops it under the speech at volume 0.12 with `amix duration=first` and **`-map "[mix]"` (audio-only output — prevents an embedded cover-art image from being looped forever by `-stream_loop`)**. Pool tracks are pre-normalized (`-vn` + `loudnorm`) at ingestion; sources/licenses in `assets/bgm/CREDITS.md` (all CC0). Skips silently if no track or ffmpeg fails.
6. **`r2.js`**: Cloudflare R2 via the AWS S3 SDK. `uploadToR2`, `downloadExistingRSS` (null on 404), `uploadRSSToR2`.
7. **`rss_generator.js` — generateRSS**: rebuilds `podcast.xml` each run, preserving up to 29 prior `<item>`s. `durationSec` is always 0.
8. **`notion.js` — saveToNotion**: one page per run. Adds a **mood/voice callout** at the top (from `variant`), the takeaway, the link list, and the script split into ≤1800-char chunks. Uses the **data-sources API** (`getPrimaryDataSourceId` → `dataSources.query`).

### Cross-cutting notes

- **News axes live in `src/axes.js`** (`RSS_AXES`, 5 groups). Each is `{name, urls, selectionHint?, priority?}`. `priority: {keyword, maxAgeDays}` drives the code-side freshness gate (see Phase 1). The low-value ServiceNow community-announcement feed was removed. The hardcoded ending in `script.js` says "5つのコーナー".
- **Failure philosophy (deliberately mixed)**: peripheral enrichment (weather, on-this-day, individual RSS feeds, BGM, the exclusion set) degrades silently; anything that would ship a broken episode (article selection, TTS, R2, Notion) throws → `process.exitCode=1` → red job → notification. Preserve this split.
- **No-hang discipline**: every network call has a timeout — weather 15s, onThisDay 20s, rss-parser 15s, Gemini TTS 120s (per attempt, with retry), Anthropic SDK 180s — plus a job-level `timeout-minutes: 60`. When adding a `fetch`, give it an `AbortSignal.timeout`.
- **Schedule**: JST weekday mornings only. Cron `0 21 * * 0-4` (UTC Sun–Thu 21:00 = JST Mon–Fri 06:00) excludes weekends; the `index.js` guard additionally skips Japanese holidays. `workflow_dispatch` runs anytime (holiday guard still applies unless `FORCE_RUN`).
- **Ordering**: Notion save happens after R2 upload; RSS `existingXML` is fetched before the new audio upload, then the whole feed is re-uploaded as `podcast.xml`.
- **Date handling**: JST is UTC+9h (`audio.js`, `rss_generator.js`, `onThisDay.js`, `index.js`). Notion's page title relies on `TZ=Asia/Tokyo` (set in CI). Keep the offset consistent.
- **`output/` is local-only scratch**; R2 is the source of truth for distribution.
