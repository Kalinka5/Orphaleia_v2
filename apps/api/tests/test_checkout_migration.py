import os
import subprocess
import sys
from pathlib import Path

import pytest
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import create_engine, inspect, text

API_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC = Path(sys.executable).with_name("alembic")


def run_migration(database_url: str, revision: str) -> None:
    environment = {
        **os.environ,
        "APP_ENV": "test",
        "DATABASE_URL": database_url,
        "SECRET_KEY": "migration-test-only-secret",
        "COOKIE_SECURE": "false",
        "PAYMENTS_MOCK": "true",
    }
    subprocess.run(
        [str(ALEMBIC), "upgrade", revision],
        cwd=API_ROOT,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )


def test_migration_normalizes_existing_duplicate_pending_orders(tmp_path):
    database_url = os.environ.get(
        "TEST_MIGRATION_DATABASE_URL", f"sqlite:///{tmp_path / 'legacy.db'}"
    )
    if os.environ.get("TEST_MIGRATION_DATABASE_URL"):
        clean_engine = create_engine(database_url)
        with clean_engine.begin() as connection:
            connection.execute(text("DROP SCHEMA public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
        clean_engine.dispose()
    run_migration(database_url, "0006")
    engine = create_engine(database_url)
    true_literal = "TRUE" if engine.dialect.name == "postgresql" else "1"
    with engine.begin() as connection:
        connection.execute(text("DROP INDEX uq_orders_one_pending_per_user"))
        connection.execute(text("DROP INDEX uq_orders_user_idempotency_key"))
        legacy_admin_hash = PasswordHasher().hash("Orphaleia!2026")
        connection.execute(
            text(
                "INSERT INTO users "
                "(id, email, full_name, password_hash, auth_version, role, is_verified, created_at) "
                "VALUES ('legacy-admin', 'admin@orphaleia.local', 'Legacy Admin', "
                f"'{legacy_admin_hash}', 0, 'admin', {true_literal}, '2026-01-01')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO refresh_sessions "
                "(id, user_id, token_hash, expires_at, revoked_at) VALUES "
                "('legacy-session', 'legacy-admin', :token_hash, '2027-01-01', NULL)"
            ),
            {"token_hash": "a" * 64},
        )
        connection.execute(
            text(
                "INSERT INTO action_tokens "
                "(id, user_id, kind, token_hash, expires_at, used_at) VALUES "
                "('legacy-action', 'legacy-admin', 'reset', :token_hash, '2027-01-01', NULL)"
            ),
            {"token_hash": "b" * 64},
        )
        connection.execute(
            text(
                "INSERT INTO users "
                "(id, email, full_name, password_hash, auth_version, role, is_verified, created_at) "
                "VALUES ('user-1', 'reader@example.com', 'Reader', 'hash', 0, 'customer', "
                f"{true_literal}, '2026-01-01')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO books "
                "(id, title, slug, isbn, description, publication_year, price_cents, currency, "
                "stock_qty, cover_url, featured, active, created_at) VALUES "
                "('book-1', 'Book', 'book', '9780000000001', 'Description', 2026, 2000, 'EUR', "
                f"5, '/book.webp', FALSE, {true_literal}, '2026-01-01')"
            )
        )
        for suffix, created_at in (("old", "2026-01-01"), ("new", "2026-01-02")):
            connection.execute(
                text(
                    "INSERT INTO orders "
                    "(id, number, user_id, status, subtotal_cents, shipping_cents, total_cents, "
                    "currency, shipping_name, shipping_line1, shipping_line2, shipping_city, "
                    "shipping_postal_code, shipping_country, created_at) VALUES "
                    "(:id, :number, 'user-1', 'pending_payment', 2000, 400, 2400, 'EUR', "
                    "'Reader', '1 Road', '', 'Madrid', '28001', 'ES', :created_at)"
                ),
                {"id": f"order-{suffix}", "number": f"ORP-{suffix}", "created_at": created_at},
            )
            connection.execute(
                text(
                    "INSERT INTO order_items "
                    "(id, order_id, book_id, title, isbn, cover_url, unit_price_cents, quantity) "
                    "VALUES (:id, :order_id, 'book-1', 'Book', '9780000000001', '/book.webp', 2000, 1)"
                ),
                {"id": f"item-{suffix}", "order_id": f"order-{suffix}"},
            )
            connection.execute(
                text(
                    "INSERT INTO inventory_reservations "
                    "(id, order_id, book_id, quantity, expires_at) "
                    "VALUES (:id, :order_id, 'book-1', 1, '2026-12-01')"
                ),
                {"id": f"hold-{suffix}", "order_id": f"order-{suffix}"},
            )

    run_migration(database_url, "head")
    with engine.connect() as connection:
        orders = connection.execute(
            text(
                "SELECT id, status, checkout_fingerprint FROM orders "
                "ORDER BY created_at"
            )
        ).mappings().all()
        assert [(order["id"], order["status"]) for order in orders] == [
            ("order-old", "cancelled"),
            ("order-new", "pending_payment"),
        ]
        assert len(orders[0]["checkout_fingerprint"]) == 64
        assert len(orders[1]["checkout_fingerprint"]) == 64
        assert connection.scalar(
            text("SELECT released_at FROM inventory_reservations WHERE id = 'hold-old'")
        )
        assert connection.scalar(
            text(
                "SELECT source FROM order_status_events "
                "WHERE order_id = 'order-old' AND status = 'cancelled'"
            )
        ) == "migration"
        indexes = {index["name"] for index in inspect(connection).get_indexes("orders")}
        assert "uq_orders_one_pending_per_user" in indexes
        assert "uq_orders_user_idempotency_key" in indexes
        assert "redirect_url" in {
            column["name"] for column in inspect(connection).get_columns("payment_attempts")
        }
        legacy_admin = connection.execute(
            text(
                "SELECT password_hash, auth_version, pending_email FROM users "
                "WHERE id = 'legacy-admin'"
            )
        ).mappings().one()
        assert legacy_admin["auth_version"] == 1
        assert legacy_admin["pending_email"] is None
        with pytest.raises(VerifyMismatchError):
            PasswordHasher().verify(legacy_admin["password_hash"], "Orphaleia!2026")
        assert connection.scalar(
            text("SELECT revoked_at FROM refresh_sessions WHERE id = 'legacy-session'")
        )
        assert connection.scalar(
            text("SELECT used_at FROM action_tokens WHERE id = 'legacy-action'")
        )
