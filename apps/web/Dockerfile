# syntax=docker/dockerfile:1
# Build a partir da RAIZ do monorepo:  docker build -f apps/web/Dockerfile .
#
# Passe a URL da API como build arg (Coolify: "Build Variable"):
#   VITE_API_URL = https://api-resenha05.coffetech.com.br/api

FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @resenha05/shared \
 && npm run build -w @resenha05/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
