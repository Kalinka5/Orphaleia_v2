from conftest import login
from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.main import PORTFOLIO_DEMO_ADDRESS
from app.models import User


def test_one_click_demo_account_uses_a_fictional_identity(client, monkeypatch):
    monkeypatch.setattr(settings, "portfolio_demo", True)

    response = client.post("/api/v1/auth/demo")

    assert response.status_code == 200
    assert response.json()["user"]["full_name"] == "Ariadne Demo"
    assert response.json()["user"]["email"].startswith("portfolio-")
    assert response.json()["user"]["email"].endswith("@orphaleia.local")
    assert client.cookies.get("access_token")
    assert client.get("/api/v1/users/me").status_code == 200

    with SessionLocal() as db:
        demo = db.scalar(select(User).where(User.id == response.json()["user"]["id"]))
        assert demo is not None
        assert demo.default_shipping_address is None


def test_demo_account_endpoint_is_unavailable_outside_portfolio_mode(client):
    response = client.post("/api/v1/auth/demo")
    assert response.status_code == 404


def test_registration_recovery_and_saved_addresses_are_disabled(client, monkeypatch):
    monkeypatch.setattr(settings, "portfolio_demo", True)

    registration = client.post(
        "/api/v1/auth/register",
        json={"email": "real@example.com", "full_name": "Real Person", "password": "LongPassword!2026"},
    )
    recovery = client.post("/api/v1/auth/request-reset", json={"email": "real@example.com"})
    headers = login(client)
    saved_address = client.put(
        "/api/v1/users/me/delivery-address",
        headers=headers,
        json=PORTFOLIO_DEMO_ADDRESS,
    )

    assert registration.status_code == 403
    assert recovery.status_code == 403
    assert saved_address.status_code == 403


def test_checkout_rejects_any_real_address_in_portfolio_mode(client, monkeypatch):
    monkeypatch.setattr(settings, "portfolio_demo", True)
    login(client)

    response = client.post(
        "/api/v1/checkout/quote",
        json={
            "address": {
                **PORTFOLIO_DEMO_ADDRESS,
                "line1": "A visitor's real address",
            }
        },
    )

    assert response.status_code == 422
    assert response.json()["message"] == "This portfolio demonstration accepts only its fixed fictional address"


def test_portfolio_mode_refuses_live_payment_code_paths(client, monkeypatch):
    monkeypatch.setattr(settings, "portfolio_demo", True)
    monkeypatch.setattr(settings, "payments_mock", False)
    headers = login(client)

    response = client.post(
        "/api/v1/payments/stripe/start?order_id=fictional-order",
        headers=headers,
    )

    assert response.status_code == 503
    assert response.json()["message"] == "Real payments are disabled in this portfolio demonstration"
