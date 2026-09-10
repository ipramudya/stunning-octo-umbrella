# Prune backend workspaces so their changes do not invalidate this image.
FROM node:24-alpine AS pruner

WORKDIR /app

RUN npm install --global turbo@2.10.12

COPY . .

RUN turbo prune web --docker

# Build the standalone Next.js server from the reduced workspace.
FROM node:24-alpine AS build

ARG GATEWAY_URL
ENV GATEWAY_URL=$GATEWAY_URL
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY --from=pruner /app/out/json/ ./

RUN npm ci --ignore-scripts --legacy-peer-deps

COPY --from=pruner /app/out/full/ ./

RUN --mount=type=cache,target=/app/.turbo \
  npx turbo run build --filter=web

# Plain Alpine avoids shipping npm and Yarn; Node comes from the matching build image.
FROM alpine:3.23

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000

RUN apk add --no-cache libstdc++ \
  && addgroup --gid 1000 --system node \
  && adduser --uid 1000 --system --ingroup node node

WORKDIR /app

COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

USER node

CMD ["node", "apps/web/server.js"]
