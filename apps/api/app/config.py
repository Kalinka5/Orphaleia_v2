from functools import lru_cache
from ipaddress import ip_network
from typing import Literal
from urllib.parse import urlparse

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

UNSAFE_SECRET_KEYS = {
    "development-secret-key-change-me-please",
    "local-docker-secret-change-before-deployment",
    "replace-with-at-least-32-random-characters",
}
UNSAFE_ADMIN_PASSWORDS = {"Orphaleia!2026"}
UNSAFE_VALUE_MARKERS = ("change-me", "changeme", "placeholder", "sandbox", "example")


class Settings(BaseSettings):
    app_env: Literal["development", "test", "production"] = "production"
    database_url: str = "sqlite:///./orphaleia.db"
    secret_key: str = ""
    frontend_url: str = "https://localhost.invalid"
    cookie_secure: bool = True
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_from: str = "hello@orphaleia.local"
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = False
    mail_preview_url: str = "http://localhost:8025"
    payments_mock: bool = False
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_webhook_id: str = ""
    paypal_base_url: str = "https://api-m.paypal.com"
    s3_endpoint_url: str = ""
    s3_bucket: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_public_url: str = ""
    media_dir: str = "media"
    admin_email: str = "admin@orphaleia.local"
    admin_password: str = ""
    allow_demo_seed: bool = False
    redis_url: str = ""
    trusted_proxy_cidrs: str = ""
    access_minutes: int = 15
    refresh_days: int = 14
    reservation_minutes: int = 30

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def validate_security_boundary(self):
        try:
            for value in self.trusted_proxy_cidrs.split(","):
                if value.strip():
                    network = ip_network(value.strip(), strict=False)
                    if network.prefixlen == 0:
                        raise ValueError("a catch-all network is not a trusted proxy boundary")
        except ValueError as exc:
            raise ValueError("TRUSTED_PROXY_CIDRS must contain valid comma-separated IP networks") from exc

        if self.redis_url and urlparse(self.redis_url).scheme not in {"redis", "rediss", "unix"}:
            raise ValueError("REDIS_URL must use redis://, rediss://, or unix://")

        if self.app_env != "test":
            if (
                len(self.secret_key) < 32
                or len(set(self.secret_key)) < 12
                or self.secret_key in UNSAFE_SECRET_KEYS
                or any(marker in self.secret_key.lower() for marker in UNSAFE_VALUE_MARKERS)
            ):
                raise ValueError("SECRET_KEY must be a high-entropy value of at least 32 characters")
            if not self.redis_url:
                raise ValueError("REDIS_URL is required outside tests")

        if self.app_env == "production":
            errors: list[str] = []
            if urlparse(self.database_url).scheme not in {"postgresql", "postgresql+psycopg"}:
                errors.append("DATABASE_URL must use PostgreSQL")
            try:
                frontend = urlparse(self.frontend_url)
                secure_frontend = frontend.scheme == "https" and bool(frontend.hostname)
            except ValueError:
                secure_frontend = False
            if not secure_frontend:
                errors.append("FRONTEND_URL must use HTTPS")
            if not self.cookie_secure:
                errors.append("COOKIE_SECURE must be true")
            if self.payments_mock:
                errors.append("PAYMENTS_MOCK must be false")
            if self.allow_demo_seed:
                errors.append("ALLOW_DEMO_SEED must be false")
            if self.admin_password in UNSAFE_ADMIN_PASSWORDS:
                errors.append("ADMIN_PASSWORD must not use a documented demo credential")
            if "orphaleia:orphaleia@" in self.database_url.lower():
                errors.append("DATABASE_URL must not use the documented database credential")
            if not self.trusted_proxy_cidrs.strip():
                errors.append("TRUSTED_PROXY_CIDRS must identify the production ingress")
            required_provider_values = {
                "STRIPE_SECRET_KEY": self.stripe_secret_key,
                "STRIPE_WEBHOOK_SECRET": self.stripe_webhook_secret,
                "PAYPAL_CLIENT_ID": self.paypal_client_id,
                "PAYPAL_CLIENT_SECRET": self.paypal_client_secret,
                "PAYPAL_WEBHOOK_ID": self.paypal_webhook_id,
            }
            errors.extend(f"{name} is required" for name, value in required_provider_values.items() if not value)
            if self.stripe_secret_key and not self.stripe_secret_key.startswith("sk_live_"):
                errors.append("STRIPE_SECRET_KEY must be a live Stripe key")
            for name, value in required_provider_values.items():
                if value and any(marker in value.lower() for marker in UNSAFE_VALUE_MARKERS):
                    errors.append(f"{name} must not use a placeholder or sandbox value")
            if self.paypal_base_url.rstrip("/") != "https://api-m.paypal.com":
                errors.append("PAYPAL_BASE_URL must use the live PayPal API")
            if errors:
                raise ValueError("Unsafe production configuration: " + "; ".join(errors))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
