FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/auth-service/package.json ./services/auth-service/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY packages/shared-types ./packages/shared-types
COPY services/auth-service ./services/auth-service
COPY tsconfig.base.json ./
RUN pnpm --filter @ride/shared-types build
RUN pnpm --filter @ride/auth-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/auth-service/dist ./dist
COPY --from=builder /app/services/auth-service/package.json ./
COPY --from=builder /app/packages/shared-types/dist ./node_modules/@ride/shared-types/dist
COPY --from=builder /app/packages/shared-types/package.json ./node_modules/@ride/shared-types/
RUN npm install --omit=dev --ignore-scripts
EXPOSE 3101
CMD ["node", "dist/index.js"]
