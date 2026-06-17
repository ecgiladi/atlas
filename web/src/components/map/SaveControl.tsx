"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";

import {
  SAVED_STATUSES,
  type SavedStatus,
  statusLabelHe,
  getFavoriteState,
  putFavorite,
  deleteFavorite,
  FetchError,
} from "./favorites";
import styles from "./SaveControl.module.css";

// Turn any thrown error into one Hebrew line + a detailed console log (status + body).
// We DELIBERATELY do not hide failures: a silent optimistic revert makes a broken save
// look like "nothing happened", which is exactly the device bug we're chasing.
function reportError(action: string, e: unknown): string {
  if (e instanceof FetchError) {
    console.error(`[SaveControl] ${action} failed`, {
      status: e.status,
      body: e.body,
      message: e.message,
    });
    if (e.status === 0) return "השמירה נכשלה — אין חיבור לשרת.";
    return `השמירה נכשלה (שגיאה ${e.status}).`;
  }
  console.error(`[SaveControl] ${action} failed`, e);
  return "השמירה נכשלה.";
}

// The "אתה שופט" capture on a place card: save (heart) defaults to 'shortlist', a small
// status selector records the judgment (מתלבט / רוצה / הייתי), toggling the heart off
// removes. All state is server-side; we keep an optimistic local mirror and revert on error.
export default function SaveControl({
  placeRef,
  favVersion,
  onChanged,
}: {
  placeRef: string;
  favVersion: number;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<SavedStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync to server state when the place changes or favorites mutate elsewhere
  // (e.g. removed from the favorites sheet). A failed read is shown, not swallowed —
  // otherwise a saved place looks unsaved (empty heart) and the next tap "loses" it.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFavoriteState(placeRef)
      .then((s) => {
        if (!cancelled) setStatus(s.saved ? s.status : null);
      })
      .catch((e) => {
        if (!cancelled) {
          setStatus(null);
          setError(reportError("load", e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [placeRef, favVersion]);

  const saved = status !== null;

  async function toggleSave() {
    if (busy) return;
    const prev = status;
    setBusy(true);
    setError(null);
    try {
      if (saved) {
        setStatus(null); // optimistic
        await deleteFavorite(placeRef);
      } else {
        setStatus("shortlist");
        await putFavorite(placeRef, "shortlist");
      }
      onChanged();
    } catch (e) {
      setStatus(prev); // revert — but loudly: show the error so it isn't a silent no-op
      setError(reportError(saved ? "remove" : "save", e));
    } finally {
      setBusy(false);
    }
  }

  async function pick(next: SavedStatus) {
    if (busy || next === status) return;
    const prev = status;
    setBusy(true);
    setError(null);
    setStatus(next); // optimistic
    try {
      await putFavorite(placeRef, next);
      onChanged();
    } catch (e) {
      setStatus(prev);
      setError(reportError("status change", e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.wrap} aria-label="שמירה ליעדים שלי">
      <button
        type="button"
        className={`${styles.heart} ${saved ? styles.heartOn : ""}`}
        onClick={toggleSave}
        disabled={loading || busy}
        aria-pressed={saved}
        aria-label={saved ? "הסרה מהיעדים שלי" : "שמירה ליעדים שלי"}
      >
        <Heart size={18} fill={saved ? "currentColor" : "none"} aria-hidden />
        <span>{saved ? "שמור" : "שמירה"}</span>
      </button>

      {saved && (
        <div className={styles.statuses} role="group" aria-label="סטטוס">
          {SAVED_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.statusPill} ${s === status ? styles.statusActive : ""}`}
              onClick={() => pick(s)}
              disabled={busy}
              aria-pressed={s === status}
            >
              {statusLabelHe(s)}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
