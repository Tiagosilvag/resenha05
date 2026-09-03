# syntax=docker/dockerfile:1
# Build a partir da RAIZ do monorepo:  docker build -f apps/api/Dockerfile .

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY db db
RUN npm run build -w @resenha05/shared \
 && npm run build -w @resenha05/api \
 && npm prune --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/db ./db
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/assets ./apps/api/assets

EXPOSE 3000
# Aplica as migrations pendentes e sobe a API.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node db/migrate.mjs && node apps/api/dist/server.js"]
