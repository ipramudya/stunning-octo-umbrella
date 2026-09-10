FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/identity/package.json apps/identity/package.json
COPY apps/attendance/package.json apps/attendance/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci --ignore-scripts --legacy-peer-deps

COPY . .

RUN npm run build -w @project/contracts && npm run build -w @project/gateway

FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci --ignore-scripts --omit=dev --legacy-peer-deps \
  --workspace @project/gateway --workspace @project/contracts

COPY --from=build --chown=node:node /app/apps/gateway/dist apps/gateway/dist
COPY --from=build --chown=node:node /app/packages/contracts/dist packages/contracts/dist
COPY --from=build --chown=node:node /app/packages/contracts/proto packages/contracts/proto

USER node

CMD ["node", "apps/gateway/dist/main.js"]
