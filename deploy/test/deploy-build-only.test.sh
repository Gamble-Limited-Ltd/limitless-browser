#!/usr/bin/env bash
# deploy.sh build-only and web-image reuse, with a stubbed docker and a throwaway repo. Touches nothing real.
# Run: bash deploy/test/deploy-build-only.test.sh
set -uo pipefail
SRC="$(cd "$(dirname "$0")/../.." && pwd)"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT; fail=0
R="$T/repo"; mkdir -p "$R/scripts" "$R/deploy" "$T/bin" "$T/gate"
cp "$SRC/deploy.sh" "$R/"; echo "services: {}" > "$R/deploy/docker-compose.yml"
printf '#!/bin/sh\necho ran >> "$STATIC_LOG"\nmkdir -p "$(dirname "$0")/../deploy/web/dist"; : > "$(dirname "$0")/../deploy/web/dist/sw.js"\n' > "$R/scripts/build-static.sh"
printf '#!/bin/sh\n' > "$R/scripts/inject-sw-stub.sh"; chmod +x "$R/scripts/"*.sh "$R/deploy.sh"
git -C "$R" init -q -b main; g() { git -C "$R" -c user.email=t@t -c user.name=t "$@"; }
g add .; g commit -qm one; ONE="$(g rev-parse HEAD)"; g update-ref refs/remotes/origin/main "$ONE"
echo b > "$R/x"; g add x; g commit -qm two; TWO="$(g rev-parse HEAD)"; : > "$T/gate.env"
cat > "$T/bin/docker" <<'D'
#!/usr/bin/env bash
echo "$*" >> "$DOCKER_LOG"
case "$1" in
  image) [ -n "${FAKE_IMAGE:-}" ]; exit $? ;;
  compose) case " $* " in *" config "*) printf 'web\nlbgate\nrelay\n' ;; *" up "*) exit 7 ;; esac ;;
esac
exit 0
D
chmod +x "$T/bin/docker"; export DOCKER_LOG="$T/log" STATIC_LOG="$T/static" GATE_CONTEXT="$T/gate"
run() { ( cd "$R" && PATH="$T/bin:$PATH" bash ./deploy.sh "$@" ) 2>&1; }
ok() { echo "ok   $1"; }; bad() { echo "FAIL $1"; fail=1; }
: > "$DOCKER_LOG"; : > "$STATIC_LOG"
run build-only "$TWO" > /dev/null && bad "build-only built a sha not on origin/main" || ok "build-only refuses a sha not on origin/main"
run build-only > /dev/null && bad "build-only without a sha" || ok "build-only needs a sha"
run build-only "$ONE" > /dev/null || bad "build-only failed (it must not need gate.env, the gate checkout or a clean tree)"
S7="$(git -C "$R" rev-parse --short "$ONE")"
if grep -qE "compose .* build web\$" "$DOCKER_LOG" && grep -q "tag limitless-web:$S7 limitless-web:${ONE:0:12}" "$DOCKER_LOG" && ! grep -qE ' (up|down|stop) ' "$DOCKER_LOG" \
  && [ ! -e "$R/.last-deploy-hash" ] && [ -s "$STATIC_LOG" ]; then ok "build-only builds only the web image, adds the 12-char alias, starts nothing, writes no hash"
else bad "build-only wrong"; cat "$DOCKER_LOG"; fi
mkdir -p "$R/deploy"; cp "$T/gate.env" "$R/deploy/gate.env"
: > "$DOCKER_LOG"; : > "$STATIC_LOG"; LB_ALLOW_DIRTY=1 FAKE_IMAGE=1 run "$ONE" > /dev/null
if [ ! -s "$STATIC_LOG" ] && grep -q "config --services" "$DOCKER_LOG" && grep -qE "build lbgate relay\$" "$DOCKER_LOG" && ! grep -qE "build web|build\$" "$DOCKER_LOG"; then ok "a deploy reuses the existing web image and builds the other services"
else bad "reuse path wrong"; cat "$DOCKER_LOG"; fi
: > "$DOCKER_LOG"; : > "$STATIC_LOG"; LB_ALLOW_DIRTY=1 run "$ONE" > /dev/null
if [ -s "$STATIC_LOG" ] && grep -qE "compose .* build\$" "$DOCKER_LOG" && grep -q "tag limitless-web:$S7 limitless-web:${ONE:0:12}" "$DOCKER_LOG"; then ok "without a prebuilt image a deploy builds everything and adds the alias"
else bad "normal path wrong"; cat "$DOCKER_LOG"; fi
exit "$fail"
