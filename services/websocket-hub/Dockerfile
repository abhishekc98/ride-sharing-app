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
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared-types ./packages/shared-types
COPY services/websocket-hub ./services/websocket-hub
COPY tsconfig.base.json ./
RUN pnpm --filter @ride/shared-types build
RUN pnpm --filter @ride/websocket-hub build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# pnpm keeps each workspace member's own deps (express, socket.io, ioredis, ...)
# in that package's own node_modules, not hoisted to the root -- so both need
# to come along, plus shared-types' built dist to satisfy the workspace symlink.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/websocket-hub/node_modules ./services/websocket-hub/node_modules
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=builder /app/services/websocket-hub/dist ./services/websocket-hub/dist
COPY --from=builder /app/services/websocket-hub/package.json ./services/websocket-hub/package.json
EXPOSE 3200
CMD ["node", "services/websocket-hub/dist/index.js"]
