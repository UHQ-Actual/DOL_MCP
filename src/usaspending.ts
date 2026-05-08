export type UsaSpendingFetchFn = (input: URL | string, init?: RequestInit) => Promise<Response>;

export interface UsaSpendingClientOptions {
  baseUrl?: string;
  fetchFn?: UsaSpendingFetchFn;
  now?: () => Date;
}

export interface UsaSpendingAwardSearchInput {
  keywords?: string;
  awardTypes?: string[];
  recipientName?: string;
  recipientState?: string;
  awardingAgency?: string;
  naicsCodes?: string[];
  pscCodes?: string[];
  placeOfPerformanceState?: string;
  placeOfPerformanceCity?: string;
  placeOfPerformanceCountyFips?: string;
  awardAmountMin?: number;
  awardAmountMax?: number;
  startDateFrom?: string;
  startDateTo?: string;
  fiscalYear?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  maxResults?: number;
  dryRun?: boolean;
}

export interface UsaSpendingAward {
  awardId: string | null;
  generatedId: string | null;
  pieceId: string | null;
  awardType: string | null;
  recipientName: string | null;
  recipientUei: string | null;
  awardingAgency: string | null;
  awardingSubAgency: string | null;
  awardAmount: number | null;
  baseAndAllOptions: number | null;
  obligated: number | null;
  startDate: string | null;
  endDate: string | null;
  naicsCode: string | null;
  naicsDescription: string | null;
  pscCode: string | null;
  performanceCity: string | null;
  performanceState: string | null;
  performanceCountry: string | null;
  description: string | null;
  usaSpendingUrl: string | null;
}

export interface UsaSpendingAwardSearchResult {
  source: "USAspending.gov Award Search API";
  dryRun: boolean;
  count: number;
  totalRecords: number | null;
  requestCount: number;
  awards: UsaSpendingAward[];
}

const DEFAULT_BASE_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const DEFAULT_AWARD_TYPES = ["A", "B", "C", "D"];
const DEFAULT_SORT = "Award Amount";
const DEFAULT_ORDER: "asc" | "desc" = "desc";
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

const DEFAULT_FIELDS = [
  "Award ID",
  "generated_internal_id",
  "Recipient Name",
  "Recipient UEI",
  "Award Amount",
  "Total Outlays",
  "Description",
  "Contract Award Type",
  "Awarding Agency",
  "Awarding Sub Agency",
  "Start Date",
  "End Date",
  "NAICS",
  "PSC",
  "Place of Performance City Code",
  "Place of Performance State Code",
  "Place of Performance Country Code",
];

export class UsaSpendingClient {
  private readonly baseUrl: string;
  private readonly fetchFn: UsaSpendingFetchFn;
  private readonly now: () => Date;

  constructor(options: UsaSpendingClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => new Date());
  }

  async search(input: UsaSpendingAwardSearchInput = {}): Promise<UsaSpendingAwardSearchResult> {
    const maxResults = normalizeMaxResults(input.maxResults);
    if (input.dryRun) {
      const awards = sampleAwards().slice(0, maxResults);
      return {
        source: "USAspending.gov Award Search API",
        dryRun: true,
        count: awards.length,
        totalRecords: awards.length,
        requestCount: 0,
        awards,
      };
    }

    const sort = input.sortBy?.trim() || DEFAULT_SORT;
    const order = input.sortOrder ?? DEFAULT_ORDER;
    const filters = this.buildFilters(input);
    const awards: UsaSpendingAward[] = [];
    let requestCount = 0;
    let page = 1;
    let hasNext = true;

    while (awards.length < maxResults && page <= MAX_PAGES && hasNext) {
      const limit = Math.min(PAGE_LIMIT, maxResults - awards.length);
      const body = {
        filters,
        fields: DEFAULT_FIELDS,
        page,
        limit,
        sort,
        order,
        subawards: false,
      };
      requestCount += 1;
      const payload = await this.requestJson(body);
      const rows = Array.isArray(payload.results) ? payload.results : [];
      for (const row of rows) {
        awards.push(normalizeAward(row));
        if (awards.length >= maxResults) {
          break;
        }
      }
      hasNext = Boolean((payload.page_metadata as Record<string, unknown> | undefined)?.hasNext);
      if (!hasNext || rows.length === 0) {
        break;
      }
      page += 1;
    }

    return {
      source: "USAspending.gov Award Search API",
      dryRun: false,
      count: awards.length,
      totalRecords: null,
      requestCount,
      awards,
    };
  }

  buildFilters(input: UsaSpendingAwardSearchInput): Record<string, unknown> {
    const awardTypes = normalizeList(input.awardTypes ?? DEFAULT_AWARD_TYPES);
    const filters: Record<string, unknown> = {
      award_type_codes: awardTypes.length ? awardTypes : DEFAULT_AWARD_TYPES,
      time_period: [resolveTimePeriod(input, this.now())],
    };

    const keywords = input.keywords?.trim();
    if (keywords) {
      filters.keywords = [keywords];
    }

    if (input.recipientName?.trim()) {
      filters.recipient_search_text = [input.recipientName.trim()];
    }

    const popLocations = buildLocations({
      state: input.placeOfPerformanceState,
      city: input.placeOfPerformanceCity,
      countyFips: input.placeOfPerformanceCountyFips,
    });
    if (popLocations.length) {
      filters.place_of_performance_locations = popLocations;
    }

    const recipientLocations = buildLocations({ state: input.recipientState });
    if (recipientLocations.length) {
      filters.recipient_locations = recipientLocations;
    }

    if (input.awardingAgency?.trim()) {
      filters.agencies = [
        { type: "awarding", tier: "toptier", name: input.awardingAgency.trim() },
      ];
    }

    const naicsCodes = normalizeList(input.naicsCodes);
    if (naicsCodes.length) {
      filters.naics_codes = { require: naicsCodes.map((code) => [code]) };
    }

    const pscCodes = normalizeList(input.pscCodes);
    if (pscCodes.length) {
      filters.psc_codes = pscCodes;
    }

    const awardAmount = buildAwardAmount(input.awardAmountMin, input.awardAmountMax);
    if (awardAmount) {
      filters.award_amounts = [awardAmount];
    }

    return filters;
  }

  sanitizeUrl(input: URL | string): string {
    return input.toString();
  }

  private async requestJson(body: unknown): Promise<Record<string, unknown>> {
    const response = await this.fetchFn(this.baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`USAspending request failed (${response.status} ${response.statusText || "HTTP error"}): ${text.slice(0, 700)}`);
    }
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  }
}

function resolveTimePeriod(input: UsaSpendingAwardSearchInput, now: Date): { start_date: string; end_date: string } {
  if (input.startDateFrom?.trim() || input.startDateTo?.trim()) {
    return {
      start_date: dateOrFloor(input.startDateFrom, now, true),
      end_date: dateOrFloor(input.startDateTo, now, false),
    };
  }
  if (Number.isInteger(input.fiscalYear)) {
    const fy = input.fiscalYear as number;
    return {
      start_date: `${fy - 1}-10-01`,
      end_date: `${fy}-09-30`,
    };
  }
  const end = formatDate(now);
  const fromDate = new Date(now);
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - 1);
  return { start_date: formatDate(fromDate), end_date: end };
}

function buildLocations(options: { state?: string; city?: string; countyFips?: string }): Array<Record<string, string>> {
  const state = options.state?.trim().toUpperCase();
  const city = options.city?.trim().toUpperCase();
  const county = options.countyFips?.trim();
  if (!state && !city && !county) return [];
  const location: Record<string, string> = { country: "USA" };
  if (state) location.state = state;
  if (city) location.city = city;
  if (county) location.county = county.padStart(3, "0");
  return [location];
}

function buildAwardAmount(min?: number, max?: number): { lower_bound?: number; upper_bound?: number } | null {
  const out: { lower_bound?: number; upper_bound?: number } = {};
  if (typeof min === "number" && Number.isFinite(min)) out.lower_bound = min;
  if (typeof max === "number" && Number.isFinite(max)) out.upper_bound = max;
  return Object.keys(out).length ? out : null;
}

export function normalizeAward(row: unknown): UsaSpendingAward {
  const record = isRecord(row) ? row : {};
  const generatedId = stringValue(record["generated_internal_id"]);
  return {
    awardId: stringValue(record["Award ID"] ?? record["award_id"]),
    generatedId,
    pieceId: stringValue(record["piid"] ?? record["PIID"]),
    awardType: stringValue(record["Contract Award Type"] ?? record["Award Type"]),
    recipientName: stringValue(record["Recipient Name"]),
    recipientUei: stringValue(record["Recipient UEI"]),
    awardingAgency: stringValue(record["Awarding Agency"]),
    awardingSubAgency: stringValue(record["Awarding Sub Agency"]),
    awardAmount: numberValue(record["Award Amount"] ?? record["award_amount"]),
    baseAndAllOptions: numberValue(record["Base And All Options Value"]),
    obligated: numberValue(record["Total Outlays"] ?? record["total_obligation"]),
    startDate: dateOnly(record["Start Date"] ?? record["start_date"]),
    endDate: dateOnly(record["End Date"] ?? record["end_date"]),
    naicsCode: stringValue(record["naics_code"] ?? record["NAICS"]),
    naicsDescription: stringValue(record["naics_description"] ?? record["NAICS Description"]),
    pscCode: stringValue(record["psc_code"] ?? record["PSC"]),
    performanceCity: stringValue(record["Place of Performance City Code"] ?? record["pop_city"]),
    performanceState: stringValue(record["Place of Performance State Code"] ?? record["pop_state_code"]),
    performanceCountry: stringValue(record["Place of Performance Country Code"] ?? record["pop_country_code"]),
    description: stringValue(record["Description"] ?? record["description"]),
    usaSpendingUrl: generatedId ? `https://www.usaspending.gov/award/${generatedId}` : null,
  };
}

export function sampleAwards(): UsaSpendingAward[] {
  return [
    {
      awardId: "W912DQ24C0001",
      generatedId: "CONT_AWD_W912DQ24C0001_USAGOV",
      pieceId: "W912DQ24C0001",
      awardType: "DEFINITIVE CONTRACT",
      recipientName: "SAMPLE CONSTRUCTION LLC",
      recipientUei: "ABCDEF123456",
      awardingAgency: "DEPT OF DEFENSE",
      awardingSubAgency: "DEPT OF THE ARMY",
      awardAmount: 12500000,
      baseAndAllOptions: 14500000,
      obligated: 12500000,
      startDate: "2024-01-15",
      endDate: "2026-12-31",
      naicsCode: "236220",
      naicsDescription: "Commercial and Institutional Building Construction",
      pscCode: "Y1AA",
      performanceCity: "LANSING",
      performanceState: "MI",
      performanceCountry: "USA",
      description: "VA Lansing Outpatient Clinic Renovation Phase II",
      usaSpendingUrl: "https://www.usaspending.gov/award/CONT_AWD_W912DQ24C0001_USAGOV",
    },
    {
      awardId: "47PF0024C0017",
      generatedId: "CONT_AWD_47PF0024C0017_USAGOV",
      pieceId: "47PF0024C0017",
      awardType: "DEFINITIVE CONTRACT",
      recipientName: "GREAT LAKES BUILDERS INC",
      recipientUei: "GHIJKL789012",
      awardingAgency: "GENERAL SERVICES ADMINISTRATION",
      awardingSubAgency: "PUBLIC BUILDINGS SERVICE",
      awardAmount: 7800000,
      baseAndAllOptions: 7800000,
      obligated: 6200000,
      startDate: "2024-06-03",
      endDate: "2025-11-30",
      naicsCode: "236220",
      naicsDescription: "Commercial and Institutional Building Construction",
      pscCode: "Z1AA",
      performanceCity: "EAST LANSING",
      performanceState: "MI",
      performanceCountry: "USA",
      description: "Federal building HVAC and roofing replacement",
      usaSpendingUrl: "https://www.usaspending.gov/award/CONT_AWD_47PF0024C0017_USAGOV",
    },
    {
      awardId: "USDA-AMS-2025-0042",
      generatedId: "CONT_AWD_USDAAMS20250042_USAGOV",
      pieceId: "USDA-AMS-2025-0042",
      awardType: "PURCHASE ORDER",
      recipientName: "MIDWEST FOODS COOPERATIVE",
      recipientUei: "MNOPQR345678",
      awardingAgency: "DEPT OF AGRICULTURE",
      awardingSubAgency: "AGRICULTURAL MARKETING SERVICE",
      awardAmount: 3200000,
      baseAndAllOptions: 3200000,
      obligated: 3200000,
      startDate: "2025-02-10",
      endDate: "2025-08-31",
      naicsCode: "311612",
      naicsDescription: "Meat Processed from Carcasses",
      pscCode: "8910",
      performanceCity: "DES MOINES",
      performanceState: "IA",
      performanceCountry: "USA",
      description: "Federal feeding program ground beef supply",
      usaSpendingUrl: "https://www.usaspending.gov/award/CONT_AWD_USDAAMS20250042_USAGOV",
    },
  ];
}

function normalizeList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeMaxResults(maxResults?: number): number {
  if (!Number.isFinite(maxResults)) {
    return 100;
  }
  return Math.min(1000, Math.max(1, Math.trunc(maxResults ?? 100)));
}

function dateOrFloor(value: string | undefined, now: Date, isStart: boolean): string {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  if (isStart) {
    const past = new Date(now);
    past.setUTCFullYear(past.getUTCFullYear() - 1);
    return formatDate(past);
  }
  return formatDate(now);
}

function formatDate(date: Date): string {
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${m}-${d}`;
}

function stringValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text && text.toLowerCase() !== "null" ? text : null;
}

function numberValue(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function dateOnly(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
