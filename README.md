# RideApp — Production Ride-Sharing PWA

A full-stack, production-grade ride-sharing web app (like Rapido) — 3 installable PWAs, 9 Node.js microservices, real-time GPS tracking, payments, and admin ops.

## Quick Start (Local — all services separately)

```bash
# 1. Start infrastructure (Postgres, Redis, MongoDB)
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Copy env file
cp .env.example .env.local

# 4. Run migrations + seed
node tools/db-migrations/migrate.js
node tools/seed/seed.js

# 5a. Start merged backend (easiest for local dev)
pnpm --filter @ride/api dev                 # :3000 — all 9 Node.js services

# 5b. OR start each service individually
pnpm --filter @ride/auth-service dev        # :3101
pnpm --filter @ride/user-service dev        # :3102
pnpm --filter @ride/driver-service dev      # :3103
pnpm --filter @ride/location-service dev    # :3104
pnpm --filter @ride/ride-service dev        # :3105
pnpm --filter @ride/matching-service dev    # :3106
pnpm --filter @ride/payment-service dev     # :3108
pnpm --filter @ride/notification-service dev# :3109
pnpm --filter @ride/rating-service dev      # :3110
pnpm --filter @ride/websocket-hub dev       # :3200
# Python pricing service
cd services/pricing-service && uvicorn src.main:app --port 3107

# 6. Start PWAs
pnpm --filter @ride/web dev                 # :3001 (Rider PWA)
pnpm --filter @ride/driver-web dev          # :3002 (Driver PWA)
pnpm --filter @ride/admin dev               # :3003 (Admin)
```

## Dev Test Credentials
- Phone: any 10-digit number (e.g., `9999999999`) — **a phone number keeps whatever role it first registered under**; reusing one across rider/driver/admin apps does not change its role. Use a distinct number per role, or the seeded admin number below.
- OTP: `000000` (bypasses Firebase in dev mode)
- Test payment: UPI `success@razorpay` / Card `4111 1111 1111 1111`
- Seeded admin: `9000000000` (`tools/seed/seed.js`)

## Payments & Driver Onboarding

- **Rider pays**: at booking, choose Wallet / Card·UPI / Cash. Wallet and
  Card go through real Razorpay Checkout (test mode) via a receipt screen
  shown after the ride ends; Cash settles in person with no in-app charge.
  Wallet top-up (rider) and payout withdrawal (driver) both use the same
  Checkout flow.
- **Driver onboarding**: a new driver must submit a vehicle + 4 KYC
  documents and be **approved by an admin** (`apps/admin` → Drivers) before
  "Go Online" is allowed — `location-service` rejects it otherwise
  (`KYC_NOT_APPROVED`).
- **Driver payouts**: there's no real bank-transfer integration — a
  driver's "Withdraw to bank" request is settled manually by an admin
  (`apps/admin` → Payouts).
- See `tests/manual-ride-flow.md` for the full walkthrough, including the
  onboarding/approval steps.

## Cloud Deployment (Render — free, no credit card)

3 Render web services, 3 Vercel apps:

| Render Service | Source | Notes |
|---------------|--------|-------|
| `api` | `services/api/` | All 9 Node.js services merged |
| `websocket-hub` | `services/websocket-hub/` | Socket.io, UptimeRobot keep-alive |
| `pricing` | `services/pricing-service/` | Python FastAPI |

See `SETUP_GUIDE.md` for the 30-minute setup, then `./deploy.sh`.

## Architecture

```
Rider PWA  ──┐                      ┌─ PostgreSQL (Neon)
Driver PWA ──┤──▶ Merged API :3000 ─┤─ Redis (Upstash — Geo+Streams+PubSub)
Admin      ──┘         │            └─ MongoDB (Atlas)
                  WebSocket Hub ──▶ Real-time GPS tracking
```

**Stack**: Next.js 14 · Node.js/Fastify · Python/FastAPI · Socket.io · **Redis Streams** · PostgreSQL · Leaflet/OSM · Vercel · Render

## Services (local dev ports)

| Service | Port | Description |
|---------|------|-------------|
| **api** (merged) | **3000** | All 9 services in one process (production) |
| auth-service | 3101 | Firebase OTP → JWT |
| user-service | 3102 | Rider profile CRUD |
| driver-service | 3103 | Driver profile, vehicle, KYC upload + admin approval, earnings |
| location-service | 3104 | GPS ping → Redis GEOADD, gates "online" on KYC approval |
| ride-service | 3105 | Ride state machine, fare finalization, promo, cancellation fee, admin ride list |
| matching-service | 3106 | Driver scoring & assignment |
| pricing-service | 3107 | Fare estimate, surge, promo validation (Python) |
| payment-service | 3108 | Razorpay checkout + wallet + cash + refunds + driver payouts |
| notification-service | 3109 | Redis Streams consumer, FCM push |
| rating-service | 3110 | Mutual rating 24h window |
| websocket-hub | 3200 | Real-time Socket.io |
