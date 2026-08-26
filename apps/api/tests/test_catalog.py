from conftest import login
from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import Author, Book, Genre, Rating, RatingEvent
from app.seed import CATALOG, FEATURED_SLUGS, LEGACY_CATALOG_SLUGS, sync_catalog


def test_classic_catalog_definition_is_complete():
    assert len(CATALOG) == 12
    assert len({item["slug"] for item in CATALOG}) == 12
    assert len({item["isbn"] for item in CATALOG}) == 12
    assert tuple(item["slug"] for item in CATALOG if item["slug"] in FEATURED_SLUGS) == FEATURED_SLUGS


def test_catalog_sync_is_repeatable_and_deactivates_legacy_books():
    legacy_slug = next(iter(LEGACY_CATALOG_SLUGS))
    with SessionLocal() as db:
        author = Author(name="Legacy Writer", slug="legacy-writer", bio="Legacy catalog author.")
        genre = Genre(name="Legacy Genre", slug="legacy-genre", description="Legacy catalog genre.")
        db.add(
            Book(
                title="Legacy Book",
                slug=legacy_slug,
                isbn="9780000000999",
                description="A sufficiently long legacy description for synchronization testing.",
                publication_year=2020,
                price_cents=1500,
                stock_qty=2,
                cover_url="/covers/legacy.svg",
                featured=True,
                authors=[author],
                genres=[genre],
            )
        )
        db.commit()

        sync_catalog(db)
        first_event_count = db.scalar(select(func.count(RatingEvent.id)))
        first_rating_count = db.scalar(select(func.count(Rating.id)))
        sync_catalog(db)

        classic_slugs = {item["slug"] for item in CATALOG}
        classics = db.scalars(select(Book).where(Book.slug.in_(classic_slugs))).all()
        legacy = db.scalar(select(Book).where(Book.slug == legacy_slug))

        assert len(classics) == 12
        assert all(book.active for book in classics)
        assert {book.slug for book in classics if book.featured} == set(FEATURED_SLUGS)
        assert legacy is not None and not legacy.active and not legacy.featured
        assert db.scalar(select(func.count(RatingEvent.id))) == first_event_count
        assert db.scalar(select(func.count(Rating.id))) == first_rating_count


def test_catalog_filters_and_detail(client):
    response = client.get("/api/v1/books?genre=adventure&year=2024")
    assert response.status_code == 200
    assert response.json()["total"] == 1
    detail = client.get("/api/v1/books/the-test-passage").json()
    assert detail["title"] == "The Test Passage"
    assert detail["authors"][0]["name"] == "Test Voyager"


def test_author_and_genre_lists_hide_entries_without_active_books(client):
    with SessionLocal() as db:
        author = Author(name="Retired Writer", slug="retired-writer", bio="No active catalog books.")
        genre = Genre(name="Retired Shelf", slug="retired-shelf", description="No active catalog books.")
        db.add(
            Book(
                title="An Archived Passage",
                slug="an-archived-passage",
                isbn="9780000099998",
                description="A sufficiently long archived description for list filtering.",
                publication_year=2020,
                price_cents=1800,
                stock_qty=1,
                cover_url="/covers/archive.svg",
                active=False,
                authors=[author],
                genres=[genre],
            )
        )
        db.commit()

    authors = client.get("/api/v1/authors").json()["items"]
    genres = client.get("/api/v1/genres").json()["items"]

    assert {item["slug"] for item in authors} == {"test-voyager"}
    assert {item["slug"] for item in genres} == {"adventure"}


def test_rating_is_unique_and_history_is_exposed(client):
    headers = login(client)
    book_id = client.get("/api/v1/books").json()["items"][0]["id"]
    assert client.put(f"/api/v1/books/{book_id}/ratings", json={"value": 4}, headers=headers).status_code == 200
    assert client.put(f"/api/v1/books/{book_id}/ratings", json={"value": 5}, headers=headers).status_code == 200
    detail = client.get(f"/api/v1/books/{book_id}").json()
    assert detail["rating_count"] == 1
    assert detail["rating_average"] == 5
    assert client.get(f"/api/v1/books/{book_id}/rating-trend").json()["points"][-1]["average"] == 5


def test_comment_requires_csrf(client):
    login(client)
    book_id = client.get("/api/v1/books").json()["items"][0]["id"]
    response = client.post(f"/api/v1/books/{book_id}/comments", json={"body": "A thoughtful note."})
    assert response.status_code == 403
