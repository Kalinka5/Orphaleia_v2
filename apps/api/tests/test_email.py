from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models import OutboxMessage
from app.worker import send_pending_mail


def test_registration_queues_email_without_exposing_verification_token(client, monkeypatch):
    monkeypatch.setattr(settings, "app_env", "development")
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "new.reader@example.com", "full_name": "New Reader", "password": "LongPassword123"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Check your email to verify your account",
        "email_preview_url": "http://localhost:8025",
    }
    with SessionLocal() as db:
        message = db.scalar(select(OutboxMessage).where(OutboxMessage.to_email == "new.reader@example.com"))
        assert message is not None
        assert message.subject == "Verify your Orphaleia account"
        assert "/verify?token=" in message.html_body


def test_worker_uses_starttls_and_authentication(monkeypatch):
    monkeypatch.setattr(settings, "smtp_starttls", True)
    monkeypatch.setattr(settings, "smtp_username", "smtp-user")
    monkeypatch.setattr(settings, "smtp_password", "smtp-password")
    with SessionLocal() as db:
        db.add(
            OutboxMessage(
                to_email="reader@example.com",
                subject="A test message",
                html_body="<p>Test</p>",
                next_attempt_at=datetime.now(UTC) - timedelta(seconds=1),
            )
        )
        db.commit()

        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        with patch("app.worker.smtplib.SMTP", return_value=smtp):
            send_pending_mail(db)

        smtp.starttls.assert_called_once()
        smtp.login.assert_called_once_with("smtp-user", "smtp-password")
        smtp.send_message.assert_called_once()
        message = db.scalar(select(OutboxMessage).where(OutboxMessage.subject == "A test message"))
        assert message.sent_at is not None
