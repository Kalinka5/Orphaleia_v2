"""Add licensed annual sales ranking datasets."""

from alembic import op
import sqlalchemy as sa


revision = "0002_sales_rankings"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("ranking_datasets"):
        op.create_table(
            "ranking_datasets",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("source_name", sa.String(length=160), nullable=False),
            sa.Column("source_url", sa.String(length=500), nullable=False),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("scope_code", sa.String(length=80), nullable=False),
            sa.Column("scope_label", sa.String(length=160), nullable=False),
            sa.Column("coverage_note", sa.Text(), nullable=False),
            sa.Column("methodology_note", sa.Text(), nullable=False),
            sa.Column("exact_units_public", sa.Boolean(), nullable=False),
            sa.Column("checksum", sa.String(length=64), nullable=False),
            sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("source_name", "year", "scope_code", name="uq_ranking_dataset_source_year_scope"),
        )
        op.create_index(op.f("ix_ranking_datasets_published_at"), "ranking_datasets", ["published_at"], unique=False)
        op.create_index(op.f("ix_ranking_datasets_scope_code"), "ranking_datasets", ["scope_code"], unique=False)
        op.create_index(op.f("ix_ranking_datasets_year"), "ranking_datasets", ["year"], unique=False)
    if not inspector.has_table("ranking_entries"):
        op.create_table(
            "ranking_entries",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("dataset_id", sa.String(length=36), nullable=False),
            sa.Column("provider_work_key", sa.String(length=180), nullable=False),
            sa.Column("isbn13", sa.String(length=13), nullable=True),
            sa.Column("title", sa.String(length=240), nullable=False),
            sa.Column("authors_json", sa.Text(), nullable=False),
            sa.Column("genre", sa.String(length=120), nullable=False),
            sa.Column("units_sold", sa.Integer(), nullable=False),
            sa.Column("catalog_book_id", sa.String(length=36), nullable=True),
            sa.ForeignKeyConstraint(["catalog_book_id"], ["books.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["dataset_id"], ["ranking_datasets.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("dataset_id", "provider_work_key", name="uq_ranking_entry_dataset_work"),
        )
        op.create_index(op.f("ix_ranking_entries_catalog_book_id"), "ranking_entries", ["catalog_book_id"], unique=False)
        op.create_index(op.f("ix_ranking_entries_dataset_id"), "ranking_entries", ["dataset_id"], unique=False)
        op.create_index(op.f("ix_ranking_entries_genre"), "ranking_entries", ["genre"], unique=False)
        op.create_index(op.f("ix_ranking_entries_isbn13"), "ranking_entries", ["isbn13"], unique=False)


def downgrade():
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("ranking_entries"):
        op.drop_table("ranking_entries")
    if inspector.has_table("ranking_datasets"):
        op.drop_table("ranking_datasets")
