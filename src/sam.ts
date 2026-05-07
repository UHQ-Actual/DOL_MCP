export type SamFetchFn = (input: URL | string, init?: RequestInit) => Promise<Response>;

export interface SamGovClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: SamFetchFn;
  now?: () => Date;
}

export interface SamOpportunitySearchInput {
  keywords?: string;
  naicsCodes?: string[];
  procurementTypes?: string[];
  setAsideType?: string;
  state?: string;
  postedDaysAgo?: number;
  maxResults?: number;
  dryRun?: boolean;
}

export interface SamOpportunityDetailInput {
  noticeId: string;
  dryRun?: boolean;
}

export interface SamOpportunitySearchResult {
  source: "SAM.gov Opportunities API";
  dryRun: boolean;
  count: number;
  totalRecords: number | null;
  requestCount: number;
  opportunities: SamOpportunity[];
}

export interface SamOpportunity {
  noticeId: string | null;
  title: string | null;
  solicitationNumber: string | null;
  procurementType: string | null;
  postedDate: string | null;
  responseDeadline: string | null;
  naicsCode: string | null;
  classificationCode: string | null;
  active: boolean | null;
  setAsideType: string | null;
  setAsideDescription: string | null;
  agency: string | null;
  subAgency: string | null;
  office: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  performanceCity: string | null;
  performanceState: string | null;
  awardAmount: string | null;
  awardDate: string | null;
  awardeeName: string | null;
  samUrl: string | null;
  additionalInfoUrl: string | null;
  attachmentCount: number;
}

const DEFAULT_BASE_URL = "https://api.sam.gov/opportunities/v2/search";
const MAX_PAGE_SIZE = 1000;
const DEFAULT_PROCUREMENT_TYPES = ["o", "k"];
const SAM_SECRET_REDACTION = "<redacted>";

const PROCUREMENT_TYPE_DESCRIPTIONS: Record<string, string> = {
  u: "Justification & Authorization",
  p: "Presolicitation",
  a: "Award Notice",
  r: "Sources Sought",
  s: "Special Notice",
  o: "Solicitation",
  g: "Sale of Surplus Property",
  k: "Combined Synopsis/Solicitation",
  i: "Intent to Bundle",
};

export class SamGovClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchFn: SamFetchFn;
  private readonly now: () => Date;

  constructor(options: SamGovClientOptions = {}) {
    this.apiKey = normalizeSecret(options.apiKey);
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => new Date());
  }

  async search(input: SamOpportunitySearchInput = {}): Promise<SamOpportunitySearchResult> {
    const maxResults = normalizeMaxResults(input.maxResults);
    const dryRun = input.dryRun ?? !this.apiKey;
    if (dryRun) {
      const opportunities = sampleOpportunities().slice(0, maxResults);
      return {
        source: "SAM.gov Opportunities API",
        dryRun: true,
        count: opportunities.length,
        totalRecords: opportunities.length,
        requestCount: 0,
        opportunities,
      };
    }

    if (!this.apiKey) {
      throw new Error("SAM_GOV_API_KEY or SAM_API_KEY is required for live SAM.gov searches. Set it in the environment or .env file.");
    }

    const seen = new Set<string>();
    const opportunities: SamOpportunity[] = [];
    let requestCount = 0;
    let totalRecords: number | null = null;
    const naicsCodes = normalizeList(input.naicsCodes);
    const searchTargets = naicsCodes.length ? naicsCodes : [undefined];

    for (const ncode of searchTargets) {
      let offset = 0;
      while (opportunities.length < maxResults) {
        const limit = Math.min(MAX_PAGE_SIZE, maxResults - opportunities.length);
        const url = this.buildSearchUrl({ ...input, maxResults: limit }, ncode, offset);
        requestCount += 1;
        const payload = await this.requestJson(url);
        const rows = Array.isArray(payload.opportunitiesData) ? payload.opportunitiesData : [];
        totalRecords = typeof payload.totalRecords === "number" ? (totalRecords ?? 0) + payload.totalRecords : totalRecords;

        for (const row of rows) {
          const opportunity = normalizeOpportunity(row);
          const key = opportunity.noticeId ?? JSON.stringify(opportunity);
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          opportunities.push(opportunity);
          if (opportunities.length >= maxResults) {
            break;
          }
        }

        if (rows.length < limit || opportunities.length >= maxResults) {
          break;
        }
        offset += limit;
      }
    }

    return {
      source: "SAM.gov Opportunities API",
      dryRun: false,
      count: opportunities.length,
      totalRecords,
      requestCount,
      opportunities,
    };
  }

  async detail(input: SamOpportunityDetailInput): Promise<SamOpportunitySearchResult> {
    const dryRun = input.dryRun ?? !this.apiKey;
    if (dryRun) {
      const opportunities = sampleOpportunities().filter((opportunity) => opportunity.noticeId === input.noticeId).slice(0, 1);
      return {
        source: "SAM.gov Opportunities API",
        dryRun: true,
        count: opportunities.length,
        totalRecords: opportunities.length,
        requestCount: 0,
        opportunities,
      };
    }
    if (!this.apiKey) {
      throw new Error("SAM_GOV_API_KEY or SAM_API_KEY is required for live SAM.gov detail lookups.");
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("limit", "1");
    url.searchParams.set("offset", "0");
    url.searchParams.set("noticeid", input.noticeId);
    const range = createSamPostedDateRange(365, this.now());
    url.searchParams.set("postedFrom", range.postedFrom);
    url.searchParams.set("postedTo", range.postedTo);
    const payload = await this.requestJson(url);
    const rows = Array.isArray(payload.opportunitiesData) ? payload.opportunitiesData : [];
    const opportunities = rows.map((row) => normalizeOpportunity(row));
    return {
      source: "SAM.gov Opportunities API",
      dryRun: false,
      count: opportunities.length,
      totalRecords: typeof payload.totalRecords === "number" ? payload.totalRecords : null,
      requestCount: 1,
      opportunities,
    };
  }

  buildSearchUrl(input: SamOpportunitySearchInput = {}, ncode?: string, offset = 0): URL {
    if (!this.apiKey) {
      throw new Error("SAM_GOV_API_KEY or SAM_API_KEY is required to build live SAM.gov request URLs.");
    }
    const url = new URL(this.baseUrl);
    const range = createSamPostedDateRange(input.postedDaysAgo ?? 30, this.now());
    const procurementTypes = normalizeList(input.procurementTypes ?? DEFAULT_PROCUREMENT_TYPES);

    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("limit", String(Math.min(MAX_PAGE_SIZE, normalizeMaxResults(input.maxResults))));
    url.searchParams.set("offset", String(Math.max(0, Math.trunc(offset))));
    url.searchParams.set("postedFrom", range.postedFrom);
    url.searchParams.set("postedTo", range.postedTo);
    if (input.keywords?.trim()) {
      url.searchParams.set("title", input.keywords.trim());
    }
    for (const type of procurementTypes) {
      url.searchParams.append("ptype", type);
    }
    if (ncode) {
      url.searchParams.set("ncode", ncode);
    }
    if (input.setAsideType?.trim()) {
      url.searchParams.set("typeOfSetAside", input.setAsideType.trim().toUpperCase());
    }
    if (input.state?.trim()) {
      url.searchParams.set("state", input.state.trim().toUpperCase());
    }

    return url;
  }

  sanitizeUrl(input: URL | string): string {
    const text = input.toString().replace(/(api_key=)[^&\s"')]+/gi, `$1${SAM_SECRET_REDACTION}`);
    return this.apiKey ? text.replace(new RegExp(escapeRegExp(this.apiKey), "g"), SAM_SECRET_REDACTION) : text;
  }

  private async requestJson(url: URL): Promise<Record<string, unknown>> {
    const response = await this.fetchFn(url, { headers: { accept: "application/json" } });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`SAM.gov request failed (${response.status} ${response.statusText || "HTTP error"}) at ${this.sanitizeUrl(url)}: ${body.slice(0, 700)}`);
    }
    return body ? (JSON.parse(body) as Record<string, unknown>) : {};
  }
}

export function createSamPostedDateRange(postedDaysAgo: number, now = new Date()): { postedFrom: string; postedTo: string } {
  const days = Math.min(365, Math.max(1, Math.trunc(postedDaysAgo)));
  const postedTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const postedFrom = new Date(postedTo);
  postedFrom.setUTCDate(postedFrom.getUTCDate() - days);
  return {
    postedFrom: formatSamDate(postedFrom),
    postedTo: formatSamDate(postedTo),
  };
}

export function normalizeOpportunity(row: unknown): SamOpportunity {
  const record = isRecord(row) ? row : {};
  const parentParts = stringValue(record.fullParentPathName)?.split(".").map((part) => part.trim()).filter(Boolean) ?? [];
  const contact = firstRecord(record.pointOfContact);
  const award = isRecord(record.award) ? record.award : {};
  const awardee = isRecord(award.awardee) ? award.awardee : {};
  const performance = isRecord(record.placeOfPerformance) ? record.placeOfPerformance : {};

  return {
    noticeId: stringValue(record.noticeId),
    title: stringValue(record.title),
    solicitationNumber: stringValue(record.solicitationNumber),
    procurementType: procurementTypeDescription(record.type),
    postedDate: dateOnly(record.postedDate),
    responseDeadline: dateOnly(record.responseDeadLine ?? record.responseDeadline),
    naicsCode: stringValue(record.naicsCode),
    classificationCode: stringValue(record.classificationCode),
    active: booleanFromSam(record.active),
    setAsideType: stringValue(record.typeOfSetAside ?? record.setAsideCode),
    setAsideDescription: stringValue(record.typeOfSetAsideDescription ?? record.setAside),
    agency: parentParts[0] ?? stringValue(record.department),
    subAgency: parentParts[1] ?? stringValue(record.subTier ?? record.subtier),
    office: parentParts[2] ?? stringValue(record.office),
    contactName: stringValue(contact?.fullName ?? contact?.fullname),
    contactEmail: stringValue(contact?.email),
    contactPhone: stringValue(contact?.phone),
    performanceCity: nestedString(performance, ["city", "name"]) ?? stringValue(performance.city),
    performanceState: nestedString(performance, ["state", "code"]) ?? stringValue(performance.state),
    awardAmount: stringValue(award.amount),
    awardDate: dateOnly(award.date),
    awardeeName: stringValue(awardee.name),
    samUrl: stringValue(record.uiLink) ?? samUrlFromNoticeId(stringValue(record.noticeId)),
    additionalInfoUrl: stringValue(record.additionalInfoLink),
    attachmentCount: Array.isArray(record.resourceLinks) ? record.resourceLinks.length : 0,
  };
}

export function sampleOpportunities(): SamOpportunity[] {
  return [
    {
      noticeId: "sample-cloud-modernization",
      title: "Enterprise Cloud Migration and Modernization Services",
      solicitationNumber: "W912DQ-26-R-0042",
      procurementType: "Solicitation",
      postedDate: "2026-05-01",
      responseDeadline: "2026-06-01",
      naicsCode: "541512",
      classificationCode: "D316",
      active: true,
      setAsideType: "SBA",
      setAsideDescription: "Total Small Business Set-Aside",
      agency: "DEPT OF DEFENSE",
      subAgency: "DEPT OF THE ARMY",
      office: "ARMY CONTRACTING COMMAND",
      contactName: "Sample Contracting Officer",
      contactEmail: "sample@example.mil",
      contactPhone: "555-0100",
      performanceCity: "Arlington",
      performanceState: "VA",
      awardAmount: null,
      awardDate: null,
      awardeeName: null,
      samUrl: "https://sam.gov/opp/sample-cloud-modernization/view",
      additionalInfoUrl: null,
      attachmentCount: 3,
    },
    {
      noticeId: "sample-cyber-sources-sought",
      title: "Cybersecurity Operations Sources Sought",
      solicitationNumber: "70FA26-RFI-CYBER",
      procurementType: "Sources Sought",
      postedDate: "2026-05-03",
      responseDeadline: "2026-05-24",
      naicsCode: "541519",
      classificationCode: "D399",
      active: true,
      setAsideType: "HZC",
      setAsideDescription: "HUBZone Set-Aside",
      agency: "DEPT OF HOMELAND SECURITY",
      subAgency: "FEDERAL EMERGENCY MANAGEMENT AGENCY",
      office: "MISSION SUPPORT",
      contactName: "Sample Specialist",
      contactEmail: "sample@example.gov",
      contactPhone: "555-0101",
      performanceCity: "Washington",
      performanceState: "DC",
      awardAmount: null,
      awardDate: null,
      awardeeName: null,
      samUrl: "https://sam.gov/opp/sample-cyber-sources-sought/view",
      additionalInfoUrl: null,
      attachmentCount: 1,
    },
    {
      noticeId: "sample-construction-award",
      title: "Facilities Repair Award Notice",
      solicitationNumber: "47PF0026C0001",
      procurementType: "Award Notice",
      postedDate: "2026-04-30",
      responseDeadline: null,
      naicsCode: "236220",
      classificationCode: "Z2AA",
      active: false,
      setAsideType: null,
      setAsideDescription: null,
      agency: "GENERAL SERVICES ADMINISTRATION",
      subAgency: "PUBLIC BUILDINGS SERVICE",
      office: "PBS REGIONAL OFFICE",
      contactName: "Sample Award Contact",
      contactEmail: "sample@example.gov",
      contactPhone: "555-0102",
      performanceCity: "Chicago",
      performanceState: "IL",
      awardAmount: "800620",
      awardDate: "2026-04-30",
      awardeeName: "SAMPLE CONSTRUCTION LLC",
      samUrl: "https://sam.gov/opp/sample-construction-award/view",
      additionalInfoUrl: null,
      attachmentCount: 0,
    },
  ];
}

function procurementTypeDescription(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  return PROCUREMENT_TYPE_DESCRIPTIONS[text.toLowerCase()] ?? text;
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

function dateOnly(value: unknown): string | null {
  const text = stringValue(value);
  if (!text || text.toLowerCase() === "null") return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return text;
}

function booleanFromSam(value: unknown): boolean | null {
  const text = stringValue(value)?.toUpperCase();
  if (!text) return null;
  if (["YES", "Y", "TRUE", "ACTIVE"].includes(text)) return true;
  if (["NO", "N", "FALSE", "INACTIVE", "ARCHIVED"].includes(text)) return false;
  return null;
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) return null;
  return value.find(isRecord) ?? null;
}

function nestedString(record: Record<string, unknown>, path: string[]): string | null {
  let value: unknown = record;
  for (const segment of path) {
    if (!isRecord(value)) return null;
    value = value[segment];
  }
  return stringValue(value);
}

function samUrlFromNoticeId(noticeId: string | null): string | null {
  return noticeId ? `https://sam.gov/opp/${noticeId}/view` : null;
}

function formatSamDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${month}/${day}/${date.getUTCFullYear()}`;
}

function normalizeSecret(value: string | undefined): string | undefined {
  const key = value?.trim().replace(/^['"]|['"]$/g, "");
  return key || undefined;
}

function stringValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text && text.toLowerCase() !== "null" ? text : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
