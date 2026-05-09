export type CensusFetchFn = (input: URL | string, init?: RequestInit) => Promise<Response>;

export type AreaType = "major_metro" | "mid_metro" | "small_or_rural";
export type RowScalingTier = "under_5k" | "5k_to_25k" | "25k_to_75k" | "over_75k";

export interface CensusAreaProfileInput {
  city?: string;
  state?: string;
  placeFips?: string;
  stateFips?: string;
  acsYear?: number;
  dryRun?: boolean;
}

export interface ResolvedGeo {
  placeName: string;
  stateName: string;
  stateCode: string;
  placeFips: string;
  stateFips: string;
  countyName: string | null;
  countyFips: string | null;
}

export interface CensusAreaProfile {
  source: "US Census Bureau ACS 5-year";
  acsYear: number;
  resolved: ResolvedGeo;
  population: number;
  areaType: AreaType;
  rowScalingTier: RowScalingTier;
  rowScalingFloor: number;
  rowScalingTarget: number;
  highCostOfLivingState: boolean;
  advMultiplierBase: number;
  notes: string;
}

export interface CensusClientOptions {
  apiKey?: string;
  geocoderUrl?: string;
  acsBaseUrl?: string;
  fetchFn?: CensusFetchFn;
  acsYear?: number;
}

const DEFAULT_GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const DEFAULT_ACS_BASE = "https://api.census.gov/data";
const DEFAULT_ACS_YEAR = 2022;
const POPULATION_VAR = "B01003_001E";

const HIGH_COL_STATES = new Set(["CA", "NY", "MA", "WA", "HI"]);

const STATE_FIPS_BY_CODE: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09",
  DE: "10", DC: "11", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17",
  IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24",
  MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31",
  NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38",
  OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46",
  TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54",
  WI: "55", WY: "56", PR: "72",
};

const STATE_NAME_BY_FIPS: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_FIPS_BY_CODE).map(([code, fips]) => [fips, code]),
);

export class CensusClient {
  private readonly apiKey?: string;
  private readonly geocoderUrl: string;
  private readonly acsBaseUrl: string;
  private readonly fetchFn: CensusFetchFn;
  private readonly acsYear: number;

  constructor(options: CensusClientOptions = {}) {
    this.apiKey = options.apiKey?.trim() || undefined;
    this.geocoderUrl = options.geocoderUrl ?? DEFAULT_GEOCODER;
    this.acsBaseUrl = options.acsBaseUrl ?? DEFAULT_ACS_BASE;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.acsYear = Math.trunc(options.acsYear ?? DEFAULT_ACS_YEAR);
  }

  async getAreaProfile(input: CensusAreaProfileInput): Promise<CensusAreaProfile> {
    if (input.dryRun) {
      return sampleProfile(input.acsYear ?? this.acsYear);
    }

    const acsYear = Math.trunc(input.acsYear ?? this.acsYear);
    const resolved = await this.resolveGeography(input);
    const population = await this.fetchPopulation(resolved, acsYear);
    return assembleProfile(resolved, population, acsYear);
  }

  private async resolveGeography(input: CensusAreaProfileInput): Promise<ResolvedGeo> {
    if (input.placeFips && input.stateFips) {
      const stateCode = STATE_NAME_BY_FIPS[input.stateFips];
      if (!stateCode) {
        throw new Error(`Unknown state FIPS "${input.stateFips}".`);
      }
      return {
        placeName: input.city ?? `${stateCode} place ${input.placeFips}`,
        stateName: stateCode,
        stateCode,
        placeFips: input.placeFips,
        stateFips: input.stateFips,
        countyName: null,
        countyFips: null,
      };
    }

    if (!input.city || !input.state) {
      throw new Error("census_area_profile requires either (city + state) or (placeFips + stateFips).");
    }

    const stateCode = input.state.trim().toUpperCase();
    if (!STATE_FIPS_BY_CODE[stateCode]) {
      throw new Error(`Unknown state code "${input.state}". Use a USPS two-letter code.`);
    }

    return await this.geocodeCity(input.city.trim(), stateCode);
  }

  private async geocodeCity(city: string, stateCode: string): Promise<ResolvedGeo> {
    const url = new URL(this.geocoderUrl);
    url.searchParams.set("address", `${city}, ${stateCode}`);
    url.searchParams.set("benchmark", "Public_AR_Current");
    url.searchParams.set("vintage", "Current_Current");
    url.searchParams.set("layers", "all");
    url.searchParams.set("format", "json");

    const response = await this.fetchFn(url, { headers: { accept: "application/json" } });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Census geocoder failed (${response.status} ${response.statusText || "HTTP error"}): ${text.slice(0, 500)}`);
    }
    const payload = text ? JSON.parse(text) : {};
    const matches = ((payload as { result?: { addressMatches?: unknown[] } }).result?.addressMatches ?? []) as Array<Record<string, unknown>>;
    if (!matches.length) {
      throw new Error(`Census geocoder returned no match for "${city}, ${stateCode}". Try a more specific address or supply placeFips + stateFips directly.`);
    }
    const geographies = (matches[0]?.geographies ?? {}) as Record<string, Array<Record<string, unknown>>>;
    const placeRow = (geographies["Incorporated Places"] ?? geographies["Census Designated Places"] ?? [])[0];
    if (!placeRow) {
      throw new Error(`Census geocoder match for "${city}, ${stateCode}" has no Incorporated Place or CDP. Try a nearby city name.`);
    }
    const countyRow = (geographies["Counties"] ?? [])[0];
    const stateFips = String(placeRow.STATE ?? "");
    return {
      placeName: String(placeRow.NAME ?? city),
      stateName: STATE_NAME_BY_FIPS[stateFips] ?? stateCode,
      stateCode,
      placeFips: String(placeRow.PLACE ?? ""),
      stateFips,
      countyName: countyRow ? String(countyRow.NAME ?? "") : null,
      countyFips: countyRow ? String(countyRow.COUNTY ?? "") : null,
    };
  }

  private async fetchPopulation(resolved: ResolvedGeo, acsYear: number): Promise<number> {
    const url = new URL(`${this.acsBaseUrl}/${acsYear}/acs/acs5`);
    url.searchParams.set("get", `NAME,${POPULATION_VAR}`);
    url.searchParams.set("for", `place:${resolved.placeFips}`);
    url.searchParams.set("in", `state:${resolved.stateFips}`);
    if (this.apiKey) {
      url.searchParams.set("key", this.apiKey);
    }

    const response = await this.fetchFn(url, { headers: { accept: "application/json" } });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Census ACS request failed (${response.status} ${response.statusText || "HTTP error"}): ${text.slice(0, 500)}`);
    }
    const payload = text ? JSON.parse(text) : null;
    if (!Array.isArray(payload) || payload.length < 2) {
      throw new Error(`Census ACS returned no population row for place ${resolved.placeFips} in state ${resolved.stateFips} (year ${acsYear}).`);
    }
    const headers = payload[0] as string[];
    const row = payload[1] as string[];
    const idx = headers.indexOf(POPULATION_VAR);
    if (idx < 0) {
      throw new Error(`Census ACS response missing ${POPULATION_VAR} column.`);
    }
    const value = Number(row[idx]);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Census ACS returned non-numeric population value: ${row[idx]}`);
    }
    return value;
  }
}

export function bucketAreaType(population: number): AreaType {
  if (population >= 500_000) return "major_metro";
  if (population >= 25_000) return "mid_metro";
  return "small_or_rural";
}

export function bucketRowScalingTier(population: number): RowScalingTier {
  if (population < 5_000) return "under_5k";
  if (population < 25_000) return "5k_to_25k";
  if (population < 75_000) return "25k_to_75k";
  return "over_75k";
}

export function rowScalingFloor(population: number): number {
  if (population < 5_000) return 15;
  if (population < 25_000) return 30;
  if (population < 75_000) return 50;
  return 80;
}

export function rowScalingTarget(population: number): number {
  return Math.max(rowScalingFloor(population), Math.ceil(population / 250));
}

export function isHighCostOfLivingState(stateCode: string): boolean {
  return HIGH_COL_STATES.has(stateCode.toUpperCase());
}

function assembleProfile(resolved: ResolvedGeo, population: number, acsYear: number): CensusAreaProfile {
  const areaType = bucketAreaType(population);
  const advMultiplierBase = areaType === "major_metro" ? 1.2 : areaType === "small_or_rural" ? 0.85 : 1.0;
  const tier = bucketRowScalingTier(population);
  const floor = rowScalingFloor(population);
  const target = rowScalingTarget(population);
  const high = isHighCostOfLivingState(resolved.stateCode);
  return {
    source: "US Census Bureau ACS 5-year",
    acsYear,
    resolved,
    population,
    areaType,
    rowScalingTier: tier,
    rowScalingFloor: floor,
    rowScalingTarget: target,
    highCostOfLivingState: high,
    advMultiplierBase,
    notes: high
      ? `${resolved.placeName} (${resolved.stateCode}) — high-COL state; pair advMultiplierBase ${advMultiplierBase} with highCostOfLivingState=true in adv_estimate (effective multiplier ${(advMultiplierBase + 0.1).toFixed(2)}).`
      : `${resolved.placeName} (${resolved.stateCode}) — pair advMultiplierBase ${advMultiplierBase} with highCostOfLivingState=false in adv_estimate.`,
  };
}

function sampleProfile(acsYear: number): CensusAreaProfile {
  const population = 8124;
  return assembleProfile(
    {
      placeName: "Hillsdale city",
      stateName: "MI",
      stateCode: "MI",
      placeFips: "38140",
      stateFips: "26",
      countyName: "Hillsdale County",
      countyFips: "059",
    },
    population,
    acsYear,
  );
}
