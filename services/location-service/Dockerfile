FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/location-service/package.json ./services/location-service/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared-types ./packages/shared-types
COPY services/location-service ./services/location-service
COPY tsconfig.base.json ./
RUN pnpm --filter @ride/shared-types build
RUN pnpm --filter @ride/location-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/location-service/dist ./dist
COPY --from=builder /app/services/location-service/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3104
CMD ["node", "dist/index.js"]
