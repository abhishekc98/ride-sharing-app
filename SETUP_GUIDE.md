# Setup Guide — 35-Minute Cloud Deployment

Follow these steps in order. After each step, copy the key/URL into `.env.keys`.

---

## Step 0 — Prerequisites (5 min)

Install CLIs:
```bash
npm install -g vercel railway
```

Install Fly.io CLI:
- Windows: `winget install Fly.io.flyctl`
- Mac: `brew install flyctl`

---

## Step 1 — GitHub (5 min)

1. Go to https://github.com/signup
2. Create account (or skip if you have one)
3. Create new repository: `ride-sharing-app` (private)
4. Run in project root:
```bash
git remote add origin https://github.com/YOUR_USERNAME/ride-sharing-app.git
git push -u origin master
```

No keys needed — GitHub is used via OAuth by all other services.

---

## Step 2 — Vercel (1 min)

1. Go to https://vercel.com
2. Click "Continue with GitHub" → authorize
3. You're done — `./deploy.sh` will create projects automatically via Vercel CLI

No keys needed — Vercel CLI uses GitHub auth.

---

## Step 3 — Railway (1 min)

1. Go to https://railway.app
2. Click "Login with GitHub" → authorize
3. You're done — `./deploy.sh` creates services via Railway CLI

No keys needed — Railway CLI uses GitHub auth.

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

## Step 6 — Upstash Kafka (2 min)

1. Still on https://upstash.com
2. Go to Kafka → "Create Cluster"
   - Name: `ride-kafka`
   - Region: `ap-south-1`
3. Click on cluster → "Details" → copy Bootstrap Server, Username, Password

```
# Paste into .env.keys:
KAFKA_BROKERS=xxx-ap-south-1.upstash.io:9092
KAFKA_USERNAME=xxx
KAFKA_PASSWORD=xxx
KAFKA_SSL=true
```

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

```
# Paste into .env.keys:
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
```

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

1. Go to https://resend.com/signup
2. Sign up with GitHub → verify email
3. API Keys → "Create API Key" → copy

```
# Paste into .env.keys:
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@yourdomain.com
```

---

## Step 12 — Fly.io (2 min)

1. Go to https://fly.io/app/sign-up
2. Sign up → verify email (requires credit card for account, but won't be charged on free tier)
3. Run: `fly auth login`

No keys needed — deploy.sh uses flyctl CLI.

---

## Step 13 — Run Deploy

Now authenticate the CLIs:
```bash
vercel login       # GitHub OAuth in browser
railway login      # GitHub OAuth in browser
fly auth login     # opens browser
```

Then deploy everything:
```bash
./deploy.sh
```

That's it. Watch the terminal. Your 3 PWAs will be live in ~10 minutes.

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
