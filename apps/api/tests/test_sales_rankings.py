import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import RankingDataset, RankingEntry
from app.rankings import RankingImportDocument, import_ranking_dataset


def ranking_document(*, public: bool = True, entries: list[dict] | None = None, year: int = 2025, scope: str = "all-covered"):
    return RankingImportDocument.model_validate(
        {
            "metadata": {
                "source_name": "NielsenIQ BookScan",
                "source_url": "https://nielseniq.com/bookscan",
                "year": year,
                "scope_code": scope,
                "scope_label": "BookScan covered markets",
                "coverage_note": "Licensed print point-of-sale data across covered BookScan markets.",
                "methodology_note": "Calendar-year units grouped into provider-defined works across print editions.",
                "exact_units_public": public,
            },
            "entries": entries
            or [
                {
                    "provider_work_key": "work-test-passage",
                    "isbn13": "9780000099999",
                    "title": "The Test Passage",
                    "authors": ["Test Voyager"],
                    "genre": "Adventure",
                    "units_sold": 1876543,
                },
                {
                    "provider_work_key": "work-quiet-atlas",
                    "isbn13": "9781111111113",
                    "title": "A Quiet Atlas",
                    "authors": ["Mara Sol"],
                    "genre": "Literary Fiction",
                    "units_sold": 934221,
                },
            ],
        }
    )


def test_import_is_idempotent_and_matches_active_catalog_books():
    with SessionLocal() as db:
        first = import_ranking_dataset(db, ranking_document(), publish=True)
        second = import_ranking_dataset(db, ranking_document(), publish=True)

        assert first.unchanged is False
        assert second.unchanged is True
        assert first.dataset.id == second.dataset.id
        assert db.scalar(select(func.count(RankingDataset.id))) == 1
        assert db.scalar(select(func.count(RankingEntry.id))) == 2
        matched = db.scalar(select(RankingEntry).where(RankingEntry.provider_work_key == "work-test-passage"))
        assert matched.catalog_book_id is not None


def test_import_rejects_publication_without_redistribution_rights():
    with SessionLocal() as db:
        with pytest.raises(ValueError, match="redistribution rights"):
            import_ranking_dataset(db, ranking_document(public=False), publish=True)
        assert db.scalar(select(func.count(RankingDataset.id))) == 0


def test_document_rejects_duplicate_work_keys_and_negative_units():
    duplicate = {
        "provider_work_key": "duplicate",
        "title": "First",
        "authors": ["One Author"],
        "genre": "Fiction",
        "units_sold": 1,
    }
    with pytest.raises(ValidationError, match="Duplicate provider_work_key"):
        ranking_document(entries=[duplicate, {**duplicate, "title": "Second"}])
    with pytest.raises(ValidationError):
        ranking_document(entries=[{**duplicate, "provider_work_key": "negative", "units_sold": -1}])


def test_unpublished_dataset_is_not_exposed(client):
    with SessionLocal() as db:
        import_ranking_dataset(db, ranking_document(), publish=False)

    response = client.get("/api/v1/rankings/sales")
    assert response.status_code == 200
    assert response.json() == {
        "status": "unavailable",
        "year": None,
        "market": None,
        "genre": None,
        "scope_label": None,
        "source": None,
        "available_years": [],
        "available_markets": [],
        "available_genres": [],
        "items": [],
    }


def test_sales_endpoint_sorts_filters_and_exposes_source_metadata(client):
    tied_entries = [
        {
            "provider_work_key": "zulu",
            "title": "Zulu Story",
            "authors": ["Zed Writer"],
            "genre": "Fantasy",
            "units_sold": 720005,
        },
        {
            "provider_work_key": "alpha",
            "title": "Alpha Story",
            "authors": ["Ana Writer"],
            "genre": "Fantasy",
            "units_sold": 720005,
        },
        {
            "provider_work_key": "history",
            "title": "A History",
            "authors": ["Ivo Writer"],
            "genre": "History & Culture",
            "units_sold": 812337,
        },
    ]
    with SessionLocal() as db:
        import_ranking_dataset(db, ranking_document(entries=tied_entries), publish=True)

    response = client.get("/api/v1/rankings/sales?year=2025&market=all-covered")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "published"
    assert payload["source"]["name"] == "NielsenIQ BookScan"
    assert payload["available_years"] == [2025]
    assert payload["available_markets"] == [{"value": "all-covered", "label": "BookScan covered markets"}]
    assert [item["title"] for item in payload["items"]] == ["A History", "Alpha Story", "Zulu Story"]
    assert [item["rank"] for item in payload["items"]] == [1, 2, 3]

    filtered = client.get("/api/v1/rankings/sales?year=2025&market=all-covered&genre=fantasy").json()
    assert [item["title"] for item in filtered["items"]] == ["Alpha Story", "Zulu Story"]
    assert [item["rank"] for item in filtered["items"]] == [1, 2]


def test_legacy_reader_rankings_endpoint_remains_available(client):
    response = client.get("/api/v1/rankings?publication_year=2024")
    assert response.status_code == 200
    assert response.json()["publication_year"] == 2024
