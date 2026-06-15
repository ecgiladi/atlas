"use client";

import { METRIC_LABELS, NO_DATA_COLOR, legendFor, type Metric } from "./encodings";
import styles from "./Legend.module.css";

function rampGradient(stops: Array<[number, string]>): string {
  const min = stops[0][0];
  const max = stops[stops.length - 1][0];
  const parts = stops.map(
    ([v, c]) => `${c} ${Math.round(((v - min) / (max - min)) * 100)}%`
  );
  // RTL: flip so the visual low/high matches the labels we render below.
  return `linear-gradient(to left, ${parts.join(", ")})`;
}

export default function Legend({ metric }: { metric: Metric }) {
  const spec = legendFor(metric);
  return (
    <div className={styles.legend}>
      <p className={styles.title}>{METRIC_LABELS[metric]}</p>

      {spec.kind === "categorical" ? (
        spec.swatches.map((s) => (
          <div className={styles.row} key={s.label}>
            <span className={styles.swatch} style={{ background: s.color }} />
            {s.label}
          </div>
        ))
      ) : (
        <>
          <div className={styles.ramp} style={{ background: rampGradient(spec.stops) }} />
          <div className={styles.rampLabels}>
            <span>{spec.lowLabel}</span>
            <span>{spec.highLabel}</span>
          </div>
        </>
      )}

      <div className={styles.divider} />
      <div className={styles.row}>
        <span className={styles.swatch} style={{ background: NO_DATA_COLOR }} />
        אין נתונים
      </div>
    </div>
  );
}
