"use client";

import { useEffect, useState } from "react";
import { Home, X } from "lucide-react";

import { VISA_COLORS, visaLabelHe } from "./encodings";
import ProvenanceBadge from "./ProvenanceBadge";
import { flightBandHe, levelLabelHe, type PlaceDetail } from "./place";
import styles from "./PlaceCard.module.css";

// Fetch the full place detail when the selected reference (iso3/slug) changes. The card
// IS the template: same sections every place fills, so the compare view can reuse it.
export default function PlaceCard({
  placeRef,
  onClose,
}: {
  placeRef: string | null;
  onClose: () => void;
}) {
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!placeRef) {
      setPlace(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/places/${encodeURIComponent(placeRef)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as PlaceDetail;
      })
      .then((d) => {
        if (!cancelled) setPlace(d);
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
  }, [placeRef]);

  if (!placeRef) return null;

  return (
    <aside className={styles.panel} aria-label="כרטיס יעד" data-testid="place-card">
      <button type="button" className={styles.close} onClick={onClose} aria-label="סגירה">
        <X size={20} aria-hidden />
      </button>

      {loading && !place && <p className={styles.status}>טוען…</p>}
      {error && !place && (
        <p className={styles.status} role="alert">
          טעינת הכרטיס נכשלה ({error})
        </p>
      )}
      {place && <CardBody place={place} />}
    </aside>
  );
}

function CardBody({ place }: { place: PlaceDetail }) {
  const prov = place.provenance;
  const isHome = place.is_home;

  // Optional sections are all NULL for countries today; render only what's present and
  // collapse the rest into one honest line instead of a wall of "אין נתון".
  const hasSafetyLang = place.safety_level != null || place.language_barrier != null;
  const hasCharacter =
    place.character_touristy_authentic != null ||
    place.character_busy_quiet != null ||
    (place.good_for?.length ?? 0) > 0;
  const hasSeason = (place.season_best_months?.length ?? 0) > 0 || place.climate != null;
  const hasNarrative = !!place.culture_section || !!place.history_context;
  const anyEmpty = !hasSafetyLang || !hasCharacter || !hasSeason || !hasNarrative;

  return (
    <>
      {/* 1. Header */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h2 className={styles.name}>{place.name_he}</h2>
          {place.name_en && <span className={styles.nameEn}>{place.name_en}</span>}
        </div>
        <div className={styles.chips}>
          <span className={styles.chip}>{levelLabelHe(place.level)}</span>
          {isHome && (
            <span className={`${styles.chip} ${styles.chipHome}`}>
              <Home size={13} aria-hidden /> בית
            </span>
          )}
          {place.enrichment_status === "partial" && (
            <span className={styles.chipMuted}>מידע חלקי</span>
          )}
        </div>
      </header>

      {/* 2. Essentials — each populated value carries its provenance badge */}
      <section className={styles.section}>
        {/* ויזה */}
        <div className={styles.field}>
          <span className={styles.label}>ויזה (דרכון ישראלי)</span>
          {isHome ? (
            <span className={styles.muted}>מדינת הבית — לא רלוונטי</span>
          ) : place.visa_status ? (
            <div className={styles.valueRow}>
              <span
                className={styles.pill}
                style={{ background: VISA_COLORS[place.visa_status] ?? "var(--atlas-text-muted)" }}
              >
                {visaLabelHe(place.visa_status)}
              </span>
              {prov.visa_status && <ProvenanceBadge prov={prov.visa_status} fieldLabel="ויזה" />}
            </div>
          ) : (
            <span className={styles.muted}>אין נתון</span>
          )}
          {!isHome && place.visa_note && <span className={styles.note}>{place.visa_note}</span>}
        </div>

        {/* עלות */}
        <div className={styles.field}>
          <span className={styles.label}>עלות</span>
          <div className={styles.valueRow}>
            <span className={styles.value}>
              {place.cost_vs_israel == null
                ? "אין נתון"
                : isHome
                  ? `${place.cost_vs_israel} · בסיס ההשוואה`
                  : `${place.cost_vs_israel} ביחס לישראל (100)`}
            </span>
            {prov.cost_vs_israel && (
              <ProvenanceBadge prov={prov.cost_vs_israel} fieldLabel="עלות" />
            )}
          </div>
        </div>

        {/* טיסה מנתב"ג */}
        <div className={styles.field}>
          <span className={styles.label}>זמן טיסה מנתב״ג</span>
          <div className={styles.valueRow}>
            <span className={styles.value}>
              {flightBandHe(place.flight_from_tlv_minutes)}
              {place.flight_from_tlv_minutes != null && ` · ~${place.flight_from_tlv_minutes} דק׳`}
            </span>
            {prov.flight_from_tlv_minutes && (
              <ProvenanceBadge prov={prov.flight_from_tlv_minutes} fieldLabel="זמן טיסה" />
            )}
          </div>
        </div>
      </section>

      {/* 3. בטיחות / שפה — render when present */}
      {hasSafetyLang && (
        <section className={styles.section}>
          {place.safety_level != null && (
            <div className={styles.field}>
              <span className={styles.label}>בטיחות</span>
              <span className={styles.value}>{place.safety_level}</span>
            </div>
          )}
          {place.language_barrier != null && (
            <div className={styles.field}>
              <span className={styles.label}>מחסום שפה</span>
              <span className={styles.value}>{place.language_barrier} / 5</span>
            </div>
          )}
        </section>
      )}

      {/* 4. אופי */}
      {hasCharacter && (
        <section className={styles.section}>
          {(place.good_for?.length ?? 0) > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>מתאים ל־</span>
              <div className={styles.tags}>
                {place.good_for!.map((t) => (
                  <span key={t} className={styles.tag}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 5. עונה + 6. נרטיב */}
      {hasSeason && place.climate != null && (
        <section className={styles.section}>
          <div className={styles.field}>
            <span className={styles.label}>אקלים</span>
            <span className={styles.value}>{place.climate}</span>
          </div>
        </section>
      )}
      {hasNarrative && (
        <section className={styles.section}>
          {place.culture_section && (
            <div className={styles.field}>
              <span className={styles.label}>תרבות</span>
              <p className={styles.prose}>{place.culture_section}</p>
            </div>
          )}
          {place.history_context && (
            <div className={styles.field}>
              <span className={styles.label}>היסטוריה</span>
              <p className={styles.prose}>{place.history_context}</p>
            </div>
          )}
        </section>
      )}

      {/* Honest empty-state line for the not-yet-enriched axes */}
      {anyEmpty && <p className={styles.comingSoon}>פרטים נוספים יתווספו בהעשרה</p>}
    </>
  );
}
