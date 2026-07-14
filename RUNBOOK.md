# Operator Runbook

Operator runbook — the two discovery workflows (warm runs + ATS/board runs) and the combined weekly digest.

---

## TL;DR — the weekly flow

The launchd job fires **every Monday at 09:00**. To trigger it manually:

```bash
launchctl start com.career-ops.scan-runner
```

What it does, in order:

1. Free board scan (`scan.mjs`) → `data/pipeline.md`
2. Paid warm scan (`warm-scan.mjs --spend`) → `data/warm-leads.md` + `data/warm-digest.md`
3. Combined digest (`weekly.mjs`) → `data/this-week.md` (always, regardless of results)
4. macOS notification with counts
5. Opens an iTerm Claude triage session **only** when new warm humans > 0, pointing at `data/this-week.md`

**Each week:** open `data/this-week.md`, triage **warm first**, then board. Regenerate at any time:

```bash
node weekly.mjs
```

---

## 1. Warm runs (PAID)

Discovers LinkedIn hiring posts from recruiters and devs actively hiring — the channel that actually converts for contract work.

### Dry preview (free — always safe to run)

```bash
node --env-file=.env warm-scan.mjs
```

Prints the actor, keywords, result limit, and estimated cost. No Apify call, no spend.

### Real fetch (costs money)

```bash
node --env-file=.env warm-scan.mjs --spend
```

Fetches posts from Apify for each keyword in `warm_signals.keywords`, runs the full chain (region gate → near-dup dedup → Page/aggregator classification → Gemini hiring-intent on ambiguous), and writes results.

### Configuration (`portals.yml`)

```yaml
warm_signals:
  actor: apify/linkedin-post-search  # Apify actor
  keywords:
    - "hiring contract python"
    - "looking contract AI engineer"
  limit: 30                          # results per keyword
  budget_cap_usd: 5                  # abort if near this monthly spend (default: 5)

location_filter:                     # reused by both warm and board scans
  allow:
    - "Edinburgh"                    # extend the built-in UK/Europe/US allow-list
```

The region gate (`location_filter`) is judged on the **poster's location field alone**, not the post text. Work-arrangement words ("remote", "hybrid") are stripped before the country check, so they can never substitute for a real region. Built-in allowed regions: full UK city list, Ireland, all EU/EEA countries, US.

### Cost

~$0.60 for 4 keywords × 30 results ($5 / 1,000 results). Guarded by `budget_cap_usd` (default $5 monthly). When near the cap the script logs `NEW_WARM=SKIPPED_BUDGET` and exits cleanly — this is expected behaviour, not an error.

### Env var required

`APIFY_TOKEN` — set in `.env` (see `.env.example`).

### Outputs

| File | Content |
|------|---------|
| `data/warm-leads.md` | Cumulative warm lead log (humans + aggregators) |
| `data/warm-digest.md` | Dated sections, newest first — one section per `--spend` run |

Log line: `NEW_WARM=<n>` (count of new human leads added this run).

---

## 2. ATS / board runs (FREE)

Two complementary free scanners. No Apify cost unless an `apify` job board is explicitly enabled in `portals.yml`.

### scan.mjs — tracked-company scanner

Scans the companies you curate in `portals.yml` via ATS APIs (Greenhouse, Ashby, Lever) and local parsers.

```bash
node scan.mjs                          # scan all enabled companies
node scan.mjs --dry-run                # preview matching jobs without writing files
node scan.mjs --company "Cohere"       # scan a single company by name
node scan.mjs --verify                 # Playwright-check each new URL; drop expired
node scan.mjs --verify --headed-fallback  # retry anti-bot URLs in headed browser
node scan.mjs --verify --throttle         # jittered ~5–10 s gap between checks
node scan.mjs --verify --throttle=8000    # custom base gap in ms
```

**Config keys in `portals.yml`:**

| Key | Purpose |
|-----|---------|
| `tracked_companies` | Companies to scan, each with a `careers_url` |
| `job_boards` | API job-board sources (Reed, Adzuna, Apify LinkedIn Jobs) |
| `title_filter` | Keywords the role title must match |
| `location_filter` | Locations to include (shared with warm) |
| `contract_filter` | Drop permanent-role signals |
| `company_filter` | Block known gig-mill aggregators |
| `content_filter` | Drop on body content patterns |

**Env vars** (each only needed when the matching source is enabled):

- `REED_API_KEY` — Reed job board
- `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` — Adzuna
- `APIFY_TOKEN` — Apify LinkedIn Jobs (`enabled: true` in the entry)

**Output:** `data/pipeline.md` (pending leads) + `data/scan-history.tsv` (URL dedup ledger).

Log line: `NEW_OFFERS=<n>`.

### scan-ats-full.mjs — reverse ATS scanner

Inverts the direction: walks public ATS directories (Greenhouse, Lever, Ashby, Workday) for fresh postings matching your `title_filter` / `location_filter` — no company curation needed. Company lists are cached for 24 h in `data/cache/`.

```bash
node scan-ats-full.mjs                        # all ATS directories, last 3 days
node scan-ats-full.mjs --since 7              # postings from the last 7 days
node scan-ats-full.mjs --ats greenhouse,workday  # subset of sources
node scan-ats-full.mjs --limit 200            # max companies per ATS
node scan-ats-full.mjs --dry-run              # preview without writing
node scan-ats-full.mjs --liveness             # Playwright-verify matches first
node scan-ats-full.mjs --md-out notes/scans   # also write a dated markdown digest
```

Postings without a publish date are skipped. Writes to the same `data/pipeline.md` + `data/scan-history.tsv` as `scan.mjs`.

**Exit codes:** `0` scan completed, `1` config error or fatal scan error.

---

## 3. Combined weekly digest (FREE)

Merges the newest warm-digest section with pending board offers into one ranked, actionable file. No network calls, no tokens.

```bash
node weekly.mjs                  # write data/this-week.md
node weekly.mjs --board-cap=20   # show up to 20 board offers (default: 15)
node weekly.mjs --dry-run        # print to stdout, do not write
```

### What it reads

- **Warm:** the newest dated `## <date>` section of `data/warm-digest.md`
- **Board:** unchecked `- [ ]` lines under `## Pending` in `data/pipeline.md`

### Ranking

Scoring (higher = act sooner):

| Signal | Points |
|--------|--------|
| Warm source | +100 |
| In-region (UK/EMEA/EU/US tag or text) | +30 |
| Outside IR35 | +20 |
| Day rate present | +15 |
| `[contract?]` tag | +5 |
| Out-of-region hint (India, UAE, SEA, LATAM …) | −100 |

Warm leads are all kept and sorted. Board leads with score < 0 are dropped; remaining are capped at `--board-cap` (default 15).

The out-of-region demote is a **ranking heuristic, not a hard filter** — the full board inbox stays in `data/pipeline.md`. Hidden offers are counted in a note at the bottom of `data/this-week.md`, not deleted.

### Output

`data/this-week.md` — structure:

```
# This week — combined actionable digest
## <date> (N warm · M board)
### Warm (act first)
- [ ] https://… | Recruiter Name — headline  [warm] [UK] £750/day [outside IR35]
### Board / ATS
- [ ] https://… | Role — Company  [contract] [remote]
_(K board offers hidden: out-of-region or low-signal — see data/pipeline.md)_
```

Log line: `WEEKLY_WRITTEN warm=N board=M hidden=K → data/this-week.md`

---

## 4. Scheduling

The plist schedules `scripts/scan-runner.sh` via launchd — **every Monday at 09:00**.

### Install

```bash
cp scripts/com.career-ops.scan-runner.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.career-ops.scan-runner.plist
```

### Uninstall

```bash
launchctl unload ~/Library/LaunchAgents/com.career-ops.scan-runner.plist
```

### Manual trigger

```bash
launchctl start com.career-ops.scan-runner
```

### Safe dry-run (prints every command without executing)

```bash
bash scripts/scan-runner.sh --dry-run
```

### Skip a date

Add the date (`YYYY-MM-DD`) to `scripts/scan-runner-skip-dates.txt`, one per line. The runner checks this file at startup and exits cleanly if today matches.

### Log

`data/scan-runner.log` — stdout and stderr from every run, appended.

### Auto-triage session

The runner opens an iTerm Claude session **only when `NEW_WARM` is a positive integer** (non-numeric values including `SKIPPED_BUDGET` are ignored). The prompt points at `data/this-week.md`. `weekly.mjs` runs on every invocation regardless, so `data/this-week.md` is always fresh even when no triage session opens.

---

## 5. Pre-flight & cost safety

Run these before the first scan, and any time `portals.yml` changes:

```bash
node validate-portals.mjs                               # offline shape + provider check
node validate-portals.mjs --file templates/portals.example.yml  # validate the template
node verify-portals.mjs                                 # ATS slug probe (network)
node verify-portals.mjs --add cursor                    # probe slug variants for one name
node verify-portals.mjs --strict                        # exit non-zero if any slug unresolved
```

**`validate-portals.mjs`** — offline only: checks YAML shape, unknown providers, malformed URLs, empty filter lists, invalid local parser blocks. Warnings (e.g. duplicate company names) do not cause a non-zero exit; errors do.

**`verify-portals.mjs`** — hits the network: probes Greenhouse / Ashby / Lever endpoints for each tracked company's slug. Reports "live but empty" (between-hires) separately from "unresolved" (wrong slug).

### The only paid surfaces

| Surface | Cost | Guard |
|---------|------|-------|
| `warm-scan.mjs --spend` | ~$5/1k results ($0.60 typical run) | `budget_cap_usd` in `portals.yml` |
| `apify` job board (if enabled) | ~$1.50/1k saved jobs | disable the entry or omit `enabled: true` |

Everything else — `scan.mjs`, `scan-ats-full.mjs`, `weekly.mjs`, Gemini hiring-intent evaluation — is free.

---

## 6. Outputs at a glance

| File | Written by | Cumulative? | Read it for |
|------|------------|-------------|-------------|
| `data/this-week.md` | `weekly.mjs` | No (overwritten each run) | Ranked triage — warm first, then board |
| `data/warm-digest.md` | `warm-scan.mjs` | Yes (newest section first) | Per-run warm lead batches |
| `data/warm-leads.md` | `warm-scan.mjs` | Yes (URL-deduplicated) | Full cumulative warm lead log |
| `data/pipeline.md` | `scan.mjs`, `scan-ats-full.mjs` | Yes | All pending board/ATS offers |
| `data/scan-history.tsv` | `scan.mjs`, `scan-ats-full.mjs` | Yes | URL dedup ledger (seen URLs never re-added) |
| `data/scan-runner.log` | launchd / scan-runner.sh | Yes (appended) | Runner history, error diagnosis |

All `data/*` files are gitignored and never committed.

---

## 7. Troubleshooting

**`node` not found under launchd**
`scan-runner.sh` prepends `/opt/homebrew/bin:/usr/local/bin` to `PATH` at startup. If `node` is still missing, confirm `which node` under your shell and add that directory to the prepend line in `scripts/scan-runner.sh`.

**`NEW_WARM=SKIPPED_BUDGET`**
The Apify monthly spend is near or over `budget_cap_usd`. This is expected defensive behaviour, not an error. Warm results from previous runs are still in `data/warm-digest.md`; `weekly.mjs` will use the newest section. Reset at the start of your Apify billing cycle, or raise `budget_cap_usd` in `portals.yml`.

**`data/this-week.md` is empty / shows no warm leads**
`weekly.mjs` reads the newest dated section of `data/warm-digest.md`. If that file does not exist or has no `## <date>` sections, warm output will be empty. Run `node --env-file=.env warm-scan.mjs --spend` first.

**Board offers look stale**
Dedup operates via `data/scan-history.tsv`. Once a URL is logged there it is not re-added to `pipeline.md`. To re-surface it, remove its row from `data/scan-history.tsv` and re-run the scan.

**First-run setup**
```bash
cp templates/portals.example.yml portals.yml   # start from the template
cp .env.example .env                           # fill in API keys
node validate-portals.mjs                      # confirm shape before first scan
```

---

## 8. Deeper design

Full work breakdown and design rationale: [`docs/proposals/contract-pipeline/README.md`](docs/proposals/contract-pipeline/README.md)

Relevant tickets:

| Ticket | Topic |
|--------|-------|
| CP-8 | Warm-signal discovery (recruiter/dev hiring posts via Apify) |
| CP-10 | Scheduled scan runner + delivery (launchd weekly, both scans, auto-triage) |
| CP-11 | Warm-signal precision (Page/region/dedup filters + Gemini hiring-intent) |
| CP-12 | Region-gate country precision (location judged alone, strict UK+Europe+US allow-list, word-boundary matching) |
