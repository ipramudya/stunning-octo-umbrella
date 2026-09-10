FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/identity/package.json apps/identity/package.json
COPY apps/attendance/package.json apps/attendance/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --ignore-scripts --legacy-peer-deps
COPY . .
RUN npm run build -w @project/contracts && npm run build -w @project/attendance
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/attendance/package.json apps/attendance/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --ignore-scripts --omit=dev --legacy-peer-deps \
  --workspace @project/attendance --workspace @project/contracts
COPY --from=build --chown=node:node /app/apps/attendance/dist apps/attendance/dist
COPY --from=build --chown=node:node /app/apps/attendance/migrations apps/attendance/migrations
COPY --from=build --chown=node:node /app/packages/contracts/dist packages/contracts/dist
COPY --from=build --chown=node:node /app/packages/contracts/proto packages/contracts/proto
COPY --from=build --chown=node:node /app/scripts/oracle-migrate.mjs scripts/oracle-migrate.mjs
USER node
CMD ["node", "apps/attendance/dist/main.js"]
