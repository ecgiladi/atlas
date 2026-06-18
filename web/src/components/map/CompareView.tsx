"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

import {
  DECIDABLE_AXES,
  UPCOMING_AXES,
  winnersForAxis,
  type CompareItem,
} from "./compare";
import { type PlaceDetail } from "./place";
import styles from "./CompareView.module.css";

// Full-screen decision table: template axes as rows, selected places as columns.
// Winner-per-row highlight on the decidable axes (cost/visa/flight). Provenance lives
// on the card (column header tap) — cells stay clean.
export default function CompareView({
  items,
  onClose,
  onOpenCard,
}: {
  items: CompareItem[];
  onClose: () => void;
  onOpenCard: (ref: string) => void;
}) {
  const [places, setPlaces] = useState<PlaceDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refs = items.map((i) => i.ref).join(",");
    setError(null);
    setPlaces(null);
    fetch(`/api/places/compare?refs=${encodeURIComponent(refs)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as PlaceDetail[];
      })
      .then((d) => {
        if (!cancelled) setPlaces(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
    // refs string is the real dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.ref).join(",")]);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="השוואה" data-testid="compare-view">
      <header className={styles.header}>
        <h2 className={styles.title}>השוואה</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="סגירה">
          <X size={22} aria-hidden />
        </button>
      </header>

      {error && <p className={styles.status} role="alert">טעינת ההשוואה נכשלה ({error})</p>}
      {!places && !error && <p className={styles.status}>טוען…</p>}

      {places && (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={`${styles.cornerCell} ${styles.axisHead}`} scope="col" />
                {places.map((p) => (
                  <th key={p.id} className={styles.placeHead} scope="col">
                    <button
                      type="button"
                      className={styles.placeName}
                      onClick={() => p.iso3 && onOpenCard(p.iso3)}
                    >
                      {p.name_he}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DECIDABLE_AXES.map((axis) => {
                const winners = winnersForAxis(places, axis);
                return (
                  <tr key={String(axis.key)}>
                    <th className={styles.axisHead} scope="row">
                      {axis.label}
                    </th>
                    {places.map((p, i) => {
                      const win = winners.has(i);
                      return (
                        <td
                          key={p.id}
                          className={`${styles.cell} ${win ? styles.winner : ""}`}
                          data-winner={win ? "true" : undefined}
                        >
                          {win && <Check size={14} className={styles.check} aria-label="המוביל בציר זה" />}
                          {axis.format(p[axis.key])}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              <tr className={styles.upcomingDivider}>
                <th className={styles.axisHead} scope="row" colSpan={1}>
                  צירים נוספים
                </th>
                <td className={styles.upcomingNote} colSpan={places.length}>
                  יתווספו בהעשרה
                </td>
              </tr>
              {UPCOMING_AXES.map((axis) => (
                <tr key={String(axis.key)} className={styles.upcomingRow}>
                  <th className={`${styles.axisHead} ${styles.axisHeadMuted}`} scope="row">
                    {axis.label}
                  </th>
                  {places.map((p) => (
                    <td key={p.id} className={`${styles.cell} ${styles.cellMuted}`}>
                      {axis.format(p[axis.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
