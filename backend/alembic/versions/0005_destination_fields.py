"""destination-tier fields: region_label, classic_rank + site_type 'natural'

Destinations are level=city children of a country. They carry a region GROUPING LABEL
(North/Central/South Italy — a label, NOT a hierarchy level) and a classic_rank so the
drill funnel can serve classic-first. site_type gains 'natural' to mark natural areas
(Amalfi Coast, Dolomites, Lake Como…) vs cities at the destination tier.

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PG16 allows ADD VALUE inside a transaction as long as the value isn't USED in the
    # same transaction (the seed runs later, separately). IF NOT EXISTS keeps it idempotent.
    op.execute("ALTER TYPE site_type ADD VALUE IF NOT EXISTS 'natural'")
    op.add_column("place", sa.Column("region_label", sa.String(length=80), nullable=True))
    op.add_column("place", sa.Column("classic_rank", sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("place", "classic_rank")
    op.drop_column("place", "region_label")
    # Note: PostgreSQL cannot drop a single enum value; the 'natural' site_type label is
    # left in place on downgrade (harmless — nothing references it once rows are gone).
