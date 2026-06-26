# CP-2 — Adzuna + Apify LinkedIn Jobs adapters

**Date:** 2026-06-26 · **Ticket:** `docs/proposals/contract-pipeline/CP-2-adzuna-apify-adapters.md` · **Depends on:** CP-1 (provider framework + Reed)

## Goal

Add two more contract-supply sources on top of the CP-1 provider framework: Adzuna (free UK aggregator) and Apify's LinkedIn Jobs Scraper (LinkedIn contract listings, scraped on Apify's infrastructure — no browser, no LinkedIn credentials on our side). Both are additive drop-in `providers/*.mjs` modules; `scan.mjs` needs no change.

## Constraints

- **Zero-token routine scan.** Pure HTTP + JSON in `providers/*.mjs`. No LLM, no browser.
- **Data contract.** Params (API keys, actor id, actor input, keywords, location) stay user-layer (`.env`, `portals.yml`). Mechanism stays system-layer (`providers/*.mjs`, `.env.example`, `templates/`, docs).
- **Apify is paid** (~$1.50/1,000 saved jobs). It must never run by surprise — disabled by default, runs only on an explicit `enabled: true`.
- **Missing keys skip cleanly** — a source with absent credentials throws a clear message and the rest of the scan runs (Reed/CP-1 pattern).

## Components

### 1. `providers/adzuna.mjs` — mapped convenience fields (Reed-style)

Board-style provider (no `detect()`), wired via a `job_boards:` entry with `provider: adzuna`.

- **Auth:** `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` from env. Missing either → `throw` with a clear "skipping Adzuna" message.
- **`buildSearchUrl(entry)`** → `GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}`. Forwards only the params the entry sets:
  - `app_id`, `app_key` (always)
  - `what` ← `entry.keywords`
  - `where` ← `entry.locationName`
  - `distance` ← `entry.distanceFromLocation` (Adzuna distance is **km**)
  - `results_per_page` ← `entry.resultsToTake` (default 50; Adzuna's page cap)
  - `contract=1` when `entry.contract === true`
  - `country` default `gb`; `page` default `1`
- **`mapAdzunaJob(raw, entry)`** → normalized `Job`:
  - `title` ← `raw.title`
  - `url` ← `raw.redirect_url` (must be http; else row dropped by caller)
  - `company` ← `raw.company.display_name` || `entry.name` || `'Adzuna'`
  - `location` ← `raw.location.display_name`
  - `salary` ← `{ min: raw.salary_min, max: raw.salary_max, currency }` where currency is derived from country (`gb`→`GBP`); omitted when neither bound present
  - `contractType` ← `raw.contract_type` when it is `'contract'` or `'permanent'`
  - `compRaw` ← built from salary (same shape as Reed)
  - `postedAt` ← `raw.created` parsed as ISO 8601 (epoch ms), omitted when absent/invalid
  - `description` ← `raw.description` (Adzuna returns a snippet; populating it lets `content_filter` work)
- **`fetch(entry, ctx)`** → build url, `ctx.fetchJson(url, { redirect: 'error' })`, map `json.results[]`, filter to rows with a non-empty title and an http(s) url.
- **Exports for testing:** `buildSearchUrl`, `mapAdzunaJob`, `parseAdzunaDate`, default provider.

### 2. `providers/apify.mjs` — raw input passthrough (actor-agnostic)

Board-style provider, wired via a `job_boards:` entry with `provider: apify`.

- **Disabled-by-default gate (first check):** `if (entry.enabled !== true) return []`. Only an *explicit* `enabled: true` runs it. The framework already drops `enabled: false`; this gate additionally catches the omitted case (where the framework would otherwise default to enabled), so a paid run never happens by surprise.
- **Auth:** `APIFY_TOKEN` from env. Missing → `throw` clear "skipping Apify" message (only reached when explicitly enabled).
- **Actor:** `entry.actor` required (e.g. `chronometrica/linkedin-jobs-scraper`). Missing → `throw`. Normalize a `user/actor` slug to the REST `user~actor` form.
- **`buildRunUrl(actor, token, { maxItems })`** → `POST https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items?token=…` plus `&maxItems=N` when `entry.maxItems` set (secondary trim of returned items).
- **Request:** body = `JSON.stringify(entry.input ?? {})` (raw passthrough — actor decides its own schema), `content-type: application/json`, `redirect: 'error'`, `timeoutMs` ← `entry.timeoutMs ?? 120000` (a sync actor run can take a minute+). Response is the dataset items array directly.
- **`mapApifyJob(raw, entry)`** maps defensively across common LinkedIn-actor field names (different actors name fields differently):
  - `title` ← `raw.title`
  - `url` ← `raw.jobUrl || raw.link || raw.url`
  - `company` ← `raw.companyName || raw.company || entry.name || 'Apify'`
  - `location` ← `raw.location`
  - `description` ← `raw.description || raw.descriptionText`
  - `remoteType` ← normalized from `raw.workplaceType` (`remote`/`hybrid`/`onsite`)
  - `contractType` ← `'contract'` when `entry.contract === true` or `raw.employmentType` matches `/contract/i`
  - `compRaw` ← `raw.salary || raw.salaryInfo` (string) when present
  - `postedAt` ← `raw.postedAt || raw.publishedAt` (epoch ms or ISO), omitted when unparseable
- **`fetch(entry, ctx)`** → gate, auth, actor; POST; ensure array; map; filter title && http url.
- **Exports for testing:** `normalizeActor`, `buildRunUrl`, `mapApifyJob`, default provider.

### 3. Config & docs

- **`.env.example`:** add `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` (free: developer.adzuna.com), `APIFY_TOKEN` (console.apify.com), each with the same "without this the source is skipped" note as Reed.
- **`templates/portals.example.yml`** (under the existing `job_boards:` block): a commented Adzuna entry, and a commented Apify entry with `enabled: false`, a sample `actor` + `input`, and an explicit cost warning.
- **`docs/SCRIPTS.md`:** document Apify cost behaviour — per-job fee (~$1.50/1,000 saved jobs), that it only runs on explicit `enabled: true`, and that volume is capped in the actor `input` (e.g. a `rows`/`count` field) with `maxItems` as a secondary guard.

### 4. Tests (TDD)

- **`test-adzuna-adapter.mjs`** and **`test-apify-adapter.mjs`**, mirroring `test-reed-adapter.mjs`: unit tests on `buildSearchUrl`/`buildRunUrl` and the `map*` functions, plus a `fetch` test with a stubbed `ctx`. Apify tests must cover the disabled-by-default gate (returns `[]` when `enabled` omitted/false), the missing-token throw, and actor-slug normalization.
- **`test-all.mjs`:** register `test-adzuna-adapter.mjs`, `test-apify-adapter.mjs`, **and the currently-unregistered `test-reed-adapter.mjs`** in the script-execution list so CI runs all three (`expectExit: 0`).

## Out of scope

- Keyword precision in the filter (CP-9) and contract/location post-filtering (CP-3). These adapters only fetch and tag supply.
- Apify MCP interactive path. Routine scan uses the REST path only.
- Adzuna/Apify pagination beyond the first page.

## Definition of Done (from ticket)

- [ ] Adzuna adapter returns UK contract roles in the common offer shape.
- [ ] Apify adapter (REST path) returns LinkedIn contract roles with no browser and no LinkedIn credentials.
- [ ] Apify runs only when explicitly enabled in `portals.yml`; disabled by default.
- [ ] All three new keys documented in `.env.example`; missing keys skip the source cleanly.
- [ ] Apify cost behaviour documented in `docs/SCRIPTS.md`.
- [ ] `node scan.mjs --dry-run` shows results tagged by source; `test-all.mjs` passes.
