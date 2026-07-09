# Contract Pipeline — Work Breakdown

**Status:** Proposed · **Owner:** Ezo · **Target users:** contractors hunting AI-native / agentic engineering work, fully remote or UK-based.

## Why this exists

career-ops was built for a permanent job search. It scans company career boards (Greenhouse, Ashby, Lever) for AI roles and tracks them as one-shot applications. That misfits contract work in three ways.

- **Wrong supply.** Company boards list mostly permanent FTE roles. Contract gigs live on other channels.
- **Wrong filter.** The scanner matches job titles only. It ignores contract-vs-permanent and ignores UK/remote.
- **Wrong tracker.** A contract is decided by day rate, IR35, and length, not a single fit score. The tracker has no columns for any of these.

The user profile (`config/profile.yml`, `modes/_profile.md`) is already tuned for UK/remote outside-IR35 AI contracting. This initiative fixes the machinery around it.

## The shape

Two engines plus a shared CRM store.

- **Discovery engine.** API-only, no browser. `scan.mjs` already loads a pluggable provider framework (`providers/*.mjs`, each a `{ id, fetch }` module wired via `portals.yml`), so new sources are **additive drop-in modules** — no scanner rewrite. This initiative adds source adapters (Reed, Adzuna, Apify LinkedIn Jobs) plus contract + location filtering on the shared pipeline.
- **Warm engine.** Reachability scoring from a cached LinkedIn connections export. Free 1st-degree lookups, no scraping. Powers warm-intro prioritisation.
- **CRM store.** Contract-economics columns, a relationship file, a reachability view, and bench-gap alerts.

No self-driven LinkedIn scraping anywhere in the routine loop. Job data comes from APIs. Apify runs any LinkedIn job scrape on its own infrastructure and returns JSON.

## Tickets

| ID | Title | Phase | Depends on | Effort | Status |
|----|-------|-------|------------|--------|--------|
| [CP-1](CP-1-discovery-adapter-framework.md) | Discovery adapter framework + Reed source | 1 | — | M | ✅ Built |
| [CP-2](CP-2-adzuna-apify-adapters.md) | Adzuna + Apify LinkedIn Jobs adapters | 1 | CP-1 | M | ✅ Built |
| [CP-9](CP-9-keyword-matching-precision.md) | Keyword matching precision | 1 | CP-1 | S | ✅ Built |
| [CP-3](CP-3-contract-location-filtering.md) | Contract + location filtering | 1 | CP-1, CP-9 | S | ✅ Built |
| [CP-4](CP-4-reachability-scoring.md) | Reachability scoring from connections CSV | 1 | CP-1 | M | ▶ Next |
| [CP-8](CP-8-network-first-discovery.md) | **Warm-signal discovery** (recruiter/dev hiring posts, reshaped) | 1 | CP-4 | L | ▶ Discovery adapter shipped · CP-4 poster-join pending |
| [CP-5](CP-5-contract-tracker-and-crm.md) | Contract-aware tracker + relationship CRM | 1 | CP-4 | L | ⏸ Deferred |
| [CP-6](CP-6-reachability-view-and-bench.md) | Reachability view + bench/renewal alerts | 1 | CP-4, CP-5 | M | ⏸ Deferred |
| [CP-7](CP-7-evaluation-scoring-upgrade.md) | Evaluation scoring upgrade (contract-fit + path-in) | 1 | CP-3 | M | ⏸ Deferred |

## Progress

**As of 2026-07-07:** CP-1, CP-2, CP-9, and CP-3 are built and pushed. New contract supply (Reed, Adzuna, Apify LinkedIn Jobs) flows through a precise, boundary-aware title matcher plus a gig-mill company blocklist, and is now gated by the CP-3 contract + location filter stage: a config-driven `contract_filter.drop` (permanent) that never silently drops unknowns, the activated `location_filter` (UK/remote/EU), and `[contract] [remote] [Reed]`-style triage tags on `pipeline.md` rows. **CP-4 is next** — free warm-intro reachability scoring on this supply.

## Strategic pivot — 2026-07-09 (board → warm)

Field evidence (operator's own contracting history): **cold applications to job boards — LinkedIn Jobs, Reed — never convert.** You email a CV into a void, drowned in LLM-generated applications. The contracts that *do* land come from **LinkedIn posts by internal/agency recruiters and devs hiring for their org** — a warm, social-feed signal, region-gated, where you respond to a person, not an ATS.

Phase 1 front-loaded board discovery (CP-1/2/3) and deferred the network channel (CP-8) to Phase 2. That is now **inverted**:

- **Keep — the warm engine:** CP-4 (reachability) is the priority; it makes any lead actionable. Extended to score the *poster* (person), not just their company.
- **Pull forward — the working channel:** CP-8, reshaped as **warm-signal discovery** (recruiter/dev hiring posts via Apify *content* search, region-gated, joined to reachability), becomes near-term. Validate the channel with one cheap Apify post search *before* building the adapter.
- **Deferred — revisit only after the warm channel proves out:** CP-5 (full CRM → trim to a minimal warm-lead log if needed), CP-6 (bench/renewal ops), CP-7 (evaluation scoring — scoring dead-channel board roles is negative ROI).
- **Board adapters (CP-1/2/3) stay on as free background supply to *skim* — not the main bet.**

The board work is not wasted: the provider framework, filtering, and tagging all get reused by the warm-signal adapter and reachability output.

## Reference

- [`SCANNING-MODEL-AND-UAT.md`](SCANNING-MODEL-AND-UAT.md) — what a scan actually touches (source taxonomy), how CP-3 behaves per source type, the "no permanent-noise reduction on ATS boards" limitation (by design), and a repeatable cost-free UAT recipe with results.

## Build order — REVISED 2026-07-09 (warm-first)

1. ✅ CP-1 → ✅ CP-2 → ✅ CP-9 → ✅ CP-3. Board supply + filtering — built, but the cold-apply board channel is low-yield for contractors (see Strategic pivot). Kept as skimmable background supply.
2. **▶ CP-4 (next).** Reachability from the connections CSV — the warm engine; makes any lead actionable. Built against a sample CSV now; real export swapped in when it lands. Extended to score the *poster* for the warm channel.
3. **CP-8 reshaped — warm-signal discovery.** Region-gated LinkedIn recruiter/dev *hiring posts* via Apify content search (validated with one cheap search first), joined to CP-4 reachability. The actual high-yield channel; pulled forward from Phase 2.
4. ⏸ Deferred, revisit only if the warm channel proves out: CP-5 (minimal warm-lead log), CP-6, CP-7.

## Cost note

Routine scanning stays zero-token (HTTP and JSON in `scan.mjs`). Reed and Adzuna are free. Apify is a dollar cost (about $1.50 per 1,000 jobs), not Claude tokens, and never your browser. Claude tokens are spent only on evaluation and intro drafting for roles you choose to pursue.

## Data contract

All parameters stay in the user layer (`config/profile.yml`, `portals.yml`, `.env`, `data/*`). All mechanism stays in the system layer (`scan.mjs`, new `.mjs` scripts, `modes/*`, `merge-tracker.mjs`, `templates/states.yml`). Updates never overwrite user tuning. See `DATA_CONTRACT.md`.
