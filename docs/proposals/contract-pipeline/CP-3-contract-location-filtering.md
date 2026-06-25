# CP-3: Contract + location filtering

**Status:** Proposed · **Phase:** 1 · **Depends on:** CP-1, CP-9 · **Effort:** S

## Overview

The scanner today filters on job title only. It cannot tell a contract from a permanent role, and it cannot tell UK/remote from US-onsite. That lets noise through to evaluation, which costs attention and tokens.

This ticket adds a post-fetch filter stage so only contract roles in scope (UK or remote) reach the pipeline. It is the single biggest noise-reduction lever in Phase 1.

## Technical notes

- Add a `targeting:` block to `portals.yml` (user layer): `contract_filter` and `location_filter` rules. Values mirror the user profile (contract, UK, remote, remote-EU).
- **Contract filter.** Keep `contract` and `temp`. Drop `permanent`. Reed and Apify give employment type directly. For ATS boards that omit it, detect contract signals in title and description. If still unknown, set `contract_type: unknown` and keep the role for human triage. Do not silently drop unknowns.
- **Location filter.** Keep UK and remote (plus remote-EU per profile). Match the structured `remote_type` and `location` fields first, then fall back to keywords (`remote`, `United Kingdom`, `London`, `EMEA`).
- Write visible tags into `pipeline.md` entries, for example `[contract] [remote] [Reed]`, so triage is legible at a glance.
- Keyword precision (word boundaries, phrases, negatives) is delegated to CP-9. This ticket stays focused on contract and location fields.
- Zero-token. Pure string and field matching in `scan.mjs`.

## Definition of Done

- [ ] `targeting:` block in `portals.yml` controls contract and location rules.
- [ ] Permanent roles are dropped; contract and temp roles pass; unknown-type roles are kept and flagged.
- [ ] Out-of-scope locations (for example US-onsite) are dropped; UK and remote pass.
- [ ] `pipeline.md` entries carry contract, location, and source tags.
- [ ] Scan summary reports counts removed by contract filter and by location filter.
- [ ] `test-all.mjs` passes.
