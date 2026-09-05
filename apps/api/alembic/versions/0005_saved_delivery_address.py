"""Add saved customer delivery addresses."""

import sqlalchemy as sa

from alembic import op

revision = "0005_saved_delivery_address"
down_revision = "0004_user_profile_settings"
branch_labels = None
depends_on = None


def upgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "saved_addresses" not in tables:
        op.create_table(
            "saved_addresses",
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("line1", sa.String(length=240), nullable=False),
            sa.Column("line2", sa.String(length=240), nullable=False, server_default=""),
            sa.Column("city", sa.String(length=120), nullable=False),
            sa.Column("postal_code", sa.String(length=24), nullable=False),
            sa.Column("country", sa.String(length=2), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("user_id"),
        )


def downgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "saved_addresses" in tables:
        op.drop_table("saved_addresses")
