import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import RefreshSession, User

hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return hasher.verify(password_hash, password)
    except Exception:
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_access_token(user: User) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {"sub": user.id, "role": user.role, "ver": user.auth_version, "iat": now, "exp": now + timedelta(minutes=settings.access_minutes)},
        settings.secret_key,
        algorithm="HS256",
    )


def create_session(db: Session, user: User) -> tuple[str, str, str]:
    refresh = secrets.token_urlsafe(48)
    csrf = secrets.token_urlsafe(24)
    db.add(
        RefreshSession(
            user_id=user.id,
            token_hash=token_hash(refresh),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_days),
        )
    )
    db.commit()
    return create_access_token(user), refresh, csrf


def set_auth_cookies(response, access: str, refresh: str, csrf: str) -> None:
    common = {"secure": settings.cookie_secure, "samesite": "lax", "path": "/"}
    response.set_cookie("access_token", access, httponly=True, max_age=settings.access_minutes * 60, **common)
    response.set_cookie("refresh_token", refresh, httponly=True, max_age=settings.refresh_days * 86400, **common)
    response.set_cookie("csrf_token", csrf, httponly=False, max_age=settings.refresh_days * 86400, **common)


def clear_auth_cookies(response) -> None:
    for key in ("access_token", "refresh_token", "csrf_token"):
        response.delete_cookie(key, path="/")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(401, "Sign in required")
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id = payload["sub"]
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Session expired") from exc
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(401, "Account not found")
    if payload.get("ver", 0) != user.auth_version:
        raise HTTPException(401, "Session expired")
    return user


def verified_user(user: User = Depends(current_user)) -> User:
    if not user.is_verified:
        raise HTTPException(403, "Verify your email to continue")
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user


def require_csrf(request: Request) -> None:
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        cookie = request.cookies.get("csrf_token")
        header = request.headers.get("X-CSRF-Token")
        if not cookie or not header or not secrets.compare_digest(cookie, header):
            raise HTTPException(403, "Invalid CSRF token")
