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

async function asJson<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

export async function getFavoriteState(ref: string): Promise<FavoriteState> {
  return asJson<FavoriteState>(await fetch(`${BASE}/${encodeURIComponent(ref)}`));
}

export async function listFavorites(status?: SavedStatus): Promise<FavoriteEntry[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return asJson<FavoriteEntry[]>(await fetch(`${BASE}${qs}`));
}

export async function putFavorite(
  ref: string,
  status: SavedStatus
): Promise<FavoriteEntry> {
  return asJson<FavoriteEntry>(
    await fetch(`${BASE}/${encodeURIComponent(ref)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    })
  );
}

export async function deleteFavorite(ref: string): Promise<void> {
  const r = await fetch(`${BASE}/${encodeURIComponent(ref)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}
