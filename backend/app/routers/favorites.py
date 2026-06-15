"""Favorites (saved_place) CRUD — the 'judge & narrow' stage.

This is where the human's JUDGMENT gets recorded ("אתה שופט"): a place is marked
considering / want / been. Atlas just stores & organizes it — no automation of the call.

Single default app_user for now (JWT deferred — Atlas is single-user). Every endpoint
resolves the default user, so the frontend never sends a user id.

Endpoints (all under /api/favorites):
  GET    /                -> saved places for the default user (optional ?status= filter),
                             each joined with a light place summary so the list renders
                             without an N+1 of /api/places calls.
  GET    /{place_ref}      -> the saved state for one place ({saved, status}) — lets the
                             card reflect current state without pulling the whole list.
  PUT    /{place_ref}      -> upsert {status} (shortlist|want|been).
  DELETE /{place_ref}      -> remove.

place_ref is the same reference the card uses (iso3 / slug / UUID), resolved via
app.routers.places._resolve_place so favorites and the card speak the same id.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.enums import SavedStatus
from app.models.place import Place
from app.models.saved_place import SavedPlace
from app.models.user import AppUser
from app.routers.places import _resolve_place

router = APIRouter(prefix="/api/favorites", tags=["favorites"])

# Single-user anchor until JWT lands. Stable email so get-or-create is idempotent.
DEFAULT_USER_EMAIL = "default@atlas.local"
DEFAULT_USER_NAME = "Atlas"


def _jsonable(value):
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    return value


async def get_default_user(session: AsyncSession) -> AppUser:
    """Resolve (creating once) the single default user.

    Commits on create so the row is durable no matter which request type first hits it
    — a read-only endpoint (GET) that creates-then-doesn't-commit would roll the user
    back, and a later write could associate a *different* user, so the save would never
    show up in the list. Committing here guarantees one stable user across PUT and GET.
    Idempotent: a concurrent create collides on the unique email; we re-read in that case.
    """
    user = (
        await session.execute(
            select(AppUser).where(AppUser.email == DEFAULT_USER_EMAIL)
        )
    ).scalar_one_or_none()
    if user is not None:
        return user

    user = AppUser(email=DEFAULT_USER_EMAIL, display_name=DEFAULT_USER_NAME)
    session.add(user)
    try:
        await session.commit()
        await session.refresh(user)
    except Exception:  # unique-violation race — someone else inserted it first
        await session.rollback()
        user = (
            await session.execute(
                select(AppUser).where(AppUser.email == DEFAULT_USER_EMAIL)
            )
        ).scalar_one()
    return user


def _place_summary(place: Place) -> dict:
    """Light place projection for the favorites list — enough to render a rich row
    (name, level, the headline comparison axes) without a per-item card fetch."""
    return {
        "id": str(place.id),
        "ref": place.iso3 or place.slug,  # the id the card/PUT/DELETE use
        "level": _jsonable(place.level),
        "name_he": place.name_he,
        "name_en": place.name_en,
        "slug": place.slug,
        "iso3": place.iso3,
        "enrichment_status": _jsonable(place.enrichment_status),
        # headline axes (may be null — the list renders honest empty states)
        "visa_status": _jsonable(place.visa_status),
        "cost_vs_israel": place.cost_vs_israel,
        "flight_from_tlv_minutes": place.flight_from_tlv_minutes,
        "good_for": place.good_for,
    }


def _saved_entry(saved: SavedPlace, place: Place) -> dict:
    return {
        "id": str(saved.id),
        "status": _jsonable(saved.status),
        "note": saved.note,
        "created_at": _jsonable(saved.created_at),
        "updated_at": _jsonable(saved.updated_at),
        "place": _place_summary(place),
    }


class FavoriteUpsert(BaseModel):
    status: SavedStatus = SavedStatus.shortlist


@router.get("")
async def list_favorites(
    status: Optional[SavedStatus] = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    user = await get_default_user(session)
    stmt = (
        select(SavedPlace, Place)
        .join(Place, SavedPlace.place_id == Place.id)
        .where(SavedPlace.user_id == user.id)
        .order_by(SavedPlace.created_at.desc())
    )
    if status is not None:
        stmt = stmt.where(SavedPlace.status == status)
    rows = (await session.execute(stmt)).all()
    return [_saved_entry(saved, place) for saved, place in rows]


@router.get("/{place_ref}")
async def get_favorite(
    place_ref: str, session: AsyncSession = Depends(get_session)
) -> dict:
    """Current saved state for one place — {saved: bool, status: ...|null}.

    Returns 404 only when the place itself doesn't exist; an un-saved (but real) place
    is a valid {saved: false} answer the card uses to show the empty heart.
    """
    place = await _resolve_place(session, place_ref)
    if place is None:
        raise HTTPException(status_code=404, detail=f"place not found: {place_ref!r}")
    user = await get_default_user(session)
    saved = (
        await session.execute(
            select(SavedPlace).where(
                SavedPlace.user_id == user.id, SavedPlace.place_id == place.id
            )
        )
    ).scalar_one_or_none()
    return {
        "saved": saved is not None,
        "status": _jsonable(saved.status) if saved else None,
        "place_ref": place.iso3 or place.slug,
    }


@router.put("/{place_ref}")
async def upsert_favorite(
    place_ref: str,
    body: FavoriteUpsert,
    session: AsyncSession = Depends(get_session),
) -> dict:
    place = await _resolve_place(session, place_ref)
    if place is None:
        raise HTTPException(status_code=404, detail=f"place not found: {place_ref!r}")
    user = await get_default_user(session)

    saved = (
        await session.execute(
            select(SavedPlace).where(
                SavedPlace.user_id == user.id, SavedPlace.place_id == place.id
            )
        )
    ).scalar_one_or_none()
    if saved is None:
        saved = SavedPlace(user_id=user.id, place_id=place.id, status=body.status)
        session.add(saved)
    else:
        saved.status = body.status
    await session.commit()
    await session.refresh(saved)
    return _saved_entry(saved, place)


@router.delete("/{place_ref}")
async def delete_favorite(
    place_ref: str, session: AsyncSession = Depends(get_session)
) -> dict:
    place = await _resolve_place(session, place_ref)
    if place is None:
        raise HTTPException(status_code=404, detail=f"place not found: {place_ref!r}")
    user = await get_default_user(session)
    saved = (
        await session.execute(
            select(SavedPlace).where(
                SavedPlace.user_id == user.id, SavedPlace.place_id == place.id
            )
        )
    ).scalar_one_or_none()
    if saved is not None:
        await session.delete(saved)
        await session.commit()
    return {"ok": True, "removed": saved is not None}
