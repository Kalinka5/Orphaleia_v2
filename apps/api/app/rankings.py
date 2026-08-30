from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import Book, RankingDataset, RankingEntry


class RankingImportMetadata(BaseModel):
    source_name: str = Field(min_length=2, max_length=160)
    source_url: HttpUrl
    year: int = Field(ge=1900, le=2100)
    scope_code: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)
    scope_label: str = Field(min_length=2, max_length=160)
    coverage_note: str = Field(min_length=10, max_length=4000)
    methodology_note: str = Field(min_length=10, max_length=4000)
    exact_units_public: bool = False

    @field_validator("source_name", "scope_label", "coverage_note", "methodology_note")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()


class RankingImportEntry(BaseModel):
    provider_work_key: str = Field(min_length=1, max_length=180)
    isbn13: str | None = Field(default=None, pattern=r"^\d{13}$")
    title: str = Field(min_length=1, max_length=240)
    authors: list[str] = Field(min_length=1, max_length=20)
    genre: str = Field(min_length=1, max_length=120)
    units_sold: int = Field(ge=0)

    @field_validator("provider_work_key", "title", "genre")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("authors")
    @classmethod
    def validate_authors(cls, authors: list[str]) -> list[str]:
        cleaned = [author.strip() for author in authors]
        if any(not author or len(author) > 160 for author in cleaned):
            raise ValueError("Authors must contain non-empty names up to 160 characters")
        return cleaned


class RankingImportDocument(BaseModel):
    metadata: RankingImportMetadata
    entries: list[RankingImportEntry] = Field(min_length=1, max_length=10000)

    @model_validator(mode="after")
    def unique_work_keys(self):
        work_keys = [entry.provider_work_key for entry in self.entries]
        if len(work_keys) != len(set(work_keys)):
            raise ValueError("Duplicate provider_work_key values are not allowed")
        return self


@dataclass(frozen=True)
class RankingImportResult:
    dataset: RankingDataset
    unchanged: bool


def document_checksum(document: RankingImportDocument) -> str:
    canonical = json.dumps(document.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def import_ranking_dataset(
    db: Session,
    document: RankingImportDocument,
    *,
    publish: bool = False,
) -> RankingImportResult:
    if publish and not document.metadata.exact_units_public:
        raise ValueError("Cannot publish exact sales units without confirmed redistribution rights")

    metadata = document.metadata
    checksum = document_checksum(document)
    dataset = db.scalar(
        select(RankingDataset).where(
            RankingDataset.source_name == metadata.source_name,
            RankingDataset.year == metadata.year,
            RankingDataset.scope_code == metadata.scope_code,
        )
    )
    now = datetime.now(UTC)
    unchanged = dataset is not None and dataset.checksum == checksum

    try:
        if dataset is None:
            dataset = RankingDataset(
                source_name=metadata.source_name,
                source_url=str(metadata.source_url),
                year=metadata.year,
                scope_code=metadata.scope_code,
                scope_label=metadata.scope_label,
                coverage_note=metadata.coverage_note,
                methodology_note=metadata.methodology_note,
                exact_units_public=metadata.exact_units_public,
                checksum=checksum,
                imported_at=now,
            )
            db.add(dataset)
            db.flush()
        elif not unchanged:
            dataset.source_url = str(metadata.source_url)
            dataset.scope_label = metadata.scope_label
            dataset.coverage_note = metadata.coverage_note
            dataset.methodology_note = metadata.methodology_note
            dataset.exact_units_public = metadata.exact_units_public
            dataset.checksum = checksum
            dataset.imported_at = now
            dataset.published_at = None
            db.execute(delete(RankingEntry).where(RankingEntry.dataset_id == dataset.id))

        if not unchanged:
            isbns = {entry.isbn13 for entry in document.entries if entry.isbn13}
            catalog_by_isbn = {
                book.isbn: book.id
                for book in db.scalars(select(Book).where(Book.isbn.in_(isbns), Book.active.is_(True))).all()
            } if isbns else {}
            for entry in document.entries:
                db.add(
                    RankingEntry(
                        dataset_id=dataset.id,
                        provider_work_key=entry.provider_work_key,
                        isbn13=entry.isbn13,
                        title=entry.title,
                        authors_json=json.dumps(entry.authors, ensure_ascii=False),
                        genre=entry.genre,
                        units_sold=entry.units_sold,
                        catalog_book_id=catalog_by_isbn.get(entry.isbn13),
                    )
                )

        if publish:
            dataset.published_at = dataset.published_at or now
        db.commit()
        db.refresh(dataset)
        return RankingImportResult(dataset=dataset, unchanged=unchanged)
    except Exception:
        db.rollback()
        raise
