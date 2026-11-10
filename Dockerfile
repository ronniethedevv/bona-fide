# Bona Fide agent image (built from repo root by the Shade Agent CLI).
# Node 22 to match the Shade Agent template runtime.
FROM node:22-alpine AS deps
WORKDIR /app
COPY agent/package.json agent/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY agent/package.json agent/package-lock.json agent/tsconfig.json ./
RUN npm ci
COPY agent/src ./src
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV REPLAY_FIXTURES_DIR=/app/fixtures/replay
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY agent/package.json ./
COPY fixtures/replay ./fixtures/replay
CMD ["node", "dist/index.js"]
