// Destination-tier (drill-down) types + fetch. A destination is the SAME template shape as
// any place (PlaceDetail) — that uniformity IS the consolidated format — plus guaranteed
// geo (for pins) and the destination grouping fields. The funnel serves classic-first;
// the frontend reveals them a tier (3) at a time.

import type { PlaceDetail } from "./place";

// A destination is a PlaceDetail with geo present (it's a pin) and a region label.
export type Destination = PlaceDetail & {
  lat: number;
  lng: number;
};

export interface DestinationsResponse {
  country: {
    ref: string;
    slug: string;
    name_he: string;
    name_en: string;
    iso3: string | null;
  };
  total: number;
  offset: number;
  destinations: Destination[];
}

// How many destinations a single "עוד" reveal adds (classic-first tiers of 3).
export const REVEAL_STEP = 3;

// --- display helpers (the uniform template renders the same axes for every destination) ---

const MONTHS_HE = [
  "ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני",
  "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳",
];

export function monthsHe(months: number[] | null): string {
  if (!months?.length) return "אין נתון";
  return months
    .filter((m) => m >= 1 && m <= 12)
    .map((m) => MONTHS_HE[m - 1])
    .join(" · ");
}

// 1 = very touristy .. 5 = very authentic
export function touristyLabelHe(v: number | null): string | null {
  if (v == null) return null;
  if (v <= 2) return "תיירותי";
  if (v === 3) return "מעורב";
  return "אותנטי";
}

// 1 = very busy .. 5 = very quiet
export function busyLabelHe(v: number | null): string | null {
  if (v == null) return null;
  if (v <= 2) return "תוסס";
  if (v === 3) return "מתון";
  return "שקט";
}

export function siteTypeLabelHe(siteType: string | null): string {
  return siteType === "natural" ? "טבע" : "עיר";
}

// --- region filter (chips above the funnel) ---

export interface RegionOption {
  value: string; // the full region_label, e.g. "צפון איטליה" (exact filter key)
  label: string; // the short chip label, e.g. "צפון"
}

// Short chip label: drop the trailing country word ("צפון איטליה" -> "צפון"). Single-word
// labels are kept as-is.
export function regionShortHe(label: string): string {
  const short = label.replace(/\s+\S+$/, "").trim();
  return short || label;
}

// Display order hint (north -> centre -> south); unknown regions fall in after, in
// first-seen order. Keeps the chip row reading geographically rather than by data order.
const REGION_RANK: Record<string, number> = { צפון: 0, מרכז: 1, דרום: 2 };

// Distinct regions present in a destination set, ready for the chip row. Returns [] when
// there's nothing to filter by (0 or 1 region) — the caller hides the chips entirely.
export function regionOptions(destinations: Destination[]): RegionOption[] {
  const seen: string[] = [];
  for (const d of destinations) {
    if (d.region_label && !seen.includes(d.region_label)) seen.push(d.region_label);
  }
  if (seen.length <= 1) return [];
  const ranked = seen
    .map((value, i) => ({ value, label: regionShortHe(value), order: i }))
    .sort((a, b) => {
      const ra = REGION_RANK[a.label] ?? 100 + a.order;
      const rb = REGION_RANK[b.label] ?? 100 + b.order;
      return ra - rb;
    });
  return ranked.map(({ value, label }) => ({ value, label }));
}

export async function fetchDestinations(
  countryRef: string
): Promise<DestinationsResponse> {
  const r = await fetch(
    `/api/places/${encodeURIComponent(countryRef)}/destinations`
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as DestinationsResponse;
}
