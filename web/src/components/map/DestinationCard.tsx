"use client";

import { MapPin, Mountain, Building2 } from "lucide-react";

import ProvenanceBadge from "./ProvenanceBadge";
import {
  type Destination,
  monthsHe,
  touristyLabelHe,
  busyLabelHe,
  siteTypeLabelHe,
} from "./destinations";
import { flightPriceBandHe, isEstimate, shekelPer } from "./place";
import styles from "./DestinationCard.module.css";

// The uniform destination template: the SAME shape for every destination = the consolidated
// format. Identity + region label + the destination axes, each value carrying its
// ProvenanceBadge (so cost shows own/inherited/הערכה honestly). Tapping opens the full card.
export default function DestinationCard({
  d,
  onOpen,
}: {
  d: Destination;
  onOpen: (ref: string) => void;
}) {
  const prov = d.provenance ?? {};
  const isNatural = d.site_type === "natural";
  const tour = touristyLabelHe(d.character_touristy_authentic);
  const busy = busyLabelHe(d.character_busy_quiet);

  // City cost is absolute ₪ (the cost_vs_israel index is a country tool, dropped here).
  const daily = shekelPer(d.daily_budget, "ליום");
  const night = shekelPer(d.price_night, "ללילה");
  const band = flightPriceBandHe(d.flight_price_band);
  // Soft estimates render visibly distinct from computed/sourced values.
  const dailyEst = isEstimate(prov.daily_budget);
  const nightEst = isEstimate(prov.price_night);
  const bandEst = isEstimate(prov.flight_price_band);

  return (
    <article
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(d.slug)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(d.slug);
        }
      }}
    >
      {/* identity + region label */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.name}>{d.name_he}</h3>
          {d.name_en && <span className={styles.nameEn}>{d.name_en}</span>}
        </div>
        <div className={styles.chips}>
          <span className={styles.chipType}>
            {isNatural ? <Mountain size={12} aria-hidden /> : <Building2 size={12} aria-hidden />}
            {siteTypeLabelHe(d.site_type)}
          </span>
          {d.region_label && (
            <span className={styles.chipRegion}>
              <MapPin size={12} aria-hidden />
              {d.region_label}
            </span>
          )}
        </div>
      </header>

      {d.culture_section && <p className={styles.blurb}>{d.culture_section}</p>}

      {/* destination axes — uniform for every card; each value carries its provenance.
          City cost is absolute ₪ (יום מחיה / יום לינה), never the country index. */}
      <dl className={styles.axes}>
        <div className={styles.axis}>
          <dt>יום מחיה</dt>
          <dd>
            <span className={dailyEst ? styles.estimate : undefined}>
              {daily ?? "אין נתון"}
            </span>
            {prov.daily_budget && (
              <ProvenanceBadge prov={prov.daily_budget} fieldLabel="יום מחיה" />
            )}
          </dd>
        </div>

        <div className={styles.axis}>
          <dt>יום לינה</dt>
          <dd>
            <span className={nightEst ? styles.estimate : undefined}>
              {night ?? "אין נתון"}
            </span>
            {prov.price_night && (
              <ProvenanceBadge prov={prov.price_night} fieldLabel="יום לינה" />
            )}
          </dd>
        </div>

        <div className={styles.axis}>
          <dt>טיסה</dt>
          <dd className={styles.flightDd}>
            <span className={styles.flightLine}>
              <span>
                {d.flight_from_tlv_minutes == null
                  ? "אין נתון"
                  : `~${d.flight_from_tlv_minutes} דק׳`}
              </span>
              {prov.flight_from_tlv_minutes && (
                <ProvenanceBadge prov={prov.flight_from_tlv_minutes} fieldLabel="זמן טיסה" />
              )}
            </span>
            {band && (
              <span className={styles.flightLine}>
                <span className={bandEst ? styles.estimate : undefined}>מחיר {band}</span>
                {prov.flight_price_band && (
                  <ProvenanceBadge prov={prov.flight_price_band} fieldLabel="מחיר טיסה" />
                )}
              </span>
            )}
          </dd>
        </div>

        <div className={styles.axis}>
          <dt>עונה מומלצת</dt>
          <dd>
            <span>{monthsHe(d.season_best_months)}</span>
            {prov.season_best_months && (
              <ProvenanceBadge prov={prov.season_best_months} fieldLabel="עונה" />
            )}
          </dd>
        </div>

        <div className={styles.axis}>
          <dt>אופי</dt>
          <dd>
            <span>
              {tour ?? "—"}
              {busy ? ` · ${busy}` : ""}
            </span>
            {prov.character_touristy_authentic && (
              <ProvenanceBadge prov={prov.character_touristy_authentic} fieldLabel="אופי" />
            )}
          </dd>
        </div>

        {(d.good_for?.length ?? 0) > 0 && (
          <div className={styles.axis}>
            <dt>מתאים ל־</dt>
            <dd>
              <div className={styles.tags}>
                {d.good_for!.map((t) => (
                  <span key={t} className={styles.tag}>
                    {t}
                  </span>
                ))}
              </div>
              {prov.good_for && <ProvenanceBadge prov={prov.good_for} fieldLabel="מתאים ל" />}
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}
