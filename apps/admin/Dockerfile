FROM node:22-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/admin/package.json ./apps/admin/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/admin ./apps/admin

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not read
# at runtime -- these are all public-by-design keys (Firebase client config,
# Razorpay publishable key), safe to bake in here.
ENV NEXT_PUBLIC_API_URL=https://ride-api-sn5o.onrender.com
ENV NEXT_PUBLIC_WS_URL=wss://ride-websocket-hub.onrender.com
ENV NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyD8W0MsB-E99MeoJXW0ABLdIu4agYnU1ek
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ride-sharing-app-2950b.firebaseapp.com
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=ride-sharing-app-2950b
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=980803971174
ENV NEXT_PUBLIC_FIREBASE_APP_ID=1:980803971174:web:9081a4fe86c28326a665a7
ENV NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_Sw7qRQdlMOV6Lc
ENV NEXT_PUBLIC_DEV_BYPASS_OTP=false

RUN pnpm --filter admin build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/admin/public ./apps/admin/public
COPY --from=builder /app/apps/admin/.next/standalone ./
COPY --from=builder /app/apps/admin/.next/static ./apps/admin/.next/static
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]
