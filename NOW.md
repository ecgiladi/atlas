# Atlas — NOW

**Personal, Hebrew-RTL, map-first travel discovery & comparison tool for an Israeli traveler.**

Last updated: 2026-06-14 · Status: bootstrap (data model + seed only, no UI yet)

---

## Vision

Travel research today is scattered across forums and Facebook groups — unstructured,
unsourced, and impossible to compare. Atlas replaces that with a **structured, sourced,
comparable place profile** surfaced through a **curiosity-driven world map**. You explore
by zooming the map; every place you open is the same template, filled with the same axes,
each fact tagged with where it came from — so you can actually *compare* candidates
instead of re-reading ten threads.

Everything is localized for an Israeli traveler:
- Hebrew UI, RTL throughout.
- Flight time & price band measured **from TLV**.
- Visa shown **for the Israeli passport**.
- Cost expressed **relative to Israel (Israel = 100)**.

---

## Core model decisions (implemented — do not re-litigate)

- **LEVEL is a first-class field.** Hierarchy: `continent > country > city > site_or_route`.
- **Comparison happens WITHIN a level only** — country vs country, city vs city, etc.
- **Inheritance flows DOWNWARD.** A city inherits country-level facts (Israeli-passport
  visa, flight-from-TLV, baseline safety, cost baseline) so child entries stay light.
  Resolution = nearest non-null ancestor wins; own value always overrides. See
  `backend/app/inheritance.py` for the inheritable field set.
- **History is NOT a level** — it's a site with `site_type = historical`.
- **Local culture is NOT a level** — it's a content section (`culture_section`) on
  country/city.
- **Map zoom == data level.** Zoomed out = country choropleth; zoomed in = city/site pins.

### Acquisition modes
- **MACRO** (continent/country): pre-seeded, bounded (~195 countries), mostly quantitative.
  Quantitative axes come from **NAMED sources** (Numbeo cost-of-living, safety indices,
  visa-by-passport datasets) via ingestion — **NO LLM** for these.
- **MICRO** (city/site/route): on-demand extraction via **Claude API + web search** into
  the template, with **per-field source citation** stored. Same "extract-into-template"
  pattern as the GigaBait recipe module. Grows with use.

### Provenance
Every qualitative/extracted field can carry a citation (`source_url` + `fetched_at`) in the
`field_source` table, so the place card can show "where this came from".

---

## Data model (this session)

- `place` — the spine. `level`, self-FK `parent_id`, identity (`name_he/name_en/slug`),
  geo (`lat/lng` + `geojson_ref`), and the full comparison-axis column set.
- `site_or_route` fields live on `place` (gated by `level = site_or_route` + `site_type`):
  trail (`length_km/difficulty/duration_min`), attraction
  (`visit_minutes/ticket_price/best_time_of_day`).
- `field_source` — per-field provenance (`place_id`, `field_name`, `source_url`, `fetched_at`).
- `app_user` — minimal user anchor (single-user personal app for now).
- `saved_place` — links user→place with `status` (`shortlist|want|been`) for the
  "compare my candidates" flow.

See the migration `backend/alembic/versions/0001_initial_schema.py` and models in
`backend/app/models/`.

---

## Stack & infra

FastAPI + Next.js 14 (App Router) + PostgreSQL + Redis, Docker (Babel, not SWC),
uv (Python) / pnpm (web), nginx routing, daily `pg_dump`.

**Assigned for Atlas (confirmed 2026-06-14):**
| Resource   | Value                       |
|------------|-----------------------------|
| Subdomain  | `atlas.giladihome.info`     |
| Web port   | `3003` → container `3000`   |
| API port   | `8003` → container `8000`   |
| Postgres   | `5434` (127.0.0.1 only)     |
| Redis      | `6380` (127.0.0.1 only)     |

---

## Roadmap (next sessions)

1. **Seed loader (MACRO)** — ingest ~195 countries with quantitative axes from named
   sources (Numbeo cost-of-living, safety indices, visa-by-passport). No LLM.
2. **Map shell** — MapLibre GL JS: vector basemap + country-fill choropleth (zoomed out)
   → city/site markers (zoomed in). Zoom level drives the queried data level.
3. **Place card** — the template, rendered with per-field provenance badges.
4. **Compare view** — side-by-side within a level, over the comparison axes; sort/rank.
5. **Extraction pipeline (MICRO)** — Claude API + web search → extract into template with
   per-field citations; same pattern as GigaBait recipe module.
6. **Filters** — by axis (season, cost band, flight band, safety, good_for tags, character,
   language barrier). **Planned:** a "travel advisories / מל״ל warnings" filter sourced
   from official advisories.
7. **Saved / compare-my-candidates** — shortlist/want/been flows over `saved_place`.

### Deferred / parked
- Auth: single-user `app_user` anchor for now; wire real JWT auth when multi-user.
- `geojson_ref` storage shape (R2 key vs inline) — decide at choropleth time.
- Currency: monetary axes stored as ILS integers for now.
