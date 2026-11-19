#!/usr/bin/env bash
# TS-1: the one entry point for gate runs (spec docs/1.3/specs/08-test-speed.md).
#   scripts/gate.sh <ref> [--base <ref>] [--tier item|rc] [--tags a,b] [--features K=V,...] [--dry-run]
# Holds /tmp/limitless-rehearsal.lock for the whole run and refuses to start while another holder exists
# (LB_GATE_LOCK_WAIT=<seconds> waits instead). Report: ~/gll-planning/reports/limitless-speed/<date>-<ref>/SUMMARY.md
# Ctrl-C or kill: the whole process group gets TERM (the stack tears itself down), then the prebuild pause and worktrees are removed.
set -uo pipefail
export PATH="$HOME/.nvm/versions/node/v22.23.0/bin:$PATH"
HERE="$(cd "$(dirname "$0")" && pwd)"
case " $* " in *" --dry-run "*) exec node "$HERE/gate.mjs" "$@" ;; esac
exec 9>/tmp/limitless-rehearsal.lock
flock -w "${LB_GATE_LOCK_WAIT:-0}" 9 || { echo "gate: another run holds /tmp/limitless-rehearsal.lock, not starting" >&2; exit 3; }
setsid env LB_GATE_LOCKED=1 node "$HERE/gate.mjs" "$@" &
pid=$!
cleanup() {
  kill -TERM -- "-$pid" 2>/dev/null
  for _ in $(seq 1 60); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  kill -KILL -- "-$pid" 2>/dev/null
  # after a KILL the stack of THIS rehearsal project (never prod `limitless-browser`) is still up: remove by label, as run.sh does at start
  f="label=com.docker.compose.project=limitless-browser-rehearsal"
  ids=$(docker ps -aq --filter "$f"); [ -n "$ids" ] && docker rm -f $ids >/dev/null 2>&1
  ids=$(docker network ls -q --filter "$f"); [ -n "$ids" ] && docker network rm $ids >/dev/null 2>&1
  ids=$(docker volume ls -q --filter "$f"); [ -n "$ids" ] && docker volume rm $ids >/dev/null 2>&1
  if [ -f "$HOME/.cache/limitless-gate/paused-by-gate" ]; then rm -f "$HOME/.gll-prebuild.pause" "$HOME/.cache/limitless-gate/paused-by-gate"; fi
  for w in "$HOME"/gll-worktrees/gate-*-"$pid"; do [ -d "$w" ] && git -C "$HERE/.." worktree remove --force "$w"; done
  git -C "$HERE/.." worktree prune
  exit 130
}
trap cleanup INT TERM
wait "$pid"; rc=$?
exit "$rc"
