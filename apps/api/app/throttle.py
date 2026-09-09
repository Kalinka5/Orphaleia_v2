import hashlib
import ipaddress
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request
from redis import Redis
from redis.exceptions import RedisError

from .config import settings

_hits: dict[str, deque[float]] = defaultdict(deque)
_redis: Redis | None = None


def _trusted_proxy_networks():
    return tuple(
        ipaddress.ip_network(value.strip(), strict=False)
        for value in settings.trusted_proxy_cidrs.split(",")
        if value.strip()
    )


def _parsed_ip(value: str):
    try:
        return ipaddress.ip_address(value.strip())
    except ValueError:
        return None


def client_ip(request: Request) -> str:
    peer_text = request.client.host if request.client else "unknown"
    peer = _parsed_ip(peer_text)
    networks = _trusted_proxy_networks()
    if peer is None or not any(peer in network for network in networks):
        return peer_text

    chain = []
    for value in request.headers.get("x-forwarded-for", "").split(","):
        parsed = _parsed_ip(value)
        if parsed is None:
            return peer_text
        chain.append(parsed)
    chain.append(peer)
    for address in reversed(chain):
        if not any(address in network for network in networks):
            return str(address)
    return peer_text


def _redis_client() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
    return _redis


def _test_limit(key: str, limit: int, window: int) -> None:
    now = time.monotonic()
    bucket = _hits[key]
    while bucket and bucket[0] < now - window:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(429, "Too many requests; try again shortly")
    bucket.append(now)


def enforce_limit(scope: str, identity: str, limit: int, window: int) -> None:
    identity_digest = hashlib.sha256(identity.strip().lower().encode()).hexdigest()
    window_id = int(time.time()) // window
    key = f"orphaleia:limit:{scope}:{identity_digest}:{window_id}"
    if settings.app_env == "test":
        _test_limit(key, limit, window)
        return
    try:
        pipe = _redis_client().pipeline(transaction=True)
        pipe.incr(key)
        pipe.expire(key, window * 2)
        count, _ = pipe.execute()
    except RedisError as exc:
        raise HTTPException(503, "Request protection is temporarily unavailable") from exc
    if int(count) > limit:
        raise HTTPException(429, "Too many requests; try again shortly")


def throttle(limit: int = 10, window: int = 60, scope: str | None = None):
    def dependency(request: Request):
        enforce_limit(scope or request.url.path, client_ip(request), limit, window)

    return dependency


def throttle_email(scope: str, email: str, limit: int, window: int) -> None:
    enforce_limit(scope, email, limit, window)


def rate_limit_health() -> None:
    if settings.app_env == "test":
        return
    try:
        if not _redis_client().ping():
            raise RedisError("Redis ping failed")
    except RedisError as exc:
        raise HTTPException(503, "Request protection is temporarily unavailable") from exc


def reset_test_limits() -> None:
    _hits.clear()
