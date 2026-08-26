import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_hits: dict[str, deque[float]] = defaultdict(deque)


def throttle(limit: int = 10, window: int = 60):
    def dependency(request: Request):
        key = f"{request.client.host if request.client else 'unknown'}:{request.url.path}"
        now = time.monotonic()
        bucket = _hits[key]
        while bucket and bucket[0] < now - window:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(429, "Too many requests; try again shortly")
        bucket.append(now)

    return dependency
