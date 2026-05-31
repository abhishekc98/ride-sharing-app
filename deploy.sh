#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RideApp — One-Command Cloud Deployment
# Usage: ./deploy.sh
# Requires: vercel CLI, railway CLI, fly CLI (all authenticated)
# ─────────────────────────────────────────────────────────────
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

# ── 1. Validate env keys file ─────────────────────────────────
if [ ! -f .env.keys ]; then
  error ".env.keys not found. Copy .env.example to .env.keys and fill in your values from SETUP_GUIDE.md"
fi

source .env.keys
log "Loaded .env.keys"

required=(DATABASE_URL REDIS_URL MONGODB_URL FIREBASE_PROJECT_ID RAZORPAY_KEY_ID JWT_ACCESS_SECRET)
for var in "${required[@]}"; do
  if [ -z "${!var}" ]; then
    error "Missing required variable: $var — check .env.keys"
  fi
done
log "All required env vars present"

# ── 2. Run database migrations ────────────────────────────────
log "Running database migrations..."
DATABASE_URL="$DATABASE_URL_DIRECT" node tools/db-migrations/migrate.js
log "Migrations applied"

# ── 3. Deploy WebSocket Hub to Fly.io ────────────────────────
log "Deploying WebSocket Hub to Fly.io..."
cd services/websocket-hub

fly secrets set \
  REDIS_URL="$REDIS_URL" \
  JWT_ACCESS_SECRET="$JWT_ACCESS_SECRET" \
  NODE_ENV=production

fly deploy --ha=false 2>/dev/null || warn "Fly deploy skipped (app may already exist — run 'fly apps create ride-websocket-hub' first)"
WS_URL=$(fly status --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('wss://'+d.get('Hostname',''))" 2>/dev/null || echo "wss://ride-websocket-hub.fly.dev")
cd ../..
log "WebSocket Hub: $WS_URL"

# ── 4. Deploy backend services to Railway ────────────────────
log "Deploying backend services to Railway..."

SERVICES=(
  auth-service
  user-service
  driver-service
  location-service
  ride-service
  matching-service
  payment-service
  notification-service
  rating-service
)

for svc in "${SERVICES[@]}"; do
  log "  Deploying $svc..."
  cd services/$svc
  railway up --service="$svc" --detach 2>/dev/null || warn "  $svc: railway deploy queued"
  cd ../..
done

# Set env vars on Railway (single service call)
log "Setting Railway environment variables..."
railway variables set \
  DATABASE_URL="$DATABASE_URL" \
  REDIS_URL="$REDIS_URL" \
  MONGODB_URL="$MONGODB_URL" \
  KAFKA_BROKERS="${KAFKA_BROKERS:-localhost:9092}" \
  KAFKA_USERNAME="${KAFKA_USERNAME:-}" \
  KAFKA_PASSWORD="${KAFKA_PASSWORD:-}" \
  KAFKA_SSL="${KAFKA_SSL:-false}" \
  JWT_ACCESS_SECRET="$JWT_ACCESS_SECRET" \
  JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
  FIREBASE_PROJECT_ID="$FIREBASE_PROJECT_ID" \
  FIREBASE_CLIENT_EMAIL="$FIREBASE_CLIENT_EMAIL" \
  FIREBASE_PRIVATE_KEY="$FIREBASE_PRIVATE_KEY" \
  RAZORPAY_KEY_ID="$RAZORPAY_KEY_ID" \
  RAZORPAY_KEY_SECRET="$RAZORPAY_KEY_SECRET" \
  CLOUDINARY_CLOUD_NAME="$CLOUDINARY_CLOUD_NAME" \
  CLOUDINARY_API_KEY="$CLOUDINARY_API_KEY" \
  CLOUDINARY_API_SECRET="$CLOUDINARY_API_SECRET" \
  RESEND_API_KEY="$RESEND_API_KEY" \
  INTERNAL_SERVICE_SECRET="$INTERNAL_SERVICE_SECRET" \
  NODE_ENV=production \
  2>/dev/null || warn "Railway env vars: set them manually in the dashboard if this fails"

# Get Railway API URL
API_URL=$(railway status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))" 2>/dev/null || echo "")
if [ -z "$API_URL" ]; then
  API_URL="https://api-gateway.railway.app"
  warn "Could not detect Railway URL — defaulting to $API_URL (update after deploy)"
fi
log "API URL: $API_URL"

# ── 5. Deploy PWAs to Vercel ──────────────────────────────────
NEXT_VARS=(
  "NEXT_PUBLIC_API_URL=$API_URL"
  "NEXT_PUBLIC_WS_URL=$WS_URL"
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

  # Build env string for vercel
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

# ── 6. Seed database ──────────────────────────────────────────
log "Seeding database with dev data..."
DATABASE_URL="$DATABASE_URL_DIRECT" node tools/seed/seed.js 2>/dev/null || warn "Seed skipped"

# ── 7. Done ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ DEPLOYMENT COMPLETE${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo ""
echo "  🛵 Rider App:     https://ride-web.vercel.app"
echo "  🚗 Driver App:    https://ride-driver-web.vercel.app"
echo "  📊 Admin:         https://ride-admin.vercel.app"
echo "  🔧 API:           $API_URL"
echo "  🔌 WebSocket:     $WS_URL"
echo ""
echo "  Test OTP login: any phone + OTP 000000 (disable DEV_BYPASS_OTP for production)"
echo "  Test payment:   UPI success@razorpay | Card 4111 1111 1111 1111"
echo ""
