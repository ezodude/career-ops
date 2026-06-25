# CP-5: Contract-aware tracker + relationship CRM

**Status:** Proposed · **Phase:** 1 · **Depends on:** CP-4 · **Effort:** L

## Overview

A contract is decided by day rate, IR35 status, and length, not by a single fit score. The tracker has no columns for any of these, and no memory of who introduced you. This ticket reshapes tracking into a contract pipeline plus a relationship record.

This is the largest Phase 1 ticket because it touches the tracker schema, the merge script, and the canonical states.

## Technical notes

- **Contract-economics columns.** Add `Day Rate`, `IR35`, `Length`, `Remote`, and `Warm?` to `data/applications.md`.
- Update `merge-tracker.mjs`, the TSV column contract (column count and order), and any header validation in `verify-pipeline.mjs`. The existing score-before-status column swap must keep working.
- Update `templates/states.yml` only if new states are needed; reuse existing states where possible.
- **Relationship CRM.** New user-layer file `data/network.md`: person, company, degree, last touch, intro given or received, source. Feeds CP-4 reachability and re-engagement.
- Keep one source of truth. The tracker holds opportunities; `network.md` holds people. Link them by company and name.
- `network.md` is user data, so add it to `.gitignore` like `applications.md`.
- Document the new schema in `DATA_CONTRACT.md` and `docs/SCRIPTS.md`.

## Definition of Done

- [ ] `applications.md` carries the new contract-economics columns; existing rows migrate without data loss.
- [ ] `merge-tracker.mjs` writes and merges the new columns; column swap preserved.
- [ ] `verify-pipeline.mjs` validates the new header; `node verify-pipeline.mjs` passes.
- [ ] `data/network.md` exists with a documented format and is gitignored.
- [ ] `DATA_CONTRACT.md` reflects the new files and columns.
- [ ] `test-all.mjs` passes.
