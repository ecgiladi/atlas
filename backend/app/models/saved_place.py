import uuid
from typing import Optional

from sqlalchemy import Enum as SAEnum, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import SavedStatus


class SavedPlace(UUIDMixin, TimestampMixin, Base):
    """Links a user to a place for the 'compare my candidates' flow."""

    __tablename__ = "saved_place"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    place_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("place.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[SavedStatus] = mapped_column(
        SAEnum(SavedStatus, name="saved_status"), nullable=False
    )
    note: Mapped[Optional[str]] = mapped_column(Text)

    place: Mapped["Place"] = relationship("Place")

    __table_args__ = (
        UniqueConstraint("user_id", "place_id", name="uq_saved_place_user_place"),
    )
