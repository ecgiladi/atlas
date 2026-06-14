"""Loader parser units — pure, no network. Plus an assemble() idempotency/dedup test."""

from app.loaders.cost_src import compute_cost_vs_israel
from app.loaders.countries_src import parse_countries, slugify
from app.loaders.geo import flight_from_tlv_minutes
from app.loaders.seed_countries import assemble
from app.loaders.visa_src import classify_visa_status, parse_visa
from app.models.enums import VisaStatus


# --- geo ---
def test_flight_minutes_reasonable():
    # Tokyo is far (~9000 km) -> ~11-13h
    tokyo = flight_from_tlv_minutes(35.68, 139.65)
    assert 650 < tokyo < 850
    # a point at TLV itself -> just the fixed overhead
    assert flight_from_tlv_minutes(32.0114, 34.8867) == 30


# --- visa classification ---
def test_classify_visa_status():
    assert classify_visa_status("Visa not required") is VisaStatus.visa_free
    assert classify_visa_status("Visa-free") is VisaStatus.visa_free
    assert classify_visa_status("Visa on arrival") is VisaStatus.voa
    assert classify_visa_status("eVisa") is VisaStatus.eta_evisa
    assert classify_visa_status("eTA") is VisaStatus.eta_evisa
    assert classify_visa_status("Visa Waiver Program") is VisaStatus.eta_evisa  # ESTA
    assert classify_visa_status("Visa required") is VisaStatus.visa_required
    assert classify_visa_status("Admission refused") is VisaStatus.visa_required
    assert classify_visa_status("Some unknown phrasing") is VisaStatus.visa_required


def test_classify_visa_combo_picks_easiest():
    # combo cell -> easiest available (eVisa easier than VoA per ordinal)
    assert classify_visa_status("Visa on arrival / eVisa") is VisaStatus.eta_evisa
    assert classify_visa_status("Visa on arrival; visa required") is VisaStatus.voa


_VISA_HTML = """
<table class="wikitable sortable">
<tr><th>Country</th><th>Visa requirement</th><th>Allowed stay</th><th>Notes</th></tr>
<tr><td>Japan</td><td>Visa not required <sup>[1]</sup></td><td>90 days</td><td>x</td></tr>
<tr><td>Thailand</td><td>Visa required <sup>[2]</sup></td><td></td><td>y</td></tr>
<tr><td>United States</td><td>eVisa <sup>[3]</sup></td><td>90 days</td><td>ESTA</td></tr>
</table>
"""


def test_parse_visa_strips_refs_and_classifies():
    out = parse_visa(_VISA_HTML)
    assert out["japan"] == (VisaStatus.visa_free, "Visa not required — 90 days")
    assert out["thailand"][0] is VisaStatus.visa_required
    assert out["united states"][0] is VisaStatus.eta_evisa  # eVisa
    assert "[" not in out["japan"][1]  # footnotes stripped


# --- countries backbone ---
_COUNTRIES = [
    {"name": {"common": "Japan", "official": "Japan"}, "cca2": "JP", "cca3": "JPN",
     "latlng": [36, 138], "region": "Asia", "unMember": True, "altSpellings": ["JP"]},
    {"name": {"common": "Some Territory", "official": "T"}, "cca2": "XT", "cca3": "XTT",
     "latlng": [0, 0], "region": "Oceania", "unMember": False, "altSpellings": []},
]


def test_parse_countries_filters_un_members():
    recs = parse_countries(_COUNTRIES, un_members_only=True)
    assert [r.cca2 for r in recs] == ["JP"]
    assert recs[0].slug == "japan"
    assert recs[0].lat == 36.0 and recs[0].region == "Asia"


def test_slugify():
    assert slugify("United Arab Emirates") == "united-arab-emirates"
    assert slugify("Côte d'Ivoire") == "cote-d-ivoire"


# --- cost rebase ---
def test_compute_cost_vs_israel_rebases():
    ppp = {"ISR": {2024: 3.5}, "USA": {2024: 1.0}, "JPN": {2024: 94.0}}
    fcrf = {"ISR": {2024: 3.7}, "USA": {2024: 1.0}, "JPN": {2024: 151.0}}
    out = compute_cost_vs_israel(ppp, fcrf)
    assert out["ISR"][0] == 100
    isr_ratio = 3.5 / 3.7
    assert out["USA"][0] == round(1.0 / isr_ratio * 100)
    assert out["JPN"][1] == 2024  # year carried


def test_compute_cost_picks_latest_common_year():
    ppp = {"ISR": {2020: 3.5, 2024: 3.6}, "X": {2019: 2.0, 2024: 2.1}}
    fcrf = {"ISR": {2020: 3.7, 2024: 3.8}, "X": {2019: 2.0, 2023: 9.9}}
    out = compute_cost_vs_israel(ppp, fcrf)
    assert out["X"][1] == 2019  # only common year for X


# --- assemble idempotency / dedup ---
def _recs():
    return parse_countries([
        {"name": {"common": "Japan"}, "cca2": "JP", "cca3": "JPN", "latlng": [36, 138],
         "region": "Asia", "unMember": True},
        {"name": {"common": "Thailand"}, "cca2": "TH", "cca3": "THA", "latlng": [15, 100],
         "region": "Asia", "unMember": True},
        {"name": {"common": "Italy"}, "cca2": "IT", "cca3": "ITA", "latlng": [42, 12],
         "region": "Europe", "unMember": True},
    ])


def test_assemble_dedups_continents_and_is_deterministic():
    cost = {"JPN": (66, 2024)}
    visa = {"JP": (VisaStatus.visa_free, "Visa not required")}  # keyed by cca2
    p1 = assemble(_recs(), cost, visa)
    p2 = assemble(_recs(), cost, visa)
    # 2 continents (Asia once, Europe once) despite 2 Asian countries
    assert {c.slug for c in p1.continents} == {"asia", "europe"}
    assert len(p1.continents) == 2
    # deterministic
    assert [c.cca2 for c in p1.countries] == [c.cca2 for c in p2.countries]
    # provenance attached; cost/visa only where data exists
    jp = next(c for c in p1.countries if c.cca2 == "JP")
    fields = {f for f, _u, _n in jp.provenance}
    assert {"name_en", "name_he", "geo", "flight_from_tlv_minutes",
            "cost_vs_israel", "visa_status"} <= fields
    th = next(c for c in p1.countries if c.cca2 == "TH")
    assert th.cost_vs_israel is None  # no cost fixture for THA
    assert not any(f == "cost_vs_israel" for f, _u, _n in th.provenance)


def test_assemble_sample_filter():
    plan = assemble(_recs(), {}, {}, sample_cca2=["JP"])
    assert [c.cca2 for c in plan.countries] == ["JP"]
    assert {c.slug for c in plan.continents} == {"asia"}  # only Japan's continent
