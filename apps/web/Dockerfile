FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/identity/package.json apps/identity/package.json
COPY apps/attendance/package.json apps/attendance/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci --ignore-scripts --legacy-peer-deps

COPY . .

ENV GATEWAY_URL=http://gateway:3000
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build -w web

FROM node:24-alpine

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

USER node

CMD ["node", "apps/web/server.js"]
