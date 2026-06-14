// Data-viz encodings for the country choropleth. Single source of truth for both the
// MapLibre fill-color expressions and the Legend. Colors live here (not design tokens)
// because they ARE the data encoding, not chrome.

export type Metric = "visa" | "cost" | "flight";

export const NO_DATA_COLOR = "#c8ccd0"; // cool grey — distinct from cost-neutral
export const HOME_COLOR = "#3d5a80"; // Israel "home" fill
export const HOME_LINE = "#16273f";
export const HOVER_LINE = "#1b2a3a";
export const BORDER_COLOR = "#ffffff";

// visa_status: categorical ease gradient
export const VISA_COLORS: Record<string, string> = {
  visa_free: "#4caf7d",
  eta_evisa: "#e0a955",
  voa: "#dd7f3f",
  visa_required: "#c75b5b",
};

const VISA_LABELS_HE: Record<string, string> = {
  visa_free: "פטור מוויזה",
  eta_evisa: "אישור אלקטרוני / eVisa",
  voa: "ויזה בכניסה",
  visa_required: "נדרשת ויזה",
};

// cost_vs_israel: diverging around 100 (Israel). Blue (cheaper) -> pale (≈Israel) -> red.
// Domain clamped so outliers (Switzerland etc.) don't flatten the ramp; interpolate
// clamps values outside the stop range to the end colors.
const COST_STOPS: Array<[number, string]> = [
  [40, "#2c7fb8"],
  [70, "#7fcdbb"],
  [100, "#ffffcc"],
  [130, "#fd8d3c"],
  [160, "#bd0026"],
];

// flight minutes: sequential single-hue, near (light) -> far (dark).
const FLIGHT_STOPS: Array<[number, string]> = [
  [60, "#edf8fb"],
  [180, "#b2e2e2"],
  [360, "#66c2a4"],
  [600, "#2ca25f"],
  [900, "#006d2c"],
  [1400, "#00441b"],
];

const fs = (k: string) => ["feature-state", k];

function interpolateExpr(stateKey: string, stops: Array<[number, string]>): any {
  const expr: any[] = ["interpolate", ["linear"], fs(stateKey)];
  for (const [v, c] of stops) expr.push(v, c);
  return expr;
}

// Build the fill-color expression for a metric. Israel is always "home"; missing data is
// always NO_DATA (never rendered as 0).
export function fillColorExpression(metric: Metric): any {
  const home: any[] = ["==", fs("isIsrael"), true];
  if (metric === "visa") {
    return [
      "case",
      home, HOME_COLOR,
      ["==", fs("visa_status"), "visa_free"], VISA_COLORS.visa_free,
      ["==", fs("visa_status"), "eta_evisa"], VISA_COLORS.eta_evisa,
      ["==", fs("visa_status"), "voa"], VISA_COLORS.voa,
      ["==", fs("visa_status"), "visa_required"], VISA_COLORS.visa_required,
      NO_DATA_COLOR,
    ];
  }
  if (metric === "cost") {
    return [
      "case",
      home, HOME_COLOR,
      ["==", fs("costHasData"), true], interpolateExpr("cost", COST_STOPS),
      NO_DATA_COLOR,
    ];
  }
  return [
    "case",
    home, HOME_COLOR,
    ["==", fs("flightHasData"), true], interpolateExpr("flight", FLIGHT_STOPS),
    NO_DATA_COLOR,
  ];
}

// --- Legend descriptors ---
export const METRIC_LABELS: Record<Metric, string> = {
  visa: "ויזה",
  cost: "עלות",
  flight: "זמן טיסה",
};

export type LegendSpec =
  | { kind: "categorical"; swatches: Array<{ color: string; label: string }> }
  | { kind: "gradient"; stops: Array<[number, string]>; lowLabel: string; highLabel: string };

export function legendFor(metric: Metric): LegendSpec {
  if (metric === "visa") {
    return {
      kind: "categorical",
      swatches: Object.keys(VISA_COLORS).map((k) => ({
        color: VISA_COLORS[k],
        label: VISA_LABELS_HE[k],
      })),
    };
  }
  if (metric === "cost") {
    return {
      kind: "gradient",
      stops: COST_STOPS,
      lowLabel: "זול מישראל",
      highLabel: "יקר מישראל",
    };
  }
  return {
    kind: "gradient",
    stops: FLIGHT_STOPS,
    lowLabel: "קרוב",
    highLabel: "רחוק",
  };
}

export function visaLabelHe(status: string | null): string {
  return status ? VISA_LABELS_HE[status] ?? status : "אין נתונים";
}
