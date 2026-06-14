"""Shared HTTP helpers for loaders.

Wikipedia (and good manners generally) require a descriptive User-Agent.
"""

import httpx

USER_AGENT = (
    "AtlasTravelApp/0.1 (personal travel-discovery project; "
    "contact ecgiladi1993@gmail.com)"
)

_TIMEOUT = httpx.Timeout(30.0)


def get_text(url: str, params: dict | None = None) -> str:
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=_TIMEOUT) as c:
        r = c.get(url, params=params)
        r.raise_for_status()
        # World Bank serves a UTF-8 BOM; httpx .text handles encoding, but be safe.
        return r.content.decode("utf-8-sig")


def get_json(url: str, params: dict | None = None):
    import json

    return json.loads(get_text(url, params=params))
