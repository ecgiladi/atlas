// Build one representative label point per country from the Natural Earth admin-0 polygons.
//
// WHY: MapLibre places a symbol label once per polygon PART, so MultiPolygon countries
// (Canada 30 parts, Russia 14, USA 10) get a name on every island/exclave. Labelling off a
// dedicated point source — exactly ONE point per ISO — gives one label per country.
//
// The point is the pole of inaccessibility (the most "inside" point) of the country's
// LARGEST polygon, so the label lands on the main landmass (continental US, not Alaska/Hawaii;
// mainland Canada, not an Arctic island) and is always inside the shape. polylabel algorithm
// (mapbox/polylabel, ISC) is inlined so this needs no extra dependency.
//
// OUTPUT shape is reusable: one Point per country keyed by iso_a3 — the same dataset the
// saved-place PINS and queued microstate markers can ride on later.
//
// Run from web/:  node scripts/build_label_points.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "public");
const SRC = path.join(PUBLIC, "ne_110m_admin0.geojson");
const OUT = path.join(PUBLIC, "country_label_points.geojson");
const ISO_PROP = "ISO_A3_EH"; // same join key the map uses

// --- tiny binary min-heap (tinyqueue, ISC) -------------------------------------------
class Queue {
  constructor() {
    this.data = [];
  }
  push(item) {
    this.data.push(item);
    let pos = this.data.length - 1;
    while (pos > 0) {
      const parent = (pos - 1) >> 1;
      if (this.data[pos].max <= this.data[parent].max) break;
      [this.data[pos], this.data[parent]] = [this.data[parent], this.data[pos]];
      pos = parent;
    }
  }
  pop() {
    if (!this.data.length) return undefined;
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length) {
      this.data[0] = last;
      let pos = 0;
      const n = this.data.length;
      while (true) {
        let largest = pos;
        const l = 2 * pos + 1;
        const r = 2 * pos + 2;
        if (l < n && this.data[l].max > this.data[largest].max) largest = l;
        if (r < n && this.data[r].max > this.data[largest].max) largest = r;
        if (largest === pos) break;
        [this.data[pos], this.data[largest]] = [this.data[largest], this.data[pos]];
        pos = largest;
      }
    }
    return top;
  }
  get length() {
    return this.data.length;
  }
}

// --- polylabel (mapbox/polylabel, ISC) -----------------------------------------------
function polylabel(polygon, precision = 0.2) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of polygon[0]) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.max(precision, Math.min(width, height) / 2);
  if (cellSize === 0) return [minX, minY];

  const queue = new Queue();
  const makeCell = (x, y, h) => {
    const d = pointToPolygonDist(x, y, polygon);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };

  for (let x = minX; x < maxX; x += cellSize)
    for (let y = minY; y < maxY; y += cellSize)
      queue.push(makeCell(x + cellSize / 2, y + cellSize / 2, cellSize / 2));

  // centroid as initial best guess
  let best = centroidCell(polygon);
  const bboxCell = makeCell(minX + width / 2, minY + height / 2, 0);
  if (bboxCell.d > best.d) best = bboxCell;

  while (queue.length) {
    const cell = queue.pop();
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    const h = cell.h / 2;
    queue.push(makeCell(cell.x - h, cell.y - h, h));
    queue.push(makeCell(cell.x + h, cell.y - h, h));
    queue.push(makeCell(cell.x - h, cell.y + h, h));
    queue.push(makeCell(cell.x + h, cell.y + h, h));
  }
  return [best.x, best.y];
}

function centroidCell(polygon) {
  let area = 0, x = 0, y = 0;
  const ring = polygon[0];
  for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
    const a = ring[i], b = ring[j];
    const f = a[0] * b[1] - b[0] * a[1];
    x += (a[0] + b[0]) * f;
    y += (a[1] + b[1]) * f;
    area += f * 3;
  }
  if (area === 0) return { x: ring[0][0], y: ring[0][1], h: 0, d: 0, max: 0 };
  return { x: x / area, y: y / area, h: 0, d: pointToPolygonDist(x / area, y / area, polygon), max: 0 };
}

function pointToPolygonDist(x, y, polygon) {
  let inside = false;
  let minDistSq = Infinity;
  for (const ring of polygon) {
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
        inside = !inside;
      minDistSq = Math.min(minDistSq, segDistSq(x, y, a, b));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

function segDistSq(px, py, a, b) {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = px - x; dy = py - y;
  return dx * dx + dy * dy;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++)
    area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return Math.abs(area / 2);
}

// pick the largest polygon (by outer-ring area) of a Polygon/MultiPolygon
function largestPolygon(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates;
  let best = null, bestArea = -1;
  for (const poly of geometry.coordinates) {
    const a = ringArea(poly[0]);
    if (a > bestArea) { bestArea = a; best = poly; }
  }
  return best;
}

// --- build ---------------------------------------------------------------------------
const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
const features = [];
for (const f of src.features) {
  const iso = f.properties[ISO_PROP];
  if (!iso || iso === "-99") continue; // skip unresolved ISO polygons (Kosovo etc. render no-data anyway)
  const poly = largestPolygon(f.geometry);
  if (!poly) continue;
  const [lng, lat] = polylabel(poly, 0.2);
  features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [Number(lng.toFixed(4)), Number(lat.toFixed(4))] },
    properties: { iso_a3: iso, name_en: f.properties.ADMIN ?? "" },
  });
}

const out = { type: "FeatureCollection", name: "country_label_points", features };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${features.length} country label points -> ${path.relative(process.cwd(), OUT)}`);
