"""add place.iso2 (cca2 upsert key for macro seed loader)

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-14
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("place", sa.Column("iso2", sa.String(2), nullable=True))
    op.create_unique_constraint("uq_place_iso2", "place", ["iso2"])


def downgrade() -> None:
    op.drop_constraint("uq_place_iso2", "place", type_="unique")
    op.drop_column("place", "iso2")
