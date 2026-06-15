// Types + presentation helpers for the place card. The detail endpoint
// (/api/places/{ref}) returns every axis (explicit nulls) plus a per-field
// provenance map; the friendly Hebrew source label is derived here so the card and
// the badge stay dumb renderers.

export interface Provenance {
  source_url: string | null;
  fetched_at: string | null;
  note: string | null;
  origin: "own" | "inherited";
}

export interface PlaceDetail {
  id: string;
  level: string;
  name_he: string;
  name_en: string;
  slug: string;
  iso3: string | null;
  enrichment_status: "stub" | "partial" | "enriched";
  is_home: boolean;

  cost_vs_israel: number | null;
  price_night: number | null;
  price_meal: number | null;
  visa_status: string | null;
  visa_note: string | null;
  flight_from_tlv_minutes: number | null;
  flight_direct: boolean | null;
  flight_price_band: string | null;
  safety_level: string | null;
  language_barrier: number | null;
  good_for: string[] | null;
  character_touristy_authentic: number | null;
  character_busy_quiet: number | null;
  season_best_months: number[] | null;
  climate: string | null;
  culture_section: string | null;
  history_context: string | null;

  provenance: Record<string, Provenance>;
}

export type ProvenanceKind = "external" | "computed" | "inherited";

export interface SourceInfo {
  kind: ProvenanceKind;
  title: string; // friendly Hebrew source name, e.g. "הבנק העולמי 2024"
  dateText: string | null; // "14.6.2026"
  url: string | null; // present only for external sources
  method: string | null; // present only for computed (how it was derived)
}

const LEVEL_LABELS_HE: Record<string, string> = {
  continent: "יבשת",
  country: "מדינה",
  city: "עיר",
  site_or_route: "אתר / מסלול",
};

export function levelLabelHe(level: string): string {
  return LEVEL_LABELS_HE[level] ?? level;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatHeDate(iso: string): string | null {
  // ISO 8601 -> "D.M.YYYY". Parse the date part directly to stay TZ-stable.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${Number(d)}.${Number(mo)}.${y}`;
}

// Computed-field notes are stored in English; surface a Hebrew method line.
function hebrewMethod(note: string | null): string | null {
  if (!note) return null;
  if (note.includes("haversine") || note.includes("TLV")) {
    return 'מרחק אווירי: נתב״ג ← מרכז המדינה';
  }
  return note.replace(/^computed:\s*/i, "");
}

// Turn a raw provenance record into the friendly Hebrew descriptor the badge renders.
export function describeProvenance(p: Provenance): SourceInfo {
  const dateText = p.fetched_at ? formatHeDate(p.fetched_at) : null;

  if (p.origin === "inherited") {
    return { kind: "inherited", title: "יורש ממדינה", dateText, url: p.source_url, method: null };
  }

  // No URL -> computed / method-only field.
  if (!p.source_url) {
    return { kind: "computed", title: "חושב", dateText, url: null, method: hebrewMethod(p.note) };
  }

  const host = hostOf(p.source_url);
  let title = host;
  if (host.includes("worldbank")) {
    const yr = p.note?.match(/year=(\d{4})/)?.[1];
    title = yr ? `הבנק העולמי ${yr}` : "הבנק העולמי";
  } else if (host.includes("wikipedia")) {
    title = "ויקיפדיה";
  } else if (host.includes("github")) {
    title = "mledoze/countries";
  }
  return { kind: "external", title, dateText, url: p.source_url, method: null };
}

export function flightBandHe(min: number | null): string {
  if (min == null) return "אין נתונים";
  if (min < 180) return "קצר (קרוב)";
  if (min < 360) return "בינוני";
  if (min < 600) return "ארוך";
  return "ארוך מאוד";
}
