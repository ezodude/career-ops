# CP-4: Reachability scoring from connections CSV

**Status:** ▶ Next — **blocked on the LinkedIn connections export** (`data/connections.csv`, user downloading as of 2026-07-09) · **Phase:** 1 · **Depends on:** CP-1 · **Effort:** M

> **Now also owns the CP-8 poster-warmth join.** Beyond scoring board offers by *company*, CP-4 is extended to score the **poster** of a [CP-8](CP-8-network-first-discovery.md) warm-signal lead — "do I have a warm path to this person" — and rank `data/warm-leads.md` by it. This is the piece the completed CP-8 discovery adapter is waiting on; it unblocks the moment the connections CSV lands.

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
- **Poster-warmth join (for CP-8):** match a warm-lead poster (`poster.name`, and their org parsed from the headline) against the connections index; annotate + rank `data/warm-leads.md` rows by warm-path (1st-degree to the poster, or a connection at the poster's org). Same index, no new data model.

## Definition of Done

- [ ] `reachability.mjs` reads `data/connections.csv` and builds a normalised company index.
- [ ] Each new offer is tagged WARM (with connection names) or COLD.
- [ ] Warm flag and names appear in `pipeline.md` and the tracker.
- [ ] Company-name matching handles common suffix and case differences.
- [ ] Missing or empty `connections.csv` degrades gracefully (all COLD, clear message).
- [ ] 2nd-degree lookup is opt-in only and documented; nothing automatic.
- [ ] **CP-8 poster-warmth join:** `data/warm-leads.md` humans are scored + ranked by warm-path to the poster (reusing the same index).
- [ ] `test-all.mjs` passes.
