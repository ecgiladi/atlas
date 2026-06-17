"""Seed Italy's classic destinations — the first drill-down slice (UX proof of the funnel).

Italy already exists as a country (macro seed). This adds ~12 destination-tier children
(level=city; site_type='natural' marks natural areas vs cities), ranked classic-first via
classic_rank, each with a region grouping LABEL, geo (for pins), a short character blurb
(culture_section), and the destination axes (cost / season / character / good_for).

CITY COST is absolute ₪, NOT the cost_vs_israel index (an index is a macro/country tool,
meaningless at city level — the destinations endpoint drops it from the payload):
  - daily_budget (₪/day living spend) + price_night (₪/night lodging) are soft ESTIMATES
    -> field_source note tagged "הערכה" (no source_url; future: Numbeo / Booking).
  - flight_from_tlv_minutes is RECOMPUTED per-city via haversine TLV->city coords (refining
    the coarse country-centroid macro number) -> note "computed" (renders "חושב").
  - flight_price_band is a soft ESTIMATE -> "הערכה" (future: Google Flights).

PROVENANCE is written honestly even for seed data:
  - season / character / good_for are editorial estimates -> "הערכה".
  - unknowns are left NULL (render as no-data; never fabricated — e.g. Tuscany's ₪ figures).

Idempotent: upserts destinations by slug and field_source by (place_id, field_name).
Run:  python -m app.seed_italy   (after `alembic upgrade head`)
"""

import asyncio
from datetime import datetime, timezone

from sqlalchemy import delete, select

from app.database import AsyncSessionLocal
from app.loaders.geo import flight_from_tlv_minutes
from app.models.enums import EnrichmentStatus, FlightPriceBand, Level, SiteType
from app.models.place import Place
from app.models.provenance import FieldSource

SEEDED_AT = datetime(2026, 6, 15, tzinfo=timezone.utc)
EST = "הערכה"  # marks a soft/estimated value (no documented source)

NORTH, CENTRAL, SOUTH = "צפון איטליה", "מרכז איטליה", "דרום איטליה"

# Ordered classic-first (classic_rank = position). site_type=None -> city; "natural" -> area.
# ₪ estimates: daily = daily living spend (food + local transport + incidentals, excl. lodging),
# night = lodging/night. Honest spread — Rome/Venice/Amalfi high, Naples/Sicily low. NULL where
# genuinely fuzzy (Tuscany, a broad rural region). band = flight price band (all mid from TLV).
DESTINATIONS = [
    {
        "slug": "rome", "name_he": "רומא", "name_en": "Rome", "lat": 41.9028, "lng": 12.4964,
        "region": CENTRAL, "site_type": None, "daily": 320, "night": 520, "band": FlightPriceBand.mid,
        "season": [4, 5, 9, 10], "touristy": 2, "busy": 1, "good_for": ["city", "culture", "food"],
        "blurb": "בירת האימפריה — קולוסיאום, הוותיקן, פיאצות ומזרקות. עיר־מוזיאון חיה.",
    },
    {
        "slug": "florence", "name_he": "פירנצה", "name_en": "Florence", "lat": 43.7696, "lng": 11.2558,
        "region": CENTRAL, "site_type": None, "daily": 300, "night": 480, "band": FlightPriceBand.mid,
        "season": [4, 5, 9, 10], "touristy": 2, "busy": 2, "good_for": ["city", "culture", "food"],
        "blurb": "ערש הרנסאנס — האופיצי, הדואומו ואמנות בכל פינה.",
    },
    {
        "slug": "venice", "name_he": "ונציה", "name_en": "Venice", "lat": 45.4408, "lng": 12.3155,
        "region": NORTH, "site_type": None, "daily": 360, "night": 600, "band": FlightPriceBand.mid,
        "season": [4, 5, 6, 9], "touristy": 1, "busy": 1, "good_for": ["city", "culture", "couples"],
        "blurb": "עיר התעלות — גונדולות, כיכר סן מרקו וסמטאות ללא מכוניות.",
    },
    {
        "slug": "amalfi-coast", "name_he": "חוף אמאלפי", "name_en": "Amalfi Coast", "lat": 40.6340, "lng": 14.6029,
        "region": SOUTH, "site_type": SiteType.natural, "daily": 340, "night": 620, "band": FlightPriceBand.mid,
        "season": [5, 6, 9], "touristy": 2, "busy": 2, "good_for": ["beach", "couples", "nature"],
        "blurb": "מצוקים, כפרים צבעוניים וים טורקיז לאורך החוף הדרומי.",
    },
    {
        "slug": "cinque-terre", "name_he": "צ'ינקווה טרה", "name_en": "Cinque Terre", "lat": 44.1280, "lng": 9.7110,
        "region": NORTH, "site_type": SiteType.natural, "daily": 300, "night": 520, "band": FlightPriceBand.mid,
        "season": [5, 6, 9], "touristy": 2, "busy": 2, "good_for": ["hiking", "nature", "couples"],
        "blurb": "חמישה כפרי דייגים תלויים על מצוקים, מחוברים בשבילי הליכה.",
    },
    {
        "slug": "tuscany", "name_he": "טוסקנה", "name_en": "Tuscany", "lat": 43.40, "lng": 11.40,
        "region": CENTRAL, "site_type": SiteType.natural, "daily": None, "night": None, "band": FlightPriceBand.mid,
        "season": [5, 6, 9, 10], "touristy": 4, "busy": 4, "good_for": ["nature", "food", "couples"],
        "blurb": "גבעות, כרמים וכפרים מבוצרים — לב הכפר האיטלקי.",
    },
    {
        "slug": "milan", "name_he": "מילאנו", "name_en": "Milan", "lat": 45.4642, "lng": 9.1900,
        "region": NORTH, "site_type": None, "daily": 310, "night": 500, "band": FlightPriceBand.mid,
        "season": [4, 5, 9, 10], "touristy": 3, "busy": 1, "good_for": ["city", "shopping", "nightlife"],
        "blurb": "בירת האופנה והעיצוב — הדואומו, קניות ואדריכלות מודרנית.",
    },
    {
        "slug": "dolomites", "name_he": "הדולומיטים", "name_en": "Dolomites", "lat": 46.4102, "lng": 11.8440,
        "region": NORTH, "site_type": SiteType.natural, "daily": 300, "night": 480, "band": FlightPriceBand.mid,
        "season": [1, 2, 7, 8], "touristy": 4, "busy": 4, "good_for": ["hiking", "skiing", "nature"],
        "blurb": "פסגות סלע דרמטיות — טיולי הרים בקיץ וסקי בחורף.",
    },
    {
        "slug": "lake-como", "name_he": "אגם קומו", "name_en": "Lake Como", "lat": 45.9852, "lng": 9.2580,
        "region": NORTH, "site_type": SiteType.natural, "daily": 330, "night": 560, "band": FlightPriceBand.mid,
        "season": [5, 6, 9], "touristy": 3, "busy": 3, "good_for": ["nature", "couples"],
        "blurb": "אגם אלפיני מוקף וילות ועיירות אלגנטיות.",
    },
    {
        "slug": "naples", "name_he": "נאפולי", "name_en": "Naples", "lat": 40.8518, "lng": 14.2681,
        "region": SOUTH, "site_type": None, "daily": 220, "night": 340, "band": FlightPriceBand.mid,
        "season": [4, 5, 10], "touristy": 4, "busy": 1, "good_for": ["city", "food", "culture"],
        "blurb": "עיר סוערת ואותנטית — מולדת הפיצה, עם פומפיי והוזוב בקרבת מקום.",
    },
    {
        "slug": "sicily", "name_he": "סיציליה", "name_en": "Sicily", "lat": 37.60, "lng": 14.00,
        "region": SOUTH, "site_type": SiteType.natural, "daily": 210, "night": 320, "band": FlightPriceBand.mid,
        "season": [5, 6, 9, 10], "touristy": 4, "busy": 3, "good_for": ["beach", "food", "culture"],
        "blurb": "האי הגדול — האתנה, חופים, מקדשים יווניים ומטבח עשיר.",
    },
    {
        "slug": "verona", "name_he": "ורונה", "name_en": "Verona", "lat": 45.4384, "lng": 10.9916,
        "region": NORTH, "site_type": None, "daily": 280, "night": 440, "band": FlightPriceBand.mid,
        "season": [5, 6, 9], "touristy": 3, "busy": 3, "good_for": ["city", "culture", "couples"],
        "blurb": "עירם של רומיאו ויוליה — זירה רומית ומרכז היסטורי קסום.",
    },
]


async def _upsert_place(session, **kwargs) -> Place:
    existing = (
        await session.execute(select(Place).where(Place.slug == kwargs["slug"]))
    ).scalar_one_or_none()
    if existing:
        for k, v in kwargs.items():
            setattr(existing, k, v)
        return existing
    place = Place(**kwargs)
    session.add(place)
    await session.flush()
    return place


async def _upsert_source(session, place_id, field_name, *, note, source_url=None) -> None:
    """Idempotent field_source upsert keyed by (place_id, field_name)."""
    existing = (
        await session.execute(
            select(FieldSource).where(
                FieldSource.place_id == place_id, FieldSource.field_name == field_name
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.source_url = source_url
        existing.note = note
        existing.fetched_at = SEEDED_AT
        return
    session.add(
        FieldSource(
            place_id=place_id,
            field_name=field_name,
            source_url=source_url,
            fetched_at=SEEDED_AT,
            note=note,
        )
    )


async def seed_italy() -> None:
    async with AsyncSessionLocal() as session:
        italy = (
            await session.execute(select(Place).where(Place.iso3 == "ITA"))
        ).scalar_one_or_none()
        if italy is None:
            raise SystemExit("Italy (ITA) not found — run the macro country seed first.")

        for rank, d in enumerate(DESTINATIONS, start=1):
            # Flight TIME refined to the CITY's real coords (the macro number is a coarse
            # country-centroid figure) — always computable from lat/lng, so never NULL.
            flight_min = flight_from_tlv_minutes(d["lat"], d["lng"])
            place = await _upsert_place(
                session,
                slug=d["slug"],
                level=Level.city,
                parent_id=italy.id,
                name_he=d["name_he"],
                name_en=d["name_en"],
                lat=d["lat"],
                lng=d["lng"],
                site_type=d["site_type"],
                region_label=d["region"],
                classic_rank=rank,
                # cost_vs_israel is a macro/country index — left NULL at city level; the
                # destinations endpoint drops it entirely (city cost language is absolute ₪).
                cost_vs_israel=None,
                daily_budget=d["daily"],
                price_night=d["night"],
                flight_from_tlv_minutes=flight_min,
                flight_price_band=d["band"],
                season_best_months=d["season"],
                character_touristy_authentic=d["touristy"],
                character_busy_quiet=d["busy"],
                good_for=d["good_for"],
                culture_section=d["blurb"],
                enrichment_status=EnrichmentStatus.partial,
            )

            # provenance — honest even for seed. Estimates are tagged "הערכה" (no URL);
            # the recomputed flight time is "computed" (renders "חושב").
            if d["daily"] is not None:
                await _upsert_source(
                    session, place.id, "daily_budget",
                    note=f"{EST} — תקציב מחיה יומי (אוכל, תחבורה מקומית, הוצאות), ₪ ליום",
                )
            if d["night"] is not None:
                await _upsert_source(
                    session, place.id, "price_night",
                    note=f"{EST} — מחיר לינה ללילה, ₪",
                )
            await _upsert_source(
                session, place.id, "flight_from_tlv_minutes",
                note="computed: haversine TLV->city coords",
            )
            if d["band"] is not None:
                await _upsert_source(
                    session, place.id, "flight_price_band",
                    note=f"{EST} — טווח מחיר טיסה",
                )
            await _upsert_source(
                session, place.id, "season_best_months", note=f"{EST} — עונת ביקור מומלצת"
            )
            await _upsert_source(
                session, place.id, "character_touristy_authentic",
                note=f"{EST} — תיירותי מול אותנטי",
            )
            await _upsert_source(
                session, place.id, "character_busy_quiet", note=f"{EST} — עומס מול שקט"
            )
            await _upsert_source(
                session, place.id, "good_for", note=f"{EST} — אופי היעד"
            )
            # Drop any stale cost_vs_israel row from an earlier seed — the city index is
            # gone (cities speak absolute ₪ now). Inheritance still attributes cost to Italy.
            await session.execute(
                delete(FieldSource).where(
                    FieldSource.place_id == place.id,
                    FieldSource.field_name == "cost_vs_israel",
                )
            )

        await session.commit()
        print(f"Seeded {len(DESTINATIONS)} Italy destinations under {italy.name_en}.")


if __name__ == "__main__":
    asyncio.run(seed_italy())
