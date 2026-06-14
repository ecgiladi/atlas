"use client";

import { X } from "lucide-react";

import { VISA_COLORS, visaLabelHe } from "./encodings";
import type { CountryDatum } from "./types";
import styles from "./SidePanel.module.css";

function flightBand(min: number | null): string {
  if (min == null) return "אין נתונים";
  if (min < 180) return "קצר (קרוב)";
  if (min < 360) return "בינוני";
  if (min < 600) return "ארוך";
  return "ארוך מאוד";
}

export default function SidePanel({
  country,
  onClose,
}: {
  country: CountryDatum | null;
  onClose: () => void;
}) {
  if (!country) return null;
  const { name_he, visa_status, visa_note, cost_vs_israel, flight_from_tlv_minutes } =
    country;

  return (
    <aside className={styles.panel} aria-label={`פרטים על ${name_he}`}>
      <div className={styles.header}>
        <h2 className={styles.name}>{name_he}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="סגירה">
          <X size={20} aria-hidden />
        </button>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>עלות</span>
        <span className={styles.value}>
          {cost_vs_israel == null
            ? "אין נתונים"
            : `${cost_vs_israel} ביחס לישראל (100)`}
        </span>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>ויזה (דרכון ישראלי)</span>
        <span
          className={styles.badge}
          style={{
            background: visa_status ? VISA_COLORS[visa_status] : "var(--atlas-text-muted)",
          }}
        >
          {visaLabelHe(visa_status)}
        </span>
        {visa_note && <span className={styles.note}>{visa_note}</span>}
      </div>

      <div className={styles.field}>
        <span className={styles.label}>זמן טיסה מנתב"ג</span>
        <span className={styles.value}>
          {flightBand(flight_from_tlv_minutes)}
          {flight_from_tlv_minutes != null && ` · ~${flight_from_tlv_minutes} דק׳`}
        </span>
      </div>

      <p className={styles.stub}>
        כרטיס היעד המלא, עם מקורות לכל שדה, יגיע בקרוב.
      </p>
    </aside>
  );
}
