import json
import secrets
from datetime import UTC, datetime

import httpx
import stripe
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import settings
from .models import (
    Book,
    Cart,
    InventoryReservation,
    Order,
    OutboxMessage,
    PaymentAttempt,
    PaymentEvent,
    ShippingZone,
)


def queue_email(db: Session, to_email: str, subject: str, html_body: str) -> None:
    db.add(OutboxMessage(to_email=to_email, subject=subject, html_body=html_body))


def shipping_quote(db: Session, cart: Cart, country: str) -> dict:
    subtotal = sum(item.book.price_cents * item.quantity for item in cart.items)
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


def finalize_payment(db: Session, order: Order, provider: str, external_event_id: str, payload: dict) -> Order:
    existing = db.scalar(select(PaymentEvent).where(PaymentEvent.external_id == external_event_id))
    if existing:
        return order
    db.add(PaymentEvent(provider=provider, external_id=external_event_id, payload=json.dumps(payload)))
    if order.status == "paid":
        db.commit()
        return order
    reservations = db.scalars(
        select(InventoryReservation).where(
            InventoryReservation.order_id == order.id,
            InventoryReservation.consumed_at.is_(None),
            InventoryReservation.released_at.is_(None),
        )
    ).all()
    if not reservations:
        raise HTTPException(409, "Inventory reservation expired; contact support")
    for reservation in reservations:
        book = db.execute(select(Book).where(Book.id == reservation.book_id).with_for_update()).scalar_one()
        if book.stock_qty < reservation.quantity:
            raise HTTPException(409, f"{book.title} is no longer available")
        book.stock_qty -= reservation.quantity
        reservation.consumed_at = datetime.now(UTC)
    order.status = "paid"
    attempt = db.scalar(select(PaymentAttempt).where(PaymentAttempt.order_id == order.id, PaymentAttempt.provider == provider))
    if attempt:
        attempt.status = "paid"
    queue_email(
        db,
        order.user.email,
        f"Order {order.number} confirmed",
        f"<h1>Your books are reserved</h1><p>We received €{order.total_cents / 100:.2f}. We will send another note when your order leaves our shelves.</p>",
    )
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
        db.add(PaymentAttempt(order_id=order.id, provider=self.name, provider_reference=reference))
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
        db.add(PaymentAttempt(order_id=order.id, provider=self.name, provider_reference=reference))
        db.commit()
        return {"provider": self.name, "reference": reference, "redirect_url": url, "mock": settings.payments_mock}


PROVIDERS = {"stripe": StripeProvider(), "paypal": PayPalProvider()}


def release_expired_reservations(db: Session) -> int:
    reservations = db.scalars(
        select(InventoryReservation).where(
            InventoryReservation.expires_at < datetime.now(UTC),
            InventoryReservation.consumed_at.is_(None),
            InventoryReservation.released_at.is_(None),
        )
    ).all()
    order_ids = set()
    for reservation in reservations:
        reservation.released_at = datetime.now(UTC)
        order_ids.add(reservation.order_id)
    for order_id in order_ids:
        order = db.get(Order, order_id)
        if order and order.status == "pending_payment":
            order.status = "cancelled"
    db.commit()
    return len(reservations)


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
