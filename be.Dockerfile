# Prune unrelated workspaces so their changes do not invalidate this image.
FROM node:24-alpine AS pruner

ARG SERVICE
WORKDIR /app

RUN npm install --global turbo@2.10.12

COPY . .

RUN turbo prune "@project/${SERVICE}" --docker

# Build the service and its workspace dependencies from the reduced graph.
FROM node:24-alpine AS build

ARG SERVICE
WORKDIR /app

COPY --from=pruner /app/out/json/ ./

RUN npm ci --ignore-scripts --legacy-peer-deps

COPY --from=pruner /app/out/full/ ./
COPY .swcrc .swcrc
COPY scripts/oracle-migrate.mjs scripts/oracle-migrate.mjs

RUN mkdir -p "apps/${SERVICE}/migrations"
RUN --mount=type=cache,target=/app/.turbo \
  npx turbo run build --filter="@project/${SERVICE}"

# Install runtime packages separately to keep development tools out of the image.
FROM node:24-alpine AS production-dependencies

WORKDIR /app

COPY --from=pruner /app/out/json/ ./

RUN npm ci --ignore-scripts --omit=dev --legacy-peer-deps

# Plain Alpine avoids shipping npm and Yarn; Node comes from the matching build image.
FROM alpine:3.23

ARG SERVICE
ENV NODE_ENV=production
ENV SERVICE=${SERVICE}

RUN apk add --no-cache libstdc++ \
  && addgroup --gid 1000 --system node \
  && adduser --uid 1000 --system --ingroup node node

WORKDIR /app

COPY --from=pruner /app/out/json/ ./
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=production-dependencies /app/node_modules node_modules

COPY --from=build --chown=node:node /app/apps/${SERVICE}/dist apps/${SERVICE}/dist
COPY --from=build --chown=node:node /app/apps/${SERVICE}/migrations apps/${SERVICE}/migrations
COPY --from=build --chown=node:node /app/packages/contracts/dist packages/contracts/dist
COPY --from=build --chown=node:node /app/packages/contracts/proto packages/contracts/proto
COPY --from=build --chown=node:node /app/scripts/oracle-migrate.mjs scripts/oracle-migrate.mjs

USER node

CMD ["sh", "-c", "exec node apps/$SERVICE/dist/main.js"]
