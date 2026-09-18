"""Add saved and shared reading-current results."""

import sqlalchemy as sa

from alembic import op

revision = "0008_reading_current"
down_revision = "0007_checkout_security"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    if "reading_current_profiles" not in tables:
        op.create_table(
            "reading_current_profiles",
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("quiz_version", sa.String(length=32), nullable=False),
            sa.Column("answers_json", sa.JSON(), nullable=False),
            sa.Column("result_json", sa.JSON(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("user_id"),
        )
    if "reading_current_shares" not in tables:
        op.create_table(
            "reading_current_shares",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("owner_user_id", sa.String(length=36), nullable=True),
            sa.Column("public_token_hash", sa.String(length=64), nullable=False),
            sa.Column("revoke_token_hash", sa.String(length=64), nullable=True),
            sa.Column("result_json", sa.JSON(), nullable=False),
            sa.Column("display_name", sa.String(length=120), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("public_token_hash"),
        )
        op.create_index("ix_reading_current_shares_owner_user_id", "reading_current_shares", ["owner_user_id"])
        op.create_index("ix_reading_current_shares_public_token_hash", "reading_current_shares", ["public_token_hash"], unique=True)
        op.create_index("ix_reading_current_shares_expires_at", "reading_current_shares", ["expires_at"])
        op.create_index("ix_reading_current_shares_revoked_at", "reading_current_shares", ["revoked_at"])


def downgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "reading_current_shares" in tables:
        op.drop_index("ix_reading_current_shares_revoked_at", table_name="reading_current_shares")
        op.drop_index("ix_reading_current_shares_expires_at", table_name="reading_current_shares")
        op.drop_index("ix_reading_current_shares_public_token_hash", table_name="reading_current_shares")
        op.drop_index("ix_reading_current_shares_owner_user_id", table_name="reading_current_shares")
        op.drop_table("reading_current_shares")
    if "reading_current_profiles" in tables:
        op.drop_table("reading_current_profiles")
