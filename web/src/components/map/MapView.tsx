"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Globe2 } from "lucide-react";

import MetricToggle from "./MetricToggle";
import Legend from "./Legend";
import PlaceCard from "./PlaceCard";
import {
  BORDER_COLOR,
  HOME_LINE,
  HOVER_LINE,
  fillColorExpression,
  visaLabelHe,
  type Metric,
} from "./encodings";
import type { CountryDatum } from "./types";
import styles from "./MapView.module.css";

const OCEAN = "#dfe6ec";
const ISO_PROP = "ISO_A3_EH";

// Neutral land fill for the world/globe view: the country layer is present (click targets +
// subtle definition) but carries NO metric color — the globe is the clean, personal frame,
// not the heatmap. The metric choropleth only appears once you drill into a region.
const LAND_NEUTRAL = "#cdd6cf";

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
  // The selected place's iso3 — the card fetches its own full detail from this.
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  // Which zoom band we're in. Drives toggle/legend visibility + neutral-vs-metric fills.
  const [mode, setMode] = useState<ViewMode>("world");
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; value: string } | null>(
    null
  );

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
        // in). Space around the sphere is the container's CSS background.
        layers: [{ id: "ocean", type: "background", paint: { "background-color": OCEAN } }],
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

      // PIN LAYER (scaffold) — the personal globe overlay: green = been, red = favorite.
      // Wired to an EMPTY source for now; favorites save + a per-place lat/lng land on
      // another branch. Seam to populate later: fetch GET /api/favorites, map each saved
      // place (status 'been' -> kind 'been'; otherwise 'favorite') to a Point feature at
      // its lat/lng, and source.setData(fc). The styling below already keys off `kind`.
      // (Country-level markers can instead reuse the "country-points" source above.)
      map.addSource("pins", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "pins",
        type: "circle",
        source: "pins",
        paint: {
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-color": [
            "match",
            ["get", "kind"],
            "been", "#4caf7d", // green
            "favorite", "#c0445b", // red
            "#6b747d", // fallback
          ],
        },
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

  function flyHome() {
    mapRef.current?.flyTo({ ...WORLD_HOME, duration: 1600 });
  }

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
      {/* Metric tools belong to the region view only — the globe stays clean. */}
      {mode === "region" && (
        <>
          <MetricToggle metric={metric} onChange={setMetric} />
          <Legend metric={metric} />
          <button
            type="button"
            className={styles.backToGlobe}
            onClick={flyHome}
            aria-label="חזרה לגלובוס"
          >
            <Globe2 size={18} aria-hidden />
            <span>חזרה לעולם</span>
          </button>
        </>
      )}
      {tooltip && (
        <div className={styles.tooltip} style={{ left: tooltip.x, top: tooltip.y }}>
          <b>{tooltip.name}</b>
          {tooltip.value && <span className={styles.metric}>{tooltip.value}</span>}
        </div>
      )}
      <PlaceCard placeRef={selectedRef} onClose={() => setSelectedRef(null)} />
    </div>
  );
}
