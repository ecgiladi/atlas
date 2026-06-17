// Favorites (saved_place) — types, Hebrew labels, and the thin API client.
// This is the "judge & narrow" capture: the human records the call (מתלבט / רוצה /
// הייתי); Atlas only stores it. All state lives on the backend (NO localStorage).

export type SavedStatus = "shortlist" | "want" | "been";

// Declaration order = display/group order (narrowing funnel: considering -> want -> been).
export const SAVED_STATUSES: SavedStatus[] = ["shortlist", "want", "been"];

const STATUS_LABELS_HE: Record<SavedStatus, string> = {
  shortlist: "מתלבט",
  want: "רוצה",
  been: "הייתי",
};

export function statusLabelHe(status: SavedStatus): string {
  return STATUS_LABELS_HE[status] ?? status;
}

// Light place projection the favorites list renders (mirrors backend _place_summary).
export interface FavoritePlaceSummary {
  id: string;
  ref: string; // iso3 || slug — the id used by card / PUT / DELETE
  level: string;
  name_he: string;
  name_en: string;
  slug: string;
  iso3: string | null;
  enrichment_status: "stub" | "partial" | "enriched";
  lat: number | null; // geo for the globe-pin overlay (step D)
  lng: number | null;
  visa_status: string | null;
  cost_vs_israel: number | null;
  flight_from_tlv_minutes: number | null;
  good_for: string[] | null;
}

export interface FavoriteEntry {
  id: string;
  status: SavedStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  place: FavoritePlaceSummary;
}

export interface FavoriteState {
  saved: boolean;
  status: SavedStatus | null;
  place_ref: string;
}

const BASE = "/api/favorites";

// A fetch error that carries the HTTP status + (truncated) response body, so a failure
// on the actual device surfaces the *why* (status + body) instead of a bare "failed".
// Network-layer failures (offline, blocked, CORS, mixed-content) become FetchError too.
export class FetchError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "FetchError";
    this.status = status;
    this.body = body;
  }
}

async function request(method: string, path: string, payload?: unknown): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(path, {
      method,
      headers: payload !== undefined ? { "content-type": "application/json" } : undefined,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });
  } catch (netErr) {
    // fetch() rejects only on a network-layer failure — no HTTP status exists.
    const msg = netErr instanceof Error ? netErr.message : String(netErr);
    throw new FetchError(`${method} ${path} network error: ${msg}`, 0, msg);
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new FetchError(`${method} ${path} → HTTP ${r.status}`, r.status, body);
  }
  return r;
}

export async function getFavoriteState(ref: string): Promise<FavoriteState> {
  const r = await request("GET", `${BASE}/${encodeURIComponent(ref)}`);
  return (await r.json()) as FavoriteState;
}

export async function listFavorites(status?: SavedStatus): Promise<FavoriteEntry[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const r = await request("GET", `${BASE}${qs}`);
  return (await r.json()) as FavoriteEntry[];
}

export async function putFavorite(
  ref: string,
  status: SavedStatus
): Promise<FavoriteEntry> {
  const r = await request("PUT", `${BASE}/${encodeURIComponent(ref)}`, { status });
  return (await r.json()) as FavoriteEntry;
}

export async function deleteFavorite(ref: string): Promise<void> {
  await request("DELETE", `${BASE}/${encodeURIComponent(ref)}`);
}
