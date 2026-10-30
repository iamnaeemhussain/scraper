"""LeadBridge API — FastAPI application entry point."""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import BASE_DIR, settings
from .database import Base, SessionLocal, engine
from .routers import (
    agents,
    auth,
    dashboard,
    exports,
    imports,
    jobs,
    leads,
    meta,
    public,
    reports,
    settings as settings_router,
    sources,
)
from .security import client_ip, limiter
from .seed import ensure_admin, seed_database
from .services.jobs import recover_stale_jobs

logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.DEBUG,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("leadbridge")

FRONTEND_DIST = BASE_DIR / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if settings.seed_demo_data and not settings.is_production:
            result = seed_database(db)
            if result.get("seeded"):
                logger.info("Demo data seeded: %s", result)
        else:
            ensure_admin(db)
    finally:
        db.close()
    recover_stale_jobs()
    logger.info("LeadBridge ready · env=%s · engine=%s", settings.environment, settings.fetch_engine)
    yield


app = FastAPI(
    title="LeadBridge API",
    description=(
        "Business lead collection platform for authorized data sources. "
        "Live web extraction runs in this Python service — never inside Cloudflare Workers."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    expose_headers=["Content-Disposition", "X-Export-Rows", "X-Export-Blocked"],
    max_age=600,
)


@app.middleware("http")
async def security_and_rate_limit(request: Request, call_next):
    path = request.url.path

    if request.method != "OPTIONS" and path.startswith("/api/"):
        exempt = path.startswith("/api/public/") or path in {"/api/auth/login", "/api/health"}
        bucket = "public-form" if path.startswith("/api/public/") else "api"
        if not exempt:
            limit = settings.rate_limit_per_minute
            allowed, retry_after = limiter.check(f"{bucket}:{client_ip(request)}", limit)
            if not allowed:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Please slow down."},
                    headers={"Retry-After": str(retry_after)},
                )

    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Response-Time-ms"] = f"{(time.perf_counter() - started) * 1000:.1f}"
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None) or {},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        location = " → ".join(str(part) for part in error.get("loc", []) if part != "body")
        errors.append(f"{location}: {error.get('msg')}")
    return JSONResponse(
        status_code=422,
        content={"detail": "; ".join(errors) or "Invalid request", "errors": exc.errors()},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url.path)
    detail = str(exc) if settings.debug else "An unexpected error occurred. Please try again."
    return JSONResponse(status_code=500, content={"detail": detail})


@app.get("/api/health", tags=["system"])
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.environment,
        "version": app.version,
        "demo_mode": settings.demo_mode_enabled,
    }


for router in (
    auth.router,
    meta.router,
    dashboard.router,
    sources.router,
    jobs.router,
    leads.router,
    agents.router,
    imports.router,
    exports.router,
    reports.router,
    settings_router.router,
    public.router,
):
    app.include_router(router)


# --------------------------------------------------------------------------- #
# Optional single-service deployment: serve the built SPA from the API host.
# --------------------------------------------------------------------------- #
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(index)
        return JSONResponse(status_code=404, content={"detail": "Frontend build not found"})
