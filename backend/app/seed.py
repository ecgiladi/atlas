"""Smoke-test seed: one place per level + provenance demo.

continent=אסיה > country=יפן > city=טוקיו > site=מקדש סנסו-ג'י

The country (יפן) carries the baseline facts (visa / flight-from-TLV / safety / cost);
the city and site are intentionally light so inheritance has something to resolve.

Run (once the DB exists and the migration is applied):
    python -m app.seed
Idempotent: re-running upserts by slug.
"""

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.enums import (
    Climate,
    EnrichmentStatus,
    FlightPriceBand,
    Level,
    SafetyLevel,
    SiteType,
    TimeOfDay,
    VisaStatus,
)
from app.models.place import Place
from app.models.provenance import FieldSource


async def _upsert(session, **kwargs) -> Place:
    slug = kwargs["slug"]
    existing = (
        await session.execute(select(Place).where(Place.slug == slug))
    ).scalar_one_or_none()
    if existing:
        for k, v in kwargs.items():
            setattr(existing, k, v)
        return existing
    place = Place(**kwargs)
    session.add(place)
    await session.flush()
    return place


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        asia = await _upsert(
            session,
            level=Level.continent,
            slug="asia",
            name_he="אסיה",
            name_en="Asia",
            enrichment_status=EnrichmentStatus.enriched,
        )

        japan = await _upsert(
            session,
            level=Level.country,
            parent_id=asia.id,
            slug="japan",
            name_he="יפן",
            name_en="Japan",
            lat=36.2,
            lng=138.25,
            # baseline country facts — these inherit downward to Tokyo / Senso-ji
            season_best_months=[3, 4, 10, 11],
            climate=Climate.temperate,
            cost_vs_israel=130,
            flight_from_tlv_minutes=780,
            flight_direct=False,
            flight_price_band=FlightPriceBand.high,
            visa_status=VisaStatus.visa_free,
            visa_note="פטור מויזה לישראלים עד 90 יום",
            safety_level=SafetyLevel.very_safe,
            language_barrier=4,
            culture_section="כבוד, דיוק וטקסיות; נעליים בחוץ, שקט בתחבורה הציבורית.",
            history_context="איחוד תחת השוגונות, רסטורציית מייג'י, יפן המודרנית.",
            enrichment_status=EnrichmentStatus.enriched,
        )

        tokyo = await _upsert(
            session,
            level=Level.city,
            parent_id=japan.id,
            slug="tokyo",
            name_he="טוקיו",
            name_en="Tokyo",
            lat=35.6762,
            lng=139.6503,
            # light: inherits visa / flight / safety / cost from Japan; overrides cost
            price_night=420,
            price_meal=55,
            cost_vs_israel=145,
            good_for=["food", "city", "shopping", "culture"],
            character_touristy_authentic=3,
            character_busy_quiet=1,
            enrichment_status=EnrichmentStatus.partial,
        )

        senso = await _upsert(
            session,
            level=Level.site_or_route,
            parent_id=tokyo.id,
            slug="senso-ji",
            name_he="מקדש סנסו-ג'י",
            name_en="Senso-ji Temple",
            lat=35.7148,
            lng=139.7967,
            site_type=SiteType.historical,
            visit_minutes=90,
            ticket_price=0,
            best_time_of_day=TimeOfDay.morning,
            good_for=["culture"],
            enrichment_status=EnrichmentStatus.enriched,
        )

        # provenance demo: cite where Tokyo's cost figure came from
        cost_src = (
            await session.execute(
                select(FieldSource).where(
                    FieldSource.place_id == tokyo.id,
                    FieldSource.field_name == "cost_vs_israel",
                )
            )
        ).scalar_one_or_none()
        if cost_src is None:
            session.add(
                FieldSource(
                    place_id=tokyo.id,
                    field_name="cost_vs_israel",
                    source_url="https://www.numbeo.com/cost-of-living/in/Tokyo",
                    fetched_at=datetime(2026, 6, 14, tzinfo=timezone.utc),
                    note="Numbeo cost-of-living index, normalized to Israel=100",
                )
            )

        await session.commit()
        print(
            f"Seeded: {asia.name_en} > {japan.name_en} > {tokyo.name_en} > {senso.name_en}"
        )


if __name__ == "__main__":
    asyncio.run(seed())
