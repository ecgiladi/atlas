import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class FieldSource(UUIDMixin, TimestampMixin, Base):
    """Per-field provenance for qualitative / extracted fields.

    One row per (place, field_name). The place card reads this to show
    "where this came from" for each extracted value.
    """

    __tablename__ = "field_source"

    place_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("place.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    source_url: Mapped[Optional[str]] = mapped_column(Text)
    fetched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    note: Mapped[Optional[str]] = mapped_column(Text)

    place: Mapped["Place"] = relationship("Place", back_populates="sources")

    __table_args__ = (
        UniqueConstraint("place_id", "field_name", name="uq_field_source_place_field"),
    )
