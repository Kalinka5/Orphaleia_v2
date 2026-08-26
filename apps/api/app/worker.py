import smtplib
import time
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

from sqlalchemy import select

from .config import settings
from .database import SessionLocal
from .models import OutboxMessage
from .services import release_expired_reservations


def send_pending_mail(db):
    messages = db.scalars(
        select(OutboxMessage).where(OutboxMessage.sent_at.is_(None), OutboxMessage.next_attempt_at <= datetime.now(UTC)).limit(20)
    ).all()
    for item in messages:
        message = EmailMessage()
        message["From"] = settings.smtp_from
        message["To"] = item.to_email
        message["Subject"] = item.subject
        message.set_content("Open this message in an HTML-capable email client.")
        message.add_alternative(item.html_body, subtype="html")
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
                smtp.send_message(message)
            item.sent_at = datetime.now(UTC)
        except Exception as exc:
            item.attempts += 1
            item.next_attempt_at = datetime.now(UTC) + timedelta(seconds=min(300, 2 ** item.attempts))
            print(f"Email delivery failed: {exc}")
    db.commit()


def run():
    print("Orphaleia worker started")
    while True:
        with SessionLocal() as db:
            release_expired_reservations(db)
            send_pending_mail(db)
        time.sleep(10)


if __name__ == "__main__":
    run()

