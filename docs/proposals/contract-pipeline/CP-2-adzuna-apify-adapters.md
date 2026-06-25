# CP-2: Adzuna + Apify LinkedIn Jobs adapters

**Status:** Proposed · **Phase:** 1 · **Depends on:** CP-1 · **Effort:** M

## Overview

Reed alone is not enough coverage. Adzuna adds a free UK aggregator. Apify's LinkedIn Jobs Scraper adds LinkedIn's contract listings without any LinkedIn login, cookies, or browser on our side. Apify runs the scrape on its own infrastructure and hands back JSON.

This ticket adds both adapters on top of the CP-1 framework.

## Technical notes

- **Adzuna.** Official API, free tier. Needs `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`. Supports keywords, location, and contract filtering. Plain HTTP, zero-token.
- **Apify LinkedIn Jobs.** Use the no-cookies actor (`chronometrica/linkedin-jobs-scraper` or equivalent). It accepts keywords, location, contract type, remote/hybrid, and date-posted. It returns title, company, location, remote status, salary signals, and description. Cost is about $1.50 per 1,000 saved jobs.
- **Two access paths for Apify, by use case:**
  - Batch sweep: `scan.mjs` calls the Apify REST API (run actor, fetch dataset items) using `APIFY_TOKEN`. Stays zero-token; cost is the Apify fee only.
  - Interactive: a Claude session calls the Apify MCP server (`mcp.apify.com`) for ad-hoc searches. Costs some tokens plus the Apify fee.
  - Default the routine scan to the REST path to keep it free of tokens.
- Add `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `APIFY_TOKEN` to `.env.example`.
- Apify is a paid dependency. Gate it behind an explicit `enabled: true` in `portals.yml` so it never runs by surprise.
- Push exact phrases to each source API where supported, to cut noise before it reaches our filter. Keyword precision in the filter itself is CP-9.

## Definition of Done

- [ ] Adzuna adapter returns UK contract roles in the common offer shape.
- [ ] Apify adapter (REST path) returns LinkedIn contract roles with no browser and no LinkedIn credentials.
- [ ] Apify runs only when explicitly enabled in `portals.yml`; disabled by default.
- [ ] All three new keys documented in `.env.example`; missing keys skip the source cleanly.
- [ ] Apify cost behaviour documented in `docs/SCRIPTS.md` (per-job fee, how to cap volume).
- [ ] `node scan.mjs --dry-run` shows results tagged by source; `test-all.mjs` passes.
