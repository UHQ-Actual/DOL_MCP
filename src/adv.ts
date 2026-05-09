export type ServiceType = "LSR" | "FSR" | "Unclear";
export type ChainFlag = "Yes" | "No" | "Unknown";
export type AreaType = "major_metro" | "mid_metro" | "small_or_rural";
export type AdvMethod = 1 | 2 | 3 | 4;
export type AdvConfidence = "Medium" | "Low" | "Very Low";
export type FlsaFlag = "Above" | "Below" | "Borderline" | "Insufficient Data";
export type CapacityInputType =
  | "seat_count"
  | "occupant_load"
  | "square_footage"
  | "parking_count"
  | "none";

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
  listPageEmployeeData?: boolean;

  seatCount?: number;
  occupantLoad?: number;
  squareFootage?: number;
  parkingSpaces?: number;
  capacitySource?: string;
  bohRatio?: number;
  parkingRatio?: number;

  chainPerUnitAdv?: number;

  areaType?: AreaType;
  highCostOfLivingState?: boolean;
  staleSources?: boolean;
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
  capacityInput: CapacityInputType;
  capacitySource: string | null;
  derivedSeatCount: number | null;
  appliedMultiplier: number;
  multiplierBreakdown: {
    base: number;
    highCostOfLivingState: boolean;
  };
  formatKey: FormatKey | null;
  notes: string;
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
const SQ_FT_PER_OCCUPANT_DINING = 15;
const OCCUPANT_LOAD_TO_SEAT_FACTOR = 0.85;
const DEFAULT_BOH_RATIO_FSR = 0.3;
const DEFAULT_BOH_RATIO_LSR = 0.4;
const DEFAULT_BOH_RATIO_UNCLEAR = 0.35;

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
      capacityInput: "none",
      capacitySource: input.capacitySource ?? null,
      derivedSeatCount: null,
      appliedMultiplier,
      multiplierBreakdown,
      formatKey,
      notes: "Insufficient data: provide at least one of employeeCount, capacity input (seatCount/occupantLoad/squareFootage/parkingSpaces), chainPerUnitAdv, or format.",
      warnings: ["Provide at least one of employeeCount, capacity input, chainPerUnitAdv, or format."],
    };
  }

  const capacity = method === 2
    ? deriveCapacity(input, formatKey, warnings)
    : { seats: null as number | null, capacityInput: "none" as CapacityInputType };

  const calc = computeEstimate(method, input, formatKey, capacity.seats, appliedMultiplier, warnings);
  const range: AdvRange = {
    low: Math.round(calc.estimate * RANGE_LOW_FACTOR),
    high: Math.round(calc.estimate * RANGE_HIGH_FACTOR),
  };
  const flsaFlag = computeFlsaFlag(range);
  const confidence = computeConfidence(method, input, capacity.capacityInput);

  const notes = buildNotes({
    method,
    capacityInput: capacity.capacityInput,
    capacitySource: input.capacitySource ?? null,
    derivedSeatCount: capacity.seats,
    multiplier: appliedMultiplier,
    multiplierBreakdown,
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
    capacityInput: capacity.capacityInput,
    capacitySource: input.capacitySource ?? null,
    derivedSeatCount: capacity.seats,
    appliedMultiplier,
    multiplierBreakdown,
    formatKey,
    notes,
    warnings,
  };
}

function selectMethod(input: AdvEstimateInput, formatKey: FormatKey | null): AdvMethod | null {
  if (input.chainFlag === "Yes" && isPositiveFinite(input.chainPerUnitAdv)) return 3;
  if (isPositiveFinite(input.employeeCount)) return 1;
  if (hasCapacityInput(input) && formatKey && SEAT_BENCHMARK[formatKey]) return 2;
  if (formatKey) return 4;
  return null;
}

function hasCapacityInput(input: AdvEstimateInput): boolean {
  return (
    isPositiveFinite(input.seatCount) ||
    isPositiveFinite(input.occupantLoad) ||
    isPositiveFinite(input.squareFootage) ||
    isPositiveFinite(input.parkingSpaces)
  );
}

function deriveCapacity(
  input: AdvEstimateInput,
  formatKey: FormatKey | null,
  warnings: string[],
): { seats: number; capacityInput: CapacityInputType } {
  if (isPositiveFinite(input.seatCount)) {
    return { seats: Math.round(input.seatCount as number), capacityInput: "seat_count" };
  }
  if (isPositiveFinite(input.occupantLoad)) {
    return {
      seats: Math.round((input.occupantLoad as number) * OCCUPANT_LOAD_TO_SEAT_FACTOR),
      capacityInput: "occupant_load",
    };
  }
  if (isPositiveFinite(input.squareFootage)) {
    const bohRatio = isValidBohRatio(input.bohRatio) ? (input.bohRatio as number) : defaultBohRatio(input.serviceType);
    const dining = (input.squareFootage as number) * (1 - bohRatio);
    const maxOccupants = dining / SQ_FT_PER_OCCUPANT_DINING;
    return {
      seats: Math.round(maxOccupants * OCCUPANT_LOAD_TO_SEAT_FACTOR),
      capacityInput: "square_footage",
    };
  }
  if (isPositiveFinite(input.parkingSpaces)) {
    const ratio = isPositiveFinite(input.parkingRatio)
      ? (input.parkingRatio as number)
      : defaultParkingRatio(formatKey, input.serviceType);
    return {
      seats: Math.round((input.parkingSpaces as number) * ratio),
      capacityInput: "parking_count",
    };
  }
  warnings.push("Method 2 selected without any capacity input; selectMethod is broken.");
  return { seats: 0, capacityInput: "none" };
}

function defaultBohRatio(serviceType?: ServiceType): number {
  if (serviceType === "FSR") return DEFAULT_BOH_RATIO_FSR;
  if (serviceType === "LSR") return DEFAULT_BOH_RATIO_LSR;
  return DEFAULT_BOH_RATIO_UNCLEAR;
}

function defaultParkingRatio(formatKey: FormatKey | null, serviceType?: ServiceType): number {
  if (formatKey === "bar_grill") return 1.75;
  if (formatKey === "fine_dining" || formatKey === "casual_dining") return 2.75;
  if (formatKey === "fast_food_or_counter" || formatKey === "fast_casual") return 2.25;
  if (serviceType === "FSR") return 2.75;
  if (serviceType === "LSR") return 2.25;
  return 2.5;
}

function computeEstimate(
  method: AdvMethod,
  input: AdvEstimateInput,
  formatKey: FormatKey | null,
  derivedSeats: number | null,
  multiplier: number,
  warnings: string[],
): { estimate: number; inputsSummary: string } {
  if (method === 1) {
    const serviceType = input.serviceType ?? "Unclear";
    if (!input.serviceType) {
      warnings.push("serviceType not provided; defaulted to Unclear ($67k/employee benchmark).");
    }
    const benchmark = PER_EMPLOYEE_BENCHMARK[serviceType];
    const estimate = (input.employeeCount as number) * benchmark * multiplier;
    return {
      estimate,
      inputsSummary: `${input.employeeCount} employees × $${benchmark.toLocaleString()}/yr (${serviceType})`,
    };
  }

  if (method === 2) {
    if (!formatKey || !SEAT_BENCHMARK[formatKey]) {
      throw new Error("Method 2 selected without a seat-eligible format; selectMethod is broken.");
    }
    if (derivedSeats === null || derivedSeats <= 0) {
      throw new Error("Method 2 selected but no derived seat count; deriveCapacity is broken.");
    }
    const seatBench = SEAT_BENCHMARK[formatKey]!;
    const estimate = derivedSeats * seatBench.revPerSeatPerDay * seatBench.daysPerYear * multiplier;
    return {
      estimate,
      inputsSummary: `${derivedSeats} seats × $${seatBench.revPerSeatPerDay}/seat/day × ${seatBench.daysPerYear} days/yr (${formatKey})`,
    };
  }

  if (method === 3) {
    const estimate = (input.chainPerUnitAdv as number) * multiplier;
    return {
      estimate,
      inputsSummary: `chain per-unit ADV $${(input.chainPerUnitAdv as number).toLocaleString()}`,
    };
  }

  if (!formatKey) throw new Error("Method 4 without format");
  const def = FORMAT_DEFAULT_ADV[formatKey];
  const estimate = def * multiplier;
  return {
    estimate,
    inputsSummary: `format default $${def.toLocaleString()} for ${formatKey}`,
  };
}

function computeFlsaFlag(range: AdvRange): FlsaFlag {
  if (range.low >= FLSA_THRESHOLD) return "Above";
  if (range.high <= FLSA_THRESHOLD) return "Below";
  return "Borderline";
}

function computeConfidence(method: AdvMethod, input: AdvEstimateInput, capacityInput: CapacityInputType): AdvConfidence {
  if (input.staleSources) return "Very Low";
  if (method === 4) return "Very Low";
  if (method === 1 && input.listPageEmployeeData) return "Low";
  if (method === 2) {
    if (capacityInput === "seat_count") return "Medium";
    if (capacityInput === "occupant_load") return "Medium";
    if (capacityInput === "square_footage") return "Low";
    if (capacityInput === "parking_count") return "Very Low";
    return "Low";
  }
  return "Medium";
}

function buildNotes(opts: {
  method: AdvMethod;
  capacityInput: CapacityInputType;
  capacitySource: string | null;
  derivedSeatCount: number | null;
  multiplier: number;
  multiplierBreakdown: { base: number; highCostOfLivingState: boolean };
  inputsSummary: string;
  chainFlag?: ChainFlag;
  staleSources: boolean;
}): string {
  const parts: string[] = [];
  parts.push(`Method ${opts.method}`);
  if (opts.method === 2 && opts.capacityInput !== "none") {
    const sourceLabel = opts.capacitySource ? ` (${opts.capacitySource})` : "";
    parts.push(`capacity=${opts.capacityInput}${sourceLabel}, ${opts.derivedSeatCount} seats`);
  }
  parts.push(opts.inputsSummary);
  const baseTier = opts.multiplierBreakdown.base === 1.2 ? "major_metro" : opts.multiplierBreakdown.base === 0.85 ? "small_or_rural" : "mid_metro";
  parts.push(`multiplier ${formatMultiplier(opts.multiplier)} (${baseTier}${opts.multiplierBreakdown.highCostOfLivingState ? " + high-COL" : ""})`);
  if (opts.chainFlag === "Yes") parts.push("enterprise coverage may apply regardless of single-unit estimate");
  if (opts.method === 4) parts.push("default: no per-unit data");
  if (opts.staleSources) parts.push("stale listing");
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

function isPositiveFinite(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidBohRatio(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1;
}
