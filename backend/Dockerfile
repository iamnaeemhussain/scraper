# syntax=docker/dockerfile:1.7
# Multi-stage build for Pak-Tel (React Web Storefront + NestJS API).

FROM node:22-alpine AS web-build
WORKDIR /build/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS backend-build
WORKDIR /build/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production
RUN apk add --no-cache tini

COPY --from=backend-build /build/backend/node_modules ./node_modules
COPY --from=backend-build /build/backend/dist ./dist
COPY --from=backend-build /build/backend/package.json ./package.json
COPY --from=backend-build /build/backend/entrypoint.sh ./entrypoint.sh
COPY --from=web-build /build/web/dist /app/web/dist
RUN chmod +x ./entrypoint.sh \
 && mkdir -p /app/backend/data \
 && addgroup -S app && adduser -S app -G app \
 && chown -R app:app /app

USER app
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--", "/app/backend/entrypoint.sh"]
