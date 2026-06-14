"""Controlled vocabularies validated app-side on every write.

`good_for` stays a Postgres text[] (so filters can use array operators), but values are
restricted to this fixed list. Validation runs at the ORM layer (see Place.validates)
so EVERY write path — including the MICRO extraction pipeline — is covered, preventing
filter rot (e.g. "beach" vs "beaches").
"""

# Fixed tag list. Add deliberately; never let extraction invent new tags.
GOOD_FOR_TAGS: frozenset[str] = frozenset(
    {
        "beach",
        "hiking",
        "city",
        "food",
        "nightlife",
        "family",
        "couples",
        "culture",
        "nature",
        "diving",
        "skiing",
        "shopping",
    }
)


def validate_good_for(tags: list[str] | None) -> list[str] | None:
    """Return the tags unchanged if all are on-list; raise ValueError otherwise."""
    if tags is None:
        return None
    bad = [t for t in tags if t not in GOOD_FOR_TAGS]
    if bad:
        raise ValueError(
            f"good_for contains off-vocabulary tags: {bad}. "
            f"Allowed: {sorted(GOOD_FOR_TAGS)}"
        )
    return tags
