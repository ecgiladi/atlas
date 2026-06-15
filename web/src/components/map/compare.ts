// Compare-view logic: the template axes as comparable rows + per-row winner computation.
// Winners are computed client-side from the /api/places/compare payload (array of the
// place-detail shape). Kept separate from rendering so the rules are unit-clear.

import { visaLabelHe } from "./encodings";
import { flightBandHe, type PlaceDetail } from "./place";

// A place selected for comparison (tray chip + compare column).
export interface CompareItem {
  ref: string; // iso3 (matches the map feature id + /api/places/{ref})
  name_he: string;
}

export const COMPARE_CAP = 3;

// Visa ordinal ease: best (easiest for an Israeli passport) -> worst. Mirrors the
// backend VISA_STATUS_EASE; lower rank = better.
const VISA_EASE_RANK: Record<string, number> = {
  visa_free: 0,
  eta_evisa: 1,
  voa: 2,
  visa_required: 3,
};

export type WinnerDirection = "lower" | "visa" | "none";

export interface CompareAxis {
  key: keyof PlaceDetail;
  label: string;
  // "lower"/"visa" -> a winner can be crowned; "none" -> subjective, display only.
  direction: WinnerDirection;
  // Decidable for countries today (cost/visa/flight). The rest are template rows that
  // light up with enrichment; shown subtly as "—" for now.
  comparableNow: boolean;
  format: (v: unknown) => string;
}

const fmtNum = (v: unknown) => (v == null ? "—" : String(v));

// Decidable now — these carry the winner highlight.
export const DECIDABLE_AXES: CompareAxis[] = [
  {
    key: "visa_status",
    label: "ויזה (דרכון ישראלי)",
    direction: "visa",
    comparableNow: true,
    format: (v) => (v == null ? "—" : visaLabelHe(v as string)),
  },
  {
    key: "cost_vs_israel",
    label: "עלות · ישראל=100",
    direction: "lower",
    comparableNow: true,
    format: fmtNum,
  },
  {
    key: "flight_from_tlv_minutes",
    label: 'טיסה מנתב״ג',
    direction: "lower",
    comparableNow: true,
    format: (v) => (v == null ? "—" : `${flightBandHe(v as number)} · ~${v} דק׳`),
  },
];

// Template axes that aren't decidable yet (NULL at country level). Rendered subtly as
// "—" so the template shape is visible and auto-lights-up as data lands.
export const UPCOMING_AXES: CompareAxis[] = [
  { key: "safety_level", label: "בטיחות", direction: "none", comparableNow: false, format: fmtNum },
  { key: "language_barrier", label: "מחסום שפה", direction: "none", comparableNow: false, format: fmtNum },
  { key: "character_touristy_authentic", label: "תיירותי ↔ אותנטי", direction: "none", comparableNow: false, format: fmtNum },
  { key: "good_for", label: "מתאים ל־", direction: "none", comparableNow: false, format: (v) => ((v as string[] | null)?.length ? (v as string[]).join(", ") : "—") },
  { key: "climate", label: "אקלים", direction: "none", comparableNow: false, format: (v) => (v == null ? "—" : String(v)) },
  { key: "season_best_months", label: "עונה מומלצת", direction: "none", comparableNow: false, format: (v) => ((v as number[] | null)?.length ? (v as number[]).join(", ") : "—") },
];

// Compute the winning column indices for an axis. Empty set = no crown:
//   - subjective axis (direction "none")
//   - fewer than 2 places have a value (incomparable / single-value case)
// Ties: every column at the best value is returned.
export function winnersForAxis(places: PlaceDetail[], axis: CompareAxis): Set<number> {
  const winners = new Set<number>();
  if (axis.direction === "none") return winners;

  const scored: Array<{ i: number; score: number }> = [];
  places.forEach((p, i) => {
    const raw = p[axis.key];
    if (raw == null) return;
    if (axis.direction === "visa") {
      const rank = VISA_EASE_RANK[raw as string];
      if (rank != null) scored.push({ i, score: rank });
    } else {
      scored.push({ i, score: raw as number });
    }
  });

  // Need at least 2 comparable values to crown anyone.
  if (scored.length < 2) return winners;

  const best = Math.min(...scored.map((s) => s.score));
  for (const s of scored) if (s.score === best) winners.add(s.i);
  return winners;
}
