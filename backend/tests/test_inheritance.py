"""Inheritance resolver tests — pure Python, no DB required.

Asserts that country-level facts (visa / flight-from-TLV / safety / cost) resolve onto
a light city, while the city's own values override.
"""

import uuid

from app.inheritance import resolve_inherited, resolved_values
from app.models.enums import FlightPriceBand, Level, SafetyLevel
from app.models.place import Place


def _make(level, **kw) -> Place:
    # Instantiate the ORM model in memory (no session/commit needed). The id default
    # only fires on insert, so set one explicitly to mirror a persisted row.
    return Place(id=uuid.uuid4(), level=level, **kw)


def _chain():
    asia = _make(Level.continent, slug="asia", name_he="אסיה", name_en="Asia")
    japan = _make(
        Level.country,
        slug="japan",
        name_he="יפן",
        name_en="Japan",
        cost_vs_israel=130,
        flight_from_tlv_minutes=780,
        flight_direct=False,
        flight_price_band=FlightPriceBand.high,
        visa_israeli_required=False,
        visa_note="פטור מויזה עד 90 יום",
        safety_level=SafetyLevel.very_safe,
        season_best_months=[3, 4, 10, 11],
    )
    tokyo = _make(
        Level.city,
        slug="tokyo",
        name_he="טוקיו",
        name_en="Tokyo",
        price_night=420,
        cost_vs_israel=145,  # overrides Japan's 130
    )
    return asia, japan, tokyo


def test_city_inherits_country_facts():
    asia, japan, tokyo = _chain()
    resolved = resolve_inherited(tokyo, [japan, asia])

    # inherited from the country (Tokyo had these null)
    assert resolved["flight_from_tlv_minutes"].value == 780
    assert resolved["flight_from_tlv_minutes"].source == str(japan.id)
    assert resolved["visa_israeli_required"].value is False
    assert resolved["safety_level"].value is SafetyLevel.very_safe
    assert resolved["season_best_months"].value == [3, 4, 10, 11]


def test_own_value_overrides_ancestor():
    asia, japan, tokyo = _chain()
    resolved = resolve_inherited(tokyo, [japan, asia])

    # Tokyo set its own cost — own wins over Japan's 130
    assert resolved["cost_vs_israel"].value == 145
    assert resolved["cost_vs_israel"].source == "own"
    assert resolved["price_night"].value == 420
    assert resolved["price_night"].source == "own"


def test_missing_everywhere_is_none():
    asia, japan, tokyo = _chain()
    resolved = resolve_inherited(tokyo, [japan, asia])

    # nobody set climate
    assert resolved["climate"].value is None
    assert resolved["climate"].source is None


def test_nearest_ancestor_wins():
    asia, japan, tokyo = _chain()
    # give the continent a safety value; the country's nearer value must win
    asia.safety_level = SafetyLevel.moderate
    resolved = resolve_inherited(tokyo, [japan, asia])
    assert resolved["safety_level"].value is SafetyLevel.very_safe
    assert resolved["safety_level"].source == str(japan.id)


def test_resolved_values_flat_view():
    asia, japan, tokyo = _chain()
    flat = resolved_values(tokyo, [japan, asia])
    assert flat["cost_vs_israel"] == 145
    assert flat["flight_from_tlv_minutes"] == 780
