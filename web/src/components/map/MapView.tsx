"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import MetricToggle from "./MetricToggle";
import Legend from "./Legend";
import PlaceCard from "./PlaceCard";
import DestinationPanel from "./DestinationPanel";
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

const OCEAN = "#dfe6ec";
const ISO_PROP = "ISO_A3_EH";
const DEST_ACCENT = "#b5651d"; // destination pin (warm, distinct from the choropleth fills)

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
  // maplibre-gl v4 signature is (url, lazy). lazy:false → load eagerly so labels shape
  // on first paint. Errors surface via the returned promise.
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

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dataRef = useRef<Map<string, CountryDatum>>(new Map());
  const metricRef = useRef<Metric>("visa");
  const hoveredRef = useRef<string | null>(null);

  const [metric, setMetric] = useState<Metric>("visa");
  // The selected place's iso3/slug — the card fetches its own full detail from this.
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  // Drill funnel: which country we're exploring, its destinations, and how many are revealed.
  const [drillRef, setDrillRef] = useState<string | null>(null);
  const [destData, setDestData] = useState<DestinationsResponse | null>(null);
  // Region filter (null = הכל). Filters the funnel + pins; not a forced step.
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(REVEAL_STEP);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
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
        layers: [{ id: "ocean", type: "background", paint: { "background-color": OCEAN } }],
      },
      center: [18, 30],
      zoom: 1.4,
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
      const [geo, rows] = await Promise.all([
        fetchJson("/ne_110m_admin0.geojson"),
        fetchJson("/api/map/countries") as Promise<CountryDatum[]>,
      ]);
      const byIso = new Map(rows.map((d) => [d.iso3, d]));
      dataRef.current = byIso;

      // merge name_he into properties (labels only for countries we have data for)
      for (const f of geo.features) {
        const rec = byIso.get(f.properties[ISO_PROP]);
        f.properties.name_he = rec ? rec.name_he : "";
      }

      map.addSource("countries", { type: "geojson", data: geo, promoteId: ISO_PROP });
      map.addLayer({
        id: "country-fill",
        type: "fill",
        source: "countries",
        paint: { "fill-color": fillColorExpression("visa"), "fill-opacity": 0.92 },
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
      map.addLayer({
        id: "country-label",
        type: "symbol",
        source: "countries",
        layout: {
          "text-field": ["get", "name_he"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 1, 9, 4, 13],
          "text-allow-overlap": false,
          "text-padding": 4,
        },
        paint: {
          "text-color": "#33383e",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.2,
        },
      });

      // Destination pins (drill-down). Empty until a country is drilled; the reveal effect
      // sets the data so pins grow with the card list. Same point-source pattern as labels.
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
          value: metricValueLabel(metricRef.current, d),
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
        setSelectedRef(id);
      });

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

  // metric toggle -> repaint fill (instant; no source reload)
  useEffect(() => {
    metricRef.current = metric;
    const map = mapRef.current;
    if (map && map.getLayer("country-fill")) {
      map.setPaintProperty("country-fill", "fill-color", fillColorExpression(metric));
    }
  }, [metric]);

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
      <MetricToggle metric={metric} onChange={setMetric} />
      <Legend metric={metric} />
      {tooltip && (
        <div className={styles.tooltip} style={{ left: tooltip.x, top: tooltip.y }}>
          <b>{tooltip.name}</b>
          <span className={styles.metric}>{tooltip.value}</span>
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
          onReveal={() => setRevealed((r) => Math.min(r + REVEAL_STEP, filteredDests.length))}
          onOpen={(ref) => setSelectedRef(ref)}
          onClose={closeDrill}
        />
      )}
      <PlaceCard
        placeRef={selectedRef}
        onDrill={handleDrill}
        onClose={() => setSelectedRef(null)}
      />
    </div>
  );
}
