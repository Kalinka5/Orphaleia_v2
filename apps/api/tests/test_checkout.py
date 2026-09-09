from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier

import pytest
from conftest import login
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import SessionLocal, engine
from app.main import app
from app.models import (
    Book,
    InventoryReservation,
    Order,
    OrderStatusEvent,
    OutboxMessage,
    PaymentAttempt,
    PaymentEvent,
    User,
)
from app.security import hash_password
from app.services import finalize_payment, release_expired_reservations

ADDRESS = {"name": "Test Reader", "line1": "1 Odyssey Way", "line2": "", "city": "Madrid", "postal_code": "28001", "country": "ES"}
ORDER_HEADERS = {"Idempotency-Key": "checkout-test-key-0001"}


def create_paid_order(client):
    headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    assert client.post("/api/v1/cart/items", json={"book_id": book["id"], "quantity": 1}, headers=headers).status_code == 200
    order = client.post(
        "/api/v1/orders", json={"address": ADDRESS}, headers={**headers, **ORDER_HEADERS}
    ).json()
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
    order = client.post(
        "/api/v1/orders", json={"address": ADDRESS}, headers={**headers, **ORDER_HEADERS}
    ).json()
    payment = client.post(f"/api/v1/payments/stripe/start?order_id={order['id']}", headers=headers).json()
    complete = client.post(f"/api/v1/payments/stripe/complete?order_id={order['id']}&reference={payment['reference']}", headers=headers)
    assert complete.status_code == 200
    assert complete.json()["status"] == "paid"
    assert client.get("/api/v1/cart").json()["items"] == []


def test_stripe_webhook_waits_for_confirmed_payment(client):
    headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    assert client.post(
        "/api/v1/cart/items",
        json={"book_id": book["id"], "quantity": 1},
        headers=headers,
    ).status_code == 200
    order = client.post(
        "/api/v1/orders",
        json={"address": ADDRESS},
        headers={**headers, "Idempotency-Key": "stripe-delayed-payment-0001"},
    ).json()
    client.post(
        f"/api/v1/payments/stripe/start?order_id={order['id']}", headers=headers
    )
    unpaid = {
        "id": "evt-stripe-unpaid",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs-delayed-payment",
                "payment_status": "unpaid",
                "metadata": {"order_id": order["id"]},
            }
        },
    }
    assert client.post("/api/v1/webhooks/stripe", json=unpaid).status_code == 200
    assert client.get(f"/api/v1/orders/{order['id']}").json()["status"] == "pending_payment"

    paid = {
        **unpaid,
        "id": "evt-stripe-paid",
        "type": "checkout.session.async_payment_succeeded",
        "data": {
            "object": {
                "id": "cs-delayed-payment",
                "payment_status": "paid",
                "metadata": {"order_id": order["id"]},
            }
        },
    }
    assert client.post("/api/v1/webhooks/stripe", json=paid).status_code == 200
    assert client.get(f"/api/v1/orders/{order['id']}").json()["status"] == "paid"


def test_payment_start_reuses_active_provider_attempt(client):
    headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    client.post(
        "/api/v1/cart/items",
        json={"book_id": book["id"], "quantity": 1},
        headers=headers,
    )
    order = client.post(
        "/api/v1/orders",
        json={"address": ADDRESS},
        headers={**headers, "Idempotency-Key": "payment-attempt-reuse-0001"},
    ).json()
    first = client.post(
        f"/api/v1/payments/stripe/start?order_id={order['id']}", headers=headers
    )
    replay = client.post(
        f"/api/v1/payments/stripe/start?order_id={order['id']}", headers=headers
    )
    assert first.status_code == replay.status_code == 200
    assert replay.json() == first.json()
    with SessionLocal() as db:
        attempts = list(
            db.scalars(
                select(PaymentAttempt).where(PaymentAttempt.order_id == order["id"])
            )
        )
        assert len(attempts) == 1


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="requires PostgreSQL concurrency")
def test_concurrent_payment_start_creates_one_provider_attempt(client):
    headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    client.post(
        "/api/v1/cart/items",
        json={"book_id": book["id"], "quantity": 1},
        headers=headers,
    )
    order = client.post(
        "/api/v1/orders",
        json={"address": ADDRESS},
        headers={**headers, "Idempotency-Key": "payment-attempt-race-0001"},
    ).json()
    access = client.cookies.get("access_token")
    refresh = client.cookies.get("refresh_token")
    csrf = client.cookies.get("csrf_token")
    barrier = Barrier(2)

    def start(_):
        with TestClient(app) as test_client:
            test_client.cookies.set("access_token", access)
            test_client.cookies.set("refresh_token", refresh)
            test_client.cookies.set("csrf_token", csrf)
            barrier.wait()
            response = test_client.post(
                f"/api/v1/payments/stripe/start?order_id={order['id']}",
                headers={"X-CSRF-Token": csrf},
            )
            return response.status_code, response.json()

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(start, range(2)))
    assert [status for status, _ in responses] == [200, 200]
    assert responses[0][1] == responses[1][1]
    with SessionLocal() as db:
        assert len(
            list(
                db.scalars(
                    select(PaymentAttempt).where(
                        PaymentAttempt.order_id == order["id"]
                    )
                )
            )
        ) == 1


def test_distinct_confirmed_payment_is_marked_for_refund(client):
    headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    client.post(
        "/api/v1/cart/items",
        json={"book_id": book["id"], "quantity": 1},
        headers=headers,
    )
    order = client.post(
        "/api/v1/orders",
        json={"address": ADDRESS},
        headers={**headers, "Idempotency-Key": "duplicate-payment-review-0001"},
    ).json()
    first = client.post(
        f"/api/v1/payments/stripe/start?order_id={order['id']}", headers=headers
    ).json()
    second_reference = "cs-legacy-second-paid-session"
    with SessionLocal() as db:
        db.add(
            PaymentAttempt(
                order_id=order["id"],
                provider="stripe",
                provider_reference=second_reference,
                redirect_url="https://checkout.stripe.test/second",
            )
        )
        db.commit()

    def paid_event(event_id, reference):
        return {
            "id": event_id,
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": reference,
                    "payment_status": "paid",
                    "metadata": {"order_id": order["id"]},
                }
            },
        }

    assert client.post(
        "/api/v1/webhooks/stripe",
        json=paid_event("evt-first-paid", first["reference"]),
    ).status_code == 200
    assert client.post(
        "/api/v1/webhooks/stripe",
        json=paid_event("evt-second-paid", second_reference),
    ).status_code == 200
    with SessionLocal() as db:
        current = db.get(Order, order["id"])
        second = db.scalar(
            select(PaymentAttempt).where(
                PaymentAttempt.provider_reference == second_reference
            )
        )
        assert current.status == "paid"
        assert second.status == "requires_refund"
        assert db.scalar(
            select(OutboxMessage).where(
                OutboxMessage.subject.contains("Additional payment requires refund")
            )
        )


def test_checkout_requires_a_valid_idempotency_key(client):
    headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    client.post(
        "/api/v1/cart/items",
        json={"book_id": book["id"], "quantity": 1},
        headers=headers,
    )
    assert client.post(
        "/api/v1/orders", json={"address": ADDRESS}, headers=headers
    ).status_code == 422
    assert client.post(
        "/api/v1/orders",
        json={"address": ADDRESS},
        headers={**headers, "Idempotency-Key": "too-short"},
    ).status_code == 422


def test_checkout_replay_reuses_order_and_rejects_changed_cart_for_same_key(client):
    headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    cart = client.post(
        "/api/v1/cart/items",
        json={"book_id": book["id"], "quantity": 1},
        headers=headers,
    ).json()
    keyed_headers = {**headers, "Idempotency-Key": "checkout-replay-key-0001"}
    first = client.post("/api/v1/orders", json={"address": ADDRESS}, headers=keyed_headers)
    replay = client.post("/api/v1/orders", json={"address": ADDRESS}, headers=keyed_headers)
    assert first.status_code == replay.status_code == 200
    assert replay.json()["id"] == first.json()["id"]

    client.put(
        f"/api/v1/cart/items/{cart['items'][0]['id']}",
        json={"book_id": book["id"], "quantity": 2},
        headers=headers,
    )
    changed_replay = client.post(
        "/api/v1/orders", json={"address": ADDRESS}, headers=keyed_headers
    )
    assert changed_replay.status_code == 409


def test_new_key_reuses_equivalent_pending_order_and_replaces_changed_hold(client):
    headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    cart = client.post(
        "/api/v1/cart/items",
        json={"book_id": book["id"], "quantity": 1},
        headers=headers,
    ).json()
    first = client.post(
        "/api/v1/orders",
        json={"address": ADDRESS},
        headers={**headers, "Idempotency-Key": "checkout-first-key-0001"},
    ).json()
    equivalent = client.post(
        "/api/v1/orders",
        json={"address": ADDRESS},
        headers={**headers, "Idempotency-Key": "checkout-second-key-0002"},
    ).json()
    assert equivalent["id"] == first["id"]

    client.put(
        f"/api/v1/cart/items/{cart['items'][0]['id']}",
        json={"book_id": book["id"], "quantity": 2},
        headers=headers,
    )
    replacement = client.post(
        "/api/v1/orders",
        json={"address": ADDRESS},
        headers={**headers, "Idempotency-Key": "checkout-replace-key-0003"},
    )
    assert replacement.status_code == 200
    assert replacement.json()["id"] != first["id"]
    with SessionLocal() as db:
        orders = list(db.scalars(select(Order).order_by(Order.created_at)))
        assert [order.status for order in orders] == ["cancelled", "pending_payment"]
        old_hold = db.scalar(
            select(InventoryReservation).where(InventoryReservation.order_id == first["id"])
        )
        new_hold = db.scalar(
            select(InventoryReservation).where(
                InventoryReservation.order_id == replacement.json()["id"]
            )
        )
        assert old_hold.released_at is not None
        assert new_hold.released_at is None


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="requires PostgreSQL row locks")
def test_concurrent_last_stock_checkout_creates_exactly_one_hold():
    with SessionLocal() as db:
        book = db.scalar(select(Book))
        book.stock_qty = 1
        db.add(
            User(
                email="second.reader@example.com",
                full_name="Second Reader",
                password_hash=hash_password("SecondReaderPass!2026"),
                is_verified=True,
            )
        )
        db.commit()
        book_id = book.id

    with TestClient(app) as first_client, TestClient(app) as second_client:
        first_headers = login(first_client)
        second_headers = login(
            second_client, "second.reader@example.com", "SecondReaderPass!2026"
        )
        for test_client, headers in (
            (first_client, first_headers),
            (second_client, second_headers),
        ):
            assert test_client.post(
                "/api/v1/cart/items",
                json={"book_id": book_id, "quantity": 1},
                headers=headers,
            ).status_code == 200

        barrier = Barrier(2)

        def checkout(test_client, headers, key):
            barrier.wait()
            return test_client.post(
                "/api/v1/orders",
                json={"address": ADDRESS},
                headers={**headers, "Idempotency-Key": key},
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(
                executor.map(
                    lambda args: checkout(*args),
                    [
                        (first_client, first_headers, "concurrent-first-key-0001"),
                        (second_client, second_headers, "concurrent-second-key-0002"),
                    ],
                )
            )
    assert sorted(response.status_code for response in responses) == [200, 409]
    with SessionLocal() as db:
        active_holds = list(
            db.scalars(
                select(InventoryReservation).where(
                    InventoryReservation.released_at.is_(None),
                    InventoryReservation.consumed_at.is_(None),
                )
            )
        )
        assert len(active_holds) == 1


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="requires PostgreSQL row locks")
def test_concurrent_duplicate_checkout_is_idempotent():
    with TestClient(app) as first_client, TestClient(app) as replay_client:
        first_headers = login(first_client)
        replay_headers = login(replay_client)
        book = first_client.get("/api/v1/books").json()["items"][0]
        first_client.post(
            "/api/v1/cart/items",
            json={"book_id": book["id"], "quantity": 1},
            headers=first_headers,
        )
        barrier = Barrier(2)

        def checkout(test_client, headers):
            barrier.wait()
            return test_client.post(
                "/api/v1/orders",
                json={"address": ADDRESS},
                headers={
                    **headers,
                    "Idempotency-Key": "concurrent-replay-key-0001",
                },
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(
                executor.map(
                    lambda args: checkout(*args),
                    [(first_client, first_headers), (replay_client, replay_headers)],
                )
            )
    assert [response.status_code for response in responses] == [200, 200]
    assert len({response.json()["id"] for response in responses}) == 1


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


def test_unpaid_order_with_late_confirmed_payment_enters_review(client):
    reader_headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    client.post("/api/v1/cart/items", json={"book_id": book["id"], "quantity": 1}, headers=reader_headers)
    order = client.post(
        "/api/v1/orders", json={"address": ADDRESS}, headers={**reader_headers, **ORDER_HEADERS}
    ).json()
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
    assert late_payment.status_code == 200
    assert late_payment.json()["status"] == "payment_review"
    assert late_payment.json()["payment_review_reason"] == "order_cancelled"
    replayed_payment = client.post(
        f"/api/v1/payments/stripe/complete?order_id={order['id']}&reference={payment['reference']}",
        headers=reader_headers,
    )
    assert replayed_payment.status_code == 200
    assert replayed_payment.json()["status"] == "payment_review"
    with SessionLocal() as db:
        reservation = db.scalar(
            select(InventoryReservation).where(InventoryReservation.order_id == order["id"])
        )
        assert reservation.released_at is not None
        notice = db.scalar(
            select(OutboxMessage).where(
                OutboxMessage.subject == f"Payment review required for order {order['number']}"
            )
        )
        assert notice is not None
        attempt = db.scalar(
            select(PaymentAttempt).where(PaymentAttempt.order_id == order["id"])
        )
        assert attempt.status == "requires_refund"
        assert len(list(db.scalars(select(PaymentEvent).where(PaymentEvent.provider == "stripe")))) == 1

    client.post("/api/v1/auth/logout", headers=reader_headers)
    admin_headers = login(client, "admin@orphaleia.local", "AdminPass!2026")
    refunded = client.patch(
        f"/api/v1/admin/orders/{order['id']}",
        json={"status": "refunded"},
        headers=admin_headers,
    )
    assert refunded.status_code == 200
    with SessionLocal() as db:
        attempt = db.scalar(
            select(PaymentAttempt).where(PaymentAttempt.order_id == order["id"])
        )
        assert attempt.status == "refunded"


def test_confirmed_payment_with_unavailable_stock_does_not_decrement_inventory(client):
    headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    client.post(
        "/api/v1/cart/items",
        json={"book_id": book["id"], "quantity": 1},
        headers=headers,
    )
    order = client.post(
        "/api/v1/orders",
        json={"address": ADDRESS},
        headers={**headers, "Idempotency-Key": "stock-review-order-key-0001"},
    ).json()
    payment = client.post(
        f"/api/v1/payments/stripe/start?order_id={order['id']}", headers=headers
    ).json()
    with SessionLocal() as db:
        locked_book = db.get(Book, book["id"])
        locked_book.stock_qty = 0
        db.commit()

    completed = client.post(
        f"/api/v1/payments/stripe/complete?order_id={order['id']}&reference={payment['reference']}",
        headers=headers,
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "payment_review"
    assert completed.json()["payment_review_reason"] == "stock_unavailable"
    with SessionLocal() as db:
        assert db.get(Book, book["id"]).stock_qty == 0
        hold = db.scalar(
            select(InventoryReservation).where(InventoryReservation.order_id == order["id"])
        )
        assert hold.released_at is not None
        assert hold.consumed_at is None


def test_expired_unpaid_order_records_cancellation_and_email(client):
    headers = login(client)
    book = client.get("/api/v1/books").json()["items"][0]
    client.post(
        "/api/v1/cart/items", json={"book_id": book["id"], "quantity": 1}, headers=headers
    )
    order = client.post(
        "/api/v1/orders", json={"address": ADDRESS}, headers={**headers, **ORDER_HEADERS}
    ).json()

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
