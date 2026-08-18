# Setup Guide — 30-Minute Cloud Deployment

Follow these steps in order. After each step, copy the key/URL into `.env.keys`.

---

## Step 0 — Prerequisites (2 min)

Install CLIs:
```bash
npm install -g vercel
```

(Render has no CLI step here — it deploys by connecting to GitHub, see Step 3.)

---

## Step 1 — GitHub (5 min)

1. Go to https://github.com/signup
2. Create account (or skip if you have one)
3. Create new repository: `ride-sharing-app` (private)
4. Run in project root:
```bash
git remote add origin https://github.com/YOUR_USERNAME/ride-sharing-app.git
git push -u origin main
```

No keys needed — GitHub is used via OAuth by all other services.

---

## Step 2 — Vercel (1 min)

1. Go to https://vercel.com
2. Click "Continue with GitHub" → authorize
3. You're done — `./deploy.sh` will create projects automatically via Vercel CLI

No keys needed — Vercel CLI uses GitHub auth.

---

## Step 3 — Render (5 min)

Render hosts all 3 backend services (`api`, `websocket-hub`, `pricing-service`),
each built straight from its `Dockerfile` in this repo — no Docker registry
involved.

1. Go to https://render.com → "Get Started" → sign up with GitHub
2. Dashboard → "New +" → "Blueprint"
3. Select this repo → Render reads `render.yaml` at the root and shows the
   3 services it's about to create (`ride-api`, `ride-websocket-hub`,
   `ride-pricing`) → click "Apply"
4. Render creates the services and starts the first build (it will fail or
   sit unhealthy until you fill in secrets below — that's expected)
5. For **each** service → "Environment" tab → fill in the variables marked
   `sync: false` in `render.yaml`, using the values you've collected in
   `.env.keys` so far (`DATABASE_URL`, `REDIS_URL`, `MONGODB_URL`,
   `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, Firebase/Razorpay/Cloudinary/
   Resend keys as you get them in later steps, `INTERNAL_SERVICE_SECRET` —
   generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   and reuse it across all services that need it)
6. `ride-pricing` needs no service-to-service value, so let it deploy first
   and copy its URL (Dashboard → `ride-pricing` → top of page, e.g.
   `https://ride-pricing.onrender.com`). Paste that into `ride-api`'s
   `PRICING_SERVICE_URL` env var — it's the one variable that depends on
   another Render service existing first.
7. Each save triggers a redeploy. Once `ride-api` and `ride-websocket-hub`
   go green, note their URLs too (same place, e.g.
   `https://ride-api.onrender.com`) — you'll need them in Step 13.

No further CLI steps for Render — every `git push origin main` after this
redeploys automatically.

---

## Step 4 — Neon (PostgreSQL) (3 min)

1. Go to https://neon.tech
2. Click "Continue with GitHub" → authorize
3. Click "Create a project" → name: `rideapp` → region: `AWS ap-south-1 (Mumbai)`
4. Click "Create project"
5. In the dashboard, go to "Connection Details"
6. Select "Pooled connection" → copy the connection string

```
# Paste into .env.keys:
DATABASE_URL=postgres://neondb_owner:xxxx@ep-xxx.ap-south-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true
DATABASE_URL_DIRECT=postgres://neondb_owner:xxxx@ep-xxx.ap-south-1.aws.neon.tech/neondb?sslmode=require
```

---

## Step 5 — Upstash Redis (2 min)

1. Go to https://upstash.com
2. Click "Login with GitHub"
3. Go to Redis → "Create Database"
   - Name: `ride-redis`
   - Region: `ap-south-1` (Mumbai)
   - Enable: TLS, Eviction
4. Click on the database → "Connect" → copy "Redis URL"

```
# Paste into .env.keys:
REDIS_URL=rediss://default:xxxx@xxx.upstash.io:6379
```

---

## Step 6 — ~~Upstash Kafka~~ (removed — now free)

Kafka has been replaced with **Redis Streams** using the same Upstash Redis from Step 5.
No extra service, no extra credentials needed.

---

## Step 7 — MongoDB Atlas (8 min)

1. Go to https://www.mongodb.com/cloud/atlas/register
2. Sign up with email → verify email
3. Choose "Free" (M0 Shared) → Provider: AWS → Region: Mumbai (ap-south-1)
4. Click "Create" → wait ~2 min for cluster
5. Security → Database Access → "Add New Database User"
   - Username: `rideapp`
   - Auto-generate password → copy it
   - Role: Atlas Admin
6. Security → Network Access → "Add IP Address" → "Allow Access from Anywhere"
7. Database → Connect → "Drivers" → copy the connection string
   - Replace `<password>` with your password
   - Replace `myFirstDatabase` with `rideapp`

```
# Paste into .env.keys:
MONGODB_URL=mongodb+srv://rideapp:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/rideapp?retryWrites=true&w=majority
```

---

## Step 8 — Firebase (8 min)

### Create Project
1. Go to https://console.firebase.google.com
2. Click "Add project" → name: `ride-sharing-app` → disable Google Analytics → Create
3. Wait for project creation

### Enable Phone Authentication
4. Go to Authentication → Sign-in method
5. Click "Phone" → Enable → Save

### Enable FCM (Push Notifications)
6. Go to Project Settings → Cloud Messaging
7. FCM is already enabled — no action needed

### Get Frontend Config
8. Project Settings → General → scroll to "Your apps"
9. Click "Add app" → Web (</>) → name: `ride-web`
10. Copy the `firebaseConfig` object values:

```
# Paste into .env.keys:
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123:web:abc
```

### Get Backend Service Account
11. Project Settings → Service accounts → "Generate new private key" → Download JSON
12. Open the JSON file and copy these fields:

```
# Paste into .env.keys:
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
```

---

## Step 9 — Razorpay Test Account (5 min)

1. Go to https://razorpay.com
2. Sign Up → fill basic details → verify email (no KYC needed for test mode)
3. Dashboard → Settings → API Keys → Generate Test Key
4. Copy Key ID and Key Secret
5. (Production only — not needed for local dev, see below) Settings →
   Webhooks → add `https://<your-api-domain>/api/v1/payments/webhook/razorpay`,
   subscribe to `payment.captured` and `payment.failed`, copy the webhook secret

```
# Paste into .env.keys:
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxx
```

Locally, the rider's browser confirms its own payment directly
(`POST /payments/verify`, checked against `RAZORPAY_KEY_SECRET`) — Checkout
can't reach a webhook on localhost. The webhook is the production safety
net for payments the client-side confirmation misses (e.g. tab closed
mid-payment), and needs `RAZORPAY_WEBHOOK_SECRET` from step 5 above.

---

## Step 10 — Cloudinary (3 min)

1. Go to https://cloudinary.com/users/register_free
2. Sign up → verify email
3. Dashboard shows your Cloud Name, API Key, API Secret

```
# Paste into .env.keys:
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=xxxxxxxxxxxxxxxxxxxx
```

---

## Step 11 — Resend Email (2 min)

Not currently called from any code path — `notification-service` only
sends FCM push, no email — so this step can be skipped for now. Included
here in case that changes; harmless to set up either way.

1. Go to https://resend.com/signup
2. Sign up with GitHub → verify email
3. API Keys → "Create API Key" → copy

```
# Paste into .env.keys:
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@yourdomain.com
```

---

## Step 12 — UptimeRobot (2 min)

Render's free plan spins down web services after ~15 min of inactivity
(cold start on the next request). UptimeRobot pings each service every 5
minutes to keep them warm.

1. Go to https://uptimerobot.com → Sign up free
2. Dashboard → "Add New Monitor" for each of the 3 Render services, using
   the actual URL each one got in Step 3 (Render appends a random suffix
   if `ride-api` etc. was already taken by someone else, e.g.
   `ride-api-a1b2.onrender.com`):
   - Monitor type: HTTP(s)
   - Friendly name: `RideApp API` / `RideApp WebSocket Hub` / `RideApp Pricing`
   - URL: `<ride-api URL>/health`, `<ride-websocket-hub URL>/health`,
     `<ride-pricing URL>` (no `/health` route on this one — the bare URL
     still keeps it warm)
   - Monitoring interval: 5 minutes

No keys needed — just the Render service URLs from Step 3.

---

## Step 13 — Run Deploy

Render is already live from Step 3 — it redeploys on every `git push origin
main` from here on, no CLI needed.

Add the Render URLs you noted in Step 3 to `.env.keys`:
```
NEXT_PUBLIC_API_URL=https://ride-api.onrender.com          # your actual ride-api URL
NEXT_PUBLIC_WS_URL=wss://ride-websocket-hub.onrender.com   # your actual ride-websocket-hub URL, wss:// not https://
```

Authenticate Vercel:
```bash
vercel login       # GitHub OAuth in browser
```

Then run migrations and deploy the 3 PWAs:
```bash
./deploy.sh
```

That's it. Watch the terminal — your 3 PWAs will be live in a couple of minutes.

---

## Test Cards (Razorpay Test Mode)

| Method | Value | Result |
|--------|-------|--------|
| Card | 4111 1111 1111 1111 | Success |
| UPI | success@razorpay | Success |
| UPI | failure@razorpay | Failure (test error handling) |

---

## Dev OTP Bypass

In local dev (`DEV_BYPASS_OTP=true`), use phone `+919999999999` and OTP `000000`.
This skips Firebase — no real SMS sent.
