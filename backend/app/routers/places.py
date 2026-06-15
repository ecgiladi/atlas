"""Place detail + compare endpoints — the templated place card feed.

GET /api/places/{ref} returns one place resolved by iso3, slug, or UUID, with:
  - identity (name, level, iso3, enrichment_status, is_home)
  - every comparison axis, including explicit NULLs (the card decides empty states)
  - a per-field provenance map { field_name: {source_url, fetched_at, note, origin} }

GET /api/places/compare?refs=JP,TH,GE returns an array of that same detail shape (2-3
places) — the compare view computes per-axis winners client-side.

Inheritance: inheritable axes resolve through the parent chain (city -> country ->
continent) via app.inheritance. For countries today everything is own, so origin is
always 'own'; the resolver makes the city case correct later without a card change.
"""

import uuid as uuidlib
from datetime import datetime
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.inheritance import INHERITABLE_FIELDS, resolve_inherited
from app.models.place import Place
from app.models.provenance import FieldSource

router = APIRouter(prefix="/api/places", tags=["places"])

ISRAEL_ISO3 = "ISR"

# Axes the card reads. Inheritable ones resolve through ancestors; the rest are
# place-specific (free tags / character scales / site fields) and read straight off
# the place. Listed explicitly so a NULL is an honest "no data", never a missing key.
PLACE_SPECIFIC_AXES: tuple[str, ...] = (
    "good_for",
    "character_touristy_authentic",
    "character_busy_quiet",
)

# Provenance rows that aren't tied to an inheritable axis but the card may surface.
NON_AXIS_PROVENANCE: tuple[str, ...] = ("name_en", "name_he", "geo")


def _jsonable(value):
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    return value


async def _resolve_place(session: AsyncSession, ref: str) -> Optional[Place]:
    """Resolve a place by iso3 (3-letter), then slug, then UUID."""
    if len(ref) == 3 and ref.isalpha():
        hit = (
            await session.execute(select(Place).where(Place.iso3 == ref.upper()))
        ).scalar_one_or_none()
        if hit:
            return hit

    hit = (
        await session.execute(select(Place).where(Place.slug == ref))
    ).scalar_one_or_none()
    if hit:
        return hit

    try:
        as_uuid = uuidlib.UUID(ref)
    except ValueError:
        return None
    return (
        await session.execute(select(Place).where(Place.id == as_uuid))
    ).scalar_one_or_none()


async def _load_ancestors(session: AsyncSession, place: Place) -> list[Place]:
    """Walk parent_id upward, nearest-first (e.g. [country, continent] for a city)."""
    ancestors: list[Place] = []
    current = place
    seen = {current.id}
    while current.parent_id is not None and current.parent_id not in seen:
        parent = (
            await session.execute(
                select(Place).where(Place.id == current.parent_id)
            )
        ).scalar_one_or_none()
        if parent is None:
            break
        ancestors.append(parent)
        seen.add(parent.id)
        current = parent
    return ancestors


async def _build_place_detail(session: AsyncSession, place: Place) -> dict:
    """The full templated detail shape for one place (identity + axes + provenance)."""
    ancestors = await _load_ancestors(session, place)
    resolved = resolve_inherited(place, ancestors)

    # Pull every field_source row for the place + its ancestors in one shot, so an
    # inherited field can cite the ancestor it actually came from.
    place_ids = [place.id, *(a.id for a in ancestors)]
    src_rows = (
        await session.execute(
            select(FieldSource).where(FieldSource.place_id.in_(place_ids))
        )
    ).scalars().all()
    src_by_key: dict[tuple, FieldSource] = {
        (s.place_id, s.field_name): s for s in src_rows
    }

    def provenance_for(field_name: str, owner_id, origin: str) -> Optional[dict]:
        row = src_by_key.get((owner_id, field_name))
        if row is None:
            return None
        return {
            "source_url": row.source_url,
            "fetched_at": _jsonable(row.fetched_at),
            "note": row.note,
            "origin": origin,
        }

    # --- axes: inheritable resolve through ancestors; rest read off the place ---
    axes: dict = {}
    provenance: dict = {}

    for field_name in INHERITABLE_FIELDS:
        rf = resolved[field_name]
        axes[field_name] = _jsonable(rf.value)
        if rf.value is None:
            continue
        if rf.source == "own":
            prov = provenance_for(field_name, place.id, "own")
        else:
            # rf.source is the ancestor id (str) the value came from
            owner_id = next(
                (a.id for a in ancestors if str(a.id) == rf.source), None
            )
            prov = provenance_for(field_name, owner_id, "inherited") if owner_id else None
        if prov:
            provenance[field_name] = prov

    for field_name in PLACE_SPECIFIC_AXES:
        axes[field_name] = _jsonable(getattr(place, field_name, None))

    # Non-axis provenance (names, geo) — always own for the resolved place.
    for field_name in NON_AXIS_PROVENANCE:
        prov = provenance_for(field_name, place.id, "own")
        if prov:
            provenance[field_name] = prov

    return {
        # identity
        "id": str(place.id),
        "level": _jsonable(place.level),
        "name_he": place.name_he,
        "name_en": place.name_en,
        "slug": place.slug,
        "iso3": place.iso3,
        "enrichment_status": _jsonable(place.enrichment_status),
        "is_home": place.iso3 == ISRAEL_ISO3,
        # comparison axes (explicit nulls preserved)
        **axes,
        "provenance": provenance,
    }


# NOTE: declared BEFORE "/{ref}" so the literal path wins over the catch-all param.
@router.get("/compare")
async def compare_places(
    refs: str = Query(..., description="2-3 comma-separated iso3/slug refs"),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """Batch detail for the compare view: array of the /{ref} shape, in request order."""
    wanted = [r.strip() for r in refs.split(",") if r.strip()]
    if not (2 <= len(wanted) <= 3):
        raise HTTPException(
            status_code=400,
            detail="compare needs 2-3 refs, got " + str(len(wanted)),
        )
    details: list[dict] = []
    for ref in wanted:
        place = await _resolve_place(session, ref)
        if place is None:
            raise HTTPException(status_code=404, detail=f"place not found: {ref!r}")
        details.append(await _build_place_detail(session, place))
    return details


@router.get("/{ref}")
async def get_place(
    ref: str, session: AsyncSession = Depends(get_session)
) -> dict:
    place = await _resolve_place(session, ref)
    if place is None:
        raise HTTPException(status_code=404, detail=f"place not found: {ref!r}")
    return await _build_place_detail(session, place)
