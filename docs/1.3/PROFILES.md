# Chromebook test profiles (2026-11-25)

Boss decision 2026-11-25: test on realistic school-Chromebook classes, not only the old `chromebook` profile. Table in
`tests/lib/profile.js`; CPU rates from `scripts/calibrate-cpu.mjs` (reference table `scripts/lib/cbrates.mjs`).

| Profile | Class | Viewport | Down / up | RTT | deviceMemory | hardwareConcurrency | CPU rate here | Runs here |
|---|---|---|---|---|---|---|---|---|
| `chromebook` | the old one, unchanged (1.2.9 comparisons) | 1366x768 | 10 / 5 Mbit | 40 ms | real | real | 4 | yes |
| `cb-low` | $200-300: Kompanio 520/540, Intel N100 | 1366x768 | 100 / 15 | 20 ms | 4 | 4 | 1 (raw 0.91) | yes |
| `cb-mid` | $300-450: Kompanio 838, Intel N200 | 1920x1080 | 200 / 30 | 20 ms | 8 | 4 | 1 (raw 0.57) | yes, numbers pessimistic |
| `cb-high` | $450-600: Core i3-N305 / Core 3 | 1920x1080 | 200 / 30 | 20 ms | 8 | 8 | 1 (raw 0.45) | CI-only |

Playwright projects `cb-low`, `cb-mid`, `cb-high` exist in the stack, native and VPS configs (stack: same specs as `chromebook`).
deviceMemory and hardwareConcurrency are overridden by an init script (`applyProfile`).

## CPU calibration (measured and sourced, 2026-11-25)
Rule: rate = score of this VM / score of the Chromebook chip, never below 1 (CDP can only slow down). A raw value under 0.5 marks the
profile CI-only (this VM is more than twice too slow for that class): the gate skips it with a note; `LB_PROFILES_FORCE=1` forces it.

This VM: Intel Xeon E5-2670 (Sandy Bridge-EP, 2.6 GHz). **No Speedometer 3 or JetStream 2 figure was found for it, nor for the
Kompanio 520 or N200** (Notebookcheck and cpu-monkey refused automated fetches, the MediaTek PDF could not be read here). So the single
common reference is **Geekbench 6 single-core**, from web search snippets of third-party pages (approximate, versions differ):

| Chip | GB6 single | Source |
|---|---|---|
| Xeon E5-2670 (this VM) | about 575 (bare-metal entries 540 to 610) | browser.geekbench.com user results (search snippets; a KVM entry at 289 ignored) |
| Kompanio 520 | 633 | Notebookcheck GB 6.5/6.7.1 and LaptopMedia; MediaTek's own sheet says 655 to 667 |
| Kompanio 838 | 1003 | Notebookcheck, GB 6.7.1 |
| Intel N100 | about 1220 | cpu-monkey comparison page |
| Intel N200 | about 1309 (three results: 1339, 1289, 1298) | browser.geekbench.com results |
| Core i3-N305 | about 1280 (Notebookcheck avg 1274 on GB 6.5) | cpu-monkey, Notebookcheck |

Each class uses its slowest listed chip with a figure (cb-low: Kompanio 520; cb-mid: Kompanio 838; cb-high: N305), so a rate is never
too heavy: cb-low 575/633 = 0.91, cb-mid 575/1003 = 0.57, cb-high 575/1280 = 0.45.

**Result: this VM is slower than every reference chip.** All three profiles run unthrottled (rate 1). What that means: cb-low is
within measurement error of the real class; cb-mid on this VM is about 1.75x slower than a Kompanio 838 (pessimistic, still useful for
ratios because native and Limitless see the same CPU); cb-high is about 2.2x slower than an N305, hence CI-only.

`node scripts/calibrate-cpu.mjs` (offline, about 2 s of JSON, regex, DOM, sort and parser work, 3 reps then once at 4x) measured
2058 ms here on 2026-11-25 and a 4.4x slowdown at rate 4 (the throttle scales, noisily). The score is not mapped to Chromebook
scores (no workload score exists for them); it is stored in `~/.cache/limitless-fixtures/cpu-calibration.json` so a drift of this
VM is visible and the table is re-derived when the VM or the reference changes.

## Not emulated
- **RAM caps.** Only `navigator.deviceMemory` is overridden. A real 4 GB Chromebook runs out of memory and discards tabs; the harness
  does not (no per-browser cap was built, not tried: a `systemd-run --user --scope -p MemoryMax=` wrapper would kill the whole browser,
  not reproduce tab discard).
- **Workers**: CDP cannot throttle them (spec 01 section 0). **Disk and thermal throttling.**
- ARM chips (Kompanio) differ from x86 in JIT and memory behaviour; the rate only matches single-core speed.

## Commands
`scripts/gate.sh <ref> --profiles cb-low,cb-mid` (default stays `chromium,chromebook` for rc, `chromebook` for item). The A/B, sites,
profile and boot-size steps take the profiles; sites and profile run under the first profile that is not `chromium` (results are keyed by sha).

Last verified: 2026-11-25
