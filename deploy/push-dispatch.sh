#!/usr/bin/env bash
# Trigger the Web Push fan-out by POSTing to /api/push/dispatch with the
# shared-secret bearer token. On Vercel this is driven by GitHub Actions; on
# the VPS a systemd timer (push-dispatch.timer) calls this instead.
#
# Reads PUSH_DISPATCH_SECRET, NEXT_PUBLIC_BASE_PATH and PORT from the
# environment. The systemd service loads them from .env.production.local.
set -euo pipefail

BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/my-koto}"
PORT="${PORT:-3000}"

if [[ -z "${PUSH_DISPATCH_SECRET:-}" ]]; then
  echo "error: PUSH_DISPATCH_SECRET is not set." >&2
  exit 1
fi

# Hit the local instance directly — no need to round-trip through Funnel.
URL="http://127.0.0.1:${PORT}${BASE_PATH}/api/push/dispatch"

curl -fsS -X POST "$URL" \
  -H "Authorization: Bearer ${PUSH_DISPATCH_SECRET}" \
  -H "Content-Type: application/json" \
  --max-time 60
echo
