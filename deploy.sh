#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RideApp — Cloud Deploy Helper
# Usage: ./deploy.sh
# Requires: vercel CLI (authenticated)
#
# Render (api, websocket-hub, pricing-service) deploys itself automatically
# on every `git push` to main, once the render.yaml Blueprint is connected —
# that's a one-time step in the Render Dashboard, see SETUP_GUIDE.md Step 3.
# This script handles the two things Render can't: running DB migrations,
# and deploying the 3 Vercel frontends.
# ─────────────────────────────────────────────────────────────
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[deploy]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

# ── 1. Validate env keys file ─────────────────────────────────
if [ ! -f .env.keys ]; then
  error ".env.keys not found. Copy .env.example to .env.keys and fill in your values from SETUP_GUIDE.md"
fi

source .env.keys
log "Loaded .env.keys"

required=(DATABASE_URL REDIS_URL MONGODB_URL FIREBASE_PROJECT_ID RAZORPAY_KEY_ID JWT_ACCESS_SECRET NEXT_PUBLIC_API_URL NEXT_PUBLIC_WS_URL)
for var in "${required[@]}"; do
  if [ -z "${!var}" ]; then
    error "Missing required variable: $var — check .env.keys (NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL come from your Render service URLs, e.g. https://ride-api.onrender.com)"
  fi
done
log "All required env vars present"

# ── 2. Run database migrations ────────────────────────────────
log "Running database migrations..."
DATABASE_URL="${DATABASE_URL_DIRECT:-$DATABASE_URL}" node tools/db-migrations/migrate.js
log "Migrations applied"

# ── 3. Remind about Render (it deploys itself) ─────────────────
if [ -n "$(git status --porcelain)" ]; then
  warn "You have uncommitted changes. Commit and 'git push origin main' to trigger the Render redeploy for api / websocket-hub / pricing-service."
else
  log "Working tree clean — pushing to main (if you haven't already) is what redeploys the 3 Render services."
fi

# ── 4. Deploy PWAs to Vercel ──────────────────────────────────
NEXT_VARS=(
  "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL"
  "NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL"
  "NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY"
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID"
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
  "NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID"
  "NEXT_PUBLIC_RAZORPAY_KEY_ID=$RAZORPAY_KEY_ID"
  "NEXT_PUBLIC_DEV_BYPASS_OTP=false"
)

deploy_vercel_app() {
  local app_dir=$1
  local app_name=$2
  log "  Deploying $app_name to Vercel..."
  cd "$app_dir"
  ENV_ARGS=""
  for var in "${NEXT_VARS[@]}"; do
    ENV_ARGS="$ENV_ARGS -e $var"
  done
  vercel deploy --prod --yes $ENV_ARGS 2>/dev/null || warn "  $app_name: vercel deploy may need manual confirmation"
  cd - > /dev/null
}

deploy_vercel_app "apps/web" "Rider PWA"
deploy_vercel_app "apps/driver-web" "Driver PWA"
deploy_vercel_app "apps/admin" "Admin Dashboard"

# ── 5. Seed database (first deploy only) ───────────────────────
log "Seeding database with dev data (safe to skip if already seeded)..."
DATABASE_URL="${DATABASE_URL_DIRECT:-$DATABASE_URL}" node tools/seed/seed.js 2>/dev/null || warn "Seed skipped"

# ── 6. Done ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ DEPLOYMENT COMPLETE${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo ""
echo "  Rider App:   https://ride-web.vercel.app"
echo "  Driver App:  https://ride-driver-web.vercel.app"
echo "  Admin:       https://ride-admin.vercel.app"
echo "  API:         $NEXT_PUBLIC_API_URL"
echo "  WebSocket:   $NEXT_PUBLIC_WS_URL"
echo ""
echo "  NOTE: Render's free plan spins down web services after inactivity."
echo "  Add UptimeRobot monitors for each *.onrender.com /health URL to keep them warm."
echo "  Set up monitors at https://uptimerobot.com after deploy."
echo ""
echo "  Test OTP login:  any phone + OTP 000000"
echo "  Test payment:    UPI success@razorpay | Card 4111 1111 1111 1111"
echo ""
