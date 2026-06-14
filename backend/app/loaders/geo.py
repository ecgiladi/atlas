"""Geo helpers — flight time computed from Ben Gurion to a destination."""

import math

# Ben Gurion Airport (TLV)
BEN_GURION_LAT = 32.0114
BEN_GURION_LNG = 34.8867

_EARTH_KM = 6371.0
# cruise model: ground-speed proxy + fixed taxi/climb/descent overhead
_CRUISE_KMH = 800.0
_OVERHEAD_MIN = 30.0


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * _EARTH_KM * math.asin(math.sqrt(a))


def flight_from_tlv_minutes(lat: float, lng: float) -> int:
    """Great-circle minutes ≈ km / 800 * 60 + 30. Rounded to int."""
    km = haversine_km(BEN_GURION_LAT, BEN_GURION_LNG, lat, lng)
    return round(km / _CRUISE_KMH * 60 + _OVERHEAD_MIN)
