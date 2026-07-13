# CP-12: Region-gate country precision

**Status:** ✅ **Shipped 2026-07-13** · **Phase:** 1 · **Depends on:** CP-11 · **Effort:** M

> A CP-11 live run surfaced an India-based recruiter (`Remote (India)`) as a warm lead, exposing two bugs in the region gate: work-arrangement words (`remote`) were treated as allow tokens, so a location like `Remote (India)` was rescued by the work-arrangement word; and token matching was substring-based (`us` matched inside `cyprus`). CP-12 rewrites warm-signal location gating to judge the **poster's location alone**, strictly against a UK+Europe+US token set, word-boundary matched. Design/spec: `docs/superpowers/specs/2026-07-13-cp-12-region-gate-country-precision-design.md` (local scratch, not committed).

## Overview

The 2026-07-13 CP-11 live run surfaced an India-based recruiter whose location field read `Remote (India)`. The region gate at the time mashed location and post text together and treated `"remote"` as a blanket allow token — a work-arrangement word that rescued a foreign location from the gate. Separately, token matching was substring-based, so `us` was found inside `cyprus` and `belarus`, admitting posters from those countries as if they were US-based.

CP-12 fixes the gate to judge the poster's **location alone**, strip work-arrangement words from the residue before matching, pass an empty residue (recall preserved for truly unlabelled profiles), and word-boundary match the residue against a curated UK+Europe+US allow set. Any residue with a real location token not in that allow set is vetoed at fetch, before any Apify spend.

## Technical notes

- **`buildWarmRegionFilter`** — new warm-only gate (separate from the shared board-scanner `buildLocationFilter`). Judges the poster's `location` field alone (not post text). Strips work-arrangement words (`remote`, `hybrid`, `on-site`, `onsite`); empty residue → **pass** (location unlabelled; recall preserved). Residue must match at least one token in `ALLOWED_REGIONS`; no match → veto.
- **`regionTokenMatch`** — word-boundary helper (`\b<token>\b`, case-insensitive). `us` no longer matches `cyprus`, `belarus`, `houston`, or similar substrings.
- **`ALLOWED_REGIONS`** — curated token set: UK (inc. England, Scotland, Wales, London, Manchester, Birmingham, Edinburgh, Glasgow, Leeds, Bristol, Ireland/Eire) + major EU/European country names and synonyms + `united states`, `usa`, `us`, `new york`, `california`, `san francisco`, `seattle`, `boston`, `chicago`, `austin`. Extendable per-operator via `warm_signals.location_filter.allow` in `portals.yml`.
- **`DEFAULT_WARM_BLOCK` removed** — the allow-only model makes a separate offshore block-list redundant; any location not in the allow set is already vetoed. `block_locations` is retained as a manual opt-in override (e.g. to drop a specific region that overlaps with an allow token) and continues to be accepted by `validate-portals.mjs`.
- **Shared board-scanner filter** (`scan.mjs buildLocationFilter`) left entirely untouched; this change is warm-engine only.
- **`"remote"` removed from operator's `portals.yml` `location_filter.allow`** on disk. `portals.yml` is gitignored (operator's live local config, `.gitignore:37`) — this is an on-disk edit to the untracked file, not a committed change. The tracked template `templates/portals.example.yml` has only a commented-out US example location_filter and needs no change.
- **US moved into region** — previously US was a separate allow path; it is now part of `ALLOWED_REGIONS` alongside UK+Europe, reflecting the UK+Europe+US policy in one place.
- **Pure units** tested in `test-all.mjs` §33 (`buildWarmRegionFilter`, `regionTokenMatch`, `ALLOWED_REGIONS` membership, work-arrangement stripping, empty-residue pass, `Remote (India)` veto); §30 updated for US-in-region.

## Definition of Done

- [x] Location judged alone (no more location+text mashing).
- [x] Strict allow-only gate, UK+Europe+US token set.
- [x] Word-boundary matching (`us` no longer matches `cyprus`, `belarus`, `houston`).
- [x] Work-arrangement words stripped; empty/`remote`-only location residue passes (recall preserved).
- [x] `DEFAULT_WARM_BLOCK` removed; `block_locations` retained as manual opt-in override.
- [x] Shared board-scanner filter (`scan.mjs buildLocationFilter`) untouched.
- [x] Synthetic-only test fixtures (no real PII).
- [x] `"remote"` removed from the operator's `portals.yml` allow-list (on-disk; file is gitignored, not a committed change).
- [x] WBS entry (this file) + README row added.
- [ ] **Live `--spend` re-run confirming a `Remote (India)`-class poster is dropped at fetch (operator's spend-go).**
