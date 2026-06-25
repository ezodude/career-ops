# CP-7: Evaluation scoring upgrade (contract-fit + path-in)

**Status:** Proposed · **Phase:** 1 · **Depends on:** CP-3 · **Effort:** M

## Overview

The `oferta` evaluation scores fit on dimensions A to F plus legitimacy. For contracts it ignores the things that actually decide the deal: IR35, day rate against the floor, and engagement length. It also has no concept of how reachable a role is.

This ticket adds a contract-fit block and a separate path-in signal. The numbers already live in `config/profile.yml`; the mode just needs to use them.

## Technical notes

- Edit `modes/oferta.md` (system layer, kept generic). Read contract fields from `config/profile.yml`.
- **Contract-fit block.** Score IR35 status, day rate against the floor (£1,200 outside, £1,000 inside), length against the 6-month minimum, and extension path. Auto-flag `hard_no` cases to **SKIP** per the profile's existing `preferences.hard_no` (3 months or shorter, below floor).
- **Path-in signal.** Carry the CP-4 warm/cold flag as a separate signal, not part of the fit score. A great-fit cold role should not score lower on fit. It just sits lower in the action queue. Fit and reachability stay orthogonal.
- Reflect the new block in the report header so reports stay consistent with the tracker columns from CP-5.
- Keep all thresholds in the profile. The mode reads them; it does not hardcode them.

## Definition of Done

- [ ] `oferta` reports include a contract-fit block (IR35, day rate vs floor, length, extension path).
- [ ] Roles breaching `hard_no` thresholds auto-flag SKIP with the reason.
- [ ] Warm/cold path-in signal is shown separately and does not alter the fit score.
- [ ] Thresholds are read from `config/profile.yml`, not hardcoded in the mode.
- [ ] Report header matches the CP-5 tracker columns.
- [ ] `test-all.mjs` passes.
