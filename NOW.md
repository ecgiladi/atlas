# Atlas — NOW

**Personal, Hebrew-RTL, map-first travel discovery & comparison tool for an Israeli traveler.**

Last updated: 2026-06-15 · Status: map shell + place card merged to `master`; compare view
on `feat/compare` (pushed). Private remote `git@github.com:ecgiladi/atlas.git`.
Next: saved_place/shortlist + MICRO enrichment.

---

## Product North-Star

*Build TOWARD this — not just the next feature.*

- **THESIS:** Atlas is a **consolidation layer** for trip research, in an Israeli lens — it
  gathers and structures what's scattered across ten search engines into one sourced,
  comparable view.
- **CORE PRINCIPLE:** "אתה שופט, Atlas אוסף" (you judge, Atlas gathers). Keep human +
  delightful: taste, judgment, exploration (the fun). Absorb into Atlas: gathering,
  structuring, synthesis (the תכלול drudgery). **NEVER automate the judgment; ALWAYS absorb
  the collection.**
- **PAIN it kills:** fragmentation across many engines + the hard manual consolidation.
  **FUN it preserves:** exploring by economics (flight cost, cost-of-living, lodging,
  transport) and by character (sites / routes / attractions / culture).
- **DIFFERENTIATOR:** not any single stage (others do each) — the seamless, enjoyable
  **continuity across the arc** + consolidation-with-trust-in-an-Israeli-lens. Provenance
  badges = trustworthy consolidation; the uniform template = the consolidated format; the
  hierarchy = the funnel.
- **TIERED CONSOLIDATION** (protects trust + buildability):
  - *Stable/sourceable* (cost-of-living, visa, attraction/culture types, climate) →
    consolidate **natively** with provenance.
  - *Volatile/live* (flight fares, lodging prices) → **guidance + deep-link hand-off**
    (Booking / Google Flights), NOT live aggregation.
  - *Soft/estimated* (seasonal price, with/without-stops) → tag provenance as "הערכה",
    never as documented fact.
- **BUILD ORDER = chronological along the trip arc:** research (now: map + card + compare)
  → narrow/favorite → detailed planning (route) → execution (connections: sleep, flight
  estimate via hand-off).
- **Discovery mechanism** (when micro lands): "pull 3, refresh for next tier", classic-first
  by search/recommendation prominence, dedupe across refreshes — on-demand enrichment as
  progressive disclosure; the KB accretes as people explore.
- **Region = a GROUPING LABEL** on destinations ("North Italy"), NOT a 5th hierarchy level.

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
  geo (`lat/lng` + `geojson_ref`), `enrichment_status` (`stub|partial|enriched`, default
  `stub` — drives on-demand micro-growth + the "enrich this stub" UI), and the full
  comparison-axis column set.
- `good_for` is `text[]` constrained to a CONTROLLED vocabulary
  (`backend/app/vocab.py`, 12 tags), enforced app-side at the ORM layer (`@validates`)
  so every write — including the MICRO extraction pipeline — is covered (no filter rot).
- `site_or_route` fields live on `place` (gated by `level = site_or_route` + `site_type`):
  trail (`length_km/difficulty/duration_min`), attraction
  (`visit_minutes/ticket_price/best_time_of_day`).
- `field_source` — per-field provenance, unique on
  `(place_id, field_name, source_url)` so a narrative field can carry multiple sources.
- `app_user` — minimal user anchor (single-user personal app for now).
- `saved_place` — links user→place with `status` (`shortlist|want|been`) for the
  "compare my candidates" flow.

See the migration `backend/alembic/versions/0001_initial_schema.py` and models in
`backend/app/models/`.

---

## Stack & infra

FastAPI + Next.js 14 (App Router) + PostgreSQL + Redis, Docker (**SWC, not Babel** —
see Map shell note), uv (Python) / pnpm (web), nginx routing, daily `pg_dump`.
Remote: PRIVATE `git@github.com:ecgiladi/atlas.git` (VPS ed25519 SSH key, account `ecgiladi`).

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

1. **Seed loader (MACRO)** — ✅ DONE. Full run: 5 continents + 194 UN-member countries.
   `backend/app/loaders/` (`countries_src` mledoze backbone · `names_he` CLDR/babel ·
   `cost_src` World Bank · `visa_src` Wikipedia · `geo` haversine).
   `python -m app.loaders.seed_countries [CCA2...]`. Idempotent (upsert by iso2 / slug;
   field_source per place+field). Coverage: visa 193/194 (only Israel null — home country),
   cost 188/194 (6 genuine WB gaps: Cuba, Liechtenstein, Monaco, North Korea, Turkmenistan,
   Vatican). visa_status distribution: visa_free 98 · eta_evisa 52 · visa_required 33 · voa 9.
   - **cost_vs_israel**: the named WB indicator `PA.NUS.PPPC.RF` is ARCHIVED/unavailable;
     reconstructed as `PA.NUS.PPP / PA.NUS.FCRF` (its definition), rebased Israel=100.
   - **visa_status** is an ordinal ease enum (`visa_free|eta_evisa|voa|visa_required`),
     combos resolve to easiest; replaced the old `visa_israeli_required` bool (migration 0003).
     ESTA/eVisa → `eta_evisa`. Names matched via `build_name_index` + a small alias map.
   - Geo uses country centroid (dataset has no `capitalInfo`) — flight time is a coarse band;
     precise flight comes at city enrichment and overrides via inheritance.
   - DEFERRED to next session: safety_level (WB Political Stability), language_barrier (EF EPI).
2. **Map shell** — ✅ DONE (country level). MapLibre GL JS country-fill choropleth at `/`,
   3-metric live toggle (ויזה / עלות / זמן טיסה) via feature-state, hover tooltip + click
   side-panel stub, Israel-as-home, null-as-no-data. Endpoint `GET /api/map/countries`.
   Polygons = Natural Earth 110m admin-0 (`web/public/ne_110m_admin0.geojson`), joined on
   `ISO_A3_EH` ↔ `place.iso3`. Hebrew labels via locally-hosted Noto glyphs (`web/public/font/`).
   - **Compiler: SWC (NOT Babel) — documented, accepted deviation.** Babel's bundled Unicode
     tables in Next 14 can't compile maplibre's `\p{Script=…}` regexes (and noParse doesn't skip
     loaders). `.babelrc` removed; SWC compiles maplibre + Hebrew cleanly and also fixes the
     `next/font` landmine. The house "Babel not SWC" rule was a workaround for a *VPS AVX
     limitation*, not a preference — it does not apply here. **Verified on the VPS (2026-06-15):
     full production `next build` completes ("✓ Compiled successfully", 4/4 static pages, no
     illegal-instruction / native-module crash); SWC used the NATIVE binary
     (`next-swc.linux-x64-gnu.node`, 131 MB, loads clean), NOT the WASM fallback (no wasm
     warning). This VPS CPU reports `avx avx2 avx512f …` — so the AVX assumption behind the house
     Babel rule is stale on this machine; worth re-checking for the OTHER projects (separate task,
     not this session).**
   - Coverage (165 matched): 9 NE polygons have no data (Antarctica, W. Sahara, Falklands,
     Greenland, New Caledonia, Puerto Rico, Palestine, Taiwan, Fr. S. Lands) + 3 `-99` polygons
     (Kosovo, N. Cyprus, Somaliland) → all render "no data". 29 data rows have NO 110m polygon
     (small/island states: Singapore, Malta, Vatican, Monaco, Maldives, Pacific/Caribbean micro-
     states…) — invisible at country fill; need NE 50m or point markers later.
   - **QUEUED (next map task, user-approved 2026-06-15, NOT started):** add clickable POINT
     MARKERS at centroids for the 29 UN members with no 110m polygon (real destinations:
     Singapore, Malta, Bahrain, Maldives, Mauritius, Seychelles, …), colored by the active metric
     via feature-state so every country is selectable regardless of polygon. **Prefer markers
     over switching to NE 50m** — forward-compatible with the coming city pins.
   - NEXT (zoom→city/site markers, vector basemap) deferred to the city-zoom session.
3. **Place card** — ✅ DONE (country level), merged to `master`. `GET /api/places/{ref}`
   (resolve by iso3/slug/UUID) returns identity + `is_home` + all 17 comparison axes (explicit
   NULLs) + a per-field `provenance` map (`source_url/fetched_at/note/origin`) via the inheritance
   resolver. Frontend `web/src/components/map/`: `PlaceCard` (the template — header chips
   level/בית/מידע-חלקי, essentials visa-pill/cost/flight) + `ProvenanceBadge` (quiet Lucide
   affordance next to each value; hover/tap popover names the source — cost→"הבנק העולמי 2024" +
   link, visa→"ויקיפדיה" + link, flight→"חושב" + method, no link). Empty axes collapse to one line
   "פרטים נוספים יתווספו בהעשרה". Israel/home → baseline cost "100 · בסיס ההשוואה", no self-visa.
   Panel anchors `inset-inline-end` (left in RTL) to clear the right-side toggle + legend.
   **STOPPED before compare view** (next).
4. **Compare view** — ✅ DONE (country level), on branch `feat/compare` (pushed, NOT merged).
   `GET /api/places/compare?refs=…` (2-3 iso3/slug) → array of the `/{ref}` detail shape;
   winners computed client-side. Compare TRAY (bottom bar, chips, "השווה (N)" enabled at >=2,
   cap 3, React state — no localStorage): add via "הוסף להשוואה" in the card, and in
   building-mode (tray non-empty) a map tap toggles a country in/out (zero-state tap still opens
   the card). Compare VIEW (full-screen overlay): template axes as rows × places as columns, RTL
   sticky axis-label column (right), 3-col horizontal-scroll on mobile, column-header tap opens
   that place's card. Winner-per-row (`compare.ts`): cost/flight lower-better, visa by ordinal
   ease; ties crown all; single-value/null = no crown ("—"); subjective axes never crown. Only
   cost/visa/flight decide now; rest render subtly as "—". **STOPPED before saved_place/shortlist
   + enrichment.**
5. **Extraction pipeline (MICRO)** — Claude API + web search → extract into template with
   per-field citations; same pattern as GigaBait recipe module.
6. **Filters** — by axis (season, cost band, flight band, safety, good_for tags, character,
   language barrier). **Planned:** a "travel advisories / מל״ל warnings" filter sourced
   from official advisories.
7. **Saved / compare-my-candidates** — shortlist/want/been flows over `saved_place`.

### Deferred / parked
- **Travel-advisory / מל״ל warning field** — NOT added now (cheap to add later as a column
  + the planned filter in roadmap #6).
- Auth: single-user `app_user` anchor for now; wire real JWT auth when multi-user.
- `geojson_ref` storage shape (R2 key vs inline) — decide at choropleth time.
- Currency: monetary axes stored as ILS integers for now.
