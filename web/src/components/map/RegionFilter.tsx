"use client";

import type { RegionOption } from "./destinations";
import styles from "./RegionFilter.module.css";

// Region filter chips above the funnel: הכל (default) + one chip per region present.
// It's a FILTER, not a forced step — the funnel still opens on הכל / classic-first; picking
// a region narrows the cards (and the pins) to that region, preserving classic-first order.
export default function RegionFilter({
  regions,
  active,
  onChange,
}: {
  regions: RegionOption[];
  active: string | null; // null = הכל (all regions)
  onChange: (value: string | null) => void;
}) {
  if (regions.length === 0) return null;

  return (
    <div className={styles.chips} role="group" aria-label="סינון לפי אזור" data-testid="region-filter">
      <button
        type="button"
        className={`${styles.chip} ${active === null ? styles.active : ""}`}
        aria-pressed={active === null}
        onClick={() => onChange(null)}
      >
        הכל
      </button>
      {regions.map((r) => (
        <button
          key={r.value}
          type="button"
          className={`${styles.chip} ${active === r.value ? styles.active : ""}`}
          aria-pressed={active === r.value}
          onClick={() => onChange(r.value)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
