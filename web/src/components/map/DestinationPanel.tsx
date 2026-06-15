"use client";

import { ChevronDown, X } from "lucide-react";

import DestinationCard from "./DestinationCard";
import type { Destination } from "./destinations";
import styles from "./DestinationPanel.module.css";

// The drill funnel panel: classic-first destination cards, revealed a tier (3) at a time,
// synced with the map pins. Region labels annotate each card (they don't navigate). Tapping
// a card opens that destination's full place-card.
export default function DestinationPanel({
  countryNameHe,
  destinations,
  revealed,
  total,
  loading,
  error,
  onReveal,
  onOpen,
  onClose,
}: {
  countryNameHe: string;
  destinations: Destination[];
  revealed: number;
  total: number;
  loading: boolean;
  error: string | null;
  onReveal: () => void;
  onOpen: (ref: string) => void;
  onClose: () => void;
}) {
  const visible = destinations.slice(0, revealed);
  const remaining = total - visible.length;

  return (
    <aside className={styles.panel} aria-label={`יעדים ב${countryNameHe}`} data-testid="destination-panel">
      <header className={styles.header}>
        <h2 className={styles.title}>יעדים ב{countryNameHe}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="סגירה">
          <X size={20} aria-hidden />
        </button>
      </header>

      {loading && destinations.length === 0 && <p className={styles.status}>טוען יעדים…</p>}
      {error && (
        <p className={styles.status} role="alert">
          טעינת היעדים נכשלה ({error})
        </p>
      )}
      {!loading && !error && destinations.length === 0 && (
        <p className={styles.status}>אין עדיין יעדים ליעד זה.</p>
      )}

      {visible.length > 0 && (
        <>
          <p className={styles.count} aria-live="polite">
            מציג {visible.length} מתוך {total} · הקלאסיים ראשונים
          </p>
          <div className={styles.list} data-testid="destination-cards">
            {visible.map((d) => (
              <DestinationCard key={d.id} d={d} onOpen={onOpen} />
            ))}
          </div>
        </>
      )}

      {remaining > 0 && (
        <button type="button" className={styles.more} onClick={onReveal} data-testid="reveal-more">
          <ChevronDown size={16} aria-hidden />
          עוד {Math.min(remaining, 3)} יעדים
        </button>
      )}
    </aside>
  );
}
