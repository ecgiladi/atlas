"use client";

import { useEffect, useRef, useState } from "react";
import { Calculator, CornerDownLeft, ExternalLink, Info } from "lucide-react";

import { describeProvenance, type Provenance } from "./place";
import styles from "./ProvenanceBadge.module.css";

const ICONS = {
  external: Info,
  computed: Calculator,
  inherited: CornerDownLeft,
} as const;

// The headline affordance: a small, unobtrusive "where did this come from" marker that
// sits NEXT TO a value (never a footnote). Quiet until tapped/hovered, then a popover
// names the source, its date, and a link (external) or method (computed).
export default function ProvenanceBadge({
  prov,
  fieldLabel,
}: {
  prov: Provenance;
  fieldLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const info = describeProvenance(prov);
  const Icon = ICONS[info.kind];

  // Close on outside click (so a tapped-open popover dismisses on mobile).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className={styles.wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={styles.trigger}
        aria-label={`מקור המידע: ${fieldLabel}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Icon size={14} aria-hidden />
      </button>

      {open && (
        <span className={styles.popover} role="tooltip">
          <span className={styles.source}>{info.title}</span>
          {info.dateText && <span className={styles.date}>עודכן {info.dateText}</span>}
          {info.method && <span className={styles.method}>{info.method}</span>}
          {info.kind === "external" && info.url && (
            <a
              className={styles.link}
              href={info.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={13} aria-hidden />
              למקור
            </a>
          )}
        </span>
      )}
    </span>
  );
}
