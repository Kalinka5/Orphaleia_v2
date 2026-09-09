from conftest import login
from sqlalchemy import select

from app.database import SessionLocal
from app.models import SavedAddress

ADDRESS = {
    "name": "  Marina   Reader  ",
    "line1": "  14   Library Lane ",
    "line2": "  Floor  2 ",
    "city": " Madrid ",
    "postal_code": " 28001 ",
    "country": "es",
}


def test_customer_can_create_replace_and_remove_default_delivery_address(client):
    headers = login(client)
    assert client.get("/api/v1/users/me").json()["default_shipping_address"] is None

    saved = client.put("/api/v1/users/me/delivery-address", json=ADDRESS, headers=headers)
    assert saved.status_code == 200
    assert saved.json()["default_shipping_address"] == {
        "name": "Marina Reader",
        "line1": "14 Library Lane",
        "line2": "Floor 2",
        "city": "Madrid",
        "postal_code": "28001",
        "country": "ES",
    }

    replacement = {**ADDRESS, "line1": "27 New Passage", "line2": ""}
    replaced = client.put("/api/v1/users/me/delivery-address", json=replacement, headers=headers)
    assert replaced.status_code == 200
    assert replaced.json()["default_shipping_address"]["line1"] == "27 New Passage"
    with SessionLocal() as db:
        assert len(db.scalars(select(SavedAddress)).all()) == 1

    removed = client.delete("/api/v1/users/me/delivery-address", headers=headers)
    assert removed.status_code == 200
    assert removed.json()["default_shipping_address"] is None


def test_delivery_address_requires_csrf_and_validates_normalized_fields(client):
    login(client)
    assert client.put("/api/v1/users/me/delivery-address", json=ADDRESS).status_code == 403
    headers = {"X-CSRF-Token": client.cookies.get("csrf_token")}
    invalid = client.put("/api/v1/users/me/delivery-address", json={**ADDRESS, "line1": "  "}, headers=headers)
    assert invalid.status_code == 422
    assert "line1" in invalid.json()["field_errors"]


def test_saved_delivery_address_is_private_to_its_customer(client):
    reader_headers = login(client)
    client.put("/api/v1/users/me/delivery-address", json=ADDRESS, headers=reader_headers)
    client.post("/api/v1/auth/logout", headers=reader_headers)

    login(client, "admin@orphaleia.local", "AdminPass!2026")
    assert client.get("/api/v1/users/me").json()["default_shipping_address"] is None


def test_order_keeps_its_shipping_snapshot_when_default_address_changes(client):
    headers = login(client)
    client.put("/api/v1/users/me/delivery-address", json=ADDRESS, headers=headers)
    book = client.get("/api/v1/books").json()["items"][0]
    client.post("/api/v1/cart/items", json={"book_id": book["id"], "quantity": 1}, headers=headers)
    order_address = {**ADDRESS, "name": "Gift Reader", "line1": "8 Order Road", "line2": ""}
    order = client.post(
        "/api/v1/orders",
        json={"address": order_address},
        headers={**headers, "Idempotency-Key": "delivery-address-order-0001"},
    )
    assert order.status_code == 200

    client.put("/api/v1/users/me/delivery-address", json={**ADDRESS, "line1": "99 Changed Street"}, headers=headers)
    stored = client.get("/api/v1/orders").json()["items"][0]
    assert stored["shipping"]["name"] == "Gift Reader"
    assert stored["shipping"]["line1"] == "8 Order Road"
