import io
import re

from conftest import login
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.main import app
from app.models import OutboxMessage


def image_bytes(color=(45, 95, 76), size=(640, 420)) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", size, color).save(output, format="PNG")
    return output.getvalue()


def email_change_token(address: str) -> str:
    with SessionLocal() as db:
        message = db.scalar(select(OutboxMessage).where(OutboxMessage.to_email == address, OutboxMessage.subject == "Confirm your new Orphaleia email"))
        assert message is not None
        match = re.search(r"token=([^\"&<]+)", message.html_body)
        assert match
        return match.group(1)


def test_profile_and_avatar_changes_update_existing_comments(client, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "media_dir", str(tmp_path))
    headers = login(client)
    book_id = client.get("/api/v1/books").json()["items"][0]["id"]
    comment = client.post(f"/api/v1/books/{book_id}/comments", json={"body": "A lasting marginal note."}, headers=headers)
    assert comment.status_code == 200

    updated = client.patch("/api/v1/users/me/profile", json={"full_name": "  Marina   Reader  "}, headers=headers)
    assert updated.status_code == 200
    assert updated.json()["full_name"] == "Marina Reader"

    uploaded = client.put(
        "/api/v1/users/me/avatar",
        files={"file": ("portrait.png", image_bytes(), "image/png")},
        headers=headers,
    )
    assert uploaded.status_code == 200
    avatar_url = uploaded.json()["avatar_url"]
    assert avatar_url.startswith("/media/avatars/")
    avatar_path = tmp_path / avatar_url.removeprefix("/media/")
    assert avatar_path.exists()
    with Image.open(avatar_path) as avatar:
        assert avatar.size == (256, 256)
        assert avatar.format == "WEBP"

    detail = client.get(f"/api/v1/books/{book_id}").json()
    rendered_comment = next(item for item in detail["comments"] if item["id"] == comment.json()["id"])
    assert rendered_comment["author"] == "Marina Reader"
    assert rendered_comment["author_avatar_url"] == avatar_url

    removed = client.delete("/api/v1/users/me/avatar", headers=headers)
    assert removed.status_code == 200
    assert removed.json()["avatar_url"] is None
    assert not avatar_path.exists()


def test_avatar_upload_validates_content_and_csrf(client, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "media_dir", str(tmp_path))
    login(client)
    no_csrf = client.put("/api/v1/users/me/avatar", files={"file": ("portrait.png", image_bytes(), "image/png")})
    assert no_csrf.status_code == 403
    headers = {"X-CSRF-Token": client.cookies.get("csrf_token")}
    invalid = client.put("/api/v1/users/me/avatar", files={"file": ("portrait.png", b"not an image", "image/png")}, headers=headers)
    assert invalid.status_code == 422
    assert invalid.json()["message"] == "Upload a valid JPEG, PNG, or WebP image"


def test_admin_can_reset_reader_avatar(client, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "media_dir", str(tmp_path))
    reader_headers = login(client)
    uploaded = client.put("/api/v1/users/me/avatar", files={"file": ("portrait.png", image_bytes(), "image/png")}, headers=reader_headers)
    reader_id = uploaded.json()["id"]
    avatar_path = tmp_path / uploaded.json()["avatar_url"].removeprefix("/media/")
    client.post("/api/v1/auth/logout", headers=reader_headers)

    admin_headers = login(client, "admin@orphaleia.local", "AdminPass!2026")
    response = client.delete(f"/api/v1/admin/users/{reader_id}/avatar", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["avatar_url"] is None
    assert not avatar_path.exists()


def test_email_change_is_pending_until_confirmed_and_revokes_sessions(client):
    headers = login(client)
    wrong_password = client.post(
        "/api/v1/users/me/email-change",
        json={"email": "new.reader@example.com", "current_password": "WrongPassword!"},
        headers=headers,
    )
    assert wrong_password.status_code == 401

    requested = client.post(
        "/api/v1/users/me/email-change",
        json={"email": "new.reader@example.com", "current_password": "ReaderPass!2026"},
        headers=headers,
    )
    assert requested.status_code == 202
    current = client.get("/api/v1/users/me").json()
    assert current["email"] == "reader@example.com"
    assert current["pending_email"] == "new.reader@example.com"
    with SessionLocal() as db:
        old_notice = db.scalar(select(OutboxMessage).where(OutboxMessage.to_email == "reader@example.com", OutboxMessage.subject == "An email change was requested"))
        assert old_notice is not None

    token = email_change_token("new.reader@example.com")
    with TestClient(app) as confirmation_client:
        confirmed = confirmation_client.post("/api/v1/auth/confirm-email-change", json={"token": token})
        assert confirmed.status_code == 200
        assert confirmation_client.cookies.get("access_token") is None

    assert client.get("/api/v1/users/me").status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "reader@example.com", "password": "ReaderPass!2026"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "new.reader@example.com", "password": "ReaderPass!2026"}).status_code == 200


def test_new_email_request_supersedes_old_token_and_can_be_cancelled(client):
    headers = login(client)
    first = client.post("/api/v1/users/me/email-change", json={"email": "first@example.com", "current_password": "ReaderPass!2026"}, headers=headers)
    assert first.status_code == 202
    first_token = email_change_token("first@example.com")
    second = client.post("/api/v1/users/me/email-change", json={"email": "second@example.com", "current_password": "ReaderPass!2026"}, headers=headers)
    assert second.status_code == 202
    assert client.post("/api/v1/auth/confirm-email-change", json={"token": first_token}).status_code == 400
    cancelled = client.delete("/api/v1/users/me/email-change", headers=headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["pending_email"] is None


def test_password_change_keeps_requesting_device_and_revokes_others(client):
    first_headers = login(client)
    with TestClient(app) as other_client:
        login(other_client)
        changed = client.post(
            "/api/v1/users/me/password",
            json={"current_password": "ReaderPass!2026", "new_password": "A-New-Reader-Pass!2026"},
            headers=first_headers,
        )
        assert changed.status_code == 200
        assert client.get("/api/v1/users/me").status_code == 200
        assert other_client.get("/api/v1/users/me").status_code == 401

    client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": client.cookies.get("csrf_token")})
    assert client.post("/api/v1/auth/login", json={"email": "reader@example.com", "password": "ReaderPass!2026"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "reader@example.com", "password": "A-New-Reader-Pass!2026"}).status_code == 200
    with SessionLocal() as db:
        notice = db.scalar(select(OutboxMessage).where(OutboxMessage.to_email == "reader@example.com", OutboxMessage.subject == "Your Orphaleia password was changed"))
        assert notice is not None
