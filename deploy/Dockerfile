# ---------------------------------------------------------------------------
# LeadBridge — single image that serves the API and the built React app.
#
#   docker build -f deploy/Dockerfile -t leadbridge .
#   docker run -p 8000:8000 -v leadbridge-data:/data --env-file .env leadbridge
#
# The extraction engine (Scrapling) lives in this Python image. Never try to run
# it inside Cloudflare Workers — proxy to this container instead.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------- 1. frontend
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# ------------------------------------------------------------------- 2. python
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # SQLite lives on a mounted volume so it survives container rebuilds.
    DATABASE_URL=sqlite:////data/leadbridge.db \
    ENVIRONMENT=production \
    COOKIE_SECURE=true \
    SEED_DEMO_DATA=false

# curl for the container health check; libnss3/libgbm are needed by headless browsers
# that Patchright may download on demand. Kept minimal on purpose.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt backend/requirements-scraper.txt ./
RUN pip install -r requirements.txt \
    && pip install -r requirements-scraper.txt \
    && rm -f requirements.txt requirements-scraper.txt

COPY deploy/docker-entrypoint.sh /usr/local/bin/leadbridge-entrypoint
RUN chmod +x /usr/local/bin/leadbridge-entrypoint

COPY backend/ /app/backend/
COPY --from=frontend /build/dist /app/frontend/dist

RUN mkdir -p /data && useradd --system --uid 10001 --home-dir /app leadbridge \
    && chown -R leadbridge:leadbridge /app /data
USER leadbridge

WORKDIR /app/backend
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/leadbridge-entrypoint"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
