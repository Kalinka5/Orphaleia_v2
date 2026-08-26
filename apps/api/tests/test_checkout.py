from conftest import login

ADDRESS = {"name": "Test Reader", "line1": "1 Odyssey Way", "line2": "", "city": "Madrid", "postal_code": "28001", "country": "ES"}


def test_mock_checkout_reserves_and_completes(client):
    headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    assert client.post("/api/v1/cart/items", json={"book_id": book["id"], "quantity": 2}, headers=headers).status_code == 200
    quote = client.post("/api/v1/checkout/quote", json={"address": ADDRESS}).json()
    assert quote["total_cents"] == 4400
    order = client.post("/api/v1/orders", json={"address": ADDRESS}, headers=headers).json()
    payment = client.post(f"/api/v1/payments/stripe/start?order_id={order['id']}", headers=headers).json()
    complete = client.post(f"/api/v1/payments/stripe/complete?order_id={order['id']}&reference={payment['reference']}", headers=headers)
    assert complete.status_code == 200
    assert complete.json()["status"] == "paid"
    assert client.get("/api/v1/cart").json()["items"] == []


def test_admin_can_hide_comments(client):
    reader_headers = login(client)
    book_id = client.get("/api/v1/books").json()["items"][0]["id"]
    comment = client.post(f"/api/v1/books/{book_id}/comments", json={"body": "Visible first."}, headers=reader_headers).json()
    client.post("/api/v1/auth/logout", headers=reader_headers)
    admin_headers = login(client, "admin@orphaleia.local", "AdminPass!2026")
    response = client.patch(f"/api/v1/admin/comments/{comment['id']}", json={"visible": False}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["visible"] is False
