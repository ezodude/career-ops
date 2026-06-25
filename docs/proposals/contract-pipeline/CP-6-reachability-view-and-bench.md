# CP-6: Reachability view + bench/renewal alerts

**Status:** Proposed · **Phase:** 1 · **Depends on:** CP-4, CP-5 · **Effort:** M

## Overview

Two contractor-specific needs sit on top of the new tracker. First, a view that sorts live opportunities by warm-vs-cold so effort goes where there is a path in. Second, a bench-gap forecast, because contractors live and die by not drifting into an unbilled gap.

This ticket adds both on top of the CP-5 schema.

## Technical notes

- **Reachability view.** Generate a view grouping live opportunities by Warm/Cold and by stage. Extend the existing `dashboard/` output or produce an `analyze-patterns`-style JSON. Surface it in `tracker` mode.
- **Bench/renewal.** New zero-token script `bench.mjs`. Read `current_engagement` end-date context from `config/profile.yml`. Compute weeks remaining. Raise a "start pipelining" alert at T-minus-N weeks (default 8, configurable in profile).
- Surface the bench alert in the `scan` summary and in `tracker` mode so it is seen during normal use.
- If the end date is absent or open-ended, skip the alert quietly.
- Both pieces are read-only over existing data. No new user input required beyond profile fields that already exist.

## Definition of Done

- [ ] `tracker` mode shows a Warm/Cold by stage view of live opportunities.
- [ ] `bench.mjs` computes weeks-to-end from profile and raises an alert inside the configurable window.
- [ ] Bench alert appears in the scan summary and tracker output.
- [ ] Missing or open-ended end date is handled with no false alert.
- [ ] Alert window is configurable in `config/profile.yml`.
- [ ] `test-all.mjs` passes.
