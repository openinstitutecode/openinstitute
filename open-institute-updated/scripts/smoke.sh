#!/usr/bin/env sh
# KOPS-019 / KQA-020 — post-deploy smoke test. Usage: scripts/smoke.sh https://portal.example.ke
# Exits non-zero on the first failed check. Read-only: it never logs in or writes data.
BASE="${1:-http://localhost:8080}"
fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (expected $2, got $3)"; fail=1; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }

check "frontend serves index"          200 "$(code "$BASE/")"
check "api liveness /api/health"       200 "$(code "$BASE/api/health")"
check "api readiness /api/ready (db)"  200 "$(code "$BASE/api/ready")"
check "unknown api route is JSON 404"  404 "$(code "$BASE/api/__no_such_route__")"
check "admin metrics require auth"     401 "$(code "$BASE/api/ops/metrics")"
check "login rejects empty body"       400 "$(code -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/auth/login")"

rid="$(curl -s -D - -o /dev/null --max-time 15 "$BASE/api/health" | tr -d '\r' | grep -i '^x-request-id:' | wc -l | tr -d ' ')"
check "api returns X-Request-Id"       1 "$rid"

csp="$(curl -s -D - -o /dev/null --max-time 15 "$BASE/" | tr -d '\r' | grep -ic '^content-security-policy:')"
check "frontend sends CSP header"      1 "$csp"

[ "$fail" = 0 ] && echo "Smoke test passed." || { echo "Smoke test FAILED."; exit 1; }
