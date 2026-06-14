"""visa_israeli_required from Wikipedia "Visa requirements for Israeli citizens".

Pure `parse_visa(html)` -> {normalized_country_name: (required: bool, note: str)};
`classify_visa_status(status)` maps the status text to the boolean.
"""

from app.loaders.http import get_text

WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_PAGE = "Visa_requirements_for_Israeli_citizens"
SOURCE_URL = "https://en.wikipedia.org/wiki/Visa_requirements_for_Israeli_citizens"

# Status phrases that mean "no visa to arrange in advance".
_NOT_REQUIRED = ("visa not required", "visa-free", "freedom of movement")
_ON_ARRIVAL = ("on arrival",)
# These require the traveler to arrange something (or entry is barred).
_REQUIRED_ADVANCE = ("evisa", "e-visa", "eta", "e-ta", "electronic", "visa required")
_REFUSED = ("admission refused", "banned", "no admission")


def classify_visa_status(status: str) -> bool:
    """True = a visa/authorization must be arranged (or entry refused); False = free entry."""
    s = status.lower()
    if any(k in s for k in _NOT_REQUIRED):
        return False
    if any(k in s for k in _ON_ARRIVAL):
        return False  # obtainable at the border, nothing to arrange beforehand
    if any(k in s for k in _REFUSED):
        return True
    if any(k in s for k in _REQUIRED_ADVANCE):
        return True
    # Unknown phrasing — default to "required" (safer for trip planning).
    return True


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
