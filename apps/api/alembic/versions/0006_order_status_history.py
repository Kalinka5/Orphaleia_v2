"""Add order status history and carrier tracking details."""

import sqlalchemy as sa
from alembic import op

revision = "0006_order_status_history"
down_revision = "0005_saved_delivery_address"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    order_columns = {column["name"] for column in inspector.get_columns("orders")}
    if "tracking_carrier" not in order_columns:
        op.add_column("orders", sa.Column("tracking_carrier", sa.String(length=120), nullable=True))
    if "tracking_url" not in order_columns:
        op.add_column("orders", sa.Column("tracking_url", sa.String(length=500), nullable=True))
    if not inspector.has_table("order_status_events"):
        op.create_table(
            "order_status_events",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("order_id", sa.String(length=36), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False),
            sa.Column("source", sa.String(length=20), nullable=False),
            sa.Column("actor_user_id", sa.String(length=36), nullable=True),
            sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("order_id", "status", name="uq_order_status_event_order_status"),
        )
        op.create_index("ix_order_status_events_order_id", "order_status_events", ["order_id"])
        op.create_index("ix_order_status_events_occurred_at", "order_status_events", ["occurred_at"])


def downgrade():
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("order_status_events"):
        op.drop_table("order_status_events")
    order_columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("orders")}
    if "tracking_url" in order_columns:
        op.drop_column("orders", "tracking_url")
    if "tracking_carrier" in order_columns:
        op.drop_column("orders", "tracking_carrier")
