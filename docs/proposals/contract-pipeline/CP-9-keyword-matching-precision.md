# CP-9: Keyword matching precision

**Status:** Built · **Phase:** 1 · **Depends on:** CP-1 · **Effort:** S

## Overview

The scanner matches keywords by raw substring. `scan.mjs` does `title.toLowerCase().includes(keyword)`, and the positive list includes `AI` and `Agent`. That produces false positives that flood the pipeline.

The Reed spike proved it live. Searching contract roles returned `Site Agent`, `Sub Agent`, `Customer Service Agent`, and `Interim Financial Accountant`. The current filter would keep all of them, because `agent` is a substring of `site agent` and `ai` is a substring of `maintain`, `domain`, and `captain`.

There is a second noise class that keyword precision alone cannot catch: **company-named gig-mills**. The first live Apify/LinkedIn scan (2026-06-26) surfaced gig-mills whose titles and JD text read like genuine roles — RLHF-eval piecework (`Great Value Hiring`), data-labeling platforms (`Alignerr`, "AI Training"), and staffing-mills that repost the same role with absurd pay bands (`Crossing Hurdles`). Description-phrase filtering (`content_filter.negative`) catches the explicit RLHF-eval class but misses the rest, because there is nothing wrong with the *words* — only the *employer*. The scanner has **no company-exclusion mechanism** today. See the `contract-supply-gigmill-noise` memory for the pattern + tells.

This ticket fixes the matching engine **and** adds company exclusion. Both are cross-cutting filter-quality concerns: every source feeds through them, so they gate pipeline quality. Build before CP-3.

## Technical notes

- Replace substring matching with **word and token-boundary matching**. `agent` must not match `management` or `site agent`. `AI` must not match `maintain`.
- Support **multi-word phrases** as first-class positives, for example `AI Engineer`, `Forward Deployed Engineer`, `LLM Engineer`. A phrase matches only as an ordered token run, not as loose tokens.
- Strengthen the **negative list** in `portals.yml` with the real noise the spike surfaced: `Site Agent`, `Sub Agent`, `Customer Service Agent`, `Estate Agent`, `Interim Accountant`, and similar. Keep negatives in the user layer.
- Keep the matcher pure and zero-token. It is string logic in `scan.mjs`, shared by all adapters.
- Ship with **test fixtures built from the actual spike output**, so the noisy titles become locked regression cases in `test-all.mjs`. Use both the Reed title spike and the Apify gig-mill output as fixture sources.
- Keep positives and phrases configurable in `portals.yml`. The matcher reads them; it does not hardcode them.
- Add a **company-exclusion filter** (e.g. `buildCompanyFilter` alongside `buildTitleFilter` in `scan.mjs`) that drops a job when `job.company` matches a user-layer blocklist. Mechanism in `scan.mjs`; the blocklist itself lives in `portals.yml` (a new `company_filter.negative` or similar). Seed the user's blocklist with the confirmed gig-mills: `Alignerr`, `Crossing Hurdles`, `Great Value Hiring`.
- Match company names on token/word boundaries too, so the blocklist does not over-match legitimate employers that merely contain a blocked substring.

## Definition of Done

- [x] Keyword matcher uses word/token boundaries; documented noise titles (`Site Agent`, `maintain`, etc.) no longer match.
- [x] Multi-word phrases match only as ordered token runs.
- [x] Negative list in `portals.yml` extended with spike noise; matcher honours it.
- [x] Regression fixtures from the spike output added and asserted in `test-all.mjs`.
- [x] Positives, phrases, and negatives all read from `portals.yml`, not hardcoded.
- [x] Existing ATS scan behaviour unchanged for titles that legitimately matched before.
- [x] Company-exclusion filter drops jobs whose `job.company` matches a `portals.yml` blocklist (mechanism in `scan.mjs`, blocklist in the user layer); seeded with `Alignerr`, `Crossing Hurdles`, `Great Value Hiring`.
- [x] Company blocklist matches on token boundaries (no over-matching legitimate employers); regression fixtures from the Apify gig-mill output asserted in `test-all.mjs`.
- [x] `test-all.mjs` passes.
