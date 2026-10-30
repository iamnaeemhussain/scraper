"""Application configuration.

All values can be supplied through environment variables (or a local .env file).
Nothing secret is ever shipped to the browser: the frontend only knows the API URL.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "backend" / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")

    # ------------------------------------------------------------------ core
    app_name: str = "LeadBridge"
    environment: str = "development"  # development | production | test
    debug: bool = False

    # ------------------------------------------------------------------ data
    database_url: str = f"sqlite:///{DATA_DIR / 'leadbridge.db'}"
    data_retention_days: int = 365
    audit_retention_days: int = 730

    # ------------------------------------------------------------------ auth
    secret_key: str = "dev-only-change-me-please-set-SECRET_KEY-in-env"
    access_token_expire_minutes: int = 60 * 12
    cookie_name: str = "leadbridge_session"
    cookie_secure: bool = False  # set True behind HTTPS in production
    password_min_length: int = 10
    login_max_attempts: int = 5
    login_lockout_minutes: int = 15

    # CORS: comma separated origins. In dev the Vite proxy makes requests same-origin.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"

    # ------------------------------------------------------------- scraping
    # auto | scrapling | httpx
    fetch_engine: str = "auto"
    # Identify the bot honestly. Never fake a browser identity for mass scraping.
    user_agent: str = "LeadBridgeBot/1.0 (+compliance contact: compliance@example.com)"
    http_timeout_seconds: float = 15.0
    respect_robots_txt: bool = True
    # Live extraction is only allowed against domains an admin has allow-listed.
    allowed_live_domains: str = ""
    default_min_delay_seconds: float = 1.5
    max_pages_per_run: int = 25
    job_workers: int = 2

    # --------------------------------------------------------- rate limiting
    rate_limit_per_minute: int = 240
    login_rate_limit_per_minute: int = 12
    public_form_rate_limit_per_minute: int = 20

    # ----------------------------------------------------------------- demo
    seed_demo_data: bool = True
    demo_mode_enabled: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_domain_list(self) -> list[str]:
        return [d.strip().lower() for d in self.allowed_live_domains.split(",") if d.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return Settings()


settings = get_settings()
