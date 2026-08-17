FROM node:22-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/websocket-hub/package.json ./services/websocket-hub/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared-types ./packages/shared-types
COPY services/websocket-hub ./services/websocket-hub
COPY tsconfig.base.json ./
RUN pnpm --filter @ride/shared-types build
RUN pnpm --filter @ride/websocket-hub build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/websocket-hub/dist ./dist
COPY --from=builder /app/services/websocket-hub/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3200
CMD ["node", "dist/index.js"]
