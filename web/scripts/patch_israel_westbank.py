#!/usr/bin/env python3
"""One-time data patch: dissolve the West Bank into Israel in the NE admin-0 geojson.

Natural Earth 110m admin-0 codes the West Bank as a SEPARATE "Palestine" polygon
(ISO_A3_EH = "PSE"). Our map joins data on ISO_A3_EH, so PSE has no row -> it renders as a
no-data grey island INSIDE Israel and is excluded from the Israel home-highlight.

For this personal map we render the West Bank as PART OF Israel. Rather than relabel it at
runtime (which would leave the internal green-line border stroked on both polygons' rings),
we DISSOLVE the geometry here: union ISR + PSE into one polygon, replace Israel's geometry
with the union, and drop the PSE feature. Result: one seamless Israel shape, no internal
grey and no internal line — on both the globe and the flat region view.

Gaza is NOT a separate polygon at 110m resolution (only ISR + PSE exist), so there is
nothing else to fold; the treatment is consistent by construction.

This is an offline data tool (like build_label_points.mjs) — shapely is required to RUN it,
but it is NOT a project/runtime dependency. The committed artifact is the patched geojson.

    pip install shapely
    python web/scripts/patch_israel_westbank.py
"""

import json
import pathlib

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

GEOJSON = pathlib.Path(__file__).resolve().parent.parent / "public" / "ne_110m_admin0.geojson"
ISRAEL_ISO = "ISR"
WEST_BANK_ISO = "PSE"


def main() -> None:
    data = json.loads(GEOJSON.read_text())
    features = data["features"]

    israel = next((f for f in features if f["properties"].get("ISO_A3_EH") == ISRAEL_ISO), None)
    west_bank = next(
        (f for f in features if f["properties"].get("ISO_A3_EH") == WEST_BANK_ISO), None
    )
    if israel is None:
        raise SystemExit("Israel (ISR) feature not found — nothing to patch.")
    if west_bank is None:
        print("No PSE polygon present — already patched (or absent). Nothing to do.")
        return

    # Dissolve: union the two adjacent polygons. Sharing the green-line edge, they merge into
    # a single ring with the internal boundary removed.
    dissolved = unary_union([shape(israel["geometry"]), shape(west_bank["geometry"])])
    israel["geometry"] = mapping(dissolved)

    data["features"] = [f for f in features if f["properties"].get("ISO_A3_EH") != WEST_BANK_ISO]

    GEOJSON.write_text(json.dumps(data))
    print(
        f"Dissolved West Bank (PSE) into Israel (ISR): {dissolved.geom_type}, "
        f"{len(data['features'])} features remain (was {len(features)})."
    )


if __name__ == "__main__":
    main()
