FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/rating-service/package.json ./services/rating-service/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared-types ./packages/shared-types
COPY services/rating-service ./services/rating-service
COPY tsconfig.base.json ./
RUN pnpm --filter @ride/shared-types build
RUN pnpm --filter @ride/rating-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/rating-service/dist ./dist
COPY --from=builder /app/services/rating-service/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3110
CMD ["node", "dist/index.js"]
