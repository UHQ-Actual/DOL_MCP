export type ServiceType = "LSR" | "FSR" | "Unclear";
export type ChainFlag = "Yes" | "No" | "Unknown";
export type AreaType = "major_metro" | "mid_metro" | "small_or_rural";
export type AdvMethod = 1 | 2 | 3 | 4;
export type AdvConfidence = "Medium" | "Low" | "Very Low";
export type FlsaFlag = "Above" | "Below" | "Borderline" | "Insufficient Data";

export type FormatKey =
  | "fast_food_or_counter"
  | "fast_casual"
  | "cafe_bakery_deli"
  | "casual_dining"
  | "fine_dining"
  | "bar_grill"
  | "pizzeria"
  | "buffet"
  | "food_truck"
  | "other";

export interface AdvEstimateInput {
  serviceType?: ServiceType;
  format?: string;
  chainFlag?: ChainFlag;
  employeeCount?: number;
  seatCount?: number;
  chainPerUnitAdv?: number;
  areaType?: AreaType;
  highCostOfLivingState?: boolean;
  staleSources?: boolean;
  listPageEmployeeData?: boolean;
}

export interface AdvRange {
  low: number;
  high: number;
}

export interface AdvEstimateResult {
  source: "DOL_MCP ADV Estimator";
  method: AdvMethod | null;
  estimate: number | null;
  range: AdvRange | null;
  flsaFlag: FlsaFlag;
  confidence: AdvConfidence | null;
  appliedMultiplier: number;
  multiplierBreakdown: {
    base: number;
    highCostOfLivingState: boolean;
  };
  formatKey: FormatKey | null;
  inputsSummary: string;
  advNotes: string;
  warnings: string[];
}

const PER_EMPLOYEE_BENCHMARK: Record<ServiceType, number> = {
  LSR: 65000,
  FSR: 70000,
  Unclear: 67000,
};

const SEAT_BENCHMARK: Record<FormatKey, { revPerSeatPerDay: number; daysPerYear: number } | null> = {
  fast_food_or_counter: { revPerSeatPerDay: 35, daysPerYear: 360 },
  fast_casual: { revPerSeatPerDay: 30, daysPerYear: 360 },
  cafe_bakery_deli: { revPerSeatPerDay: 22, daysPerYear: 340 },
  casual_dining: { revPerSeatPerDay: 27, daysPerYear: 355 },
  fine_dining: { revPerSeatPerDay: 45, daysPerYear: 340 },
  bar_grill: { revPerSeatPerDay: 30, daysPerYear: 355 },
  pizzeria: { revPerSeatPerDay: 25, daysPerYear: 360 },
  buffet: { revPerSeatPerDay: 28, daysPerYear: 355 },
  food_truck: null,
  other: { revPerSeatPerDay: 27, daysPerYear: 350 },
};

const FORMAT_DEFAULT_ADV: Record<FormatKey, number> = {
  fast_food_or_counter: 1100000,
  fast_casual: 1000000,
  cafe_bakery_deli: 600000,
  casual_dining: 1200000,
  fine_dining: 2300000,
  bar_grill: 1100000,
  pizzeria: 850000,
  buffet: 1400000,
  food_truck: 250000,
  other: 950000,
};

const FLSA_THRESHOLD = 500000;
const RANGE_LOW_FACTOR = 0.6;
const RANGE_HIGH_FACTOR = 1.4;

export function estimateAdv(input: AdvEstimateInput): AdvEstimateResult {
  const warnings: string[] = [];
  const formatKey = normalizeFormat(input.format);
  const multiplierBreakdown = {
    base: areaTypeMultiplier(input.areaType),
    highCostOfLivingState: Boolean(input.highCostOfLivingState),
  };
  const appliedMultiplier = multiplierBreakdown.base + (multiplierBreakdown.highCostOfLivingState ? 0.1 : 0);

  const method = selectMethod(input, formatKey);
  if (method === null) {
    return {
      source: "DOL_MCP ADV Estimator",
      method: null,
      estimate: null,
      range: null,
      flsaFlag: "Insufficient Data",
      confidence: null,
      appliedMultiplier,
      multiplierBreakdown,
      formatKey,
      inputsSummary: "no employee count, no seat count, no chain per-unit ADV, no format",
      advNotes: "FLSA: Insufficient Data; Range: --; Method: --; Inputs: insufficient data to estimate",
      warnings: ["Provide at least one of employeeCount, seatCount, chainPerUnitAdv, or format."],
    };
  }

  const calc = computeEstimate(method, input, formatKey, appliedMultiplier, warnings);
  const range: AdvRange = {
    low: Math.round(calc.estimate * RANGE_LOW_FACTOR),
    high: Math.round(calc.estimate * RANGE_HIGH_FACTOR),
  };
  const flsaFlag = computeFlsaFlag(range);
  const confidence = computeConfidence(method, input);

  const advNotes = buildAdvNotes({
    flsaFlag,
    range,
    method,
    inputsSummary: calc.inputsSummary,
    chainFlag: input.chainFlag,
    staleSources: Boolean(input.staleSources),
  });

  return {
    source: "DOL_MCP ADV Estimator",
    method,
    estimate: Math.round(calc.estimate),
    range,
    flsaFlag,
    confidence,
    appliedMultiplier,
    multiplierBreakdown,
    formatKey,
    inputsSummary: calc.inputsSummary,
    advNotes,
    warnings,
  };
}

function selectMethod(input: AdvEstimateInput, formatKey: FormatKey | null): AdvMethod | null {
  if (input.chainFlag === "Yes" && isPositiveFinite(input.chainPerUnitAdv)) return 3;
  if (isPositiveFinite(input.employeeCount)) return 1;
  if (isPositiveFinite(input.seatCount) && formatKey && SEAT_BENCHMARK[formatKey]) return 2;
  if (formatKey) return 4;
  return null;
}

function computeEstimate(
  method: AdvMethod,
  input: AdvEstimateInput,
  formatKey: FormatKey | null,
  multiplier: number,
  warnings: string[],
): { estimate: number; inputsSummary: string } {
  const multiplierLabel = formatMultiplier(multiplier);

  if (method === 1) {
    const serviceType = input.serviceType ?? "Unclear";
    if (!input.serviceType) {
      warnings.push("serviceType not provided; defaulted to Unclear ($67k/employee benchmark).");
    }
    const benchmark = PER_EMPLOYEE_BENCHMARK[serviceType];
    const estimate = (input.employeeCount as number) * benchmark * multiplier;
    return {
      estimate,
      inputsSummary: `${input.employeeCount} employees @ $${benchmark.toLocaleString()}/employee/yr (${serviceType}), ${multiplierLabel} multiplier`,
    };
  }

  if (method === 2) {
    if (!formatKey || !SEAT_BENCHMARK[formatKey]) {
      throw new Error("Method 2 selected without a seat-eligible format; selectMethod is broken.");
    }
    const seatBench = SEAT_BENCHMARK[formatKey]!;
    const estimate = (input.seatCount as number) * seatBench.revPerSeatPerDay * seatBench.daysPerYear * multiplier;
    return {
      estimate,
      inputsSummary: `${input.seatCount} seats × $${seatBench.revPerSeatPerDay}/seat/day × ${seatBench.daysPerYear} days/yr (${formatKey}), ${multiplierLabel} multiplier`,
    };
  }

  if (method === 3) {
    const estimate = (input.chainPerUnitAdv as number) * multiplier;
    return {
      estimate,
      inputsSummary: `chain per-unit ADV $${(input.chainPerUnitAdv as number).toLocaleString()}, ${multiplierLabel} multiplier`,
    };
  }

  // Method 4
  if (!formatKey) {
    throw new Error("Method 4 selected without a format; selectMethod is broken.");
  }
  const def = FORMAT_DEFAULT_ADV[formatKey];
  const estimate = def * multiplier;
  return {
    estimate,
    inputsSummary: `format default $${def.toLocaleString()} for ${formatKey}, ${multiplierLabel} multiplier`,
  };
}

function computeFlsaFlag(range: AdvRange): FlsaFlag {
  if (range.low >= FLSA_THRESHOLD) return "Above";
  if (range.high <= FLSA_THRESHOLD) return "Below";
  return "Borderline";
}

function computeConfidence(method: AdvMethod, input: AdvEstimateInput): AdvConfidence {
  if (input.staleSources) return "Very Low";
  if (method === 4) return "Very Low";
  if (method === 2) return "Low";
  if (method === 1 && input.listPageEmployeeData) return "Low";
  return "Medium";
}

function buildAdvNotes(opts: {
  flsaFlag: FlsaFlag;
  range: AdvRange;
  method: AdvMethod;
  inputsSummary: string;
  chainFlag?: ChainFlag;
  staleSources: boolean;
}): string {
  const parts = [
    `FLSA: ${opts.flsaFlag}`,
    `Range: $${formatMoney(opts.range.low)}-$${formatMoney(opts.range.high)}`,
    `Method: ${opts.method}`,
    `Inputs: ${opts.inputsSummary}`,
  ];
  if (opts.chainFlag === "Yes") {
    parts.push("Enterprise coverage may apply regardless of single-unit estimate");
  }
  if (opts.method === 4) {
    parts.push("Default: no per-unit data");
  }
  if (opts.staleSources) {
    parts.push("Stale listing");
  }
  return parts.join("; ");
}

export function normalizeFormat(value: string | undefined): FormatKey | null {
  if (!value) return null;
  const lead = value.split("—")[0].split("-")[0].trim().toLowerCase();
  if (!lead) return null;
  if (lead === "fast food" || lead === "counter service") return "fast_food_or_counter";
  if (lead === "fast casual") return "fast_casual";
  if (lead === "cafe" || lead === "bakery" || lead === "deli") return "cafe_bakery_deli";
  if (lead === "casual dining") return "casual_dining";
  if (lead === "fine dining") return "fine_dining";
  if (lead === "bar & grill" || lead === "bar and grill" || lead === "bar grill") return "bar_grill";
  if (lead === "pizzeria") return "pizzeria";
  if (lead === "buffet") return "buffet";
  if (lead === "food truck") return "food_truck";
  return "other";
}

function areaTypeMultiplier(areaType?: AreaType): number {
  if (areaType === "major_metro") return 1.2;
  if (areaType === "small_or_rural") return 0.85;
  return 1.0;
}

function formatMultiplier(multiplier: number): string {
  return multiplier.toFixed(2).replace(/\.?0+$/, "") + "×";
}

function formatMoney(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    const trimmed = m.toFixed(2).replace(/\.?0+$/, "");
    return `${trimmed}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return `${value}`;
}

function isPositiveFinite(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
