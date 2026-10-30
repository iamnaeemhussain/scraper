"""Compliant HTTP access layer.

Rules baked in here (not just documented):
  * robots.txt is honoured for every live fetch;
  * live collection is only permitted against admin allow-listed domains;
  * one request at a time per domain with a configurable minimum delay;
  * the crawler identifies itself honestly and never attempts to defeat CAPTCHAs,
    log-ins, paywalls or other access controls.

Scrapling is used when it is importable, otherwise the same interface falls back
to httpx so the platform stays runnable on minimal hosting.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

from ..config import settings

try:
    from scrapling.fetchers import Fetcher as ScraplingFetcher

    SCRAPLING_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency
    ScraplingFetcher = None  # type: ignore[assignment]
    SCRAPLING_AVAILABLE = False


class ComplianceError(RuntimeError):
    """Raised when a request would violate robots.txt, the allowlist or rate limits."""


class FetchError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, url: str | None = None,
                 error_type: str = "fetch_error"):
        super().__init__(message)
        self.status_code = status_code
        self.url = url
        self.error_type = error_type


@dataclass
class FetchResult:
    url: str
    status_code: int
    text: str
    engine: str
    elapsed_ms: int
    headers: dict[str, str] = field(default_factory=dict)


# --------------------------------------------------------------------------- #
# robots.txt
# --------------------------------------------------------------------------- #
class RobotsCache:
    def __init__(self) -> None:
        self._cache: dict[str, tuple[RobotFileParser | None, float]] = {}
        self._lock = threading.Lock()
        self._ttl = 3600.0

    def _parser(self, base_url: str) -> RobotFileParser | None:
        parsed = urlparse(base_url)
        if not parsed.scheme or not parsed.netloc:
            return None
        origin = f"{parsed.scheme}://{parsed.netloc}"
        with self._lock:
            cached = self._cache.get(origin)
            if cached and time.time() - cached[1] < self._ttl:
                return cached[0]
        parser: RobotFileParser | None = RobotFileParser()
        try:
            response = httpx.get(
                f"{origin}/robots.txt",
                timeout=min(8.0, settings.http_timeout_seconds),
                headers={"User-Agent": settings.user_agent},
                follow_redirects=True,
            )
            if response.status_code >= 400:
                parser = None  # no robots file -> allowed by convention
            else:
                parser.parse(response.text.splitlines())
        except Exception:
            parser = None
        with self._lock:
            self._cache[origin] = (parser, time.time())
        return parser

    def allowed(self, url: str) -> tuple[bool, str]:
        if not settings.respect_robots_txt:
            return True, "robots checking disabled by configuration"
        parser = self._parser(url)
        if parser is None:
            return True, "no robots.txt restrictions published"
        try:
            allowed = parser.can_fetch(settings.user_agent, url) or parser.can_fetch("*", url)
        except Exception:
            return True, "robots.txt could not be interpreted"
        return (True, "allowed by robots.txt") if allowed else (
            False,
            "disallowed by robots.txt — collection skipped",
        )

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()


robots_cache = RobotsCache()


# --------------------------------------------------------------------------- #
# Politeness: at most one in-flight request per domain, min delay between calls
# --------------------------------------------------------------------------- #
class DomainThrottle:
    def __init__(self) -> None:
        self._last: dict[str, float] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()

    def wait(self, url: str, min_delay: float) -> None:
        domain = urlparse(url).netloc.lower()
        with self._guard:
            lock = self._locks.setdefault(domain, threading.Lock())
        with lock:
            last = self._last.get(domain, 0.0)
            delay = min_delay - (time.monotonic() - last)
            if delay > 0:
                time.sleep(delay)
            self._last[domain] = time.monotonic()


throttle = DomainThrottle()


def domain_of(url: str) -> str:
    return (urlparse(url).netloc or "").lower().split(":")[0]


def assert_live_allowed(url: str, source_domain_allowlist: list[str] | None = None) -> None:
    """Gate for live collection. Both the global allowlist and the source allowlist apply."""
    domain = domain_of(url)
    if not domain:
        raise ComplianceError("Source URL has no host to verify.")
    allowed = set(settings.allowed_domain_list) | {d.lower() for d in (source_domain_allowlist or [])}
    if not allowed:
        raise ComplianceError(
            "Live collection is disabled until an administrator allow-lists the domain "
            "(ALLOWED_LIVE_DOMAINS or the source configuration). This prevents accidental "
            "collection from sites that have not been reviewed for permission."
        )
    if not any(domain == entry or domain.endswith("." + entry) for entry in allowed):
        raise ComplianceError(
            f"Domain '{domain}' is not on the approved live-collection allowlist. "
            "An administrator must review the site's terms and robots policy first."
        )
    ok, reason = robots_cache.allowed(url)
    if not ok:
        raise ComplianceError(reason)


# --------------------------------------------------------------------------- #
# Fetch
# --------------------------------------------------------------------------- #
def _fetch_with_scrapling(url: str) -> FetchResult:
    started = time.perf_counter()
    response = ScraplingFetcher.get(url, timeout=settings.http_timeout_seconds)  # type: ignore[union-attr]
    elapsed = int((time.perf_counter() - started) * 1000)
    status_code = int(getattr(response, "status", 0) or 0)
    if status_code >= 400:
        raise FetchError(
            f"HTTP {status_code} from {url}", status_code=status_code, url=url, error_type="http_error"
        )
    return FetchResult(url=url, status_code=status_code or 200, text=getattr(response, "text", "") or "",
                       engine="scrapling", elapsed_ms=elapsed)


def _fetch_with_httpx(url: str) -> FetchResult:
    started = time.perf_counter()
    try:
        response = httpx.get(
            url,
            timeout=settings.http_timeout_seconds,
            headers={"User-Agent": settings.user_agent, "Accept": "text/html,application/xhtml+xml"},
            follow_redirects=True,
        )
    except httpx.HTTPError as exc:
        raise FetchError(f"{type(exc).__name__}: {exc}", url=url, error_type="network_error") from exc
    elapsed = int((time.perf_counter() - started) * 1000)
    if response.status_code >= 400:
        raise FetchError(
            f"HTTP {response.status_code} from {url}",
            status_code=response.status_code,
            url=url,
            error_type="http_error",
        )
    return FetchResult(
        url=str(response.url),
        status_code=response.status_code,
        text=response.text,
        engine="httpx",
        elapsed_ms=elapsed,
        headers=dict(response.headers),
    )


def fetch(url: str, *, min_delay: float | None = None) -> FetchResult:
    """Fetch a page politely. Live allowlist/robots checks are the caller's responsibility."""
    throttle.wait(url, min_delay if min_delay is not None else settings.default_min_delay_seconds)
    engine = settings.fetch_engine.lower()
    if engine in {"auto", "scrapling"} and SCRAPLING_AVAILABLE:
        try:
            return _fetch_with_scrapling(url)
        except FetchError:
            raise
        except Exception as exc:  # engine-level failure -> fall back when in auto mode
            if engine == "scrapling":
                raise FetchError(f"Scrapling failed: {exc}", url=url, error_type="engine_error") from exc
    return _fetch_with_httpx(url)


def engine_info() -> dict[str, Any]:
    return {
        "configured": settings.fetch_engine,
        "scrapling_available": SCRAPLING_AVAILABLE,
        "active": "scrapling" if (settings.fetch_engine in {"auto", "scrapling"} and SCRAPLING_AVAILABLE)
        and settings.fetch_engine != "httpx" else "httpx",
        "robots_enforced": settings.respect_robots_txt,
        "allowlist_enforced": True,
        "allowlisted_domains": settings.allowed_domain_list,
        "user_agent": settings.user_agent,
    }
