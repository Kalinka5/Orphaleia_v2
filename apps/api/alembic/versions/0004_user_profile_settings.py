"""Add reader profile and session-version fields."""

import sqlalchemy as sa

from alembic import op

revision = "0004_user_profile_settings"
down_revision = "0003_book_editorial_spreads"
branch_labels = None
depends_on = None


def upgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "pending_email" not in columns:
        op.add_column("users", sa.Column("pending_email", sa.String(length=320), nullable=True))
    if "avatar_url" not in columns:
        op.add_column("users", sa.Column("avatar_url", sa.String(length=500), nullable=True))
    if "auth_version" not in columns:
        op.add_column("users", sa.Column("auth_version", sa.Integer(), nullable=False, server_default="0"))


def downgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "auth_version" in columns:
        op.drop_column("users", "auth_version")
    if "avatar_url" in columns:
        op.drop_column("users", "avatar_url")
    if "pending_email" in columns:
        op.drop_column("users", "pending_email")
