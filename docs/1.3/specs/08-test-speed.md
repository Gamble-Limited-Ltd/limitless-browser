# 08: Faster gate runs on this VM (spec, 2026-11-19)

Area code **TS**. Master plan: `docs/1.3/NATIVE-SPEED-PLAN.md`. Ledger: `docs/1.2/SPEED-NEXT.md`.
Boss (2026-11-19): **VM only, the build PC is out of scope** for Limitless tests. Nothing here changes a threshold of the release gate
(10 percent and 100 ms, `scripts/speed-compare.mjs`) without Boss's OK; TS-4 changes how the verdict is reached and is listed in
"Decisions for Boss" in the master plan.

## 0. Where the time goes today (measured, 2026-11-18 overnight run, `~/gll-planning/reports/limitless-speed/2026-11-18_overnight/`)

| Run | Time | What it is |
|---|---|---|
| `npm test` (e2e, 462 tests, `fullyParallel`, default workers = 4 on 8 vCPU) | 24.9 min | every item, today the full suite |
| speed run, fixtures only (`LB_SPEED_PUBLIC=0`), both projects, 7 reps | 38.6 min | one build; the base build is a second run of the same length unless reused |
| speed run per project | about 19 min, about 2.7 min per rep | 6 fixture sites cold + warm + boot |
| real-site suite, 42 sites x 3 reps, 1 worker | about 1 h | pass/fail, chromebook |
| one item, all of the above, base reused | about 2 to 2.5 h | so a night fits about 3 items |

Other facts that matter: `deploy/rehearsal/run.sh` runs `compose down -v` and `scripts/build-static.sh` on every start (one build per run);
`scripts/speed-nightly.sh` still checks out `release/1.0.0` (stale); `gll-prebuild.timer` builds Docker images on this VM every 10 minutes
(CPU noise during a speed run); `tests/stack/real-sites.json` still lists YouTube, which 1.2.2 blocks on purpose.

**Target:** one item's gate in **about 40 min** (e2e by tags about 10, speed about 25, sites by tags about 5), a release candidate in
**about 80 min**. A night then fits 6 to 8 items instead of 3. Estimates marked [est] come from the research file
(`docs/1.3/research/tests-2026-11-19.md`, Sonnet) and our own per-rep numbers; each TS item measures its real saving and writes it here.

## Item template (used by every spec in `docs/1.3/specs/`)
Each item has: **id** (old ids), **status**, **why**, **rules** (numbered, testable), **how**, **state** (files, keys, env), **edge cases**,
**tests** (failing test first where it is code), **measured by / exit**, **rollback**, **likely time** (agent hours, 1 plan day = 2 to 4 h).

---

## TS-1 One gate runner script (new; replaces hand-assembled night jobs)
- **Status:** built 2026-11-19 (branch `tools/1.3-test-speed`). First item-tier run, CL-1 (`release/1.2.3`, `--tags rewrite`): 37.5 min in all (build cached 0.0, e2e 3.9, speed 24.6 with 3 reps chromebook for the candidate and the base, sites 9.1) against about 2 to 2.5 h by hand (2026-11-18 report); the plan target is about 40. Deviations: the harness comes from the checkout that holds `gate.sh` and is overlaid on the source of `<ref>` (so `release/*` branches cut from `main` need no tooling commits); refs are committed trees, so the dirty-worktree refusal is not needed; a kill (Ctrl-C) stops the process group, sweeps the rehearsal project by label, removes the prebuild pause and the worktrees. `--steps` and `--speed-reps` added. With 7 speed reps (the release setting) an item takes longer: CL-1 speed 55.4 min; CL-2 68.6 min in all (e2e 11.9, speed 55.8); TL-1 84.4 min (e2e 9.1, speed 55.4, sites with base 19.1). The 40 min target holds only at 3 reps, which is too few to decide a release (see TS-4). **Likely time:** 2 h.
- **Why:** night jobs are assembled by hand per agent (A-speed, B-sites, C-l3 folders), and `speed-nightly.sh` runs a stale branch.
- **Rules:**
  1. `scripts/gate.sh <ref> [--base <ref>] [--tier item|rc] [--tags a,b] [--features K=V,...]` is the only entry point for gate runs.
  2. It takes `flock /tmp/limitless-rehearsal.lock` for the whole run and refuses to start a speed step while another holder exists.
  3. It builds each ref once into `~/.cache/limitless-gate/dist/<sha>-<featurehash>/` and reuses that tree (TS-3).
  4. It writes `~/gll-planning/reports/limitless-speed/<YYYY-MM-DD_HHMM>-<ref>/` with `SUMMARY.md` (one table: step, minutes, verdict),
     raw JSON and logs. Exit 0 only when every gated step passed.
  5. `--tier item` runs TS-5 (tagged e2e), TS-4 (speed, chromebook, fixtures) and TS-6 (tagged sites). `--tier rc` runs full e2e, TS-4 on
     both projects, full sites, the profile harness and boot size.
  6. `speed-nightly.sh` becomes a 3-line wrapper: `gate.sh main --tier rc`.
- **State:** none besides the cache dir and reports.
- **Edge cases:** dirty worktree (refuse, print the paths); a ref that does not have `test:speed:quick` (old builds: run the step with
  the harness of the candidate ref, which is what TS-4 needs anyway); killed run (the existing `run.sh` label sweep cleans up; the lock
  is released by the kernel).
- **Tests:** `tests/unit/gate-args.test.mjs` (node --test): argument parsing, tier to step list, feature hash stable for the same set in
  any order. A dry run `--dry-run` prints the steps and exits 0.
- **Measured by:** the `SUMMARY.md` table, minutes per step. **Rollback:** delete the script; old commands still work.

## TS-2 Quiet machine during speed steps
- **Status:** built 2026-11-19. Pause with marker and trap, window warning, `env.load1` and `env.noisy` in the speed JSON. Deviation: the first run used the spec's "load1 above 2.0 waits up to 60 s" and every rep waited the full 60 s (load1 lags and holds the previous rep's own work, about 20 min lost per side), so the wait now keys on CPU busy over 35 percent in a 1 s sample (load1 is still recorded). Noisy reps in the two item runs: 0. The gate still fails on different rows from run to run (see TS-4): quiet alone does not cure it. **Likely time:** 1 h.
- **Why:** the gate fails on different rows each run (1.2.0 record); background CPU on this VM is one known cause. Fewer false fails save
  a whole rerun (about 39 min) each time.
- **Rules:**
  1. Before a speed step, `gate.sh` touches `~/.gll-prebuild.pause` (documented pause switch of `gll-prebuild.timer`) and removes it after,
     also on failure (trap). If the file existed before, it is left alone.
  2. It records the 1-minute load average before and after each rep in the JSON (`env.load1`). A rep that starts with load1 above 2.0 waits
     up to 60 s, then runs and is flagged `noisy: true`.
  3. No other suite runs during a speed step (the lock already says so; rule 2 makes violations visible).
  4. Speed steps prefer 01:00 to 05:00 Chicago (before the 05:00 rotation prestage); `gate.sh` prints a warning outside that window, it does not refuse.
- **Edge cases:** the prebuild pause must never stay on: the trap removes it, and `gate.sh` refuses to start if the pause file is older
  than 6 h and was created by it (`~/.cache/limitless-gate/paused-by-gate` marker), printing a warning instead of silently clearing it.
- **Not done (unverified gain, [est]):** CPU pinning with `taskset` or `--cpuset-cpus`; try only if TS-4 still shows drift.
- **Measured by:** count of `noisy` reps per run; rerun rate over two weeks. **Rollback:** remove the two calls.

## TS-3 Build once per sha and feature set
- **Status:** built 2026-11-19. `LB_DIST` in `run.sh`, cache `~/.cache/limitless-gate/dist/<sha>-<featurehash>/` (newest 10 kept, dirty never cached), base speed and site results reused for 12 h (key: base tree, tier, reps, `LB_SPEED_TIER`). A cache hit costs 0.0 min; an uncached build 0.8 min (CL-2, TL-1). `--features` apply to the candidate only (the base is built as prod is). **Likely time:** 1.5 h.
- **Rules:**
  1. `run.sh` accepts `LB_DIST=<dir>`; when set it skips `build-static.sh` and serves that tree.
  2. The cache key is `<sha>-<sha256 of sorted LB_FEATURE_* pairs, 8 chars>`; a dirty tree is never cached.
  3. Cache is pruned to the last 10 trees by mtime.
- **Tests:** a node test that two feature orders give one key; an e2e that `LB_DIST` is honoured (version.json sha matches).
- **Saving [est]:** 1 to 3 min per run, more on the rc tier (several runs per build). **Rollback:** unset `LB_DIST`.

## TS-4 Interleaved A/B speed step with early stop (replaces "base run + candidate run")
- **Status:** built 2026-11-19 (`scripts/lib/abstat.mjs` paired bootstrap, `speed.spec.js` test "interleaved A/B", `run.sh` `LB_DIST_B`, `gate.mjs` step `speedab`, default on, `--no-ab` = old mode; unit tests `abstat.test.mjs`). **Deviation:** one web container serves both trees and the spec flips a `cur` symlink between reps (`REHEARSAL_AB_DIR`), because a second web service on another port fails the gate's Origin and `PUBLIC_ORIGIN` checks. **First A = B self-test** (`main` cec4d6f against itself, item tier, chromebook, 2026-11-19 14:41, NOT quiet: e2e ran beside it for about 20 min): 63.6 min, 0 fail, 22 pass, 6 inconclusive of 28 rows (boot repeat x2, fx-app warm x2, fx-article warm x2; warm rows sit near the 100 ms floor). False-fail rate 0 of 1 so far; under D3 the 6 inconclusive rows would fail an rc run, so rc runs belong in the quiet window and the inconclusive rate is watched. **Likely time:** 6 to 8 h (harness change plus the stack change). Verdict rule approved by Boss on 2026-11-19 (master plan
  decision D3); thresholds stay 10 percent and 100 ms.
- **Why:** today the base and the candidate run at different times (or the base comes from an older night), so machine drift lands on one
  side only. Interleaving A and B rep by rep in one stack cancels drift (the method Tachometer and Chromium Pinpoint use; sources in the
  research file), and stopping early on clear rows saves reps.
- **Rules:**
  1. The rehearsal stack serves two static trees at once: `web-a` and `web-b` (same nginx image, same gate, relay and fixtures), reachable
     as two hostnames in the test network. The member session is shared (same gate).
  2. Order per rep: A then B on even reps, B then A on odd reps, each in a fresh browser context, per fixture site.
  3. Start with 4 pairs per row. After each pair from the 4th on, per row (site x phase x metric that the gate checks: `shown`, `load`):
     - **pass early** when the bootstrap 90 percent interval of `median(B) - median(A)` is entirely below `max(10 percent of A, 100 ms)`;
     - **fail early** when the interval's lower end is above that bound;
     - else continue, at most 9 pairs. A row still undecided at 9 pairs is reported **inconclusive** and counts as a fail for the release
       gate (same strictness as today), and as a warning for the item tier.
  4. Only fixture rows and boot rows gate. Public sites are not in the item tier at all; in the rc tier they run 3 reps, advisory only
     (as today).
  5. Output keeps today's JSON shape per side (`speed-<sha>-<project>.json`) plus `abtest-<shaA>-<shaB>-<project>.json` with per-row
     pairs, interval and verdict, so `speed-compare.mjs` still works for old comparisons.
- **How:** `speed.spec.js` gets an `LB_SPEED_AB=<urlA>,<urlB>` mode; the decision helper lives in `scripts/lib/abstat.mjs` (pure,
  seeded bootstrap, 2,000 resamples).
- **Edge cases:** a rep that errors on one side drops the whole pair; 3 dropped pairs on a row = inconclusive with reason; A and B the same
  sha (self-test) must pass every row.
- **Tests:** `abstat.test.mjs`: identical samples pass in 4 pairs; a constant +300 ms shift fails by pair 4; a +5 percent shift with noise
  passes or goes inconclusive, never fails; seed makes it deterministic. Stack test: A = B self-run passes.
- **Measured by:** minutes per item speed step (target about 25 min chromebook only [est]; today 19 min per project per build, i.e. 38 min
  for base + candidate) and the false-fail rate (A = B runs that fail; target 0 of 5).
- **Rollback:** run the old mode (no `LB_SPEED_AB`); `speed-compare.mjs` unchanged.

## TS-5 e2e by tags for items, full suite for release candidates
- **Status:** built 2026-11-19, deviation: tags live in `tests/tags.json` (spec file to tags, changed path to tags) instead of in `describe` titles, because release branches cut from `main` carry no tags and most specs use plain `test()`. Every spec must have an entry (unit test). Measured: full `npm test` on this VM 25.2 min (1511 s, 465 passed, 1 failed: `chromebook.spec.js` CPU-throttle ratio, as in the 1.2.2 record); CL-1 item tier (core + rewrite, 20 of 67 files) 3.9 min. The `--workers=6` trial is not done. **Likely time:** 3 h.
- **Rules:**
  1. Each spec file in `tests/e2e/` carries Playwright tags in its `describe` titles (`@boot @rewrite @router @lane @images @admin @botcheck
     @media @ui`); a test without a tag gets `@core`.
  2. `tests/tags.json` maps source paths to tags (for example `app/main.js` rewrite region by function names is too fine: map files,
     and for `app/main.js` and `index.html` use the item's own tag list from its spec).
  3. Item tier: `@core` plus the item's tags (`--grep`). Release candidate: everything.
  4. Workers: try 6 (`--workers=6`) once against 4 on the full suite; keep 6 only if the suite is faster and has no new flaky test in 3
     runs (memory: about 7 GB free on the VM; watch it).
- **Edge cases:** a change in a shared helper (`tests/lib/*`, `playwright.config.js`) forces the full suite.
- **Tests:** a node test that every spec file has at least one tag.
- **Saving [est]:** 25 min to about 10 min per item. **Rollback:** run without `--grep`.

## TS-6 Real-site suite: tags, 4 workers, reps across sites
- **Status:** built 2026-11-19. Tags and `official` (10 sites; steam, gimkit and coolmath were not in the list and were added with generic selectors, they loaded 1/1), YouTube `expect: blocked`, 4 shards that own whole sites and walk rep by rep, 403 and 429 count as `blocked`. The item tier also runs the base on the same sites (cached 12 h) and fails only on a site that loaded on the base and not on the candidate after one retry. Measured: CL-1, 27 sites, 1 rep, 4 workers: 9.1 min, 21 of 27 loaded (discord and kahoot timed out at 45 s under 4 workers, google-docs, khanacademy, twitch render, tumblr script) against about 1 h for the old 42 x 3 x 1 worker. The YouTube blocked-card check and the rc tier (all sites, 3 reps) have not been run yet. **Likely time:** 3 h.
- **Rules:**
  1. Each entry in `real-sites.json` gets `tags` (`images video chat botcheck heavyjs school game google`) and `official: true` for the
     10-site list (master plan section 1).
  2. Item tier: sites whose tags meet the item's tags, plus the official list, 1 rep. Release candidate: all sites, 3 reps.
  3. Reps are ordered across sites (site 1 rep 1, site 2 rep 1, ... then rep 2), so no host sees back-to-back loads.
  4. Workers 4; each worker owns whole sites (no two workers on one host at once).
  5. YouTube stays in the list with `expect: "blocked"`: pass = the "YouTube is not available" card shows. It is no longer a speed row.
  6. Pass/fail only; timing from this suite is reported, never gated.
- **Edge cases:** rate limits and 403/429 count as category `blocked`, not as a Limitless failure, and never retry more than once.
- **Tests:** schema test for `real-sites.json` (every entry has tags; official list has exactly 10).
- **Saving [est]:** 1 h to about 15 min (rc), about 5 min (item). **Rollback:** `LB_SITES_WORKERS=1`, no tag filter.

## TS-7 Bot-check metric in the site run (was T3)
- **Status:** built 2026-11-25 (`tools/1.3-profiles`; `scripts/lib/challenge.mjs`, `sites.spec.js` records `challenge` per rep and `vantage` per site, `sites-merge.mjs` adds `summary.challenges`, the gate's sites note prints "challenges N per 100 loads (vantage)"; unit tests `challenge-baseline.test.mjs`). Deviation: `card` = the app's Human Check card showed (so `LB_botCheck` said yes) and `vendor` = a challenge widget or vendor script in the loaded page, found by pattern, not by hooking `LB_botCheck`. Vantage `rehearsal-home` unless `LB_SITES_VANTAGE=vps`. Not run on real sites yet. **Likely time:** 1.5 h.
- **Rules:** per site and rep the suite records `challenge: none|card|vendor` from `LB_botCheck` and the vantage (`rehearsal-home`,
  `vps`); `SUMMARY.md` gets "challenges per 100 loads" per vantage. Never retries a challenged load more than once and never interacts
  with a challenge (spec 06 rules).
- **Measured by:** the table; spec 06 BC-7 uses it.

## TS-8 Baseline per release (was SPEED-NEXT F "keep baselines")
- **Status:** built 2026-11-25 (`tools/1.3-profiles`; `scripts/lib/baseline.mjs`, written by `gate.mjs` at the end of a passing `--tier rc` run that measured speed, version from the ref's `package.json`, harness = the tools checkout's HEAD; unit test). Not run yet. **Likely time:** 1 h.
- **Rules:** after each release, `gate.sh <release sha> --tier rc` writes `docs/1.3/baseline/<version>.md` (one table, medians, date,
  harness hash). It is the reference for the "x native" table and for ads (SPEED-AUDIT 4b). TS-4 makes it unnecessary for item gates.

## TS-9 Real-site recordings as fixtures (new, brainstorm H1)
- **Status:** planned. **Likely time:** 6 h.
- **Rules:**
  1. `scripts/record-site.mjs <name> <url>` loads the page once in Chromium (native, no proxy) with `recordHar`, keeps every response
     body, and writes `~/.cache/limitless-fixtures/<name>/<date>/` (third-party content: **never committed**, never copied to the build
     PC or any other machine).
  2. The fixtures container serves a recording under `fx-<name>.fixture` with every recorded host remapped to
     `<host-hash>.fx-<name>.fixture` (URLs inside HTML, CSS and JS rewritten by plain string replace at record time), so payload sizes and
     script complexity stay real.
  3. Rows `fx-steam`, `fx-kahoot`, `fx-discord`, `fx-reddit` join the speed gate when their recording exists, else they are skipped with a
     note (a fresh clone still runs the gate).
  4. Re-record monthly or when a site row changes shape; the record date goes into the gate JSON.
- **Tests:** a recording of a local fixture page round-trips (served page loads with zero requests outside the fixture hosts).

## TS-10 Rewriter micro-bench per commit (new, brainstorm H2)
- **Status:** built 2026-11-19 (`scripts/rw-bench.mjs`, extraction of `rewriteLocationRefs` from `app/main.js`, 5 reps, 10 percent rule with one retry because a single pass flaked on a loaded VM). 2026-11-25: `~/.cache/limitless-fixtures/bundles/` holds 112 real site bundles (bbc, walmart, weather, bing and more, 52 MB, cache only, filled 2026-11-24, not by this item); `--save-base` was run on `tools/1.3-profiles` and `rw-bench-base.json` exists, so the gate step no longer skips. **Likely time:** 2 h.
- **Rules:** `node scripts/rw-bench.mjs` runs the rewriter (the `app/rewriter.js` module once SV-4's G4-1 exists, before that the
  extraction harness) on the bundles in `~/.cache/limitless-fixtures/bundles/`, and, with `--base <dir>` (the gate passes its base worktree),
  times base and candidate interleaved in one run (7 reps, A,B then B,A, medians); more than 10 percent slower than base on any bundle
  fails, a byte-identical rewriter skips the compare. Without `--base` it falls back to the saved
  `~/.cache/limitless-fixtures/rw-bench-base.json` (load-sensitive, fixed 2026-11-26). Runs in `gate.sh` before the stack
  starts (seconds). Skipped with a note when the bundles are absent.

## TS-11 Automatic bisect (new, brainstorm H3)
- **Status:** planned. **Likely time:** 3 h.
- **Rules:** `gate.sh <combined ref> --bisect <item refs in merge order>` reruns only the failing speed rows (`LB_SPEED_ONLY`) with A/B
  (TS-4) on each item's tip against the base, stops at the first item that reproduces the failure, and writes the culprit into
  `SUMMARY.md`.

## TS-12 Non-timing suites side by side (new, brainstorm H4)
- **Status:** partial 2026-11-19: built and unit tested (4 GB guard, e2e on its own free port beside the sites suite in the rc tier), but the rc tier has not been run, so no measured saving. **Likely time:** 1 h.
- **Rules:** in the rc tier, `npm test` (static server on its own port, `LB_E2E_PORT`) runs at the same time as the sites suite; neither
  ever runs during a speed step (`gate.sh` holds the speed step alone). Memory guard: start the second suite only with 4 GB or more free.

## Order
TS-1, TS-2, TS-3, TS-12 first (one evening, small), then TS-5 and TS-6 (one night), TS-10, then TS-4 (largest; needs Boss's OK on D3),
TS-9 recordings, TS-11 bisect, then TS-7, TS-8. Total about 30 to 33 agent hours.

Last verified: 2026-11-19
