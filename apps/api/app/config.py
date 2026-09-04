from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "sqlite:///./orphaleia.db"
    secret_key: str = "development-secret-key-change-me-please"
    frontend_url: str = "http://localhost:5173"
    cookie_secure: bool = False
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_from: str = "hello@orphaleia.local"
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = False
    mail_preview_url: str = "http://localhost:8025"
    payments_mock: bool = True
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_webhook_id: str = ""
    paypal_base_url: str = "https://api-m.sandbox.paypal.com"
    s3_endpoint_url: str = ""
    s3_bucket: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_public_url: str = ""
    media_dir: str = "media"
    admin_email: str = "admin@orphaleia.local"
    admin_password: str = "Orphaleia!2026"
    access_minutes: int = 15
    refresh_days: int = 14
    reservation_minutes: int = 30

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
