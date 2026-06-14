import enum


class Level(str, enum.Enum):
    """The spine. Comparison happens WITHIN a level only; facts inherit downward."""

    continent = "continent"
    country = "country"
    city = "city"
    site_or_route = "site_or_route"


class SiteType(str, enum.Enum):
    """Only meaningful when level == site_or_route. History is a site, not a level."""

    attraction = "attraction"
    historical = "historical"
    trail = "trail"
    viewpoint = "viewpoint"
    other = "other"


class Climate(str, enum.Enum):
    tropical = "tropical"
    arid = "arid"
    mediterranean = "mediterranean"
    temperate = "temperate"
    continental = "continental"
    polar = "polar"


class FlightPriceBand(str, enum.Enum):
    low = "low"
    mid = "mid"
    high = "high"


class SafetyLevel(str, enum.Enum):
    very_safe = "very_safe"
    safe = "safe"
    moderate = "moderate"
    caution = "caution"
    avoid = "avoid"


class TrailDifficulty(str, enum.Enum):
    easy = "easy"
    moderate = "moderate"
    hard = "hard"
    expert = "expert"


class TimeOfDay(str, enum.Enum):
    morning = "morning"
    midday = "midday"
    afternoon = "afternoon"
    evening = "evening"
    night = "night"
    any = "any"


class SavedStatus(str, enum.Enum):
    shortlist = "shortlist"
    want = "want"
    been = "been"


class EnrichmentStatus(str, enum.Enum):
    """Drives the on-demand micro-growth model + the 'enrich this stub' UI."""

    stub = "stub"
    partial = "partial"
    enriched = "enriched"


class VisaStatus(str, enum.Enum):
    """Ordinal ease gradient for the Israeli passport. Declaration order = ease order
    (easiest first); combos resolve to the easiest available option."""

    visa_free = "visa_free"  # not required / freedom of movement
    eta_evisa = "eta_evisa"  # ESTA / eVisa / eTA / electronic authorization (pre-trip)
    voa = "voa"  # visa on arrival
    visa_required = "visa_required"  # embassy visa in advance / admission refused


# ease rank for "pick the easiest available" combo resolution
VISA_STATUS_EASE: dict[VisaStatus, int] = {
    VisaStatus.visa_free: 0,
    VisaStatus.eta_evisa: 1,
    VisaStatus.voa: 2,
    VisaStatus.visa_required: 3,
}
