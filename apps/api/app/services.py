import json
import secrets
from datetime import UTC, datetime
from html import escape

import httpx
import stripe
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .config import settings
from .models import (
    Book,
    Cart,
    InventoryReservation,
    Order,
    OrderStatusEvent,
    OutboxMessage,
    PaymentAttempt,
    PaymentEvent,
    ShippingZone,
)

PAID_ORDER_STATUSES = {"paid", "processing", "shipped", "out_for_delivery", "delivered", "refunded"}
FINALIZED_PAYMENT_STATUSES = PAID_ORDER_STATUSES | {"payment_review"}


def queue_email(db: Session, to_email: str, subject: str, html_body: str) -> None:
    db.add(OutboxMessage(to_email=to_email, subject=subject, html_body=html_body))


def add_order_status_event(
    db: Session, order: Order, status: str, source: str, actor_user_id: str | None = None
) -> None:
    order.status_events.append(
        OrderStatusEvent(status=status, source=source, actor_user_id=actor_user_id)
    )


def queue_order_status_email(db: Session, order: Order, status: str) -> None:
    if status not in {"paid", "payment_review", "shipped", "delivered", "cancelled", "refunded"}:
        return

    number = escape(order.number)
    account_url = escape(f"{settings.frontend_url}/account?section=orders&order={order.id}", quote=True)
    tracking = ""
    if status == "shipped" and order.tracking_carrier and order.tracking_reference:
        carrier = escape(order.tracking_carrier)
        reference = escape(order.tracking_reference)
        tracking_link = ""
        if order.tracking_url:
            url = escape(order.tracking_url, quote=True)
            tracking_link = f'<p><a href="{url}">Track this parcel with {carrier}</a></p>'
        tracking = f"<p><strong>{carrier}</strong><br>Tracking reference: {reference}</p>{tracking_link}"

    content = {
        "paid": (
            f"Order {number} confirmed",
            "Your books are reserved",
            f"We received €{order.total_cents / 100:.2f}. We will write again when your parcel leaves our shelves.",
        ),
        "payment_review": (
            f"Order {number} needs payment review",
            "We received a payment that needs review",
            "Your payment was confirmed, but the order could not be fulfilled automatically. We will review it and arrange a refund if needed.",
        ),
        "shipped": (
            f"Order {number} is on its way",
            "Your books have left our shelves",
            "The parcel is now with the carrier.",
        ),
        "delivered": (
            f"Order {number} delivered",
            "Your order has been delivered",
            "Our delivery record now shows this parcel as delivered.",
        ),
        "cancelled": (
            f"Order {number} cancelled",
            "Your order was cancelled",
            "This unpaid order will not be prepared or dispatched.",
        ),
        "refunded": (
            f"Order {number} marked as refunded",
            "Your order was marked as refunded",
            "The shop has updated the order record. Contact us if you need payment details.",
        ),
    }
    subject, heading, message = content[status]
    html_body = (
        '<div style="max-width:600px;margin:auto;padding:32px;color:#173f31;background:#fdfbf7;'
        'font-family:Arial,sans-serif;line-height:1.6">'
        '<p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase">Orphaleia · Order update</p>'
        f'<h1 style="font-family:Georgia,serif;font-weight:400">{heading}</h1>'
        f"<p>{message}</p>{tracking}"
        f'<p><a href="{account_url}">View order {number}</a></p>'
        "</div>"
    )
    queue_email(db, order.user.email, subject, html_body)


def shipping_quote(db: Session, cart: Cart, country: str, books: dict[str, Book] | None = None) -> dict:
    subtotal = sum((books[item.book_id] if books else item.book).price_cents * item.quantity for item in cart.items)
    zones = db.scalars(select(ShippingZone).where(ShippingZone.active.is_(True))).all()
    zone = next((z for z in zones if country.upper() in z.country_codes.split(",")), None)
    if not zone:
        raise HTTPException(422, "We do not currently ship to this country")
    shipping = 0 if zone.free_over_cents is not None and subtotal >= zone.free_over_cents else zone.rate_cents
    return {
        "subtotal_cents": subtotal,
        "shipping_cents": shipping,
        "total_cents": subtotal + shipping,
        "currency": "EUR",
        "zone": zone.name,
    }


def finalize_payment(
    db: Session,
    order: Order,
    provider: str,
    external_event_id: str,
    payload: dict,
    provider_reference: str | None = None,
) -> Order:
    order = db.execute(
        select(Order)
        .options(selectinload(Order.user), selectinload(Order.status_events))
        .where(Order.id == order.id)
        .with_for_update()
    ).scalar_one()
    existing = db.scalar(select(PaymentEvent).where(PaymentEvent.external_id == external_event_id))
    if existing:
        return order
    attempt_query = select(PaymentAttempt).where(
        PaymentAttempt.order_id == order.id, PaymentAttempt.provider == provider
    )
    if provider_reference:
        attempt_query = attempt_query.where(
            PaymentAttempt.provider_reference == provider_reference
        )
    else:
        attempt_query = attempt_query.order_by(PaymentAttempt.created_at.desc())
    attempt = db.scalar(attempt_query.with_for_update())
    if not attempt and provider_reference:
        attempt = PaymentAttempt(
            order_id=order.id,
            provider=provider,
            provider_reference=provider_reference,
        )
        db.add(attempt)
        db.flush()
    if attempt:
        attempt.redirect_url = None
    db.add(
        PaymentEvent(
            provider=provider,
            external_id=external_event_id,
            payload=json.dumps(payload),
        )
    )
    if order.status in FINALIZED_PAYMENT_STATUSES:
        if attempt and attempt.status == "created":
            attempt.status = "requires_refund"
            queue_email(
                db,
                order.user.email,
                f"Additional payment received for order {order.number}",
                "<p>We received an additional payment for an order that was already finalized. "
                "Our team will review it and arrange a refund.</p>",
            )
            queue_email(
                db,
                settings.admin_email,
                f"Additional payment requires refund for order {order.number}",
                f"<p>Order {escape(order.number)} received another provider-confirmed payment. "
                "The exact payment attempt is marked as requiring a refund.</p>",
            )
        db.commit()
        return order
    reservations = db.scalars(
        select(InventoryReservation).where(
            InventoryReservation.order_id == order.id,
            InventoryReservation.consumed_at.is_(None),
            InventoryReservation.released_at.is_(None),
        ).with_for_update()
    ).all()

    review_reason = None
    books = {}
    if order.status == "cancelled":
        review_reason = "order_cancelled"
    elif not reservations:
        review_reason = "reservation_expired"
    else:
        book_ids = sorted({reservation.book_id for reservation in reservations})
        locked_books = db.scalars(select(Book).where(Book.id.in_(book_ids)).order_by(Book.id).with_for_update()).all()
        books = {book.id: book for book in locked_books}
        if any(books[reservation.book_id].stock_qty < reservation.quantity for reservation in reservations):
            review_reason = "stock_unavailable"

    if review_reason:
        timestamp = datetime.now(UTC)
        for reservation in reservations:
            reservation.released_at = timestamp
        order.status = "payment_review"
        order.payment_review_reason = review_reason
        add_order_status_event(db, order, "payment_review", "payment")
        if attempt:
            attempt.status = "requires_refund"
        queue_order_status_email(db, order, "payment_review")
        queue_email(
            db,
            settings.admin_email,
            f"Payment review required for order {order.number}",
            f"<p>Order {escape(order.number)} has a provider-confirmed payment requiring review. Reason: {escape(review_reason)}.</p>",
        )
        db.commit()
        return order

    for reservation in reservations:
        book = books[reservation.book_id]
        book.stock_qty -= reservation.quantity
        reservation.consumed_at = datetime.now(UTC)
    order.status = "paid"
    order.payment_review_reason = None
    add_order_status_event(db, order, "paid", "payment")
    if attempt:
        attempt.status = "paid"
    queue_order_status_email(db, order, "paid")
    db.commit()
    return order


class PaymentProvider:
    name: str

    async def start(self, db: Session, order: Order) -> dict:
        raise NotImplementedError


class StripeProvider(PaymentProvider):
    name = "stripe"

    async def start(self, db: Session, order: Order) -> dict:
        reference = f"mock_stripe_{secrets.token_hex(8)}"
        if settings.payments_mock:
            url = f"{settings.frontend_url}/payment/return?provider=stripe&order={order.id}&reference={reference}"
        else:
            stripe.api_key = settings.stripe_secret_key
            session = stripe.checkout.Session.create(
                mode="payment",
                success_url=f"{settings.frontend_url}/payment/return?provider=stripe&order={order.id}&reference={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{settings.frontend_url}/checkout?cancelled=1",
                client_reference_id=order.id,
                customer_email=order.user.email,
                line_items=[
                    {
                        "quantity": 1,
                        "price_data": {
                            "currency": "eur",
                            "unit_amount": order.total_cents,
                            "product_data": {"name": f"Orphaleia order {order.number}"},
                        },
                    }
                ],
                metadata={"order_id": order.id},
            )
            reference, url = session.id, session.url
        db.add(
            PaymentAttempt(
                order_id=order.id,
                provider=self.name,
                provider_reference=reference,
                redirect_url=url,
            )
        )
        db.commit()
        return {"provider": self.name, "reference": reference, "redirect_url": url, "mock": settings.payments_mock}


class PayPalProvider(PaymentProvider):
    name = "paypal"

    async def _token(self) -> str:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.paypal_base_url}/v1/oauth2/token",
                auth=(settings.paypal_client_id, settings.paypal_client_secret),
                data={"grant_type": "client_credentials"},
            )
            response.raise_for_status()
            return response.json()["access_token"]

    async def start(self, db: Session, order: Order) -> dict:
        reference = f"mock_paypal_{secrets.token_hex(8)}"
        if settings.payments_mock:
            url = f"{settings.frontend_url}/payment/return?provider=paypal&order={order.id}&reference={reference}"
        else:
            token = await self._token()
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.paypal_base_url}/v2/checkout/orders",
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    json={
                        "intent": "CAPTURE",
                        "purchase_units": [{"reference_id": order.id, "amount": {"currency_code": "EUR", "value": f"{order.total_cents / 100:.2f}"}}],
                        "application_context": {
                            "return_url": f"{settings.frontend_url}/payment/return?provider=paypal&order={order.id}",
                            "cancel_url": f"{settings.frontend_url}/checkout?cancelled=1",
                        },
                    },
                )
                response.raise_for_status()
                data = response.json()
                reference = data["id"]
                url = next(link["href"] for link in data["links"] if link["rel"] == "approve")
        db.add(
            PaymentAttempt(
                order_id=order.id,
                provider=self.name,
                provider_reference=reference,
                redirect_url=url,
            )
        )
        db.commit()
        return {"provider": self.name, "reference": reference, "redirect_url": url, "mock": settings.payments_mock}


PROVIDERS = {"stripe": StripeProvider(), "paypal": PayPalProvider()}


def release_expired_reservations(db: Session) -> int:
    candidate_order_ids = db.scalars(
        select(InventoryReservation.order_id).where(
            InventoryReservation.expires_at < datetime.now(UTC),
            InventoryReservation.consumed_at.is_(None),
            InventoryReservation.released_at.is_(None),
        ).distinct()
    ).all()
    if not candidate_order_ids:
        return 0
    orders = db.scalars(
        select(Order).where(Order.id.in_(sorted(candidate_order_ids))).order_by(Order.id).with_for_update()
    ).all()
    released = 0
    for order in orders:
        reservations = db.scalars(
            select(InventoryReservation).where(
                InventoryReservation.order_id == order.id,
                InventoryReservation.expires_at < datetime.now(UTC),
                InventoryReservation.consumed_at.is_(None),
                InventoryReservation.released_at.is_(None),
            ).with_for_update()
        ).all()
        timestamp = datetime.now(UTC)
        for reservation in reservations:
            reservation.released_at = timestamp
            released += 1
        if reservations and order.status == "pending_payment":
            order.status = "cancelled"
            add_order_status_event(db, order, "cancelled", "payment")
            queue_order_status_email(db, order, "cancelled")
    db.commit()
    return released


def reserved_quantity(db: Session, book_id: str) -> int:
    return int(
        db.scalar(
            select(func.coalesce(func.sum(InventoryReservation.quantity), 0)).where(
                InventoryReservation.book_id == book_id,
                InventoryReservation.expires_at > datetime.now(UTC),
                InventoryReservation.consumed_at.is_(None),
                InventoryReservation.released_at.is_(None),
            )
        )
        or 0
    )
