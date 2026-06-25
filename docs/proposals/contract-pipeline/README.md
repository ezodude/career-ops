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

- **Discovery engine.** API-only, no browser. Extends `scan.mjs` with new source adapters (Reed, Adzuna, Apify LinkedIn Jobs) and adds contract + location filtering.
- **Warm engine.** Reachability scoring from a cached LinkedIn connections export. Free 1st-degree lookups, no scraping. Powers warm-intro prioritisation.
- **CRM store.** Contract-economics columns, a relationship file, a reachability view, and bench-gap alerts.

No self-driven LinkedIn scraping anywhere in the routine loop. Job data comes from APIs. Apify runs any LinkedIn job scrape on its own infrastructure and returns JSON.

## Tickets

| ID | Title | Phase | Depends on | Effort |
|----|-------|-------|------------|--------|
| [CP-1](CP-1-discovery-adapter-framework.md) | Discovery adapter framework + Reed source | 1 | — | M |
| [CP-2](CP-2-adzuna-apify-adapters.md) | Adzuna + Apify LinkedIn Jobs adapters | 1 | CP-1 | M |
| [CP-9](CP-9-keyword-matching-precision.md) | Keyword matching precision | 1 | CP-1 | S |
| [CP-3](CP-3-contract-location-filtering.md) | Contract + location filtering | 1 | CP-1, CP-9 | S |
| [CP-4](CP-4-reachability-scoring.md) | Reachability scoring from connections CSV | 1 | CP-1 | M |
| [CP-5](CP-5-contract-tracker-and-crm.md) | Contract-aware tracker + relationship CRM | 1 | CP-4 | L |
| [CP-6](CP-6-reachability-view-and-bench.md) | Reachability view + bench/renewal alerts | 1 | CP-4, CP-5 | M |
| [CP-7](CP-7-evaluation-scoring-upgrade.md) | Evaluation scoring upgrade (contract-fit + path-in) | 1 | CP-3 | M |
| [CP-8](CP-8-network-first-discovery.md) | Network-first discovery (future) | 2 | CP-4 | L |

## Build order

1. CP-1 then CP-2, then CP-9 then CP-3. New contract supply, matched precisely and filtered.
2. CP-4. Free warm flagging on the new supply.
3. CP-5 then CP-6. Manage the contract pipeline.
4. CP-7. Sharpen ranking.

CP-8 is sketched only. Build it after Phase 1 proves the reachability primitive.

## Cost note

Routine scanning stays zero-token (HTTP and JSON in `scan.mjs`). Reed and Adzuna are free. Apify is a dollar cost (about $1.50 per 1,000 jobs), not Claude tokens, and never your browser. Claude tokens are spent only on evaluation and intro drafting for roles you choose to pursue.

## Data contract

All parameters stay in the user layer (`config/profile.yml`, `portals.yml`, `.env`, `data/*`). All mechanism stays in the system layer (`scan.mjs`, new `.mjs` scripts, `modes/*`, `merge-tracker.mjs`, `templates/states.yml`). Updates never overwrite user tuning. See `DATA_CONTRACT.md`.
