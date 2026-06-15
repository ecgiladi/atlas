"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import MetricToggle from "./MetricToggle";
import Legend from "./Legend";
import PlaceCard from "./PlaceCard";
import CompareTray from "./CompareTray";
import CompareView from "./CompareView";
import { COMPARE_CAP, type CompareItem } from "./compare";
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
  // The selected place's iso3 — the card fetches its own full detail from this.
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  // Compare tray (1-3 places). trayRef mirrors it for the map click closure.
  const [tray, setTray] = useState<CompareItem[]>([]);
  const trayRef = useRef<CompareItem[]>([]);
  const [comparing, setComparing] = useState(false);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; value: string } | null>(
    null
  );

  // Add/remove a place in the compare tray (cap COMPARE_CAP). trayRef kept in lockstep so
  // the map click handler (built once, in the load closure) reads the live tray.
  const toggleTray = useCallback((item: CompareItem) => {
    setTray((prev) => {
      const exists = prev.some((t) => t.ref === item.ref);
      let next: CompareItem[];
      if (exists) next = prev.filter((t) => t.ref !== item.ref);
      else if (prev.length >= COMPARE_CAP) next = prev; // silently ignore over-cap
      else next = [...prev, item];
      trayRef.current = next;
      return next;
    });
  }, []);

  const removeFromTray = useCallback((ref: string) => {
    setTray((prev) => {
      const next = prev.filter((t) => t.ref !== ref);
      trayRef.current = next;
      return next;
    });
  }, []);

  const clearTray = useCallback(() => {
    trayRef.current = [];
    setTray([]);
    setComparing(false);
  }, []);

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
        const d = dataRef.current.get(id);
        // Building mode (tray has >=1): a tap toggles the country in/out of the tray.
        // Zero-state: a tap opens the place card. Only data-backed countries are
        // toggleable (a no-data polygon can't be fetched/compared).
        if (trayRef.current.length >= 1) {
          if (d) toggleTray({ ref: id, name_he: d.name_he });
        } else {
          setSelectedRef(id);
        }
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
      <PlaceCard
        placeRef={selectedRef}
        onClose={() => setSelectedRef(null)}
        inCompare={selectedRef != null && tray.some((t) => t.ref === selectedRef)}
        compareFull={tray.length >= COMPARE_CAP}
        onToggleCompare={toggleTray}
      />
      <CompareTray
        items={tray}
        onRemove={removeFromTray}
        onClear={clearTray}
        onCompare={() => setComparing(true)}
      />
      {comparing && (
        <CompareView
          items={tray}
          onClose={() => setComparing(false)}
          onOpenCard={(ref) => {
            setComparing(false);
            setSelectedRef(ref);
          }}
        />
      )}
    </div>
  );
}
