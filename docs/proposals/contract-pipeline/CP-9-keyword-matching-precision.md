# CP-9: Keyword matching precision

**Status:** Proposed · **Phase:** 1 · **Depends on:** CP-1 · **Effort:** S

## Overview

The scanner matches keywords by raw substring. `scan.mjs` does `title.toLowerCase().includes(keyword)`, and the positive list includes `AI` and `Agent`. That produces false positives that flood the pipeline.

The Reed spike proved it live. Searching contract roles returned `Site Agent`, `Sub Agent`, `Customer Service Agent`, and `Interim Financial Accountant`. The current filter would keep all of them, because `agent` is a substring of `site agent` and `ai` is a substring of `maintain`, `domain`, and `captain`.

This ticket fixes the matching engine. It is a cross-cutting concern: every source feeds through it, so it gates filter quality for the whole pipeline. Build it before CP-3.

## Technical notes

- Replace substring matching with **word and token-boundary matching**. `agent` must not match `management` or `site agent`. `AI` must not match `maintain`.
- Support **multi-word phrases** as first-class positives, for example `AI Engineer`, `Forward Deployed Engineer`, `LLM Engineer`. A phrase matches only as an ordered token run, not as loose tokens.
- Strengthen the **negative list** in `portals.yml` with the real noise the spike surfaced: `Site Agent`, `Sub Agent`, `Customer Service Agent`, `Estate Agent`, `Interim Accountant`, and similar. Keep negatives in the user layer.
- Keep the matcher pure and zero-token. It is string logic in `scan.mjs`, shared by all adapters.
- Ship with **test fixtures built from the actual spike output**, so the noisy titles become locked regression cases in `test-all.mjs`.
- Keep positives and phrases configurable in `portals.yml`. The matcher reads them; it does not hardcode them.

## Definition of Done

- [ ] Keyword matcher uses word/token boundaries; documented noise titles (`Site Agent`, `maintain`, etc.) no longer match.
- [ ] Multi-word phrases match only as ordered token runs.
- [ ] Negative list in `portals.yml` extended with spike noise; matcher honours it.
- [ ] Regression fixtures from the spike output added and asserted in `test-all.mjs`.
- [ ] Positives, phrases, and negatives all read from `portals.yml`, not hardcoded.
- [ ] Existing ATS scan behaviour unchanged for titles that legitimately matched before.
- [ ] `test-all.mjs` passes.
