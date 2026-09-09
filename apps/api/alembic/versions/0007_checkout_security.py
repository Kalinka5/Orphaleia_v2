"""Add checkout idempotency and payment review state."""

import hashlib
import json
import secrets
import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from argon2 import PasswordHasher

from alembic import op

revision = "0007_checkout_security"
down_revision = "0006_order_status_history"
branch_labels = None
depends_on = None


def _fingerprint(order, items) -> str:
    payload = {
        "address": {
            "name": order.shipping_name,
            "line1": order.shipping_line1,
            "line2": order.shipping_line2,
            "city": order.shipping_city,
            "postal_code": order.shipping_postal_code,
            "country": order.shipping_country,
        },
        "items": sorted(
            [
                {
                    "book_id": item.book_id,
                    "quantity": item.quantity,
                    "unit_price_cents": item.unit_price_cents,
                }
                for item in items
            ],
            key=lambda item: item["book_id"],
        ),
        "currency": order.currency,
        "subtotal_cents": order.subtotal_cents,
        "shipping_cents": order.shipping_cents,
        "total_cents": order.total_cents,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def upgrade():
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    order_columns = {column["name"] for column in inspector.get_columns("orders")}
    if "idempotency_key" not in order_columns:
        op.add_column("orders", sa.Column("idempotency_key", sa.String(length=128), nullable=True))
    if "checkout_fingerprint" not in order_columns:
        op.add_column("orders", sa.Column("checkout_fingerprint", sa.String(length=64), nullable=True))
    if "payment_review_reason" not in order_columns:
        op.add_column("orders", sa.Column("payment_review_reason", sa.String(length=40), nullable=True))
    payment_attempt_columns = {
        column["name"] for column in inspector.get_columns("payment_attempts")
    }
    if "redirect_url" not in payment_attempt_columns:
        op.add_column(
            "payment_attempts", sa.Column("redirect_url", sa.String(length=1000), nullable=True)
        )

    pending = connection.execute(
        sa.text(
            "SELECT id, user_id, currency, subtotal_cents, shipping_cents, total_cents, "
            "shipping_name, shipping_line1, shipping_line2, shipping_city, shipping_postal_code, shipping_country "
            "FROM orders WHERE status = 'pending_payment' ORDER BY user_id, created_at DESC, id DESC"
        )
    ).fetchall()
    newest_by_user: dict[str, str] = {}
    timestamp = datetime.now(UTC)

    legacy_admin = connection.execute(
        sa.text(
            "SELECT id, password_hash FROM users "
            "WHERE lower(email) = 'admin@orphaleia.local' AND role = 'admin'"
        )
    ).first()
    legacy_password_matches = False
    if legacy_admin:
        try:
            legacy_password_matches = PasswordHasher().verify(
                legacy_admin.password_hash, "Orphaleia!2026"
            )
        except Exception:
            legacy_password_matches = False
    if legacy_admin and legacy_password_matches:
        replacement_hash = PasswordHasher().hash(secrets.token_urlsafe(48))
        connection.execute(
            sa.text(
                "UPDATE users SET password_hash = :password_hash, "
                "auth_version = auth_version + 1, pending_email = NULL WHERE id = :user_id"
            ),
            {"password_hash": replacement_hash, "user_id": legacy_admin.id},
        )
        connection.execute(
            sa.text(
                "UPDATE refresh_sessions SET revoked_at = :timestamp "
                "WHERE user_id = :user_id AND revoked_at IS NULL"
            ),
            {"timestamp": timestamp, "user_id": legacy_admin.id},
        )
        connection.execute(
            sa.text(
                "UPDATE action_tokens SET used_at = :timestamp "
                "WHERE user_id = :user_id AND used_at IS NULL"
            ),
            {"timestamp": timestamp, "user_id": legacy_admin.id},
        )

    for order in pending:
        if order.user_id in newest_by_user:
            connection.execute(
                sa.text(
                    "UPDATE inventory_reservations SET released_at = :timestamp "
                    "WHERE order_id = :order_id AND consumed_at IS NULL AND released_at IS NULL"
                ),
                {"timestamp": timestamp, "order_id": order.id},
            )
            connection.execute(
                sa.text("UPDATE orders SET status = 'cancelled' WHERE id = :order_id"),
                {"order_id": order.id},
            )
            existing = connection.execute(
                sa.text(
                    "SELECT id FROM order_status_events WHERE order_id = :order_id AND status = 'cancelled'"
                ),
                {"order_id": order.id},
            ).first()
            if not existing:
                connection.execute(
                    sa.text(
                        "INSERT INTO order_status_events "
                        "(id, order_id, status, source, actor_user_id, occurred_at) "
                        "VALUES (:id, :order_id, 'cancelled', 'migration', NULL, :timestamp)"
                    ),
                    {"id": str(uuid.uuid4()), "order_id": order.id, "timestamp": timestamp},
                )
            continue

        newest_by_user[order.user_id] = order.id
        items = connection.execute(
            sa.text(
                "SELECT book_id, quantity, unit_price_cents FROM order_items WHERE order_id = :order_id"
            ),
            {"order_id": order.id},
        ).fetchall()
        connection.execute(
            sa.text("UPDATE orders SET checkout_fingerprint = :fingerprint WHERE id = :order_id"),
            {"fingerprint": _fingerprint(order, items), "order_id": order.id},
        )

    remaining = connection.execute(
        sa.text(
            "SELECT id, user_id, currency, subtotal_cents, shipping_cents, total_cents, "
            "shipping_name, shipping_line1, shipping_line2, shipping_city, shipping_postal_code, shipping_country "
            "FROM orders WHERE checkout_fingerprint IS NULL"
        )
    ).fetchall()
    for order in remaining:
        items = connection.execute(
            sa.text(
                "SELECT book_id, quantity, unit_price_cents FROM order_items WHERE order_id = :order_id"
            ),
            {"order_id": order.id},
        ).fetchall()
        connection.execute(
            sa.text("UPDATE orders SET checkout_fingerprint = :fingerprint WHERE id = :order_id"),
            {"fingerprint": _fingerprint(order, items), "order_id": order.id},
        )

    order_indexes = {index["name"] for index in sa.inspect(connection).get_indexes("orders")}
    if "uq_orders_user_idempotency_key" not in order_indexes:
        op.create_index(
            "uq_orders_user_idempotency_key",
            "orders",
            ["user_id", "idempotency_key"],
            unique=True,
        )
    if "uq_orders_one_pending_per_user" not in order_indexes:
        op.create_index(
            "uq_orders_one_pending_per_user",
            "orders",
            ["user_id"],
            unique=True,
            postgresql_where=sa.text("status = 'pending_payment'"),
            sqlite_where=sa.text("status = 'pending_payment'"),
        )


def downgrade():
    op.drop_index("uq_orders_one_pending_per_user", table_name="orders")
    op.drop_index("uq_orders_user_idempotency_key", table_name="orders")
    op.drop_column("orders", "payment_review_reason")
    op.drop_column("orders", "checkout_fingerprint")
    op.drop_column("orders", "idempotency_key")
    op.drop_column("payment_attempts", "redirect_url")
