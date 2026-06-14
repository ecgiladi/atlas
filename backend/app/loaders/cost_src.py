"""cost_vs_israel from World Bank WDI.

The named indicator PA.NUS.PPPC.RF (price level ratio of PPP conversion factor (GDP)
to market exchange rate) is ARCHIVED and no longer served by the data API. It is by
definition PPP-conversion-factor / market-exchange-rate, so we reconstruct it from the
two current WDI indicators and rebase to Israel = 100:

    ratio(country)        = PA.NUS.PPP / PA.NUS.FCRF      (US == 1.0)
    cost_vs_israel(country) = round(ratio(country) / ratio(Israel) * 100)

This is a GDP-level (economy-wide) proxy — coarse for traveler cost, fine for the macro
choropleth/sort.
"""

from app.loaders.http import get_json

PPP_INDICATOR = "PA.NUS.PPP"  # PPP conversion factor, GDP (LCU per international $)
FCRF_INDICATOR = "PA.NUS.FCRF"  # Official exchange rate (LCU per US$, period avg)
ISRAEL_ISO3 = "ISR"

# Cited as the conceptual indicator the value reconstructs.
SOURCE_URL = "https://data.worldbank.org/indicator/PA.NUS.PPPC.RF"

_BASE = "https://api.worldbank.org/v2/country/all/indicator/{ind}"


def fetch_series(indicator: str, date_range: str = "2010:2025") -> dict[str, dict[int, float]]:
    """{iso3: {year: value}} for an indicator, paginating the WB API."""
    out: dict[str, dict[int, float]] = {}
    page = 1
    while True:
        d = get_json(
            _BASE.format(ind=indicator),
            params={"format": "json", "per_page": 20000, "date": date_range, "page": page},
        )
        meta = d[0]
        for e in d[1] or []:
            if e["value"] is None:
                continue
            iso3 = e.get("countryiso3code")
            if not iso3:
                continue
            out.setdefault(iso3, {})[int(e["date"])] = float(e["value"])
        if page >= int(meta.get("pages", 1)):
            break
        page += 1
    return out


def _latest_common_year(a: dict[int, float], b: dict[int, float]) -> int | None:
    common = sorted(set(a) & set(b), reverse=True)
    return common[0] if common else None


def compute_cost_vs_israel(
    ppp: dict[str, dict[int, float]],
    fcrf: dict[str, dict[int, float]],
) -> dict[str, tuple[int, int]]:
    """{iso3: (cost_vs_israel:int, year:int)}. Pure — no network."""
    isr_year = _latest_common_year(ppp.get(ISRAEL_ISO3, {}), fcrf.get(ISRAEL_ISO3, {}))
    if isr_year is None:
        raise ValueError("No common-year PPP/FCRF data for Israel — cannot rebase")
    isr_ratio = ppp[ISRAEL_ISO3][isr_year] / fcrf[ISRAEL_ISO3][isr_year]

    out: dict[str, tuple[int, int]] = {}
    for iso3 in set(ppp) & set(fcrf):
        year = _latest_common_year(ppp[iso3], fcrf[iso3])
        if year is None:
            continue
        fx = fcrf[iso3][year]
        if not fx:
            continue
        ratio = ppp[iso3][year] / fx
        out[iso3] = (round(ratio / isr_ratio * 100), year)
    return out


def cost_note(year: int) -> str:
    return (
        "World Bank WDI; price-level ratio = PA.NUS.PPP / PA.NUS.FCRF "
        f"(reconstructs archived PA.NUS.PPPC.RF); rebased Israel=100; year={year}"
    )
