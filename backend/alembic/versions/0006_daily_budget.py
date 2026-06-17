"""city ₪ axis: daily_budget (daily living spend in ILS)

The city/destination cost language is absolute ₪, not the cost_vs_israel index (an index
is a macro/country tool, meaningless at city level). price_night already exists; this adds
daily_budget — on-the-ground daily living spend (food + local transport + incidentals,
excluding lodging), in ILS.

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("place", sa.Column("daily_budget", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("place", "daily_budget")
