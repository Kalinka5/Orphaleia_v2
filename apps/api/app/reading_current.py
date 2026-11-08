"""Expire historical shares from the removed reading quiz."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import ReadingCurrentShare

SHARE_TOMBSTONE_DAYS = 30


def purge_old_shares(db: Session) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=SHARE_TOMBSTONE_DAYS)
    records = db.scalars(
        select(ReadingCurrentShare).where(
            or_(
                ReadingCurrentShare.expires_at < cutoff,
                ReadingCurrentShare.revoked_at < cutoff,
            )
        )
    ).all()
    for record in records:
        db.delete(record)
    db.commit()
    return len(records)
