#!/bin/bash
# CP-10 weekly scan runner. Runs the free board scan + paid warm scan (budget-guarded),
# notifies, and opens a Claude triage session only when there are new warm leads.
# Triggered by launchd (com.career-ops.scan-runner) Mon 09:00. Mirrors wayfinder/nurture-session.sh.
set -uo pipefail

# launchd starts with a minimal PATH that omits Homebrew, so `node` is not found.
# Prepend the Homebrew (and Intel-brew) bin dirs so headless runs resolve node.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN="${1:-}"

SKIP_FILE="$(dirname "$0")/scan-runner-skip-dates.txt"
if grep -q "$(date +%Y-%m-%d)" "$SKIP_FILE" 2>/dev/null; then
  echo "skip-dates matched today — exiting."
  exit 0
fi

run() {  # echo instead of executing under --dry-run
  if [ "$DRY_RUN" = "--dry-run" ]; then echo "DRY: $*"; return 0; fi
  ( cd "$REPO" && eval "$@" )
}

# Free board sweep → pipeline.md
BOARD_OUT="$(run 'node scan.mjs' 2>&1)"; echo "$BOARD_OUT"
NEW_OFFERS="$(printf '%s' "$BOARD_OUT" | sed -n 's/^NEW_OFFERS=//p' | tail -1)"
[ -z "$NEW_OFFERS" ] && NEW_OFFERS=0

# Paid warm scan → warm-leads.md + digest (budget-guarded inside warm-scan.mjs)
WARM_OUT="$(run 'node --env-file=.env warm-scan.mjs --spend' 2>&1)"; echo "$WARM_OUT"
NEW_WARM="$(printf '%s' "$WARM_OUT" | sed -n 's/^NEW_WARM=//p' | tail -1)"
[ -z "$NEW_WARM" ] && NEW_WARM=0

# Notify
if [ "$NEW_WARM" = "SKIPPED_BUDGET" ]; then
  NOTE="warm skipped — near Apify cap · ${NEW_OFFERS} new board offers"
else
  NOTE="${NEW_WARM} new warm leads · ${NEW_OFFERS} new board offers"
fi
if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "DRY notify: $NOTE"
else
  osascript -e "display notification \"${NOTE}\" with title \"career-ops\""
fi

# Open a Claude triage session ONLY on new warm humans (numeric > 0)
case "$NEW_WARM" in
  ''|*[!0-9]* ) OPEN=0 ;;   # non-numeric (incl. SKIPPED_BUDGET) → no session
  * ) [ "$NEW_WARM" -gt 0 ] && OPEN=1 || OPEN=0 ;;
esac

if [ "$OPEN" = "1" ]; then
  PROMPT="Triage the ${NEW_WARM} new warm leads in data/warm-digest.md — help me shortlist and draft outreach."
  if [ "$DRY_RUN" = "--dry-run" ]; then
    echo "DRY open-session: $PROMPT"
  else
    osascript <<EOF
tell application "iTerm"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        write text "cd ${REPO}"
        delay 1
        write text "claude '${PROMPT}'"
    end tell
end tell
EOF
  fi
fi
