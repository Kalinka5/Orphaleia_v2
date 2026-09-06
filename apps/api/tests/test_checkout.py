from datetime import UTC, datetime, timedelta

from conftest import login
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import SessionLocal
from app.main import app
from app.models import InventoryReservation, Order, OrderStatusEvent, OutboxMessage
from app.services import finalize_payment, release_expired_reservations

ADDRESS = {"name": "Test Reader", "line1": "1 Odyssey Way", "line2": "", "city": "Madrid", "postal_code": "28001", "country": "ES"}


def create_paid_order(client):
    headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    assert client.post("/api/v1/cart/items", json={"book_id": book["id"], "quantity": 1}, headers=headers).status_code == 200
    order = client.post("/api/v1/orders", json={"address": ADDRESS}, headers=headers).json()
    assert order["status_history"] == []
    payment = client.post(f"/api/v1/payments/stripe/start?order_id={order['id']}", headers=headers).json()
    completed = client.post(
        f"/api/v1/payments/stripe/complete?order_id={order['id']}&reference={payment['reference']}",
        headers=headers,
    )
    assert completed.status_code == 200
    return headers, completed.json(), payment


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


def test_order_lifecycle_records_history_tracking_and_milestone_emails(client):
    reader_headers, paid_order, _ = create_paid_order(client)
    order_id = paid_order["id"]
    assert [event["status"] for event in paid_order["status_history"]] == ["paid"]

    forbidden = client.patch(
        f"/api/v1/admin/orders/{order_id}", json={"status": "processing"}, headers=reader_headers
    )
    assert forbidden.status_code == 403

    client.post("/api/v1/auth/logout", headers=reader_headers)
    admin_headers = login(client, "admin@orphaleia.local", "AdminPass!2026")

    skipped = client.patch(
        f"/api/v1/admin/orders/{order_id}",
        json={"status": "shipped", "tracking_carrier": "Correos <Express>", "tracking_reference": "PQ48392761ES"},
        headers=admin_headers,
    )
    assert skipped.status_code == 409

    preparing = client.patch(
        f"/api/v1/admin/orders/{order_id}", json={"status": "processing"}, headers=admin_headers
    )
    assert preparing.status_code == 200

    missing_tracking = client.patch(
        f"/api/v1/admin/orders/{order_id}", json={"status": "shipped"}, headers=admin_headers
    )
    assert missing_tracking.status_code == 422
    invalid_tracking_url = client.patch(
        f"/api/v1/admin/orders/{order_id}",
        json={
            "status": "shipped",
            "tracking_carrier": "Correos <Express>",
            "tracking_reference": "PQ48392761ES",
            "tracking_url": "javascript:alert(1)",
        },
        headers=admin_headers,
    )
    assert invalid_tracking_url.status_code == 422

    shipped = client.patch(
        f"/api/v1/admin/orders/{order_id}",
        json={
            "status": "shipped",
            "tracking_carrier": "Correos <Express>",
            "tracking_reference": "PQ48392761ES",
            "tracking_url": "https://www.correos.es/track/PQ48392761ES",
        },
        headers=admin_headers,
    )
    assert shipped.status_code == 200
    assert shipped.json()["tracking_carrier"] == "Correos <Express>"
    assert shipped.json()["tracking_reference"] == "PQ48392761ES"
    assert shipped.json()["tracking_url"] == "https://www.correos.es/track/PQ48392761ES"

    out_for_delivery = client.patch(
        f"/api/v1/admin/orders/{order_id}", json={"status": "out_for_delivery"}, headers=admin_headers
    )
    assert out_for_delivery.status_code == 200
    delivered = client.patch(
        f"/api/v1/admin/orders/{order_id}", json={"status": "delivered"}, headers=admin_headers
    )
    assert delivered.status_code == 200
    assert [event["status"] for event in delivered.json()["status_history"]] == [
        "paid",
        "processing",
        "shipped",
        "out_for_delivery",
        "delivered",
    ]

    repeated = client.patch(
        f"/api/v1/admin/orders/{order_id}", json={"status": "delivered"}, headers=admin_headers
    )
    assert repeated.status_code == 409
    terminal_refund = client.patch(
        f"/api/v1/admin/orders/{order_id}", json={"status": "refunded"}, headers=admin_headers
    )
    assert terminal_refund.status_code == 409

    with SessionLocal() as db:
        subjects = list(
            db.scalars(select(OutboxMessage.subject).where(OutboxMessage.to_email == "reader@example.com"))
        )
        assert len(subjects) == 3
        assert set(subjects) == {
            f"Order {paid_order['number']} confirmed",
            f"Order {paid_order['number']} is on its way",
            f"Order {paid_order['number']} delivered",
        }
        shipped_notice = db.scalar(
            select(OutboxMessage).where(OutboxMessage.subject == f"Order {paid_order['number']} is on its way")
        )
        assert "Correos &lt;Express&gt;" in shipped_notice.html_body
        assert "Correos <Express>" not in shipped_notice.html_body
        events = list(db.scalars(select(OrderStatusEvent).where(OrderStatusEvent.order_id == order_id)))
        assert len(events) == 5
        assert all(event.actor_user_id for event in events if event.source == "admin")


def test_unpaid_order_can_be_cancelled_and_late_payment_is_rejected(client):
    reader_headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    client.post("/api/v1/cart/items", json={"book_id": book["id"], "quantity": 1}, headers=reader_headers)
    order = client.post("/api/v1/orders", json={"address": ADDRESS}, headers=reader_headers).json()
    payment = client.post(f"/api/v1/payments/stripe/start?order_id={order['id']}", headers=reader_headers).json()

    with TestClient(app) as admin_client:
        admin_headers = login(admin_client, "admin@orphaleia.local", "AdminPass!2026")
        cancelled = admin_client.patch(
            f"/api/v1/admin/orders/{order['id']}", json={"status": "cancelled"}, headers=admin_headers
        )
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"

    late_payment = client.post(
        f"/api/v1/payments/stripe/complete?order_id={order['id']}&reference={payment['reference']}",
        headers=reader_headers,
    )
    assert late_payment.status_code == 409
    with SessionLocal() as db:
        reservation = db.scalar(
            select(InventoryReservation).where(InventoryReservation.order_id == order["id"])
        )
        assert reservation.released_at is not None
        notice = db.scalar(
            select(OutboxMessage).where(OutboxMessage.subject == f"Order {order['number']} cancelled")
        )
        assert notice is not None


def test_expired_unpaid_order_records_cancellation_and_email(client):
    headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    client.post(
        "/api/v1/cart/items", json={"book_id": book["id"], "quantity": 1}, headers=headers
    )
    order = client.post("/api/v1/orders", json={"address": ADDRESS}, headers=headers).json()

    with SessionLocal() as db:
        reservation = db.scalar(
            select(InventoryReservation).where(InventoryReservation.order_id == order["id"])
        )
        reservation.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        db.commit()
        assert release_expired_reservations(db) == 1

        expired_order = db.scalar(
            select(Order)
            .options(selectinload(Order.status_events))
            .where(Order.id == order["id"])
        )
        assert expired_order.status == "cancelled"
        assert [(event.status, event.source) for event in expired_order.status_events] == [
            ("cancelled", "payment")
        ]
        assert db.scalar(
            select(OutboxMessage).where(
                OutboxMessage.subject == f"Order {order['number']} cancelled"
            )
        ) is not None


def test_paid_order_can_be_recorded_as_refunded_without_skipping_rules(client):
    reader_headers, paid_order, _ = create_paid_order(client)
    client.post("/api/v1/auth/logout", headers=reader_headers)
    admin_headers = login(client, "admin@orphaleia.local", "AdminPass!2026")
    refunded = client.patch(
        f"/api/v1/admin/orders/{paid_order['id']}", json={"status": "refunded"}, headers=admin_headers
    )
    assert refunded.status_code == 200
    assert refunded.json()["status"] == "refunded"
    assert [event["status"] for event in refunded.json()["status_history"]] == ["paid", "refunded"]
    assert client.patch(
        f"/api/v1/admin/orders/{paid_order['id']}", json={"status": "processing"}, headers=admin_headers
    ).status_code == 409


def test_payment_callback_after_fulfilment_started_is_idempotent(client):
    reader_headers, paid_order, _ = create_paid_order(client)
    client.post("/api/v1/auth/logout", headers=reader_headers)
    admin_headers = login(client, "admin@orphaleia.local", "AdminPass!2026")
    assert client.patch(
        f"/api/v1/admin/orders/{paid_order['id']}", json={"status": "processing"}, headers=admin_headers
    ).status_code == 200

    with SessionLocal() as db:
        order = db.scalar(
            select(Order)
            .options(selectinload(Order.user), selectinload(Order.status_events))
            .where(Order.id == paid_order["id"])
        )
        finalize_payment(db, order, "stripe", "stripe-replay-after-processing", {"status": "completed"})
        assert order.status == "processing"
        assert [event.status for event in order.status_events] == ["paid", "processing"]
        messages = list(db.scalars(select(OutboxMessage).where(OutboxMessage.to_email == "reader@example.com")))
        assert len(messages) == 1
