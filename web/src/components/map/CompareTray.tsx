"use client";

import { Scale, X } from "lucide-react";

import { type CompareItem } from "./compare";
import styles from "./CompareTray.module.css";

// Persistent selection bar. Visible once >=1 place is selected (compare-building mode).
// >=2 enables "השווה". Chips remove individually; "נקה" clears all.
export default function CompareTray({
  items,
  onRemove,
  onClear,
  onCompare,
}: {
  items: CompareItem[];
  onRemove: (ref: string) => void;
  onClear: () => void;
  onCompare: () => void;
}) {
  if (items.length === 0) return null;
  const canCompare = items.length >= 2;

  return (
    <div className={styles.tray} role="region" aria-label="השוואת יעדים" data-testid="compare-tray">
      <div className={styles.chips}>
        {items.map((it) => (
          <span key={it.ref} className={styles.chip}>
            {it.name_he}
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={`הסרת ${it.name_he}`}
              onClick={() => onRemove(it.ref)}
            >
              <X size={14} aria-hidden />
            </button>
          </span>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.clear} onClick={onClear}>
          נקה
        </button>
        <button
          type="button"
          className={styles.compare}
          disabled={!canCompare}
          onClick={onCompare}
          data-testid="compare-go"
        >
          <Scale size={16} aria-hidden />
          השווה ({items.length})
        </button>
      </div>
    </div>
  );
}
