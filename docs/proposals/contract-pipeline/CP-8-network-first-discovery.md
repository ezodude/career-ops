# CP-8: Network-first discovery (future)

**Status:** Sketch · **Phase:** 2 · **Depends on:** CP-4 · **Effort:** L

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

- [ ] Decision recorded on signals, cadence, and spend cap (resolve open questions first).
- [ ] Network-first pull surfaces warm openings ranked by reachability and fit.
- [ ] Reuses CP-4 index and CP-5 relationships; no duplicate data model.
- [ ] Opt-in and scheduled; never part of the zero-token routine scan.
- [ ] `test-all.mjs` passes.
