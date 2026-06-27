# Self-hosting my-koto on a VPS (Tailscale Funnel)

This directory holds everything needed to run the app on a VPS instead of
Vercel. The app is designed for it: `next.config.ts` reads `basePath` from
`NEXT_PUBLIC_BASE_PATH`, and the Funnel deployment uses `/my-koto`.

The VPS reuses the **existing Vercel KV and Turso backends** — no code changes.
KV powers the proxy cache, rate limiting, and durable Web Push subscriptions;
point the VPS at the same instances via env vars.

## Two deployment modes

A small VPS (e.g. ~768 MB RAM) has too little memory to run `next build`
reliably (it OOMs). So the app is built with `output: "standalone"` and there
are two paths:

- **Build-on-Mac, ship to VPS (recommended for low-RAM hosts).** Build on a beefy
  machine, rsync the standalone bundle, run `node server.js` on the VPS. No
  `npm ci` / `next build` on the VPS at all. → `deploy/build-and-ship.sh`
- **Build-on-VPS.** Only viable on a box with ≥2 GB RAM. → `deploy/deploy.sh`

## One-time setup (Mac-build mode)

```bash
# --- On the VPS, as the run user ---
git clone <repo> /opt/koto-city && cd /opt/koto-city
cp deploy/env.production.example.txt .env.production.local
$EDITOR .env.production.local                 # KV / Turso / VAPID from Vercel
sudo ./deploy/install-systemd.sh              # app daemon + hourly push timer

# --- On your Mac (the build machine) ---
cd <repo>
cp /path/from/vps/.env.production.local .env.production.local   # SAME values
./deploy/build-and-ship.sh user@your-vps /opt/koto-city

# --- Back on the VPS ---
sudo systemctl restart my-koto
tailscale funnel --bg --set-path /my-koto 3000
tailscale funnel status                       # note the public URL
```

After the first ship, put the Funnel URL (with the `/my-koto` suffix) into
`NEXT_PUBLIC_SITE_URL` in **both** `.env.production.local` files (Mac + VPS),
then re-run `build-and-ship.sh` so OG images and CORS use the right origin.

> The Mac's `.env.production.local` only matters for build-time `NEXT_PUBLIC_*`
> (BASE_PATH, SITE_URL, VAPID_PUBLIC_KEY). The VPS's copy supplies the runtime
> secrets (KV, VAPID_PRIVATE_KEY, PUSH_DISPATCH_SECRET) read by server.js.

## Redeploy (Mac-build mode)

```bash
# On the Mac:
./deploy/build-and-ship.sh user@your-vps /opt/koto-city
# On the VPS:
sudo systemctl restart my-koto
```

## Redeploy (VPS-build mode, ≥2 GB RAM only)

```bash
cd /opt/koto-city && ./deploy/deploy.sh
```

Pulls, `npm ci`, `npm run build` (heap-capped), refreshes Funnel, restarts.

## Files

| File | Purpose |
|------|---------|
| `env.production.example.txt` | Template for `.env.production.local` (repo root). |
| `build-and-ship.sh` | **(Mac)** Build standalone, rsync to the VPS. Recommended for low-RAM hosts. |
| `deploy.sh` | **(VPS, ≥2 GB)** Pull → build → Funnel → restart. |
| `install-systemd.sh` | Installs the units with paths/user substituted. |
| `my-koto.service` | `next start` daemon. |
| `push-dispatch.{service,timer}` | Hourly Web Push fan-out (replaces the GH Actions cron). |
| `push-dispatch.sh` | POSTs to `/api/push/dispatch` with the bearer secret. |

## What does NOT come from this VPS

- **Dataset freshness** (bus / events / AED / toilet): the hourly
  `datasets-sync` GitHub Actions cron writes to Turso. Keep that running and set
  `DATASETS_DB_URL` so the VPS reads fresh data. If you leave Turso unset, the
  app serves the `data/datasets.sqlite` snapshot frozen at build time — re-run
  `deploy.sh` to refresh it.
- **Client IP for rate limiting**: `@vercel/functions` `ipAddress()` returns
  null off-Vercel, so all requests share one rate-limit bucket (treated as
  `0.0.0.0`). Acceptable for a personal/tailnet deployment; revisit if exposed
  to open traffic.

## Notes

- Edge routes (`export const runtime = "edge"`) run fine under `next start` —
  they execute on Node, not a Vercel edge runtime.
- KV outage degrades gracefully: proxies fall back to a process-local LRU; only
  Web Push (which needs durable storage) stops until KV returns.
