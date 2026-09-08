FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/identity/package.json apps/identity/package.json
COPY apps/attendance/package.json apps/attendance/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --ignore-scripts --legacy-peer-deps
COPY . .
RUN npm run build -w @project/contracts && npm run build -w @project/identity
RUN npm prune --ignore-scripts --omit=dev --legacy-peer-deps

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
CMD ["node", "apps/identity/dist/main.js"]
