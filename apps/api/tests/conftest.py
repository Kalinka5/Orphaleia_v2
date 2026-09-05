import os

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-secret-that-is-long-enough-for-tests"
os.environ["PAYMENTS_MOCK"] = "true"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Author, Book, Genre, ShippingZone, User
from app.security import hash_password
from app.throttle import _hits


@pytest.fixture(autouse=True)
def database():
    _hits.clear()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        author = Author(name="Test Voyager", slug="test-voyager", bio="Writes across imagined seas.")
        genre = Genre(name="Adventure", slug="adventure", description="Bold crossings.")
        book = Book(title="The Test Passage", slug="the-test-passage", isbn="9780000099999", description="A sufficiently long test description for a book.", publication_year=2024, price_cents=2000, stock_qty=5, cover_url="/covers/test.svg", authors=[author], genres=[genre])
        user = User(email="reader@example.com", full_name="Test Reader", password_hash=hash_password("ReaderPass!2026"), is_verified=True)
        admin = User(email="admin@orphaleia.local", full_name="Test Admin", password_hash=hash_password("AdminPass!2026"), is_verified=True, role="admin")
        db.add_all([book, user, admin, ShippingZone(name="Spain", country_codes="ES", rate_cents=400, free_over_cents=5000)])
        db.commit()
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def login(client, email="reader@example.com", password="ReaderPass!2026"):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"X-CSRF-Token": client.cookies.get("csrf_token")}
