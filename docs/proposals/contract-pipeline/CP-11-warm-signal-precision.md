# CP-11: Warm-signal precision

**Status:** ✅ **Shipped — live-verified pending operator --spend run.** · **Phase:** 1 · **Depends on:** CP-8 · **Effort:** M

> Cuts the ~80% noise in the warm digest at source. Deterministic zero-cost filters remove the mechanical junk (LinkedIn Pages, off-region incl. Gulf, near-duplicate reposts, styled-unicode evasion, un-parsed rates); a Gemini free-tier hiring-intent classifier handles the semantic residue (is an in-region person actually hiring, vs commentary/self-promotion/seeking work). Design/spec: `docs/superpowers/specs/2026-07-13-cp-11-warm-signal-precision-design.md` (local scratch, not committed).

## Overview

The 2026-07-13 CP-10 live run produced 12 warm leads; operator triage kept 1 shortlist + 3 maybes and skipped 8. The 8 split into deterministic classes (brand Pages, off-location, near-dup reposts) plus one semantic class (a person posting commentary that quotes hiring words critically). CP-11 removes each class with the cheapest reliable mechanism, running BEFORE CP-4 so reachability ranks a clean set.

## Technical notes

- **`runWarmChain`** (pure/sync) now returns `{humans, aggregators, ambiguous}`. Order, first-veto-wins: URL dedup → job-seeker drop → combined region gate (block-term anywhere vetoes) → near-dup dedup (`dupeSignature`, normalised 100-char text prefix) → Page→aggregator (`isPageProfile`, follower-count headline) → name-pattern→aggregator (`classifyPosterType`) → economics (IR35/day-rate present)→humans → else→ambiguous.
- **NFKC normalisation** in `mapApifyPost` collapses mathematical-bold unicode (e.g. `𝗜𝗥𝟯𝟱`) to ASCII before regex; `parseDayRate` widened to accept no-£, bare, ranged and comma-thousands rates.
- **Region block list** `DEFAULT_WARM_BLOCK` extended with Gulf/UAE/Dubai/KSA/Qatar terms (override via `warm_signals.block_locations`).
- **Hybrid classifier** (`hiring-intent.mjs`): pure `buildHiringIntentPrompt` + pure `mergeHiringVerdicts`; network `makeGeminiClassifier` (injected SDK). Runs only on the `ambiguous` residue, at the `main()` I/O boundary — keeping `runWarmChain` pure. Default model `gemini-3.1-flash-lite` (free tier; `gemini-2.5-flash` is now 404 for new API keys), overridable via `warm_signals.hiring_intent.model`; `hiring_intent.enabled:false` disables it.
- **Fail-open:** no `GEMINI_API_KEY` / classifier disabled / per-post error → the post is KEPT and tagged `[intent?]` (never silently dropped); the CP-10 triage session is the human backstop. Gemini is free-tier — no dollar cost added; the only paid step remains the budget-guarded Apify fetch.
- **`validate-portals.mjs`** accepts the optional `warm_signals.block_locations` (string list) and `warm_signals.hiring_intent` (`{enabled?:boolean, model?:string}`).
- **Pure units** tested in `test-all.mjs` §30/§32 (parseDayRate, NFKC, isPageProfile, dupeSignature, DEFAULT_WARM_BLOCK, buildWarmTags extraTags, runWarmChain 3-bucket split, buildHiringIntentPrompt, mergeHiringVerdicts, validator); the Gemini network call + `main()` wiring verified by a free smoke test (correctly separated a genuine contract-hire post from an opinion rant).

## Definition of Done

- [x] NFKC normalisation + widened day-rate parse (`parseDayRate` accepts no-£, bare, ranged, comma-thousands).
- [x] Gulf/UAE/Dubai/KSA/Qatar region block terms added to `DEFAULT_WARM_BLOCK`.
- [x] Page detection (`isPageProfile`) routes brand Pages to aggregators.
- [x] Near-dup dedup (`dupeSignature`, normalised 100-char prefix) eliminates reposted noise.
- [x] Economics auto-keep: IR35/day-rate present → humans; else → ambiguous for classifier.
- [x] Gemini hiring-intent classifier with fail-open `[intent?]` flag (no `GEMINI_API_KEY` / error → kept, not dropped).
- [x] Config keys (`block_locations`, `hiring_intent`) accepted and validated by `validate-portals.mjs`.
- [x] Synthetic-only test fixtures (no PII); pure units in `test-all.mjs` §30/§32.
- [x] WBS entry (this file) + README row added.
- [ ] **Live end-to-end `--spend` run exercising Gemini on real ambiguous posts (operator's spend-go).**
