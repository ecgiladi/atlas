"""Hebrew names from the Unicode CLDR via babel (authoritative localization)."""

from babel import Locale

_HE = Locale("he")

SOURCE_NOTE = "Unicode CLDR via babel (locale he)"

# mledoze region -> CLDR continent territory code
_REGION_TO_CODE = {
    "Africa": "002",
    "Americas": "019",
    "Asia": "142",
    "Europe": "150",
    "Oceania": "009",
    "Antarctic": "010",
}

# CLDR has no he label for Antarctica ('010'); fallback for completeness.
_CONTINENT_HE_FALLBACK = {"Antarctic": "אנטארקטיקה"}


def hebrew_country_name(cca2: str) -> str | None:
    return _HE.territories.get(cca2.upper())


def hebrew_continent_name(region: str) -> str | None:
    code = _REGION_TO_CODE.get(region)
    if code:
        name = _HE.territories.get(code)
        if name:
            return name
    return _CONTINENT_HE_FALLBACK.get(region)
