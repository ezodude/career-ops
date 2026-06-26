# Test fixtures

Real, captured API output used as locked regression cases. Do not hand-edit —
re-capture from the live source if a schema changes.

| File | Source | Captured | Used by |
|------|--------|----------|---------|
| `apify-linkedin-jobs-sample.json` | Apify actor `chronometrica/linkedin-jobs-scraper`, `run-sync-get-dataset-items` (input: searchTerm "AI Engineer", location "United Kingdom", jobType contract, workplaceType remote, maxItems 5) | 2026-06-26 | `test-apify-adapter.mjs` (output-mapping regression); seeds CP-9 keyword/company-exclusion fixtures |

`apify-linkedin-jobs-sample.json` is the raw 5-item actor output. It exercises the
output-field quirks `mapApifyJob` must handle (`locationRaw`/`locationCity` not
`location`; `salaryRaw` + `salaryMin`/`salaryMax`/`salaryCurrency` not `salary`)
and contains real gig-mill rows (Great Value Hiring, Crossing Hurdles) for CP-9
company-exclusion work.
