"use client";

import { Stamp, Coins, Plane } from "lucide-react";

import { METRIC_LABELS, type Metric } from "./encodings";
import styles from "./MetricToggle.module.css";

const ICONS: Record<Metric, typeof Coins> = {
  visa: Stamp,
  cost: Coins,
  flight: Plane,
};

const ORDER: Metric[] = ["visa", "cost", "flight"];

export default function MetricToggle({
  metric,
  onChange,
}: {
  metric: Metric;
  onChange: (m: Metric) => void;
}) {
  return (
    <div className={styles.toggle} role="radiogroup" aria-label="בחירת מדד">
      {ORDER.map((m) => {
        const Icon = ICONS[m];
        const active = m === metric;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            className={`${styles.button} ${active ? styles.active : ""}`}
            onClick={() => onChange(m)}
          >
            <Icon size={16} aria-hidden />
            {METRIC_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}
