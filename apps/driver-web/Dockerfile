FROM node:22-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/driver-web/package.json ./apps/driver-web/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/driver-web/node_modules ./apps/driver-web/node_modules
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/driver-web ./apps/driver-web

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

RUN pnpm --filter driver-web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Next.js standalone server.js binds to this address -- without it, it only
# listens on loopback inside the container and Render's proxy can't reach it
# (502, even though the process itself logs "Ready" and looks healthy).
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/apps/driver-web/public ./apps/driver-web/public
COPY --from=builder /app/apps/driver-web/.next/standalone ./
COPY --from=builder /app/apps/driver-web/.next/static ./apps/driver-web/.next/static
EXPOSE 3000
CMD ["node", "apps/driver-web/server.js"]
