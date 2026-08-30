"""Add editorial fields for interactive book spreads."""

from alembic import op
import sqlalchemy as sa


revision = "0003_book_editorial_spreads"
down_revision = "0002_sales_rankings"
branch_labels = None
depends_on = None


def upgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("books")}
    if "interior_image_url" not in columns:
        op.add_column("books", sa.Column("interior_image_url", sa.String(length=500), nullable=True))
    if "interior_image_alt" not in columns:
        op.add_column("books", sa.Column("interior_image_alt", sa.String(length=300), nullable=True))
    if "pull_quote" not in columns:
        op.add_column("books", sa.Column("pull_quote", sa.String(length=280), nullable=True))


def downgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("books")}
    if "pull_quote" in columns:
        op.drop_column("books", "pull_quote")
    if "interior_image_alt" in columns:
        op.drop_column("books", "interior_image_alt")
    if "interior_image_url" in columns:
        op.drop_column("books", "interior_image_url")
