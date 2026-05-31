# RideApp — Production Ride-Sharing PWA

A full-stack, production-grade ride-sharing web app (like Rapido) — 3 installable PWAs, 9 microservices, real-time GPS tracking, payments, and admin ops.

## Quick Start (Local)

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Copy env file
cp .env.example .env.local

# 4. Run migrations
node tools/db-migrations/migrate.js

# 5. Seed dev data
node tools/seed/seed.js

# 6. Start all apps (in separate terminals)
pnpm --filter @ride/auth-service dev      # :3101
pnpm --filter @ride/user-service dev      # :3102
pnpm --filter @ride/driver-service dev    # :3103
pnpm --filter @ride/location-service dev  # :3104
pnpm --filter @ride/ride-service dev      # :3105
pnpm --filter @ride/matching-service dev  # :3106
pnpm --filter @ride/pricing-service ...   # :3107 (Python: uvicorn)
pnpm --filter @ride/payment-service dev   # :3108
pnpm --filter @ride/notification-service dev # :3109
pnpm --filter @ride/rating-service dev    # :3110
pnpm --filter @ride/websocket-hub dev     # :3200

pnpm --filter @ride/web dev               # :3000 (Rider PWA)
pnpm --filter @ride/driver-web dev        # :3001 (Driver PWA)
pnpm --filter @ride/admin dev             # :3002 (Admin)
```

## Dev Test Credentials
- Phone: any 10-digit number (e.g., `9999999999`)
- OTP: `000000` (bypasses Firebase in dev mode)
- Test payment: UPI `success@razorpay` / Card `4111 1111 1111 1111`

## Cloud Deployment

See `SETUP_GUIDE.md` for the 30-minute account setup, then:

```bash
./deploy.sh
```

## Architecture

```
Rider PWA ────────┐
Driver PWA ───────┤──▶ API Gateway ──▶ Microservices ──▶ PostgreSQL / Redis / MongoDB
Admin Dashboard ──┘         │
                       WebSocket Hub ──▶ Real-time tracking
```

**Stack**: Next.js 14 · Node.js/Fastify · Python/FastAPI · Socket.io · Redis Streams · PostgreSQL · Leaflet · Vercel · Railway

## Services

| Service | Port | Description |
|---------|------|-------------|
| auth-service | 3101 | Firebase OTP → JWT |
| user-service | 3102 | Rider profile CRUD |
| driver-service | 3103 | Driver profile, KYC, earnings |
| location-service | 3104 | GPS ping → Redis GEOADD |
| ride-service | 3105 | Ride state machine |
| matching-service | 3106 | Driver scoring & assignment |
| pricing-service | 3107 | Fare estimate, surge pricing |
| payment-service | 3108 | Razorpay + wallet |
| notification-service | 3109 | FCM push + email |
| rating-service | 3110 | Post-ride ratings |
| websocket-hub | 3200 | Real-time Socket.io (Railway, kept awake by UptimeRobot) |
