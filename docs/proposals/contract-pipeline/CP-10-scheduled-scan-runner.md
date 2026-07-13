# CP-10: Scheduled scan runner + delivery

**Status:** ✅ **Shipped — live-verified 2026-07-13.** · **Phase:** 1 · **Depends on:** CP-8 · **Effort:** S–M

> Turns the manual scans into a hands-off **weekly** cadence. A macOS launchd Launch Agent runs both the free board scan and the paid warm-signal scan, surfaces *new* leads, notifies, and opens a Claude triage session **only when there is new warm signal**. Mirrors the operator's existing wayfinder launchd pattern. Design/spec: `docs/superpowers/specs/2026-07-10-cp-10-scheduled-scan-runner-delivery-design.md` (local scratch, not committed).

## Overview

CP-1…CP-9 built the discovery/filtering machinery and CP-8 added warm-signal discovery, but running them was still manual. CP-10 is the scheduling + delivery layer that makes the warm channel "turn on" without a human kicking it off. It is CSV-independent, so it shipped in parallel with the CP-4 wait.

The runner is opinionated about attention: new **board** offers just accumulate in `pipeline.md` for at-leisure skim; only new **warm humans** (the DM-able targets) open a Claude session. Spend is guarded on every paid run so the weekly cadence cannot blow the Apify FREE-plan cap.

## Technical notes

- **Scheduler:** macOS launchd Launch Agent (`scripts/com.career-ops.scan-runner.plist`), weekly **Monday 09:00 local** (`StartCalendarInterval`). Weekly matches the actor's `date_filter: past-week` — daily would re-pull the same window and overspend ~5×. Not cron / not CI: the upstream project expects users to self-schedule locally.
- **Launcher** (`scripts/scan-runner.sh`, mirrors `wayfinder/nurture-session.sh`): skip-date guard (`scripts/scan-runner-skip-dates.txt`) → `node scan.mjs` (free board sweep, no `--verify`) → `node --env-file=.env warm-scan.mjs --spend` (paid, budget-guarded) → parse markers → `osascript` notification → open iTerm + Claude **iff** new warm humans. A `--dry-run` flag echoes commands instead of running them (zero spend, for verification).
- **Machine markers** bridge scripts and shell: `scan.mjs` prints `NEW_OFFERS=<n>`; `warm-scan.mjs` prints `NEW_WARM=<n>` (or the `NEW_WARM=SKIPPED_BUDGET` sentinel). The launcher `sed`-parses them; a missing marker defaults to `0`.
- **`warm-scan.mjs` changes:** `appendToWarmLeads` returns the freshly-added rows; a pure `isWithinBudget` + network `checkBudget` (GET Apify monthly usage, conservative skip-on-error) gate the paid fetch **before** any spend; `appendToWarmDigest` prepends a dated `## <date> (N new)` section (newest-first) of new humans to `data/warm-digest.md` — the file the opened session reads.
- **Budget guard:** cap `$5` / margin `$0.5` default in code, overridable via `warm_signals.budget_cap_usd` / `budget_margin_usd` in `portals.yml` (validated in `validate-portals.mjs`). Skips (does not error) when `used + est > cap − margin`.
- **Gitignored runtime files:** `data/warm-digest.md`, `data/scan-runner.log`. Install/uninstall documented in the top-level `README.md` ("Scheduled scans").
- **launchd PATH gotcha:** launchd starts with a minimal `PATH` that omits Homebrew, so `node` is not found headlessly. The launcher prepends `/opt/homebrew/bin:/usr/local/bin` to `PATH` (no absolute `$HOME` literal, so it passes the repo's absolute-path hygiene check).
- Pure units (`isWithinBudget`, digest writer, added-rows return, budget-key validation) are unit-tested in `test-all.mjs` §31; the network `checkBudget`, `main()` wiring, the `.sh` launcher, and the plist are network/OS-bound and verified manually.

## Definition of Done

- [x] launchd Launch Agent runs weekly (Mon 09:00), driving the launcher.
- [x] Launcher runs **both** scans on one timer — free board scan (always) + paid warm scan (budget-guarded).
- [x] Hybrid delivery: notification always; Claude triage session opens **only** on new warm humans (board offers just accumulate in `pipeline.md`).
- [x] Budget guard refuses to spend when Apify usage is near the FREE-plan cap; `SKIPPED_BUDGET` suppresses the session.
- [x] New warm humans logged to `data/warm-digest.md` (dated, newest-first); digest + log gitignored.
- [x] `scan.mjs`/`warm-scan.mjs` emit machine markers the launcher parses; missing marker defaults to 0.
- [x] Optional `budget_cap_usd` / `budget_margin_usd` overrides accepted by `validate-portals.mjs`.
- [x] Install/uninstall + budget note documented in `README.md`.
- [x] `test-all.mjs` passes (§31 covers the pure units).
- [x] **Live-verified (2026-07-13):** a real run produced `NEW_OFFERS=260` + `NEW_WARM=12` (12 new UK/remote human leads, ~$0.60 within budget), wrote the dated digest, notified, and auto-opened the triage session.
