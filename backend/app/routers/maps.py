"""Map data endpoints — country-level choropleth feed."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.enums import Level
from app.models.place import Place

router = APIRouter(prefix="/api/map", tags=["map"])


@router.get("/countries")
async def map_countries(session: AsyncSession = Depends(get_session)) -> list[dict]:
    """All countries with the metrics the choropleth encodes.

    The web client fetches this once and applies it via MapLibre feature-state,
    keyed by iso3 (== Natural Earth ISO_A3_EH). cost may be null (no World Bank
    data) — the client must render that as a distinct 'no data' color, never 0.
    """
    rows = (
        await session.execute(
            select(
                Place.iso3,
                Place.name_he,
                Place.visa_status,
                Place.visa_note,
                Place.cost_vs_israel,
                Place.flight_from_tlv_minutes,
            )
            .where(Place.level == Level.country, Place.iso3.is_not(None))
            .order_by(Place.name_he)
        )
    ).all()
    return [
        {
            "iso3": r.iso3,
            "name_he": r.name_he,
            "visa_status": r.visa_status.value if r.visa_status else None,
            "visa_note": r.visa_note,
            "cost_vs_israel": r.cost_vs_israel,
            "flight_from_tlv_minutes": r.flight_from_tlv_minutes,
        }
        for r in rows
    ]
