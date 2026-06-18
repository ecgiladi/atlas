"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Globe2, Heart } from "lucide-react";

import MetricToggle from "./MetricToggle";
import Legend from "./Legend";
import PlaceCard from "./PlaceCard";
import DestinationPanel from "./DestinationPanel";
import FavoritesSheet from "./FavoritesSheet";
import { listFavorites, type FavoriteEntry } from "./favorites";
import {
  BORDER_COLOR,
  HOME_LINE,
  HOVER_LINE,
  fillColorExpression,
  visaLabelHe,
  type Metric,
} from "./encodings";
import {
  fetchDestinations,
  regionOptions,
  REVEAL_STEP,
  type Destination,
  type DestinationsResponse,
} from "./destinations";
import type { CountryDatum } from "./types";
import styles from "./MapView.module.css";

const OCEAN = "#dfe6ec"; // flat-map ocean (region view) — unchanged
// Globe sea: a soft, muted blue (calm, not saturated) so the sphere reads as Earth. The
// background layer interpolates from this at world zoom to OCEAN by the region threshold,
// so the flat region map keeps its existing light ocean exactly.
const OCEAN_GLOBE = "#a7bccd";
const ISO_PROP = "ISO_A3_EH";
const SAVED_LINE = "#c0445b"; // warm "saved" marker outline (matches the card heart)
const DEST_ACCENT = "#b5651d"; // destination pin (warm, distinct from the choropleth fills)

// Saved-place globe pins, colored by the human's call (status). Muted tones, picked to read
// on the planet palette without fighting it (tunable — nudge on device): been=green (the
// "done / lived it" call), want=red (matches the saved heart/outline), shortlist=amber
// (still deciding). Kept slightly desaturated so they sit on the globe, not over it.
const PIN_COLOR_BEEN = "#4f9d75"; // הייתי — muted green
const PIN_COLOR_WANT = "#c0445b"; // רוצה — same warm red as the saved outline / card heart
const PIN_COLOR_SHORTLIST = "#d4a13c"; // מתלבט — muted amber

// Build the saved-place pin overlay (GLOBE / world view) from the /api/favorites payload.
// Each saved place plots at its lat/lng — a city point, or for a saved COUNTRY its centroid
// (both already live on the place row, so a country pin just works). Skips null geo (no
// 0,0 ghost pin / crash) and dedupes by place id so a place that appears twice -> one pin.
// `status` rides on the feature and drives the circle color; `ref` is the id the card opens.
function pinFeatureCollection(favs: FavoriteEntry[]) {
  const seen = new Set<string>();
  const features = [];
  for (const f of favs) {
    const { id, ref, name_he, lat, lng } = f.place;
    if (lat == null || lng == null) continue; // null geo -> skip gracefully
    if (seen.has(id)) continue; // dedupe
    seen.add(id);
    features.push({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [lng, lat] },
      properties: { ref, status: f.status, name_he },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

// 1-D squared Euclidean distance transform (Felzenszwalb & Huttenlocher) — the kernel of the
// 2-D EDT used to turn the rasterized pin into a real signed-distance field (below).
function edt1d(f: Float64Array, n: number): Float64Array {
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
  return d;
}
function edt2d(grid: Float64Array, w: number, h: number) {
  const f = new Float64Array(Math.max(w, h));
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    const d = edt1d(f, h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    const d = edt1d(f, w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
}

// Build a teardrop map-pin as a true SDF image for the saved-place symbol layer. It's the
// Material "place" glyph in a 24x24 viewBox — a classic balloon, point at the BOTTOM, with a
// round inner hole (even-odd fill). We crop the canvas height to the tip (y=22) so
// icon-anchor:'bottom' lands the TIP exactly on the coordinate.
//
// SDF (not a plain alpha mask): rasterize the glyph, then encode each pixel's *signed
// distance* to the silhouette edge into the alpha channel (Mapbox/TinySDF convention: edge at
// ~191, inside→255, outside→0). Only the alpha is read; icon-color tints per status and — the
// reason we need a real distance field — icon-halo paints a clean white rim that expands into
// the field, so green/red/amber stay legible over ANY metric fill (incl. the saturated end of
// the cost diverging ramp). A binary mask can't do this: the halo has no distance to grow into.
const SAVED_PIN_IMG = "saved-pin";
const SAVED_PIN_PATH =
  "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z";
function makePinImage(scale = 4): { width: number; height: number; data: Uint8ClampedArray } | null {
  const VB_W = 24;
  const TIP_Y = 22; // path's lowest point (the tip), at x=12 -> crop here so anchor:'bottom' = tip
  const w = Math.round(VB_W * scale);
  const h = Math.round(TIP_Y * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  const path = new Path2D(SAVED_PIN_PATH);
  ctx.fillStyle = "#000";
  ctx.fill(path, "evenodd"); // even-odd -> the inner circle is "outside" too -> a real hole

  // Rasterized silhouette -> signed distance field encoded into alpha.
  const raster = ctx.getImageData(0, 0, w, h).data;
  const INF = 1e20;
  const outer = new Float64Array(w * h); // dist^2 from outside pixels to nearest inside
  const inner = new Float64Array(w * h); // dist^2 from inside pixels to nearest outside
  for (let i = 0; i < w * h; i++) {
    const isInside = raster[i * 4 + 3] > 127; // alpha of the rasterized glyph
    outer[i] = isInside ? 0 : INF;
    inner[i] = isInside ? INF : 0;
  }
  edt2d(outer, w, h);
  edt2d(inner, w, h);
  // radius = halo budget in base px (after icon-size it becomes the on-screen halo headroom).
  const radius = 2 * scale;
  const cutoff = 0.25; // edge sits at alpha = 255*(1-cutoff) ≈ 191 (matches MapLibre's SDF buffer)
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const d = Math.sqrt(outer[i]) - Math.sqrt(inner[i]); // +outside, -inside (signed distance)
    const a = 255 - 255 * (d / radius + cutoff); // clamping handled by Uint8ClampedArray
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = a;
  }
  return { width: w, height: h, data: out };
}

// Reuse the one-point-per-feature pattern (from the label-points work): destinations are
// points of the same shape, so they ride a geojson Point source + circle/label layers.
function destFeatureCollection(dests: Destination[]) {
  return {
    type: "FeatureCollection" as const,
    features: dests.map((d) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [d.lng, d.lat] },
      properties: { slug: d.slug, name_he: d.name_he, site_type: d.site_type ?? "" },
    })),
  };
}

// Frame a set of destination pins. Pads the panel side (RTL: physical left) so pins stay
// clear of the funnel. Shared by the initial drill and by region-filter changes (the pin
// set follows the active filter, so the framing should too).
function fitToDestinations(map: maplibregl.Map, dests: Destination[]) {
  if (!dests.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of dests) {
    minX = Math.min(minX, d.lng);
    maxX = Math.max(maxX, d.lng);
    minY = Math.min(minY, d.lat);
    maxY = Math.max(maxY, d.lat);
  }
  map.fitBounds(
    [[minX, minY], [maxX, maxY]],
    { padding: { top: 70, bottom: 70, left: 380, right: 70 }, duration: 1600, maxZoom: 7 }
  );
}

// Neutral land fill for the world/globe view: the country layer is present (click targets +
// subtle definition) but carries NO metric color — the globe is the clean, personal frame,
// not the heatmap. The metric choropleth only appears once you drill into a region. A hair
// warm so it doesn't wash out against the richer ocean.
const LAND_NEUTRAL = "#d3cdbe";

// The map is ONE instance with two zoom bands ("modes"):
//   world  (zoom < threshold): globe projection, neutral fills, pins, no toggle/legend.
//   region (zoom >= threshold): morphed-flat Mercator, metric choropleth, toggle + legend.
// Mode is derived purely from zoom; the globe projection is adaptive (v5) and morphs
// globe<->flat on its own as zoom crosses ~5, so we never swap projections by hand.
type ViewMode = "world" | "region";
const REGION_ZOOM_THRESHOLD = 3.6; // at/above this we're "in a region": show the choropleth
const REGION_ZOOM_MIN = 4.2; // drilling in always lands at least here (so big countries enter region too)
const WORLD_HOME = { center: [12, 22] as [number, number], zoom: 1.05 }; // the globe landing camera

// MapLibre/WebGL does NOT apply bidi/RTL shaping to glyphs on its own, so Hebrew on-map
// labels render reversed (גרמניה → "הינמרג"). The RTL text plugin fixes shaping. It's a
// global, set-once call (throws if invoked twice — matters under React strict-mode remount),
// so guard it. Hosted locally in /public to keep the no-external-runtime approach used for
// glyphs. lazy:false → labels shape correctly on the very first paint, not after an idle event.
let rtlPluginRequested = false;
function ensureRtlTextPlugin() {
  if (rtlPluginRequested || maplibregl.getRTLTextPluginStatus() !== "unavailable") {
    rtlPluginRequested = true;
    return;
  }
  rtlPluginRequested = true;
  // setRTLTextPlugin(url, lazy) — signature unchanged from v4 to v5 (verified under
  // maplibre-gl 5.24: Hebrew labels still shape correctly, גרמניה not הינמרג). lazy:false
  // → load eagerly so labels shape on first paint. Errors surface via the returned promise.
  maplibregl
    .setRTLTextPlugin("/mapbox-gl-rtl-text.js", false)
    .catch((err) => console.error("[MapView] RTL text plugin failed to load:", err));
}

function metricValueLabel(metric: Metric, d: CountryDatum | undefined): string {
  if (!d) return "אין נתונים";
  if (metric === "visa") return visaLabelHe(d.visa_status);
  if (metric === "cost")
    return d.cost_vs_israel == null ? "אין נתונים" : `${d.cost_vs_israel} (ישראל=100)`;
  return d.flight_from_tlv_minutes == null
    ? "אין נתונים"
    : `~${d.flight_from_tlv_minutes} דק׳`;
}

const modeForZoom = (zoom: number): ViewMode =>
  zoom >= REGION_ZOOM_THRESHOLD ? "region" : "world";

// Axis-aligned bbox over a GeoJSON Polygon/MultiPolygon ring set. Good enough to fitBounds;
// dateline-spanning countries (Russia, Fiji) get a wide box — acceptable for a drill-in.
function bboxOf(geometry: any): [number, number, number, number] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (coords: any) => {
    if (typeof coords[0] === "number") {
      const [x, y] = coords;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    } else {
      for (const c of coords) visit(c);
    }
  };
  if (!geometry?.coordinates) return null;
  visit(geometry.coordinates);
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dataRef = useRef<Map<string, CountryDatum>>(new Map());
  const metricRef = useRef<Metric>("visa");
  const hoveredRef = useRef<string | null>(null);
  // Per-country bbox, computed once from the geojson, so a world-mode click can fitBounds
  // to drill in without re-reading geometry off the (possibly clipped) click event.
  const bboxByIso = useRef<Map<string, [number, number, number, number]>>(new Map());
  const modeRef = useRef<ViewMode>("world");

  const [metric, setMetric] = useState<Metric>("visa");
  // The selected place's iso3/slug — the card fetches its own full detail from this.
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  // Which zoom band we're in (globe baseline). Drives toggle/legend/back visibility,
  // neutral-vs-metric fills, and saved-pin visibility.
  const [mode, setMode] = useState<ViewMode>("world");
  // Drill funnel (a deeper state off the region view): which country we're exploring, its
  // destinations, and how many are revealed.
  const [drillRef, setDrillRef] = useState<string | null>(null);
  const [destData, setDestData] = useState<DestinationsResponse | null>(null);
  // Region filter (null = הכל). Filters the funnel + destination pins; not a forced step.
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(REVEAL_STEP);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  // Favorites: a version counter so the card / sheet / map marker all re-sync after a
  // mutation, and a flag for the favorites sheet.
  const [favVersion, setFavVersion] = useState(0);
  const [showFavorites, setShowFavorites] = useState(false);
  const bumpFav = () => setFavVersion((v) => v + 1);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; value: string } | null>(
    null
  );

  // Region chips derived from the loaded set; the filtered list drives both cards and pins.
  const regions = useMemo(() => regionOptions(destData?.destinations ?? []), [destData]);
  const filteredDests = useMemo(() => {
    const all = destData?.destinations ?? [];
    return activeRegion ? all.filter((d) => d.region_label === activeRegion) : all;
  }, [destData, activeRegion]);

  // init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensureRtlTextPlugin();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: "/font/{fontstack}/{range}.pbf",
        sources: {},
        // The background layer is the globe's sea (and the flat map's ocean once zoomed
        // in). Space around the sphere is the container's CSS background. Muted blue at
        // world zoom -> the existing light ocean by the region threshold, so the flat
        // region map is visually unchanged.
        layers: [
          {
            id: "ocean",
            type: "background",
            paint: {
              "background-color": [
                "interpolate",
                ["linear"],
                ["zoom"],
                2,
                OCEAN_GLOBE,
                REGION_ZOOM_THRESHOLD,
                OCEAN,
              ],
            },
          },
        ],
      },
      center: WORLD_HOME.center,
      zoom: WORLD_HOME.zoom,
      renderWorldCopies: false,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(
      new maplibregl.AttributionControl({
        customAttribution: "גבולות: Natural Earth",
      })
    );

    // Surface a hung load instead of showing "טוען מפה…" forever. If the style/data/glyphs
    // never finish (e.g. a 404 on chunks or a failed fetch), flip to an honest error state.
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        const msg = "המפה לא נטענה בזמן (timeout). בדקו את חיבור הנתונים והרשת.";
        console.error("[MapView] load timeout — map never became ready");
        setError(msg);
      }
    }, 15000);

    // Log every MapLibre internal error (missing tile/glyph range, style issue) — non-fatal
    // ones won't block load, but they belong in the console, not swallowed.
    map.on("error", (e) => {
      console.error("[MapView] maplibre error:", (e && (e as any).error) || e);
    });

    async function fetchJson(url: string) {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
      return r.json();
    }

    map.on("load", async () => {
      try {
      // Globe projection (MapLibre v5): adaptive composite — renders as a globe at low
      // zoom and morphs to flat Mercator as you zoom into a region. One map, two views.
      map.setProjection({ type: "globe" });

      // Atmosphere (v5 sky spec): a soft blue glow at the limb over dark space, so the
      // globe reads as a planet rather than a flat circle. Kept subtle. atmosphere-blend
      // fades to 0 as we zoom into a region, so the flat map gets no sky/fog.
      map.setSky({
        // Space above the atmosphere — a lighter slate/blue-grey (was the deep night-navy
        // #0a1326, which read heavy and masked the CSS radial). Matches the lightened .map
        // radial's outer slate; still dark enough that the limb-glow + outlines read.
        "sky-color": "#25324c",
        "sky-horizon-blend": 0.7,
        "horizon-color": "#8fb8e0", // soft blue limb glow
        "horizon-fog-blend": 0.5,
        "fog-color": "#cfe0f0", // pale near-surface haze
        "fog-ground-blend": 0.0,
        "atmosphere-blend": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          0.6,
          4,
          0.3,
          6,
          0,
        ],
      });

      const [geo, points, rows] = await Promise.all([
        fetchJson("/ne_110m_admin0.geojson"),
        // One representative Point per country (precomputed pole-of-inaccessibility of the
        // largest polygon). Labels ride on THIS, not the fill source, so a MultiPolygon
        // country (Canada/Russia/USA) gets one label, not one per island/exclave.
        fetchJson("/country_label_points.geojson"),
        fetchJson("/api/map/countries") as Promise<CountryDatum[]>,
      ]);
      const byIso = new Map(rows.map((d) => [d.iso3, d]));
      dataRef.current = byIso;

      // cache each country's bbox (for the world-mode drill-in fitBounds).
      for (const f of geo.features) {
        const iso = f.properties[ISO_PROP];
        const bb = bboxOf(f.geometry);
        if (bb && iso) bboxByIso.current.set(iso, bb);
      }

      // merge name_he onto the label points (only countries we have data for get a name).
      for (const f of points.features) {
        const rec = byIso.get(f.properties.iso_a3);
        f.properties.name_he = rec ? rec.name_he : "";
      }

      map.addSource("countries", { type: "geojson", data: geo, promoteId: ISO_PROP });
      // Start neutral: the landing view is the globe (world mode). The mode effect swaps
      // this to the metric choropleth when the user drills into a region.
      map.addLayer({
        id: "country-fill",
        type: "fill",
        source: "countries",
        paint: { "fill-color": LAND_NEUTRAL, "fill-opacity": 0.92 },
      });
      map.addLayer({
        id: "country-border",
        type: "line",
        source: "countries",
        paint: { "line-color": BORDER_COLOR, "line-width": 0.5 },
      });
      map.addLayer({
        id: "country-hover",
        type: "line",
        source: "countries",
        paint: {
          "line-color": HOVER_LINE,
          "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0],
        },
      });
      map.addLayer({
        id: "israel-outline",
        type: "line",
        source: "countries",
        filter: ["==", ["get", ISO_PROP], "ISR"],
        paint: { "line-color": HOME_LINE, "line-width": 1.8 },
      });
      // Subtle saved-country marker: a warm outline driven by feature-state `saved`.
      // It's its own line layer, so it never touches the choropleth fill encoding.
      map.addLayer({
        id: "country-saved",
        type: "line",
        source: "countries",
        paint: {
          "line-color": SAVED_LINE,
          "line-width": ["case", ["boolean", ["feature-state", "saved"], false], 2.5, 0],
        },
      });
      // One Point per country — the reusable country-keyed dataset. Labels live here so
      // each country is named exactly once; country-level markers (microstates with no
      // 110m polygon, future country pins) can ride on this same source by iso_a3.
      map.addSource("country-points", { type: "geojson", data: points, promoteId: "iso_a3" });
      map.addLayer({
        id: "country-label",
        type: "symbol",
        source: "country-points",
        layout: {
          "text-field": ["get", "name_he"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 1, 9, 4, 13],
          // allow-overlap:false declutters the globe (only non-colliding labels render);
          // sort-key keeps the home country (Israel) label as the first to win a slot.
          "text-allow-overlap": false,
          "text-padding": 4,
          "symbol-sort-key": ["case", ["==", ["get", "iso_a3"], "ISR"], 0, 1],
        },
        paint: {
          "text-color": "#33383e",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.2,
        },
      });

      // TWO DISTINCT pin usages coexist — separate sources + layer ids, never clobbering,
      // each shown/hidden by mode (see the pin-visibility effect):
      //
      // (a) SAVED-PLACE pins — the personal GLOBE overlay, colored by the human's call
      //     (status): been=green, want=red, shortlist=amber. Populated from GET /api/favorites
      //     via pinFeatureCollection() in the favorites-sync effect below, and kept live on
      //     favVersion bumps (a save anywhere -> the pin appears without reload). Country-level
      //     saves plot at their centroid (lat/lng on the place row). Added FIRST -> below the
      //     funnel's destination pins in z-order.
      map.addSource("pins", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // Register the teardrop pin once (SDF -> tintable per-feature via icon-color).
      if (!map.hasImage(SAVED_PIN_IMG)) {
        const pinImg = makePinImage();
        if (pinImg) map.addImage(SAVED_PIN_IMG, pinImg, { sdf: true });
      }
      map.addLayer({
        id: "pins",
        type: "symbol",
        source: "pins",
        layout: {
          "icon-image": SAVED_PIN_IMG,
          // icon-anchor:'bottom' -> the TIP sits on the exact coordinate (the canvas is
          // cropped to the tip). allow-overlap + ignore-placement: never drop a personal pin.
          "icon-anchor": "bottom",
          "icon-size": 0.34,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          // On the globe, keep pins upright / billboarded (don't tilt with the camera or
          // lie flat on the sphere) — they read as map markers planted on the planet.
          "icon-rotation-alignment": "viewport",
          "icon-pitch-alignment": "viewport",
        },
        paint: {
          "icon-color": [
            "match",
            ["get", "status"],
            "been", PIN_COLOR_BEEN,
            "want", PIN_COLOR_WANT,
            "shortlist", PIN_COLOR_SHORTLIST,
            "#6b747d", // fallback (unknown status)
          ],
          // White rim so a colored pin reads over ANY fill — the planet palette in world, and
          // the metric choropleth in region (incl. the cost ramp's saturated red end, where the
          // red pin is closest in hue). Real SDF (above) makes this halo actually render; ~1.8px
          // stays within the field's halo budget (radius * icon-size). Tunable on device.
          "icon-halo-color": "#ffffff",
          "icon-halo-width": 1.8,
        },
      });
      // Tap a saved pin -> open its PlaceCard (same path as a destination pin / region click).
      map.on("click", "pins", (e) => {
        if (!e.features?.length) return;
        setSelectedRef(e.features[0].properties?.ref as string);
      });
      map.on("mouseenter", "pins", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "pins", () => {
        map.getCanvas().style.cursor = "";
      });

      // (b) DESTINATION pins — the drill funnel's city pins. Empty until a country is
      //     drilled; the reveal effect sets the data so pins grow with the card list. Same
      //     point-source pattern as the country labels. Added LAST -> destination pins +
      //     labels sit on top (the funnel is the focused, deeper view).
      map.addSource("destinations", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "slug",
      });
      map.addLayer({
        id: "destination-pins",
        type: "circle",
        source: "destinations",
        paint: {
          "circle-radius": 7,
          "circle-color": DEST_ACCENT,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "destination-pin-labels",
        type: "symbol",
        source: "destinations",
        layout: {
          "text-field": ["get", "name_he"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#2b3036",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.4,
        },
      });
      map.on("click", "destination-pins", (e) => {
        if (!e.features?.length) return;
        setSelectedRef(e.features[0].properties?.slug as string);
      });
      map.on("mouseenter", "destination-pins", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "destination-pins", () => {
        map.getCanvas().style.cursor = "";
      });

      // apply metrics via feature-state
      for (const d of rows) {
        map.setFeatureState(
          { source: "countries", id: d.iso3 },
          {
            visa_status: d.visa_status,
            cost: d.cost_vs_israel,
            costHasData: d.cost_vs_israel != null,
            flight: d.flight_from_tlv_minutes,
            flightHasData: d.flight_from_tlv_minutes != null,
            isIsrael: d.iso3 === "ISR",
          }
        );
      }

      // interactions
      map.on("mousemove", "country-fill", (e) => {
        if (!e.features?.length) return;
        const f = e.features[0];
        const id = f.id as string;
        if (hoveredRef.current !== id) {
          if (hoveredRef.current != null)
            map.setFeatureState(
              { source: "countries", id: hoveredRef.current },
              { hover: false }
            );
          hoveredRef.current = id;
          map.setFeatureState({ source: "countries", id }, { hover: true });
        }
        map.getCanvas().style.cursor = "pointer";
        const d = dataRef.current.get(id);
        setTooltip({
          x: e.point.x,
          y: e.point.y,
          name: d?.name_he || (f.properties?.ADMIN as string) || "",
          // World mode is the clean/personal frame: show the name only, no metric value.
          value: modeRef.current === "region" ? metricValueLabel(metricRef.current, d) : "",
        });
      });
      map.on("mouseleave", "country-fill", () => {
        if (hoveredRef.current != null)
          map.setFeatureState(
            { source: "countries", id: hoveredRef.current },
            { hover: false }
          );
        hoveredRef.current = null;
        map.getCanvas().style.cursor = "";
        setTooltip(null);
      });
      map.on("click", "country-fill", (e) => {
        if (!e.features?.length) return;
        const id = e.features[0].id as string; // iso3 (== promoteId)
        // Saved-place pins sit above the fill in BOTH world and region; if one is under the
        // click, let its own handler open the card instead of drilling / opening the country
        // card beneath it. (Hidden in the funnel, so this is a no-op there.)
        if (map.queryRenderedFeatures(e.point, { layers: ["pins"] }).length) return;
        if (modeRef.current === "world") {
          // On the globe, a click DRILLS IN: fly to the country's bounds. Crossing the
          // zoom threshold flips to region mode (choropleth + toggle) and the adaptive
          // projection morphs globe -> flat. Clamp zoom so even large countries enter region.
          const bb = bboxByIso.current.get(id);
          if (bb) {
            const cam = map.cameraForBounds(
              [[bb[0], bb[1]], [bb[2], bb[3]]],
              { padding: 60, maxZoom: 6 }
            );
            const center = cam?.center ?? [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
            const zoom = Math.max(
              typeof cam?.zoom === "number" ? cam.zoom : REGION_ZOOM_MIN,
              REGION_ZOOM_MIN
            );
            map.flyTo({ center: center as [number, number], zoom, duration: 1800 });
          }
        } else {
          // In a region (flat) the existing behaviour: open the place card.
          setSelectedRef(id);
        }
      });

      // Derive view mode from zoom; flip React state only on an actual band change.
      const syncMode = () => {
        const next = modeForZoom(map.getZoom());
        if (next !== modeRef.current) {
          modeRef.current = next;
          setMode(next);
        }
      };
      map.on("zoom", syncMode);
      syncMode();

      clearTimeout(timeout);
      readyRef.current = true;
      setReady(true);
      } catch (err) {
        clearTimeout(timeout);
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[MapView] failed to build map:", err);
        setError(`טעינת המפה נכשלה: ${msg}`);
      }
    });

    return () => {
      clearTimeout(timeout);
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // mode change -> swap the country fill between neutral (world/globe) and the metric
  // choropleth (region). Driven by the zoom band, not a user toggle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("country-fill")) return;
    map.setPaintProperty(
      "country-fill",
      "fill-color",
      mode === "region" ? fillColorExpression(metricRef.current) : LAND_NEUTRAL
    );
  }, [mode, ready]);

  // metric toggle -> repaint fill (instant; no source reload). Only meaningful in region
  // mode; in world mode the fill is neutral and the toggle is hidden.
  useEffect(() => {
    metricRef.current = metric;
    const map = mapRef.current;
    if (map && map.getLayer("country-fill") && mode === "region") {
      map.setPaintProperty("country-fill", "fill-color", fillColorExpression(metric));
    }
  }, [metric, mode]);

  // Pin visibility by mode/funnel — the two pin sets never co-show, keeping each to its scope:
  //   - saved-place pins ("pins") are the personal overlay -> visible in WORLD + REGION (they
  //     stay pinned over the choropleth), but HIDDEN while the destinations funnel is open so
  //     they don't double up with the funnel's own pins (destination pins own the funnel).
  //   - destination pins ("destination-pins"/labels) belong to the funnel (a deeper state off
  //     region) -> visible only while a country's funnel is open (drillRef set). Their data is
  //     also cleared on close, so this is belt-and-suspenders against stragglers.
  // SAVED_PINS_IN_FUNNEL: one-line flip — set true to also show saved pins inside the funnel.
  const SAVED_PINS_IN_FUNNEL = false;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setVis = (id: string, visible: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    };
    setVis("pins", SAVED_PINS_IN_FUNNEL || drillRef == null);
    setVis("destination-pins", drillRef != null);
    setVis("destination-pin-labels", drillRef != null);
  }, [drillRef, ready]);

  // "חזרה לעולם" (region-back -> globe). Collapse any open funnel first so we never land on
  // the globe with the destination panel/pins still up — the back stack is funnel -> region
  // (panel close) -> globe (this). closeDrill is a no-op when no funnel is open.
  function flyHome() {
    closeDrill();
    mapRef.current?.flyTo({ ...WORLD_HOME, duration: 1600 });
  }

  // Reveal effect: keep the pins in sync with the revealed (classic-first) destinations of
  // the ACTIVE region filter, so pins and the card list grow together on each "עוד" and both
  // respect the active filter.
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("destinations") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(destFeatureCollection(filteredDests.slice(0, revealed)));
  }, [filteredDests, revealed, ready]);

  // Enter the drill funnel for a country: load its destinations, frame them on the map,
  // and open the panel. Clears the country card so the panel takes over.
  async function handleDrill(ref: string) {
    setSelectedRef(null);
    setDrillRef(ref);
    setActiveRegion(null); // funnel always opens on הכל / classic-first
    setRevealed(REVEAL_STEP);
    setDrillLoading(true);
    setDrillError(null);
    try {
      const data = await fetchDestinations(ref);
      setDestData(data);
      const map = mapRef.current;
      if (map) fitToDestinations(map, data.destinations);
    } catch (e) {
      setDrillError(e instanceof Error ? e.message : String(e));
    } finally {
      setDrillLoading(false);
    }
  }

  // Region chip change: narrow (or restore) the funnel + pins, reset the reveal to the first
  // classic-first tier, and reframe the map to the now-visible pins.
  function handleRegionChange(region: string | null) {
    setActiveRegion(region);
    setRevealed(REVEAL_STEP);
    const all = destData?.destinations ?? [];
    const next = region ? all.filter((d) => d.region_label === region) : all;
    const map = mapRef.current;
    if (map) fitToDestinations(map, next);
  }

  function closeDrill() {
    setDrillRef(null);
    setDestData(null);
    setActiveRegion(null);
    const src = mapRef.current?.getSource("destinations") as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: "FeatureCollection", features: [] });
  }

  // Reflect favorites on the map from a single /api/favorites fetch: (1) the `saved`
  // feature-state outline on every country (so un-saving clears it too), and (2) the
  // saved-place GLOBE pins (status-colored, plotted at each place's geo). Re-runs on
  // favVersion bumps (a save/remove anywhere) and once the map is ready, so a save makes
  // its pin appear without a reload; an unsave makes it disappear.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map || !map.getSource("countries")) return;
    let cancelled = false;
    listFavorites()
      .then((favs) => {
        if (cancelled) return;
        const savedIso = new Set(
          favs.map((f) => f.place.iso3).filter((x): x is string => !!x)
        );
        for (const iso of dataRef.current.keys()) {
          map.setFeatureState(
            { source: "countries", id: iso },
            { saved: savedIso.has(iso) }
          );
        }
        const pins = map.getSource("pins") as maplibregl.GeoJSONSource | undefined;
        pins?.setData(pinFeatureCollection(favs));
      })
      .catch((e) => console.error("[MapView] favorites marker sync failed:", e));
    return () => {
      cancelled = true;
    };
  }, [ready, favVersion]);

  return (
    <div className={styles.wrap}>
      <div ref={containerRef} className={styles.map} />
      {error ? (
        <div className={styles.error} role="alert">
          <b>שגיאה בטעינת המפה</b>
          <span>{error}</span>
        </div>
      ) : (
        !ready && <div className={styles.loading}>טוען מפה…</div>
      )}
      {/* Metric tools belong to the region view only — the globe stays clean. "חזרה לעולם"
          sits ALONE at the top; the metric toggle is paired with the legend it drives in a
          bottom cluster, so the two never share the top bar / overlap at phone width. */}
      {mode === "region" && (
        <>
          <button
            type="button"
            className={styles.backToGlobe}
            onClick={flyHome}
            aria-label="חזרה לגלובוס"
          >
            <Globe2 size={18} aria-hidden />
            <span>חזרה לעולם</span>
          </button>
          <div className={styles.metricCluster}>
            <MetricToggle metric={metric} onChange={setMetric} />
            <Legend metric={metric} />
          </div>
        </>
      )}
      {tooltip && (
        <div className={styles.tooltip} style={{ left: tooltip.x, top: tooltip.y }}>
          <b>{tooltip.name}</b>
          {tooltip.value && <span className={styles.metric}>{tooltip.value}</span>}
        </div>
      )}
      {drillRef && (
        <DestinationPanel
          countryNameHe={destData?.country.name_he ?? ""}
          destinations={filteredDests}
          revealed={revealed}
          total={filteredDests.length}
          regions={regions}
          activeRegion={activeRegion}
          onRegionChange={handleRegionChange}
          loading={drillLoading}
          error={drillError}
          favVersion={favVersion}
          onFavChanged={bumpFav}
          onReveal={() => setRevealed((r) => Math.min(r + REVEAL_STEP, filteredDests.length))}
          onOpen={(ref) => setSelectedRef(ref)}
          onClose={closeDrill}
        />
      )}
      {!showFavorites && (
        <button
          type="button"
          className={styles.favFab}
          onClick={() => setShowFavorites(true)}
          aria-label="היעדים שלי"
        >
          <Heart size={22} aria-hidden />
        </button>
      )}
      <PlaceCard
        placeRef={selectedRef}
        onDrill={handleDrill}
        favVersion={favVersion}
        onFavChanged={bumpFav}
        onClose={() => setSelectedRef(null)}
      />
      <FavoritesSheet
        open={showFavorites}
        favVersion={favVersion}
        onSelectPlace={(ref) => setSelectedRef(ref)}
        onChanged={bumpFav}
        onClose={() => setShowFavorites(false)}
      />
    </div>
  );
}
