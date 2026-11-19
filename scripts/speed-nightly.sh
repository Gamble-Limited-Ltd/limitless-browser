#!/usr/bin/env bash
# Unattended release-candidate gate on main (TS-1). Results: ~/gll-planning/reports/limitless-speed/<date>-main/SUMMARY.md
exec "$(dirname "$0")/gate.sh" main --tier rc "$@"
