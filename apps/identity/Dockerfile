FROM node:24-alpine AS pruner

WORKDIR /app

RUN npm install --global turbo@2.10.12

COPY . .

RUN turbo prune @project/identity --docker

FROM node:24-alpine AS build

WORKDIR /app

COPY --from=pruner /app/out/json/ ./

RUN npm ci --ignore-scripts --legacy-peer-deps

COPY --from=pruner /app/out/full/ ./
COPY .swcrc .swcrc
COPY scripts/oracle-migrate.mjs scripts/oracle-migrate.mjs

RUN --mount=type=cache,target=/app/.turbo \
  npx turbo run build --filter=@project/identity

FROM node:24-alpine AS production-dependencies

WORKDIR /app

COPY --from=pruner /app/out/json/ ./

RUN npm ci --ignore-scripts --omit=dev --legacy-peer-deps

FROM alpine:3.23

ENV NODE_ENV=production

RUN apk add --no-cache libstdc++ \
  && addgroup --gid 1000 --system node \
  && adduser --uid 1000 --system --ingroup node node

WORKDIR /app

COPY --from=pruner /app/out/json/ ./
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=production-dependencies /app/node_modules node_modules

COPY --from=build --chown=node:node /app/apps/identity/dist apps/identity/dist
COPY --from=build --chown=node:node /app/apps/identity/migrations apps/identity/migrations
COPY --from=build --chown=node:node /app/packages/contracts/dist packages/contracts/dist
COPY --from=build --chown=node:node /app/packages/contracts/proto packages/contracts/proto
COPY --from=build --chown=node:node /app/scripts/oracle-migrate.mjs scripts/oracle-migrate.mjs

USER node

CMD ["node", "apps/identity/dist/main.js"]
