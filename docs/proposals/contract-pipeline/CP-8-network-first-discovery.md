# CP-8: Network-first discovery (future)

**Status:** ▶ Pulled forward + reshaped (2026-07-09 pivot) · **Phase:** 1 · **Depends on:** CP-4 · **Effort:** L

> **Pulled forward from Phase 2 by the [2026-07-09 strategic pivot](README.md#strategic-pivot--2026-07-09-board--warm)** and reshaped into **warm-signal discovery**: region-gated LinkedIn recruiter/dev *hiring posts* via Apify *content* search (validate with one cheap search before building the adapter), joined to CP-4 reachability scored on the *poster*, not just their company. This is the operator's actual high-yield channel. Needs its own brainstorm/spec before build.
>
> **✅ Validation done (2026-07-09) — GO.** A ~$0.72 spike (`apimaestro/linkedin-posts-search-scraper-no-cookies`, 5 searches) surfaced 49/144 in-scope UK/Remote AI-contract hiring posts; `AI engineer outside IR35` hit **83% precision**. Findings + adapter implications: [`CP-8-warm-signal-validation-findings.md`](CP-8-warm-signal-validation-findings.md).
>
> **▶ Discovery adapter SHIPPED (2026-07-09).** Standalone opt-in `warm-scan.mjs` + `providers/apify-posts.mjs` normaliser + `warm_signals` config block. Pulls posts per keyword (dry-preview by default; PAID Apify fetch only on `--spend`), normalises poster/text/rate/IR35/reactions, drops job-seekers, region-gates UK/Remote via the reused `buildLocationFilter` (combined location+text with a warm-specific US/offshore block list), classifies human vs aggregator, and writes `data/warm-leads.md` (humans first, own URL dedup — never touches `pipeline.md`). Filters/classify/tags unit-tested inline in `test-all.mjs` §30. **Poster-reachability join (CP-4) still pending the connections CSV** — layered on once it lands.

## Overview

Phase 1 finds roles, then checks if there is a warm path. Phase 2 inverts the funnel. It starts from your network and surfaces openings because there is already a path in. This matches the "warm paths first, minimise vetting" strategy most directly.

Build this only after Phase 1 proves the reachability primitive (CP-4) in real use.

## Technical notes

- Periodically pull network signals: connection job moves, new roles at AI-native companies, "we are hiring" posts. Source via Apify network or profile actors, or a manual review step.
- Match signals against AI-native and agentic target companies, then surface warm openings proactively.
- Reuse the CP-4 company index and the CP-5 relationship file. This ticket adds a discovery direction, not a new data model.
- Heavier on cost than Phase 1: more Apify usage and some Claude tokens for matching and ranking. Keep it opt-in and scheduled, not part of the free routine scan.

## Open questions (resolve before build)

- Which network signals are reliable enough to act on without scraping fragility.
- Cadence: weekly review vs on-demand.
- How to cap Apify spend on proactive network pulls.

## Definition of Done

- [x] Decision recorded on signals, cadence, and spend cap (spike findings + spec; spend cap = per-run `limit` + dry-preview/`--spend` gate; cadence = manual opt-in for now, auto-schedule deferred).
- [ ] Network-first pull surfaces warm openings **ranked by reachability** and fit. *(pending CP-4 poster-join — discovery + fit tags shipped, ranking not yet)*
- [ ] Reuses CP-4 index and CP-5 relationships; no duplicate data model. *(pending CP-4 connections CSV)*
- [x] Opt-in; never part of the zero-token routine scan (standalone `warm-scan.mjs`, PAID only on `--spend`). *(auto-scheduling deferred)*
- [x] `test-all.mjs` passes (§30 covers normaliser, filters, classify, tags, region-gate regression).
