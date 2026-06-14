"""visa_status from Wikipedia "Visa requirements for Israeli citizens".

Pure `parse_visa(html)` -> {normalized_country_name: (VisaStatus, note: str)};
`classify_visa_status(status)` maps the (color-coded) Wikipedia categories to the
ordinal `VisaStatus`, picking the EASIEST available option for combo cells.
"""

import re

from app.loaders.http import get_text
from app.models.enums import VISA_STATUS_EASE, VisaStatus

WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_PAGE = "Visa_requirements_for_Israeli_citizens"
SOURCE_URL = "https://en.wikipedia.org/wiki/Visa_requirements_for_Israeli_citizens"

# Category detectors, checked independently so a combo cell yields multiple matches.
_VISA_FREE = ("visa not required", "visa-free", "visa free", "freedom of movement")
_VOA = ("on arrival",)
_ETA_EVISA = ("evisa", "e-visa", "eta", "e-ta", "esta", "electronic", "visa waiver")
_VISA_REQUIRED = ("visa required",)
_REFUSED = ("admission refused", "banned", "no admission")


def classify_visa_status(status: str) -> VisaStatus:
    """Map a Wikipedia status cell to the easiest applicable VisaStatus."""
    s = status.lower()
    matched: list[VisaStatus] = []
    if any(k in s for k in _VISA_FREE):
        matched.append(VisaStatus.visa_free)
    if any(k in s for k in _VOA):
        matched.append(VisaStatus.voa)
    # "eta" must be a whole word (avoid matching inside other words); others substring.
    if re.search(r"\beta\b", s) or any(k in s for k in _ETA_EVISA if k != "eta"):
        matched.append(VisaStatus.eta_evisa)
    if any(k in s for k in _VISA_REQUIRED) or any(k in s for k in _REFUSED):
        matched.append(VisaStatus.visa_required)

    if not matched:
        return VisaStatus.visa_required  # unknown phrasing -> safest (hardest)
    return min(matched, key=lambda v: VISA_STATUS_EASE[v])


def _clean_cell(cell) -> str:
    # Drop footnote <sup> references before extracting text.
    for sup in cell.select("sup"):
        sup.decompose()
    return cell.get_text(" ", strip=True)


def parse_visa(html: str) -> dict[str, tuple[bool, str]]:
    from bs4 import BeautifulSoup

    from app.loaders.countries_src import normalize_name

    soup = BeautifulSoup(html, "lxml")
    result: dict[str, tuple[bool, str]] = {}
    for table in soup.select("table.wikitable"):
        rows = table.select("tr")
        if not rows:
            continue
        header = [th.get_text(" ", strip=True).lower() for th in rows[0].select("th")]
        if not header or "country" not in header[0]:
            continue  # not the visa table
        for r in rows[1:]:
            cells = r.find_all(["td", "th"])
            if len(cells) < 2:
                continue
            country = _clean_cell(cells[0])
            status = _clean_cell(cells[1])
            if not country or not status:
                continue
            allowed = _clean_cell(cells[2]) if len(cells) > 2 else ""
            note = f"{status} — {allowed}".strip(" —") if allowed else status
            result[normalize_name(country)] = (classify_visa_status(status), note)
    return result


def fetch_visa_html() -> str:
    """Fetch the rendered HTML of the visa page via the MediaWiki action API."""
    import json

    raw = get_text(
        WIKI_API,
        params={
            "action": "parse",
            "page": WIKI_PAGE,
            "prop": "text",
            "format": "json",
            "formatversion": "2",
        },
    )
    return json.loads(raw)["parse"]["text"]
