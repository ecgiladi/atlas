"""add place.iso3 (cca3) — Natural Earth polygon join key

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-14
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("place", sa.Column("iso3", sa.String(3), nullable=True))
    op.create_unique_constraint("uq_place_iso3", "place", ["iso3"])


def downgrade() -> None:
    op.drop_constraint("uq_place_iso3", "place", type_="unique")
    op.drop_column("place", "iso3")
