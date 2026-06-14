"""Macro seed orchestrator: continents + ~195 countries.

Split into a PURE `assemble()` (deterministic, no network/DB — unit-tested) and an
async `apply()` that idempotently upserts into Postgres. Re-running updates rows
(places keyed by iso2 / continents by slug; field_source upserted per place+field).

Usage:
    python -m app.loaders.seed_countries                 # full ~195 (UN members)
    python -m app.loaders.seed_countries JP TH GE IT US AE GR VN   # sample only
"""

import asyncio
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.loaders import cost_src, countries_src, names_he, visa_src
from app.loaders.countries_src import CountryRecord, normalize_name, slugify
from app.loaders.geo import flight_from_tlv_minutes
from app.models.enums import EnrichmentStatus, Level
from app.models.place import Place
from app.models.provenance import FieldSource

Provenance = tuple[str, str | None, str]  # (field_name, source_url, note)


@dataclass(frozen=True)
class ContinentPlan:
    slug: str
    name_en: str
    name_he: str | None


@dataclass
class CountryPlan:
    cca2: str
    region: str
    slug: str
    name_en: str
    name_he: str | None
    lat: float
    lng: float
    cost_vs_israel: int | None
    visa_required: bool | None
    visa_note: str | None
    flight_minutes: int
    provenance: list[Provenance] = field(default_factory=list)


@dataclass
class SeedPlan:
    continents: list[ContinentPlan]
    countries: list[CountryPlan]


def assemble(
    records: list[CountryRecord],
    cost_by_iso3: dict[str, tuple[int, int]],
    visa_by_norm: dict[str, tuple[bool, str]],
    sample_cca2: list[str] | None = None,
) -> SeedPlan:
    """Build the deterministic seed plan. Pure: no network, no DB."""
    if sample_cca2:
        want = {c.upper() for c in sample_cca2}
        records = [r for r in records if r.cca2.upper() in want]

    # continents (deduped by region), in stable first-seen order
    seen: dict[str, ContinentPlan] = {}
    for r in records:
        if r.region and r.region not in seen:
            seen[r.region] = ContinentPlan(
                slug=slugify(r.region),
                name_en=r.region,
                name_he=names_he.hebrew_continent_name(r.region),
            )
    continents = list(seen.values())

    countries: list[CountryPlan] = []
    for r in sorted(records, key=lambda x: x.cca2):
        name_he = names_he.hebrew_country_name(r.cca2)
        cost = cost_by_iso3.get(r.cca3)
        visa = visa_by_norm.get(normalize_name(r.name_en))
        flight = flight_from_tlv_minutes(r.lat, r.lng)

        prov: list[Provenance] = [
            ("name_en", countries_src.SOURCE_URL, countries_src.SOURCE_NOTE_NAME),
            ("name_he", None, names_he.SOURCE_NOTE),
            ("geo", countries_src.SOURCE_URL, countries_src.SOURCE_NOTE_GEO),
            ("flight_from_tlv_minutes", None, "computed: haversine TLV->country centroid"),
        ]
        cost_val = None
        if cost:
            cost_val, cost_year = cost
            prov.append(("cost_vs_israel", cost_src.SOURCE_URL, cost_src.cost_note(cost_year)))
        visa_required = visa_note = None
        if visa:
            visa_required, visa_note = visa
            prov.append(
                ("visa_israeli_required", visa_src.SOURCE_URL, f"Wikipedia: {visa_note}")
            )

        countries.append(
            CountryPlan(
                cca2=r.cca2,
                region=r.region,
                slug=r.slug,
                name_en=r.name_en,
                name_he=name_he,
                lat=r.lat,
                lng=r.lng,
                cost_vs_israel=cost_val,
                visa_required=visa_required,
                visa_note=visa_note,
                flight_minutes=flight,
                provenance=prov,
            )
        )
    return SeedPlan(continents=continents, countries=countries)


async def _upsert_by(session, key_field: str, key_value, fields: dict) -> Place:
    existing = (
        await session.execute(
            select(Place).where(getattr(Place, key_field) == key_value)
        )
    ).scalar_one_or_none()
    if existing:
        for k, v in fields.items():
            setattr(existing, k, v)
        place = existing
    else:
        place = Place(**{key_field: key_value}, **fields)
        session.add(place)
    await session.flush()
    return place


async def _set_field_source(session, place_id, field_name, source_url, note, fetched_at):
    existing = (
        await session.execute(
            select(FieldSource).where(
                FieldSource.place_id == place_id,
                FieldSource.field_name == field_name,
            )
        )
    ).scalars().first()
    if existing:
        existing.source_url = source_url
        existing.note = note
        existing.fetched_at = fetched_at
    else:
        session.add(
            FieldSource(
                place_id=place_id,
                field_name=field_name,
                source_url=source_url,
                note=note,
                fetched_at=fetched_at,
            )
        )


async def apply(plan: SeedPlan) -> dict:
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as session:
        # continents first -> region -> place.id
        region_id: dict[str, object] = {}
        for cont in plan.continents:
            p = await _upsert_by(
                session,
                "slug",
                cont.slug,
                dict(
                    level=Level.continent,
                    name_he=cont.name_he or cont.name_en,
                    name_en=cont.name_en,
                    enrichment_status=EnrichmentStatus.enriched,
                ),
            )
            region_id[cont.name_en] = p.id

        for c in plan.countries:
            p = await _upsert_by(
                session,
                "iso2",
                c.cca2,
                dict(
                    level=Level.country,
                    parent_id=region_id.get(c.region),
                    name_he=c.name_he or c.name_en,
                    name_en=c.name_en,
                    slug=c.slug,
                    lat=c.lat,
                    lng=c.lng,
                    cost_vs_israel=c.cost_vs_israel,
                    visa_israeli_required=c.visa_required,
                    visa_note=c.visa_note,
                    flight_from_tlv_minutes=c.flight_minutes,
                    enrichment_status=EnrichmentStatus.partial,
                ),
            )
            for field_name, url, note in c.provenance:
                await _set_field_source(session, p.id, field_name, url, note, now)

        await session.commit()
    return {"continents": len(plan.continents), "countries": len(plan.countries)}


async def main(sample_cca2: list[str] | None) -> None:
    print("Fetching sources…")
    raw_countries = countries_src.fetch_countries_raw()
    records = countries_src.parse_countries(raw_countries, un_members_only=True)
    ppp = cost_src.fetch_series(cost_src.PPP_INDICATOR)
    fcrf = cost_src.fetch_series(cost_src.FCRF_INDICATOR)
    cost_by_iso3 = cost_src.compute_cost_vs_israel(ppp, fcrf)
    visa_by_norm = visa_src.parse_visa(visa_src.fetch_visa_html())
    print(
        f"  countries={len(records)} cost={len(cost_by_iso3)} visa={len(visa_by_norm)}"
    )

    plan = assemble(records, cost_by_iso3, visa_by_norm, sample_cca2=sample_cca2)
    result = await apply(plan)
    print(f"Seeded: {result}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a.strip()]
    asyncio.run(main(args or None))
