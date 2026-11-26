# CI (GitHub Actions)

The repo is public, so standard runners (ubuntu-latest, 4 vCPU, 16 GB) are free. Workflows live in `.github/workflows/`, use
`permissions: contents: read`, never `pull_request_target`, and never deploy.

## What runs where
| Where | What |
|---|---|
| `test.yml` (every push, or by hand) | unit tests (`npm run test:unit`), full e2e (`npm test`, Playwright 1.64.0, chromium) in 4 shards, Node 22, npm and browser caches. Report artifact only on failure. |
| `stack.yml` (by hand; nightly schedule is commented out) | sites smoke (12 public sites) and the speed A/B TRIAL (`scripts/gate.sh HEAD --base origin/main --tier item --steps speed`, 3 reps). |
| VM only | real VPS lane (`test:vps`, prod, test account), the release speed gate (`gate.sh --tier rc`, 7 reps), test-account runs, school Chromebook runs. |

The `projects` input of both workflows defaults to `chromium,chromebook`. Once the `cb-low`, `cb-mid`, `cb-high` profiles are merged, pass
them in the same list (`chromium,cb-low,cb-mid,cb-high`); the A/B job passes `--profiles` only when `gate-args.mjs` knows it.

## Stack jobs need a deploy key
The rehearsal builds the gate from the private repo `Gamble-Limited-Ltd/limitless-gate` (the stack specs sign in through its mock GATE and the
real gate image; the stub gate of `deploy/dev-up.sh` is only an nginx stub and cannot do that). Add a read-only deploy key to that repo and
its private half as the secret `LBGATE_DEPLOY_KEY` here. Without the secret the jobs skip with a notice.

## Speed A/B on CI is a trial
A shared runner is noisy and unlike the VM, so the result is informational and the job never fails a release (`continue-on-error`). The
`abtest-*.json` and `SUMMARY.md` are uploaded as the artifact `speed-ab-trial`; compare them with the VM's verdicts before trusting it.

## Logs are public
Anyone can read workflow logs and artifacts. Keep prod hosts, the VPS, test-account credentials, `deploy/gate.env` and `.env` content out of
workflows and out of test output. The stack run uses per-run generated secrets on the runner only.

## Trigger
- `git push` runs `test.yml`.
- `gh workflow run test.yml --ref <branch> -f projects=chromium,chromebook`
- `gh workflow run stack.yml --ref <branch> -f base=origin/main -f speed_reps=3`
- Watch: `gh run list --workflow test.yml`, `gh run watch`.
