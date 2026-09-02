from conftest import login
from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import Author, Book, Genre, Rating, RatingEvent
from app.seed import AUTHORS, CATALOG, FEATURED_SLUGS, LEGACY_CATALOG_SLUGS, sync_catalog


def test_classic_catalog_definition_is_complete():
    assert len(CATALOG) == 13
    assert len({item["slug"] for item in CATALOG}) == 13
    assert len({item["isbn"] for item in CATALOG}) == 13
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

        assert len(classics) == 13
        assert all(book.active for book in classics)
        assert {book.slug for book in classics if book.featured} == set(FEATURED_SLUGS)
        seeded_authors = db.scalars(select(Author).where(Author.slug.in_(AUTHORS))).all()
        assert len(seeded_authors) == 13
        assert all(author.image_url == f"/assets/authors/{author.slug}.webp" for author in seeded_authors)
        oz = next(book for book in classics if book.slug == "the-wonderful-wizard-of-oz")
        assert [author.name for author in oz.authors] == ["L. Frank Baum"]
        assert {genre.slug for genre in oz.genres} == {"childrens-literature", "fantasy"}
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
    assert detail["interior_image_url"] is None
    assert detail["interior_image_alt"] is None
    assert detail["pull_quote"] is None


def test_admin_can_create_and_update_editorial_spread_content(client):
    headers = login(client, "admin@orphaleia.local", "AdminPass!2026")
    author = client.get("/api/v1/authors").json()["items"][0]
    genre = client.get("/api/v1/genres").json()["items"][0]
    payload = {
        "title": "The Illustrated Crossing",
        "slug": "the-illustrated-crossing",
        "isbn": "9780000099987",
        "description": "A sufficiently long description for an illustrated test edition.",
        "publication_year": 2026,
        "price_cents": 2490,
        "stock_qty": 8,
        "cover_url": "/covers/illustrated.webp",
        "interior_image_url": "/uploads/illustrated-interior.webp",
        "interior_image_alt": "A lantern glowing beside an open book at sea",
        "pull_quote": "Every crossing begins with a page.",
        "featured": False,
        "active": True,
        "author_ids": [author["id"]],
        "genre_ids": [genre["id"]],
    }

    created = client.post("/api/v1/admin/books", json=payload, headers=headers)
    assert created.status_code == 200
    assert created.json()["interior_image_url"] == payload["interior_image_url"]
    assert created.json()["interior_image_alt"] == payload["interior_image_alt"]
    assert created.json()["pull_quote"] == payload["pull_quote"]

    payload["pull_quote"] = "A changed line for the second spread."
    updated = client.put(f"/api/v1/admin/books/{created.json()['id']}", json=payload, headers=headers)
    assert updated.status_code == 200
    detail = client.get("/api/v1/books/the-illustrated-crossing").json()
    assert detail["pull_quote"] == payload["pull_quote"]


def test_interior_artwork_requires_alt_text(client):
    headers = login(client, "admin@orphaleia.local", "AdminPass!2026")
    book = client.get("/api/v1/books/the-test-passage").json()
    payload = {
        "title": book["title"],
        "slug": book["slug"],
        "isbn": book["isbn"],
        "description": book["description"],
        "publication_year": book["publication_year"],
        "price_cents": book["price_cents"],
        "stock_qty": book["stock_qty"],
        "cover_url": book["cover_url"],
        "interior_image_url": "/uploads/missing-alt.webp",
        "interior_image_alt": "",
        "featured": book["featured"],
        "active": book["active"],
        "author_ids": [author["id"] for author in book["authors"]],
        "genre_ids": [genre["id"] for genre in book["genres"]],
    }

    response = client.put(f"/api/v1/admin/books/{book['id']}", json=payload, headers=headers)
    assert response.status_code == 422
    assert "Interior image alt text is required" in response.text


def test_admin_author_requires_a_valid_portrait(client):
    headers = login(client, "admin@orphaleia.local", "AdminPass!2026")
    payload = {
        "name": "Portrait Writer",
        "slug": "portrait-writer",
        "bio": "Writes stories shaped by portraiture and memory.",
        "image_url": "/media/authors/portrait-writer.webp",
    }

    created = client.post("/api/v1/admin/authors", json=payload, headers=headers)
    assert created.status_code == 200
    assert created.json()["image_url"] == payload["image_url"]

    for invalid in (None, "", "//example.com/portrait.webp", "ftp://example.com/portrait.webp"):
        invalid_payload = {**payload, "slug": f"invalid-{len(str(invalid))}"}
        if invalid is None:
            invalid_payload.pop("image_url")
        else:
            invalid_payload["image_url"] = invalid
        response = client.post("/api/v1/admin/authors", json=invalid_payload, headers=headers)
        assert response.status_code == 422


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
