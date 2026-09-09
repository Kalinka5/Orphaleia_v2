import json
import uuid

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import settings

DEFAULT_REQUEST_LIMIT = 1024 * 1024
PATH_REQUEST_LIMITS = {
    "/api/v1/webhooks/stripe": 256 * 1024,
    "/api/v1/webhooks/paypal": 256 * 1024,
    "/api/v1/users/me/avatar": 6 * 1024 * 1024,
    "/api/v1/admin/media": 9 * 1024 * 1024,
}


class RequestTooLarge(Exception):
    pass


class RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") in {"GET", "HEAD", "OPTIONS"}:
            await self.app(scope, receive, send)
            return

        limit = PATH_REQUEST_LIMITS.get(scope.get("path", ""), DEFAULT_REQUEST_LIMIT)
        headers = Headers(scope=scope)
        request_id = headers.get("x-request-id") or str(uuid.uuid4())
        origin = headers.get("origin")
        content_length = headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > limit:
                    await self._reject(send, request_id, origin)
                    return
            except ValueError:
                pass

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise RequestTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestTooLarge:
            await self._reject(send, request_id, origin)

    @staticmethod
    async def _reject(send: Send, request_id: str, origin: str | None) -> None:
        body = json.dumps(
            {"code": "http_413", "message": "Request body is too large", "request_id": request_id},
            separators=(",", ":"),
        ).encode()
        response_headers = [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode()),
            (b"x-request-id", request_id.encode()),
        ]
        if origin == settings.frontend_url:
            response_headers.extend(
                [
                    (b"access-control-allow-origin", origin.encode()),
                    (b"access-control-allow-credentials", b"true"),
                    (b"vary", b"Origin"),
                ]
            )
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": response_headers,
            }
        )
        await send({"type": "http.response.body", "body": body})
