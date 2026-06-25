# CP-4: Reachability scoring from connections CSV

**Status:** Proposed · **Phase:** 1 · **Depends on:** CP-1 · **Effort:** M

## Overview

The best way into a contract is a warm intro through a 1st or 2nd degree connection. The system should tell you which discovered roles are warm and who can introduce you, so you spend effort where there is a path in.

This ticket scores each role for reachability using a cached LinkedIn connections export. No scraping, no browser. It is the core primitive the network-first phase later reuses.

## Technical notes

- New zero-token script `reachability.mjs`.
- Input: `data/connections.csv`, the user's own LinkedIn connections export (Name, Company, Position, URL). LinkedIn provides this via Settings, Get a copy of your data. It is not scraped.
- Build a `company to connections` index. Normalise company names (lowercase, strip suffixes like Ltd, Inc).
- For each new offer: a 1st-degree connection at that company means **WARM**, and the script names the connection. No match means **COLD**.
- Annotate `pipeline.md` and the tracker with the warm flag and connection name(s).
- **2nd-degree stays out of the routine loop.** For a role the user chooses to chase, allow an opt-in lookup (Apify company-employees actor, or paste a name). Never run it automatically.
- Document the re-export cadence in onboarding. The CSV is refreshed manually.

## Definition of Done

- [ ] `reachability.mjs` reads `data/connections.csv` and builds a normalised company index.
- [ ] Each new offer is tagged WARM (with connection names) or COLD.
- [ ] Warm flag and names appear in `pipeline.md` and the tracker.
- [ ] Company-name matching handles common suffix and case differences.
- [ ] Missing or empty `connections.csv` degrades gracefully (all COLD, clear message).
- [ ] 2nd-degree lookup is opt-in only and documented; nothing automatic.
- [ ] `test-all.mjs` passes.
