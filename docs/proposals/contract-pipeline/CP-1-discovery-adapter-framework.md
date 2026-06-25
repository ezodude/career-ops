# CP-1: Discovery adapter framework + Reed source

**Status:** Proposed · **Phase:** 1 · **Depends on:** — · **Effort:** M

## Overview

`scan.mjs` can only read three ATS providers, and the logic is hard-wired to `careers_url`. To pull contract roles we need more sources, starting with Reed, the UK's largest job board. Reed exposes contract roles that company career boards never list.

This ticket generalises the scanner into a pluggable source-adapter model, then adds Reed as the first new adapter. It unlocks every later discovery ticket.

## Technical notes

- Refactor `detectApi()` and `PARSERS` into a source-adapter interface. Each adapter exposes `fetch(config)` and returns the common offer shape.
- Extend the offer shape with new fields: `contract_type`, `remote_type`, `comp_raw`, `posted_date`. Existing fields (`title`, `url`, `company`, `location`, `source`) stay.
- Add a `sources:` block to `portals.yml` (user layer). Each entry names an adapter and its query params (keywords, location, contract flag).
- Reed adapter calls the official Reed jobseeker API. It is free and needs an API key. Auth is HTTP basic, key as username, blank password.
- Reed supports `keywords`, `locationName`, `distanceFromLocation`, and a `contract` boolean. It returns contract type and salary per job.
- Add `REED_API_KEY` to `.env.example`. Read secrets from `.env`.
- Reed has no direct remote flag. Treat remote as a keyword and location post-filter (handled in CP-3).
- Push exact phrases to the source API where supported, to cut noise before it reaches our filter. Keyword precision in the filter itself is CP-9.
- Keep the whole path zero-token. Pure HTTP and JSON, no LLM call.

## Definition of Done

- [ ] `scan.mjs` runs all sources through one adapter interface; existing Greenhouse/Ashby/Lever behaviour unchanged.
- [ ] Reed adapter fetches contract roles by keyword and UK location and returns the extended offer shape.
- [ ] `portals.yml` `sources:` block controls which adapters run and their params.
- [ ] `REED_API_KEY` documented in `.env.example`; missing key skips Reed with a clear message, no crash.
- [ ] `node scan.mjs --dry-run` lists Reed results with contract type and source tag.
- [ ] `test-all.mjs` passes.
