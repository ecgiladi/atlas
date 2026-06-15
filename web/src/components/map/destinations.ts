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

export async function fetchDestinations(
  countryRef: string
): Promise<DestinationsResponse> {
  const r = await fetch(
    `/api/places/${encodeURIComponent(countryRef)}/destinations`
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as DestinationsResponse;
}
