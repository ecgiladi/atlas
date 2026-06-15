"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart, X, Trash2 } from "lucide-react";

import { visaLabelHe } from "./encodings";
import { flightBandHe, levelLabelHe } from "./place";
import {
  SAVED_STATUSES,
  type FavoriteEntry,
  type SavedStatus,
  statusLabelHe,
  listFavorites,
  deleteFavorite,
} from "./favorites";
import styles from "./FavoritesSheet.module.css";

type Filter = "all" | SavedStatus;

// The favorites screen: everything the human has judged so far, grouped by status and
// filterable. Tap a row to open its full card; remove with the trash button. Empty state
// invites the first save. State is server-side — this just reads & mutates it.
export default function FavoritesSheet({
  open,
  favVersion,
  onSelectPlace,
  onChanged,
  onClose,
}: {
  open: boolean;
  favVersion: number;
  onSelectPlace: (ref: string) => void;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<FavoriteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listFavorites()
      .then((d) => {
        if (!cancelled) setEntries(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, favVersion]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: entries.length, shortlist: 0, want: 0, been: 0 };
    for (const e of entries) c[e.status] += 1;
    return c;
  }, [entries]);

  const visible = filter === "all" ? entries : entries.filter((e) => e.status === filter);

  async function remove(ref: string) {
    const prev = entries;
    setEntries((es) => es.filter((e) => e.place.ref !== ref)); // optimistic
    try {
      await deleteFavorite(ref);
      onChanged();
    } catch (e) {
      setEntries(prev); // revert
      console.error("[FavoritesSheet] remove failed:", e);
    }
  }

  if (!open) return null;

  return (
    <aside className={styles.panel} aria-label="היעדים שלי" data-testid="favorites-sheet">
      <header className={styles.header}>
        <h2 className={styles.title}>
          <Heart size={18} aria-hidden /> היעדים שלי
        </h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="סגירה">
          <X size={20} aria-hidden />
        </button>
      </header>

      <div className={styles.filters} role="group" aria-label="סינון לפי סטטוס">
        {(["all", ...SAVED_STATUSES] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`${styles.filterPill} ${f === filter ? styles.filterActive : ""}`}
            onClick={() => setFilter(f)}
            aria-pressed={f === filter}
          >
            {f === "all" ? "הכל" : statusLabelHe(f)}
            <span className={styles.count}>{counts[f]}</span>
          </button>
        ))}
      </div>

      {loading && entries.length === 0 && <p className={styles.status}>טוען…</p>}
      {error && (
        <p className={styles.status} role="alert">
          טעינת היעדים נכשלה ({error})
        </p>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className={styles.empty}>
          <Heart size={28} aria-hidden />
          <p>עדיין לא שמרת יעדים.</p>
          <p className={styles.emptyHint}>
            בחר יעד במפה ולחץ על הלב כדי להתחיל לבנות את רשימת המועמדים שלך.
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <ul className={styles.list}>
          {visible.map((e) => (
            <li key={e.id} className={styles.row}>
              <button
                type="button"
                className={styles.rowMain}
                onClick={() => {
                  onSelectPlace(e.place.ref);
                  onClose();
                }}
              >
                <div className={styles.rowTitle}>
                  <span className={styles.rowName}>{e.place.name_he}</span>
                  <span className={styles.rowStatus}>{statusLabelHe(e.status)}</span>
                </div>
                <div className={styles.rowMeta}>
                  <span className={styles.rowChip}>{levelLabelHe(e.place.level)}</span>
                  {e.place.visa_status && (
                    <span className={styles.rowMetaItem}>{visaLabelHe(e.place.visa_status)}</span>
                  )}
                  {e.place.cost_vs_israel != null && (
                    <span className={styles.rowMetaItem}>עלות {e.place.cost_vs_israel}</span>
                  )}
                  {e.place.flight_from_tlv_minutes != null && (
                    <span className={styles.rowMetaItem}>
                      {flightBandHe(e.place.flight_from_tlv_minutes)}
                    </span>
                  )}
                </div>
              </button>
              <button
                type="button"
                className={styles.remove}
                onClick={() => remove(e.place.ref)}
                aria-label={`הסרת ${e.place.name_he}`}
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && entries.length > 0 && visible.length === 0 && (
        <p className={styles.status}>אין יעדים בסטטוס הזה.</p>
      )}
    </aside>
  );
}
