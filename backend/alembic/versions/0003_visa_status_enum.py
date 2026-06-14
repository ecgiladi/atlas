"""migrate visa from bool to ordinal enum (visa_status)

Replaces place.visa_israeli_required (bool) with place.visa_status, an ordinal ease
gradient: visa_free | eta_evisa | voa | visa_required.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

visa_status = postgresql.ENUM(
    "visa_free", "eta_evisa", "voa", "visa_required",
    name="visa_status", create_type=False,
)


def upgrade() -> None:
    visa_status.create(op.get_bind(), checkfirst=True)
    op.add_column("place", sa.Column("visa_status", visa_status, nullable=True))
    op.drop_column("place", "visa_israeli_required")


def downgrade() -> None:
    op.add_column(
        "place",
        sa.Column("visa_israeli_required", sa.Boolean(), nullable=True),
    )
    op.drop_column("place", "visa_status")
    visa_status.drop(op.get_bind(), checkfirst=True)
