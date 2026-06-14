"""Backbone source: mledoze/countries static JSON.

Pure `parse_countries(raw)` turns the dataset into CountryRecords; `fetch_*` does network.
"""

import re
import unicodedata
from dataclasses import dataclass

from app.loaders.http import get_json

COUNTRIES_URL = (
    "https://raw.githubusercontent.com/mledoze/countries/master/countries.json"
)
SOURCE_URL = COUNTRIES_URL
SOURCE_NOTE_NAME = "mledoze/countries name.common"
SOURCE_NOTE_GEO = "mledoze/countries country centroid (latlng)"


@dataclass(frozen=True)
class CountryRecord:
    cca2: str
    cca3: str
    name_en: str
    slug: str
    lat: float
    lng: float
    region: str


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s


def normalize_name(name: str) -> str:
    """Loose key for matching names across sources (visa table <-> dataset)."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = s.lower().strip()
    s = re.sub(r"^the\s+", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def fetch_countries_raw() -> list:
    return get_json(COUNTRIES_URL)


def parse_countries(raw: list, un_members_only: bool = True) -> list[CountryRecord]:
    out: list[CountryRecord] = []
    for c in raw:
        if un_members_only and not c.get("unMember"):
            continue
        latlng = c.get("latlng") or []
        if len(latlng) != 2:
            continue
        name_en = c["name"]["common"]
        out.append(
            CountryRecord(
                cca2=c["cca2"],
                cca3=c["cca3"],
                name_en=name_en,
                slug=slugify(name_en),
                lat=float(latlng[0]),
                lng=float(latlng[1]),
                region=c.get("region", ""),
            )
        )
    return out


def build_name_index(raw: list) -> dict[str, str]:
    """normalized-name -> cca2, from common/official/altSpellings (for visa matching)."""
    idx: dict[str, str] = {}
    for c in raw:
        cca2 = c["cca2"]
        names = [c["name"]["common"], c["name"].get("official", "")]
        names += c.get("altSpellings", [])
        for n in names:
            if n:
                idx.setdefault(normalize_name(n), cca2)
    return idx
