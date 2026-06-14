"""initial schema: place, field_source, app_user, saved_place

Revision ID: 0001
Revises:
Create Date: 2026-06-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


# --- enum type definitions (created once explicitly; create_type=False so
# create_table does NOT also auto-emit CREATE TYPE) ---
level = postgresql.ENUM(
    "continent", "country", "city", "site_or_route", name="level", create_type=False
)
site_type = postgresql.ENUM(
    "attraction", "historical", "trail", "viewpoint", "other",
    name="site_type", create_type=False,
)
climate = postgresql.ENUM(
    "tropical", "arid", "mediterranean", "temperate", "continental", "polar",
    name="climate", create_type=False,
)
flight_price_band = postgresql.ENUM(
    "low", "mid", "high", name="flight_price_band", create_type=False
)
safety_level = postgresql.ENUM(
    "very_safe", "safe", "moderate", "caution", "avoid",
    name="safety_level", create_type=False,
)
trail_difficulty = postgresql.ENUM(
    "easy", "moderate", "hard", "expert", name="trail_difficulty", create_type=False
)
time_of_day = postgresql.ENUM(
    "morning", "midday", "afternoon", "evening", "night", "any",
    name="time_of_day", create_type=False,
)
saved_status = postgresql.ENUM(
    "shortlist", "want", "been", name="saved_status", create_type=False
)
enrichment_status = postgresql.ENUM(
    "stub", "partial", "enriched", name="enrichment_status", create_type=False
)

_ALL_ENUMS = [
    level, site_type, climate, flight_price_band, safety_level,
    trail_difficulty, time_of_day, saved_status, enrichment_status,
]


def upgrade() -> None:
    bind = op.get_bind()
    for e in _ALL_ENUMS:
        e.create(bind, checkfirst=True)

    uuid_pk = lambda: sa.Column(  # noqa: E731
        "id",
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    ts_cols = (
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    # --- app_user ---
    op.create_table(
        "app_user",
        uuid_pk(),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(120)),
        *ts_cols,
        sa.UniqueConstraint("email", name="uq_app_user_email"),
    )

    # --- place (the spine) ---
    op.create_table(
        "place",
        uuid_pk(),
        sa.Column("level", level, nullable=False),
        sa.Column(
            "parent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("place.id", ondelete="SET NULL"),
        ),
        sa.Column("name_he", sa.String(200), nullable=False),
        sa.Column("name_en", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column(
            "enrichment_status",
            enrichment_status,
            nullable=False,
            server_default="stub",
        ),
        # geo
        sa.Column("lat", sa.Float()),
        sa.Column("lng", sa.Float()),
        sa.Column("geojson_ref", sa.String(500)),
        # comparison axes
        sa.Column("season_best_months", postgresql.ARRAY(sa.SmallInteger())),
        sa.Column("climate", climate),
        sa.Column("cost_vs_israel", sa.SmallInteger()),
        sa.Column("price_night", sa.Integer()),
        sa.Column("price_meal", sa.Integer()),
        sa.Column("flight_from_tlv_minutes", sa.Integer()),
        sa.Column("flight_direct", sa.Boolean()),
        sa.Column("flight_price_band", flight_price_band),
        sa.Column("visa_israeli_required", sa.Boolean()),
        sa.Column("visa_note", sa.Text()),
        sa.Column("safety_level", safety_level),
        sa.Column("good_for", postgresql.ARRAY(sa.Text())),
        sa.Column("character_touristy_authentic", sa.SmallInteger()),
        sa.Column("character_busy_quiet", sa.SmallInteger()),
        sa.Column("language_barrier", sa.SmallInteger()),
        # content sections
        sa.Column("culture_section", sa.Text()),
        sa.Column("history_context", sa.Text()),
        # site_or_route specifics
        sa.Column("site_type", site_type),
        sa.Column("length_km", sa.Numeric(6, 2)),
        sa.Column("difficulty", trail_difficulty),
        sa.Column("duration_min", sa.Integer()),
        sa.Column("visit_minutes", sa.Integer()),
        sa.Column("ticket_price", sa.Integer()),
        sa.Column("best_time_of_day", time_of_day),
        *ts_cols,
        sa.UniqueConstraint("slug", name="uq_place_slug"),
    )
    op.create_index("ix_place_level", "place", ["level"])
    op.create_index("ix_place_parent_id", "place", ["parent_id"])
    op.create_index("ix_place_level_parent", "place", ["level", "parent_id"])

    # --- field_source (per-field provenance) ---
    op.create_table(
        "field_source",
        uuid_pk(),
        sa.Column(
            "place_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("place.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("field_name", sa.String(100), nullable=False),
        sa.Column("source_url", sa.Text()),
        sa.Column("fetched_at", sa.DateTime(timezone=True)),
        sa.Column("note", sa.Text()),
        *ts_cols,
        sa.UniqueConstraint(
            "place_id",
            "field_name",
            "source_url",
            name="uq_field_source_place_field_url",
        ),
    )
    op.create_index("ix_field_source_place_id", "field_source", ["place_id"])

    # --- saved_place ---
    op.create_table(
        "saved_place",
        uuid_pk(),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app_user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "place_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("place.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", saved_status, nullable=False),
        sa.Column("note", sa.Text()),
        *ts_cols,
        sa.UniqueConstraint("user_id", "place_id", name="uq_saved_place_user_place"),
    )
    op.create_index("ix_saved_place_user_id", "saved_place", ["user_id"])
    op.create_index("ix_saved_place_place_id", "saved_place", ["place_id"])


def downgrade() -> None:
    op.drop_table("saved_place")
    op.drop_table("field_source")
    op.drop_table("place")
    op.drop_table("app_user")
    bind = op.get_bind()
    for e in reversed(_ALL_ENUMS):
        e.drop(bind, checkfirst=True)
