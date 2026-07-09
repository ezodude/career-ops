# CP-8 warm-signal validation — findings (2026-07-09)

Result of the pre-build validation spike agreed in the [2026-07-09 pivot](README.md#strategic-pivot--2026-07-09-board--warm):
does an Apify AI/agentic hiring-**post** search surface the warm channel (recruiters/devs
posting UK contract roles) before we build an adapter? **Verdict: GO — strong signal.**

## Method

- **Actor:** `apimaestro/linkedin-posts-search-scraper-no-cookies` (no login; `keyword`,
  `sort_type`, `date_filter`, `limit`, plus author filters; **$5 / 1,000 results**).
- **5 searches**, `date_filter: past-week`, `sort: date_posted`, `limit: 30` each.
- **No geo filter exists on post search** → region-gated **downstream** by classifying each
  post's author-location + text against the CP-3 `location_filter` intent (UK / Remote / EU).
- Cost: **144 posts pulled ≈ $0.72** (under the ~$1 cap). Raw kept in gitignored scratch only.

## Results

| keyword | pulled | in-scope (UK/Remote/EU) | precision |
|---|---|---|---|
| `AI engineer outside IR35` | 24 | **20** | **83%** |
| `agentic engineer contract` | 30 | 10 | 33% |
| `AI engineer contract` | 30 | 9 | 30% |
| `LLM engineer contract` | 30 | 8 | 27% |
| `agentic AI hiring` | 30 | 2 | 7% |
| **total** | **144** | **49 (34%)** | |

Region split of the 144: Remote 25 · UK 22 · EU 2 · Other (out) 95.

## Key findings (feed these into the adapter spec)

1. **The channel is real and rich.** In-scope posts are individual recruiters, agency talent
   partners, and founders posting UK contract AI/ML roles with **day rates and IR35 status**
   — e.g. "Lead/Senior Backend Engineers, contract up to £750/day, hybrid London, outside
   IR35"; "AI-Native Travel Concierge, Contract, Remote (must be UK), Outside IR35,
   £450–500/day"; "Hybrid AI Engineer, 6 months, Outside IR35, UK" (defence). This is the
   operator's stated high-yield channel, confirmed.
2. **"outside IR35" is the highest-precision term (83%).** It is UK-contract-specific and
   suppresses the US noise that generic AI terms pull in. **Weight the keyword set toward
   UK-contract phrasing** (`outside IR35`, `inside IR35`, `£/day`, `contract`) crossed with
   AI/agent role terms. `agentic AI hiring` (7%) is too generic — drop or tighten.
3. **US noise is the main pollutant.** `LLM/AI engineer contract` surface many US-remote and
   `#OpenToWork` *candidate* posts (people seeking work, not hiring). The adapter must filter
   **US-only** roles (downstream location gate already does most of this) and **distinguish
   hiring posts from job-seeker posts** (candidate posts like "#OpenToWork … seeking contract"
   are noise).
4. **Poster type matters — split humans from aggregators.** ~13 in-scope posts came from
   **aggregator repost pages** (JobWharf, Find Contract Jobs, "Outside IR35 Jobs", follower
   counts, no personal profile) — these are boards in disguise, low warmth. The genuinely
   warm targets are **individual recruiters/devs you can DM**. The adapter should classify
   poster type and **deprioritise aggregator pages**.
5. **Region gate downstream is sufficient.** Reusing the CP-3 `location_filter` logic on
   author-location + post text correctly caught UK/Remote without any actor geo param.
6. **Data-quality note for the adapter:** the actor's `reactions` field is a nested object
   (not a scalar) — the normaliser must dig into it. Author fields land under `author.*`.

## Implications for the CP-8 adapter (next spec)

- **Keyword set:** primary = `AI engineer outside IR35` + variants (`ML engineer outside IR35`,
  `agentic engineer outside IR35`, `AI contract £ day London`); secondary = `agentic engineer
  contract` etc. Drop the low-precision generic `agentic AI hiring`.
- **Pipeline:** fetch posts → normalise (author, headline, company, location, text, url, date,
  reactions) → **drop job-seeker/#OpenToWork posts** → downstream UK/Remote/EU gate → **poster-type
  classify (human vs aggregator)** → tag + write to `pipeline.md` (or a dedicated warm-leads
  file) → **join CP-4 reachability on the poster** (once the connections CSV lands) to rank
  "do I have a warm path to this person".
- **Cost model:** opt-in + scheduled, not in the free routine scan. At $5/1k and ~30
  results/search, a weekly run of ~6 targeted searches ≈ $0.90/week. Cap per run.
- **Reuse:** the CP-3 `location_filter`/tag infra and the provider framework; the post
  normaliser is a new module (post shape ≠ job shape, so it is NOT the existing `apify.mjs`
  job provider).

## Decision

**GO.** Proceed to a proper CP-8 adapter spec (brainstorm → spec → plan → build). The discovery
adapter can be built now; the reachability-on-poster join is layered in once CP-4 lands.
