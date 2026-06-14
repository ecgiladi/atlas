import uuid
from typing import Optional

from sqlalchemy import (
    Boolean,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.models.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import (
    Climate,
    EnrichmentStatus,
    FlightPriceBand,
    Level,
    SafetyLevel,
    SiteType,
    TimeOfDay,
    TrailDifficulty,
)
from app.vocab import validate_good_for


class Place(UUIDMixin, TimestampMixin, Base):
    """The spine of Atlas.

    A single table holds every level (continent/country/city/site_or_route) so the
    comparison axes live in one queryable place and inheritance can walk parent_id.
    Site/route-specific columns are gated by ``level == site_or_route`` + ``site_type``.
    """

    __tablename__ = "place"

    # --- identity / hierarchy ---
    level: Mapped[Level] = mapped_column(
        SAEnum(Level, name="level"), nullable=False, index=True
    )
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("place.id", ondelete="SET NULL"), index=True
    )
    name_he: Mapped[str] = mapped_column(String(200), nullable=False)
    name_en: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    # ISO 3166-1 alpha-2 for countries (cca2). Upsert key for the macro seed loader;
    # NULL for non-country levels. Unique where present.
    iso2: Mapped[Optional[str]] = mapped_column(String(2), unique=True)
    # On-demand micro-growth: new places land as 'stub' and get enriched on use.
    enrichment_status: Mapped[EnrichmentStatus] = mapped_column(
        SAEnum(EnrichmentStatus, name="enrichment_status"),
        nullable=False,
        default=EnrichmentStatus.stub,
        server_default=EnrichmentStatus.stub.value,
    )

    # --- geo ---
    lat: Mapped[Optional[float]] = mapped_column(Float)
    lng: Mapped[Optional[float]] = mapped_column(Float)
    # Pointer to a GeoJSON asset (R2 key or path) for choropleth fills — resolved later.
    geojson_ref: Mapped[Optional[str]] = mapped_column(String(500))

    # --- comparison axes (the spine; nullable, inheritable per inheritance.py) ---
    season_best_months: Mapped[Optional[list[int]]] = mapped_column(
        ARRAY(SmallInteger)
    )  # months 1..12
    climate: Mapped[Optional[Climate]] = mapped_column(SAEnum(Climate, name="climate"))
    cost_vs_israel: Mapped[Optional[int]] = mapped_column(SmallInteger)  # Israel = 100
    price_night: Mapped[Optional[int]] = mapped_column(Integer)  # ILS
    price_meal: Mapped[Optional[int]] = mapped_column(Integer)  # ILS
    flight_from_tlv_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    flight_direct: Mapped[Optional[bool]] = mapped_column(Boolean)
    flight_price_band: Mapped[Optional[FlightPriceBand]] = mapped_column(
        SAEnum(FlightPriceBand, name="flight_price_band")
    )
    visa_israeli_required: Mapped[Optional[bool]] = mapped_column(Boolean)
    visa_note: Mapped[Optional[str]] = mapped_column(Text)
    safety_level: Mapped[Optional[SafetyLevel]] = mapped_column(
        SAEnum(SafetyLevel, name="safety_level")
    )
    good_for: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))  # free tags
    # Character scales, 1..5. Documented direction so sort/filter is meaningful:
    character_touristy_authentic: Mapped[Optional[int]] = mapped_column(
        SmallInteger
    )  # 1 = very touristy .. 5 = very authentic
    character_busy_quiet: Mapped[Optional[int]] = mapped_column(
        SmallInteger
    )  # 1 = very busy .. 5 = very quiet
    language_barrier: Mapped[Optional[int]] = mapped_column(
        SmallInteger
    )  # 1 = easy (English fine) .. 5 = hard

    # --- content sections (country/city); culture & history are NOT levels ---
    culture_section: Mapped[Optional[str]] = mapped_column(Text)
    history_context: Mapped[Optional[str]] = mapped_column(Text)

    # --- site_or_route specifics (gated by level == site_or_route) ---
    site_type: Mapped[Optional[SiteType]] = mapped_column(
        SAEnum(SiteType, name="site_type")
    )
    # trail
    length_km: Mapped[Optional[float]] = mapped_column(Numeric(6, 2))
    difficulty: Mapped[Optional[TrailDifficulty]] = mapped_column(
        SAEnum(TrailDifficulty, name="trail_difficulty")
    )
    duration_min: Mapped[Optional[int]] = mapped_column(Integer)
    # attraction
    visit_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    ticket_price: Mapped[Optional[int]] = mapped_column(Integer)  # ILS
    best_time_of_day: Mapped[Optional[TimeOfDay]] = mapped_column(
        SAEnum(TimeOfDay, name="time_of_day")
    )

    # --- relationships ---
    parent: Mapped[Optional["Place"]] = relationship(
        "Place", remote_side="Place.id", backref="children"
    )
    sources: Mapped[list["FieldSource"]] = relationship(
        "FieldSource", back_populates="place", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_place_level_parent", "level", "parent_id"),
    )

    @validates("good_for")
    def _validate_good_for(self, _key: str, value):
        # Enforce the controlled vocabulary on every ORM write (incl. extraction).
        return validate_good_for(value)

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<Place {self.level.value} {self.name_en!r}>"


# Imported here to avoid a circular import at module top.
from app.models.provenance import FieldSource  # noqa: E402,F401
