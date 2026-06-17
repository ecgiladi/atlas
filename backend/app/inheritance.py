"""Downward inheritance of place facts.

A child place (e.g. a city) stays light: where its own value is NULL, it inherits the
nearest non-null ancestor's value (city -> country -> continent). The child's own value
always wins. Identity, geo, free tags, character scales, and site-specific fields are
NOT inherited — they are place-specific.

This module is intentionally pure: it operates on any object exposing the attributes
below, so it can be unit-tested without a database or a session.
"""

from dataclasses import dataclass
from typing import Any, Iterable, Optional

# Fields that flow downward. These are the "baseline facts" of a country that a city or
# site can lean on (visa, flight-from-TLV, safety, cost, climate, language, season,
# culture/history context).
INHERITABLE_FIELDS: tuple[str, ...] = (
    "cost_vs_israel",
    "daily_budget",
    "price_night",
    "price_meal",
    "flight_from_tlv_minutes",
    "flight_direct",
    "flight_price_band",
    "visa_status",
    "visa_note",
    "safety_level",
    "climate",
    "language_barrier",
    "season_best_months",
    "culture_section",
    "history_context",
)


@dataclass
class ResolvedField:
    value: Any
    # "own" if the place itself supplied it, else the id of the ancestor it came from
    # (str(id) for portability), or None if nothing supplied it anywhere.
    source: Optional[str]


def resolve_inherited(
    place: Any, ancestors: Iterable[Any]
) -> dict[str, ResolvedField]:
    """Resolve inheritable fields for ``place``.

    Args:
        place: the place being resolved.
        ancestors: ordered nearest-first (e.g. [country, continent] for a city).

    Returns:
        ``{field_name: ResolvedField(value, source)}`` for every inheritable field.
    """
    ancestors = list(ancestors)
    resolved: dict[str, ResolvedField] = {}

    for field in INHERITABLE_FIELDS:
        own = getattr(place, field, None)
        if own is not None:
            resolved[field] = ResolvedField(value=own, source="own")
            continue

        inherited = ResolvedField(value=None, source=None)
        for ancestor in ancestors:
            anc_val = getattr(ancestor, field, None)
            if anc_val is not None:
                src = getattr(ancestor, "id", None)
                inherited = ResolvedField(
                    value=anc_val, source=str(src) if src is not None else "ancestor"
                )
                break
        resolved[field] = inherited

    return resolved


def resolved_values(place: Any, ancestors: Iterable[Any]) -> dict[str, Any]:
    """Flat ``{field: value}`` view — convenience for serialization."""
    return {k: rf.value for k, rf in resolve_inherited(place, ancestors).items()}
