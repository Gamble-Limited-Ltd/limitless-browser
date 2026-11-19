# 01: Measuring (spec, 2026-11-19)

Area code **MS**. Old ids merged here: NATIVE-SPEED-PLAN Phase 0 (0.1 to 0.4) and Phase 1 (1.1 to 1.4), SPEED-NEXT B2, G6 (cache
measurement moves to spec 04 SV-0). Every speed item in the other specs is judged by these numbers. Advert rule unchanged: every
published number is dated, names the device profile and the median and n (SPEED-AUDIT 4b).

## 0. Facts
- The emulated `chromebook` profile (1366x768, 4x CPU via CDP, 10/5 Mbit/s, 40 ms RTT, `tests/lib/profile.js`) cannot slow down Workers
  (CDP refuses: "only supported for pages"), so anything moved into a Worker looks better in the harness than on a device.
- The only real device is a school Chromebook: no installs, short manual runs (Boss, 2026-11-18).
- Real-VPS test traffic: at most 50 GB a month on one prod test member (Boss, 2026-11-18).
- No real paid number exists yet: every "Cardinal" number so far went through a VPS stand-in on this VM (TIER-NUMBERS).
- `lbPerfSample` already sends `page_shown` ms with a device class (no URL, 1 in 5, members only) and the admin panel has a daily p50/p90
  chart (gate `GET perf`, 30 days).

---

## MS-1 Native column in the harness (was 0.1)
- **Status:** planned. **Likely time:** 1.5 h.
- **Rules:**
  1. `profile.spec.js` and `speed.spec.js` accept `LB_NATIVE=1`: the same Chromium, profile and throttle load the site directly (no app,
     no relay), same marks where they exist (`shown` = first contentful paint after navigation start, `load` = load event).
  2. Output `native-<date>-<project>.json` in the same shape; a new `scripts/x-native.mjs <limitless.json> <native.json>` prints the
     ratio per site and phase (Limitless median / native median), and writes the "x native" table.
  3. Native runs never touch fixtures (they are not reachable natively in a meaningful way); only the official sites.
- **Edge cases:** a site that challenges the VM's native load is reported "native blocked", not as a ratio.
- **Tests:** `scripts/x-native.test.mjs` (node --test) on two small JSON files: ratio, missing side, blocked row.

## MS-2 In-app bench for the school Chromebook (was 0.2)
- **Status:** planned. **Likely time:** 3 h.
- **Rules:**
  1. `limitless://bench`, owner and Executive only (hidden otherwise, like `limitless://admin`).
  2. It loads the official sites one by one in a new tab, cold (cache cleared for that host first, not the whole cache) then warm, reads
     `__lbPerf` marks and the longest task (`PerformanceObserver` `longtask` in the app page), and shows a table with Copy (plain text,
     date, device memory, `navigator.hardwareConcurrency`, build sha, plan).
  3. A "Native times" column the owner types by hand from a stopwatch run on the same device, or left empty and labelled "emulated
     native" with MS-1's numbers.
  4. Never sends the results anywhere; copy only.
  5. Takes about 10 minutes for the 10 sites; one "Stop" button.
- **Tests:** e2e with stub sites: table rows, copy text format, hidden for a Cardinal member.
- **Exit:** Boss runs it once before each Minor (MS-6).

## MS-3 Steadier speed gate
- Moved to spec 08 TS-2 and TS-4.

## MS-4 Real-VPS test lane (was 0.4, 1.1, B2)
- **Status:** planned. **Likely time:** 3 h + Boss 15 min. **Decision:** MS-D2.
- **Rules:**
  1. Boss creates a prod GLL ID account `lbtest` and grants it Cardinal with amount 0 and the note "test account" (with the new Grant tab,
     spec 09). Its credentials live in `~/.config/gll-cloud/lbtest.env` (gitignored, never printed, never on the build PC).
  2. `tests/stack/vps.spec.js` signs in to prod Limitless as `lbtest` and runs MS-1's site list through the real VPS (Buffalo), chromebook
     profile, 3 reps.
  3. A meter `~/.local/state/limitless-tests/vps-gb.json` adds the bytes each run used (from the gate's per-member usage before and
     after); a run refuses to start above 45 GB in the calendar month and stops itself at 50 GB.
  4. Runs only between 22:00 and 06:00 Chicago (not at school hours, not during the 06:00 rotation).
  5. Ordinal is measured with a second account `lbtest-free` that never gets a plan (changing `lbtest`'s tier per run would be a prod
     write each time). Ordinal traffic uses public relays, so it does not count toward the 50 GB VPS meter.
- **Edge cases:** the gate's abuse throttle (sustained top speed) must not fire on test runs: runs are short; if it fires, the run stops
  and says so.
- **Exit:** a dated "x native" table for the official sites with native, Ordinal and Cardinal through the real VPS.

## MS-5 VPS capacity checks (was 1.3, 1.4)
- **Status:** planned. **Likely time:** 2.5 h.
- **Rules:**
  1. A sampler on the VPS (`deploy/relay-vps/sample.sh`, cron every minute for one week) writes CPU per container, RAM, disk and uplink
     to a local file; no hostnames, no member ids.
  2. Kuma alerts at 70 and 90 percent of the month's transfer (needs RackNerd's answer on whether 5 TB counts both directions:
     **Boss sends the ticket**, text drafted in the release record).
  3. Output feeds spec 04 SV-0 (the CPU budget).

## MS-6 The "x native" table per Minor (was Phase 0 exit)
- **Rules:** every Minor release record has one table: official sites x (native, Ordinal, Cardinal, Prime) x (cold, warm) shown ms
  and the ratio, from MS-1 and MS-4, plus one school-Chromebook run from MS-2. Prime and Executive differ from Cardinal only in server
  limits until spec 04 ships; until then they are "same as Cardinal, not measured".
- **Targets (unchanged, master plan section 2):** Cardinal 2.0x native or better, Prime 1.5x, Executive 1.3x (faster than native on
  Steam, Discord, Kahoot); longest task caused by us under 200 ms (Ordinal, Cardinal) or 100 ms (Prime, Executive).

## MS-7 Field numbers from members
- **Status:** exists (S9b). **Likely time:** 1 h.
- **Rules:** each release record adds the admin chart's p50 and p90 `page_shown` per device class for the 7 days before and after the
  release. Only aggregate numbers; no change to what is collected.

## Decisions for Boss (also in the master plan)
- **MS-D1 Official list without YouTube:** YouTube is blocked on every tier since 1.2.2, so it cannot be a speed row. Recommended: replace
  it with **Khan Academy** (school tool, heavy script, fails today with page script errors, so it shows real progress). Other options:
  Wikipedia (light, easy), Twitch (video, allowed), Canvas.
- **MS-D2 Test accounts:** create `lbtest` (Cardinal, $0) and `lbtest-free` (no plan) in prod; 50 GB a month already approved.

Last verified: 2026-11-19
