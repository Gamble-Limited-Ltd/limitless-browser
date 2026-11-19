#!/usr/bin/env bash
# TS-1: the one entry point for gate runs (spec docs/1.3/specs/08-test-speed.md).
#   scripts/gate.sh <ref> [--base <ref>] [--tier item|rc] [--tags a,b] [--features K=V,...] [--dry-run]
# Holds /tmp/limitless-rehearsal.lock for the whole run and refuses to start while another holder exists
# (LB_GATE_LOCK_WAIT=<seconds> waits instead). Report: ~/gll-planning/reports/limitless-speed/<date>-<ref>/SUMMARY.md
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v22.23.0/bin:$PATH"
HERE="$(cd "$(dirname "$0")" && pwd)"
case " $* " in *" --dry-run "*) exec node "$HERE/gate.mjs" "$@" ;; esac
exec 9>/tmp/limitless-rehearsal.lock
flock -w "${LB_GATE_LOCK_WAIT:-0}" 9 || { echo "gate: another run holds /tmp/limitless-rehearsal.lock, not starting" >&2; exit 3; }
LB_GATE_LOCKED=1 exec node "$HERE/gate.mjs" "$@"
