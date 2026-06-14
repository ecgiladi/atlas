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
