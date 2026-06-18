"""Place detail + destination-tier + compare endpoints — the templated place card feed.

GET /api/places/{ref}                      -> one place, every axis + per-field provenance.
GET /api/places/{country_ref}/destinations -> a country's destination-tier children
                                              (level=city), ordered classic-first, each in
                                              the SAME template shape (the consolidated format).

GET /api/places/compare?refs=JP,TH,GE returns an array of that same detail shape (2-3
places) — the compare view computes per-axis winners client-side.

Inheritance: inheritable axes resolve through the parent chain (city -> country ->
continent) via app.inheritance, so a destination with a NULL cost shows the country's
figure attributed to the country (origin 'inherited').
"""

import uuid as uuidlib
from datetime import datetime
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.inheritance import INHERITABLE_FIELDS, resolve_inherited
from app.models.enums import Level
from app.models.place import Place
from app.models.provenance import FieldSource

router = APIRouter(prefix="/api/places", tags=["places"])

ISRAEL_ISO3 = "ISR"

# Place-specific axes (free tags / character scales). Not inherited; read off the place.
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


async def _load_sources(
    session: AsyncSession, place_ids: list
) -> dict[tuple, FieldSource]:
    """All field_source rows for the given places, keyed by (place_id, field_name)."""
    rows = (
        await session.execute(
            select(FieldSource).where(FieldSource.place_id.in_(place_ids))
        )
    ).scalars().all()
    return {(s.place_id, s.field_name): s for s in rows}


def _build_payload(
    place: Place, ancestors: list[Place], src_by_key: dict[tuple, FieldSource]
) -> dict:
    """The uniform place template: identity + geo + every axis (explicit nulls) + a
    per-field provenance map. Shared by the detail card and the destination list so every
    place — country or destination — renders the same consolidated shape."""
    resolved = resolve_inherited(place, ancestors)

    def prov_for(field_name: str, owner_id, origin: str) -> Optional[dict]:
        row = src_by_key.get((owner_id, field_name))
        if row is None:
            return None
        return {
            "source_url": row.source_url,
            "fetched_at": _jsonable(row.fetched_at),
            "note": row.note,
            "origin": origin,
        }

    axes: dict = {}
    provenance: dict = {}

    for field_name in INHERITABLE_FIELDS:
        rf = resolved[field_name]
        axes[field_name] = _jsonable(rf.value)
        if rf.value is None:
            continue
        if rf.source == "own":
            prov = prov_for(field_name, place.id, "own")
        else:
            owner_id = next((a.id for a in ancestors if str(a.id) == rf.source), None)
            prov = prov_for(field_name, owner_id, "inherited") if owner_id else None
        if prov:
            provenance[field_name] = prov

    # Place-specific axes read off the place; attach own provenance when present (so a
    # destination's character/good_for estimate can carry its "הערכה" badge).
    for field_name in PLACE_SPECIFIC_AXES:
        axes[field_name] = _jsonable(getattr(place, field_name, None))
        prov = prov_for(field_name, place.id, "own")
        if prov:
            provenance[field_name] = prov

    for field_name in NON_AXIS_PROVENANCE:
        prov = prov_for(field_name, place.id, "own")
        if prov:
            provenance[field_name] = prov

    return {
        # identity
        "id": str(place.id),
        "level": _jsonable(place.level),
        "site_type": _jsonable(place.site_type),
        "name_he": place.name_he,
        "name_en": place.name_en,
        "slug": place.slug,
        "iso3": place.iso3,
        # geo (pins) + destination grouping
        "lat": place.lat,
        "lng": place.lng,
        "region_label": place.region_label,
        "classic_rank": place.classic_rank,
        "enrichment_status": _jsonable(place.enrichment_status),
        "is_home": place.iso3 == ISRAEL_ISO3,
        # comparison axes (explicit nulls preserved)
        **axes,
        "provenance": provenance,
    }


@router.get("/{country_ref}/destinations")
async def get_destinations(
    country_ref: str,
    offset: int = Query(default=0, ge=0),
    limit: Optional[int] = Query(default=None, ge=1),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Destination-tier children of a country, ordered classic-first (classic_rank asc,
    unranked last). Returns the full ordered list + total by default; the frontend reveals
    3 at a time. offset/limit are honoured if the caller prefers server-side paging."""
    country = await _resolve_place(session, country_ref)
    if country is None or country.level != Level.country:
        raise HTTPException(status_code=404, detail=f"country not found: {country_ref!r}")

    children = (
        await session.execute(
            select(Place)
            .where(Place.parent_id == country.id, Place.level == Level.city)
            .order_by(Place.classic_rank.asc().nulls_last(), Place.name_he)
        )
    ).scalars().all()

    # A destination inherits through [country, continent, ...]; load once for all children.
    country_ancestors = await _load_ancestors(session, country)
    ancestors_for_child = [country, *country_ancestors]
    src_ids = [c.id for c in children] + [country.id] + [a.id for a in country_ancestors]
    src_by_key = await _load_sources(session, src_ids)

    # cost_vs_israel is a macro/country index — meaningless at the city level, where the
    # cost language is absolute ₪ (daily_budget / price_night). Drop it from the
    # destination payload so a city never carries the (possibly inherited) country index.
    items = []
    for c in children:
        payload = _build_payload(c, ancestors_for_child, src_by_key)
        payload.pop("cost_vs_israel", None)
        payload["provenance"].pop("cost_vs_israel", None)
        items.append(payload)
    total = len(items)
    if offset or limit is not None:
        items = items[offset : (offset + limit) if limit is not None else None]

    return {
        "country": {
            "ref": country.iso3 or country.slug,
            "slug": country.slug,
            "name_he": country.name_he,
            "name_en": country.name_en,
            "iso3": country.iso3,
        },
        "total": total,
        "offset": offset,
        "destinations": items,
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
        # Reuse the shared template assembly (same shape as GET /{ref}) per place.
        ancestors = await _load_ancestors(session, place)
        place_ids = [place.id, *(a.id for a in ancestors)]
        src_by_key = await _load_sources(session, place_ids)
        details.append(_build_payload(place, ancestors, src_by_key))
    return details


@router.get("/{ref}")
async def get_place(
    ref: str, session: AsyncSession = Depends(get_session)
) -> dict:
    place = await _resolve_place(session, ref)
    if place is None:
        raise HTTPException(status_code=404, detail=f"place not found: {ref!r}")

    ancestors = await _load_ancestors(session, place)
    place_ids = [place.id, *(a.id for a in ancestors)]
    src_by_key = await _load_sources(session, place_ids)
    payload = _build_payload(place, ancestors, src_by_key)

    # Drill affordance: tell the country card whether it has destinations to reveal.
    if place.level == Level.country:
        payload["destination_count"] = (
            await session.execute(
                select(func.count())
                .select_from(Place)
                .where(Place.parent_id == place.id, Place.level == Level.city)
            )
        ).scalar_one()

    return payload
