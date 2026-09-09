import asyncio
import io
import os
import re
import struct
import time
import zlib
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from conftest import login
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from pydantic import ValidationError
from redis import Redis
from sqlalchemy import select
from starlette.requests import Request

from app import main as main_module
from app import throttle as throttle_module
from app.config import Settings, settings
from app.database import SessionLocal, engine
from app.main import app
from app.middleware import DEFAULT_REQUEST_LIMIT, RequestBodyLimitMiddleware
from app.models import ActionToken, OutboxMessage
from app.storage import save_image

PRODUCTION_SETTINGS = {
    "app_env": "production",
    "database_url": "postgresql+psycopg://service_user:strong-db-pass@db:5432/shop",
    "secret_key": "a9B7c6D5e4F3g2H1j0K8m7N6p5Q4r3S2",
    "frontend_url": "https://books.orphaleia.test",
    "cookie_secure": True,
    "payments_mock": False,
    "allow_demo_seed": False,
    "redis_url": "redis://redis:6379/0",
    "trusted_proxy_cidrs": "10.20.30.40/32",
    "stripe_secret_key": "sk_live_51RealProductionKey9Zx",
    "stripe_webhook_secret": "whsec_7Kp9N2r4T6v8X1z3",
    "paypal_client_id": "live-client-7Kp9N2r4",
    "paypal_client_secret": "live-secret-8Lm0Q3s5",
    "paypal_webhook_id": "live-hook-9Mn1R4t6",
    "paypal_base_url": "https://api-m.paypal.com",
}


def test_configuration_profiles_are_explicit_and_fail_closed():
    test = Settings(
        app_env="test",
        secret_key="test",
        payments_mock=True,
        redis_url="",
        _env_file=None,
    )
    assert test.redis_url == ""

    demo = Settings(
        app_env="development",
        secret_key="h8J7k6L5m4N3p2Q1r9S8t7U6v5W4x3Y2",
        redis_url="redis://localhost:6379/0",
        allow_demo_seed=True,
        payments_mock=True,
        cookie_secure=False,
        frontend_url="http://localhost:5173",
        _env_file=None,
    )
    assert demo.allow_demo_seed is True

    production = Settings(**PRODUCTION_SETTINGS, _env_file=None)
    assert production.payments_mock is False


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"secret_key": "x" * 40}, "high-entropy"),
        ({"frontend_url": "http://books.orphaleia.test"}, "HTTPS"),
        ({"frontend_url": "https://"}, "HTTPS"),
        ({"cookie_secure": False}, "COOKIE_SECURE"),
        ({"payments_mock": True}, "PAYMENTS_MOCK"),
        ({"allow_demo_seed": True}, "ALLOW_DEMO_SEED"),
        ({"redis_url": "http://redis:6379"}, "REDIS_URL"),
        ({"trusted_proxy_cidrs": ""}, "TRUSTED_PROXY_CIDRS"),
        ({"trusted_proxy_cidrs": "0.0.0.0/0"}, "TRUSTED_PROXY_CIDRS"),
        ({"stripe_secret_key": "sk_test_123456789"}, "live Stripe"),
        ({"stripe_webhook_secret": "change-me"}, "placeholder"),
        ({"paypal_base_url": "https://api-m.sandbox.paypal.com"}, "live PayPal"),
        ({"database_url": "sqlite:///./production.db"}, "PostgreSQL"),
        ({"database_url": "postgresql+psycopg://orphaleia:orphaleia@db/shop"}, "database credential"),
    ],
)
def test_production_rejects_each_unsafe_value(override, message):
    values = {**PRODUCTION_SETTINGS, **override}
    with pytest.raises(ValidationError, match=message):
        Settings(**values, _env_file=None)


def request_from(peer: str, forwarded: str | None = None) -> Request:
    headers = [] if forwarded is None else [(b"x-forwarded-for", forwarded.encode())]
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": headers,
            "client": (peer, 1234),
            "server": ("testserver", 80),
            "scheme": "http",
            "query_string": b"",
        }
    )


def test_forwarded_chain_is_used_only_for_an_explicitly_trusted_peer(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_cidrs", "10.0.0.0/24,192.0.2.10/32")
    assert throttle_module.client_ip(request_from("203.0.113.9", "198.51.100.7")) == "203.0.113.9"
    assert (
        throttle_module.client_ip(
            request_from("10.0.0.8", "198.51.100.7, 192.0.2.10")
        )
        == "198.51.100.7"
    )
    assert throttle_module.client_ip(request_from("10.0.0.8", "not-an-ip")) == "10.0.0.8"


class FakeRedis:
    def __init__(self):
        self.counts = defaultdict(int)

    def pipeline(self, transaction=True):
        backend = self

        class Pipeline:
            def incr(self, key):
                self.key = key
                return self

            def expire(self, key, ttl):
                self.ttl = ttl
                return self

            def execute(self):
                backend.counts[self.key] += 1
                return [backend.counts[self.key], True]

        assert transaction is True
        return Pipeline()

    def ping(self):
        return True


def test_redis_limits_are_shared_across_instances_and_survive_client_recreation(monkeypatch):
    backend = FakeRedis()
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(settings, "redis_url", "redis://limits:6379/0")
    monkeypatch.setattr(throttle_module.Redis, "from_url", lambda *args, **kwargs: backend)
    monkeypatch.setattr(throttle_module.time, "time", lambda: 600.0)
    throttle_module._redis = None

    throttle_module.enforce_limit("login", "reader@example.com", 2, 60)
    throttle_module._redis = None
    throttle_module.enforce_limit("login", "reader@example.com", 2, 60)
    with pytest.raises(HTTPException) as limited:
        throttle_module.enforce_limit("login", "reader@example.com", 2, 60)
    assert limited.value.status_code == 429

    monkeypatch.setattr(throttle_module.time, "time", lambda: 661.0)
    throttle_module.enforce_limit("login", "reader@example.com", 2, 60)


def test_redis_outage_fails_closed(monkeypatch):
    monkeypatch.setattr(settings, "app_env", "development")

    def unavailable():
        raise throttle_module.RedisError("offline")

    monkeypatch.setattr(throttle_module, "_redis_client", unavailable)
    with pytest.raises(HTTPException) as unavailable_error:
        throttle_module.enforce_limit("login", "reader@example.com", 1, 60)
    assert unavailable_error.value.status_code == 503


def test_declared_request_body_limit_uses_standard_error_shape(client):
    response = client.post(
        "/api/v1/auth/login",
        content=b"x" * (DEFAULT_REQUEST_LIMIT + 1),
        headers={"Content-Type": "application/json", "X-Request-ID": "oversize-declared"},
    )
    assert response.status_code == 413
    assert response.json() == {
        "code": "http_413",
        "message": "Request body is too large",
        "request_id": "oversize-declared",
    }


def test_chunked_request_body_limit_counts_every_frame():
    received = [
        {"type": "http.request", "body": b"a" * 600_000, "more_body": True},
        {"type": "http.request", "body": b"b" * 600_000, "more_body": False},
    ]
    sent = []

    async def receive():
        return received.pop(0)

    async def send(message):
        sent.append(message)

    async def consume(scope, receive, send):
        while (await receive()).get("more_body"):
            pass

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/auth/login",
        "headers": [],
    }
    asyncio.run(RequestBodyLimitMiddleware(consume)(scope, receive, send))
    assert sent[0]["status"] == 413


def test_webhook_and_upload_limits_apply_before_parsing(client):
    too_large_webhook = client.post(
        "/api/v1/webhooks/stripe",
        content=b"x" * (256 * 1024 + 1),
        headers={"stripe-signature": "invalid"},
    )
    assert too_large_webhook.status_code == 413

    exact_webhook = client.post(
        "/api/v1/webhooks/stripe",
        content=b"{}" + b" " * (256 * 1024 - 2),
        headers={"stripe-signature": "invalid"},
    )
    assert exact_webhook.status_code == 200

    headers = login(client)
    oversized_file = client.put(
        "/api/v1/users/me/avatar",
        files={"file": ("large.png", b"x" * (5 * 1024 * 1024 + 1), "image/png")},
        headers=headers,
    )
    assert oversized_file.status_code == 413


def test_bounded_upload_helper_accepts_exact_boundary_and_rejects_one_more_byte():
    exact = UploadFile(file=io.BytesIO(b"x" * 1024), filename="exact.bin")
    assert len(asyncio.run(main_module.read_limited_upload(exact, 1024))) == 1024
    oversized = UploadFile(file=io.BytesIO(b"x" * 1025), filename="large.bin")
    with pytest.raises(HTTPException) as error:
        asyncio.run(main_module.read_limited_upload(oversized, 1024))
    assert error.value.status_code == 413


def test_cover_upload_rejects_large_decoded_dimensions_before_rasterization():
    ihdr = b"IHDR" + struct.pack(">IIBBBBB", 10_000, 5_000, 8, 2, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", 13)
        + ihdr
        + struct.pack(">I", zlib.crc32(ihdr))
        + struct.pack(">I", 0)
        + b"IEND"
        + struct.pack(">I", zlib.crc32(b"IEND"))
    )
    with pytest.raises(ValueError, match="dimensions"):
        save_image(png, "image/png")


def token_from_message(message: OutboxMessage) -> str:
    match = re.search(r"token=([^\"&<]+)", message.html_body)
    assert match
    return match.group(1)


def test_registration_is_indistinguishable_and_hashes_both_passwords(client, monkeypatch):
    hashes = []
    real_hash = main_module.hash_password

    def tracked_hash(password):
        hashes.append(password)
        return real_hash(password)

    monkeypatch.setattr(main_module, "hash_password", tracked_hash)
    payload = {
        "email": "reader@example.com",
        "full_name": "Another Reader",
        "password": "LongPassword123",
    }
    existing = client.post("/api/v1/auth/register", json=payload)
    created = client.post(
        "/api/v1/auth/register",
        json={**payload, "email": "new.reader@example.com"},
    )
    assert existing.status_code == created.status_code == 202
    assert existing.json() == created.json() == {
        "message": "Check your email to verify your account"
    }
    assert hashes == ["LongPassword123", "LongPassword123"]
    with SessionLocal() as db:
        assert db.scalar(
            select(OutboxMessage).where(
                OutboxMessage.to_email == "reader@example.com",
                OutboxMessage.subject == "An Orphaleia registration was attempted",
            )
        )
        assert db.scalar(
            select(OutboxMessage).where(
                OutboxMessage.to_email == "new.reader@example.com",
                OutboxMessage.subject == "Verify your Orphaleia account",
            )
        )


def test_new_reset_supersedes_old_and_password_change_invalidates_all(client):
    for _ in range(2):
        response = client.post(
            "/api/v1/auth/request-reset", json={"email": "reader@example.com"}
        )
        assert response.status_code == 200
    with SessionLocal() as db:
        messages = list(
            db.scalars(
                select(OutboxMessage)
                .where(OutboxMessage.subject == "Reset your Orphaleia password")
                .order_by(OutboxMessage.next_attempt_at)
            )
        )
        old_token, current_token = (token_from_message(message) for message in messages)
        records = list(db.scalars(select(ActionToken).where(ActionToken.kind == "reset")))
        assert len(records) == 2
        assert sum(record.used_at is None for record in records) == 1

    assert client.post(
        "/api/v1/auth/reset", json={"token": old_token, "password": "ReplacementPass123"}
    ).status_code == 400
    assert current_token

    headers = login(client)
    changed = client.post(
        "/api/v1/users/me/password",
        json={
            "current_password": "ReaderPass!2026",
            "new_password": "A-New-Reader-Pass!2026",
        },
        headers=headers,
    )
    assert changed.status_code == 200
    assert client.post(
        "/api/v1/auth/reset",
        json={"token": current_token, "password": "AnotherReplacementPass123"},
    ).status_code == 400


def test_refresh_token_can_be_consumed_only_once(client):
    login(client)
    original_refresh = client.cookies.get("refresh_token")
    assert original_refresh
    with TestClient(app) as first, TestClient(app) as replay:
        first.cookies.set("refresh_token", original_refresh)
        replay.cookies.set("refresh_token", original_refresh)
        assert first.post("/api/v1/auth/refresh").status_code == 200
        assert replay.post("/api/v1/auth/refresh").status_code == 401


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="requires PostgreSQL concurrency")
def test_concurrent_refresh_allows_exactly_one_success(client):
    login(client)
    original_refresh = client.cookies.get("refresh_token")
    barrier = Barrier(2)
    with TestClient(app) as first, TestClient(app) as replay:
        first.cookies.set("refresh_token", original_refresh)
        replay.cookies.set("refresh_token", original_refresh)

        def refresh(test_client):
            barrier.wait()
            return test_client.post("/api/v1/auth/refresh").status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(executor.map(refresh, (first, replay)))
    assert sorted(statuses) == [200, 401]


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="requires PostgreSQL concurrency")
def test_concurrent_verification_consumes_token_once(client):
    email = "concurrent.verify@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "full_name": "Concurrent", "password": "LongPassword123"},
    )
    assert response.status_code == 202
    with SessionLocal() as db:
        message = db.scalar(
            select(OutboxMessage).where(
                OutboxMessage.to_email == email,
                OutboxMessage.subject == "Verify your Orphaleia account",
            )
        )
        token = token_from_message(message)

    barrier = Barrier(2)

    def verify(_):
        with TestClient(app) as test_client:
            barrier.wait()
            return test_client.post(
                "/api/v1/auth/verify", json={"token": token}
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(verify, range(2)))
    assert sorted(statuses) == [200, 400]


@pytest.mark.skipif(not os.environ.get("TEST_REDIS_URL"), reason="requires isolated Redis")
def test_real_redis_buckets_are_shared_and_expire(monkeypatch):
    redis_url = os.environ["TEST_REDIS_URL"]
    backend = Redis.from_url(redis_url, decode_responses=True)
    backend.flushdb()
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(settings, "redis_url", redis_url)
    throttle_module._redis = None
    try:
        throttle_module.enforce_limit("real", "198.51.100.1", 1, 1)
        throttle_module._redis = None
        with pytest.raises(HTTPException) as limited:
            throttle_module.enforce_limit("real", "198.51.100.1", 1, 1)
        assert limited.value.status_code == 429
        throttle_module.enforce_limit("real", "198.51.100.2", 1, 1)
        time.sleep(1.05)
        throttle_module.enforce_limit("real", "198.51.100.1", 1, 1)
    finally:
        backend.flushdb()
        throttle_module._redis = None
