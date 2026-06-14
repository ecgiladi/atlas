from typing import Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class AppUser(UUIDMixin, TimestampMixin, Base):
    """Minimal user anchor.

    Atlas is single-user for now; this exists so saved_place has a real FK target.
    Real JWT auth (house FastAPI utilities) is wired when the app goes multi-user.
    """

    __tablename__ = "app_user"

    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(120))
