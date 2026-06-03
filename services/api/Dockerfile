FROM node:20-alpine
RUN npm install -g pnpm
WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared-types/package.json   ./packages/shared-types/
COPY packages/shared-utils/package.json   ./packages/shared-utils/
COPY services/api/package.json            ./services/api/
COPY services/auth-service/package.json   ./services/auth-service/
COPY services/user-service/package.json   ./services/user-service/
COPY services/driver-service/package.json ./services/driver-service/
COPY services/location-service/package.json ./services/location-service/
COPY services/ride-service/package.json   ./services/ride-service/
COPY services/matching-service/package.json ./services/matching-service/
COPY services/payment-service/package.json  ./services/payment-service/
COPY services/notification-service/package.json ./services/notification-service/
COPY services/rating-service/package.json ./services/rating-service/
RUN pnpm install --frozen-lockfile

# Copy all source (tsx transpiles at runtime — no build step needed)
COPY tsconfig.base.json ./
COPY packages/shared-types/src ./packages/shared-types/src
COPY packages/shared-utils/src ./packages/shared-utils/src
COPY services/api/src           ./services/api/src
COPY services/auth-service/src  ./services/auth-service/src
COPY services/user-service/src  ./services/user-service/src
COPY services/driver-service/src  ./services/driver-service/src
COPY services/location-service/src ./services/location-service/src
COPY services/ride-service/src  ./services/ride-service/src
COPY services/matching-service/src ./services/matching-service/src
COPY services/payment-service/src  ./services/payment-service/src
COPY services/notification-service/src ./services/notification-service/src
COPY services/rating-service/src ./services/rating-service/src

ENV NODE_ENV=production
EXPOSE 3000
CMD ["tsx", "services/api/src/index.ts"]
