export type OpenCorporatesFetchFn = (input: URL | string, init?: RequestInit) => Promise<Response>;

export interface OpenCorporatesClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: OpenCorporatesFetchFn;
  now?: () => Date;
}

export interface OpenCorporatesSearchInput {
  query?: string;
  jurisdictionCode?: string;
  currentStatus?: string;
  companyType?: string;
  inactive?: boolean;
  incorporationDateFrom?: string;
  incorporationDateTo?: string;
  maxResults?: number;
  dryRun?: boolean;
}

export interface OpenCorporatesDetailInput {
  jurisdictionCode: string;
  companyNumber: string;
  dryRun?: boolean;
}

export interface OpenCorporatesCompany {
  name: string | null;
  companyNumber: string | null;
  jurisdictionCode: string | null;
  currentStatus: string | null;
  companyType: string | null;
  incorporationDate: string | null;
  dissolutionDate: string | null;
  registeredAddress: string | null;
  previousNames: string[];
  branch: string | null;
  inactive: boolean | null;
  openCorporatesUrl: string | null;
  registryUrl: string | null;
}

export interface OpenCorporatesSearchResult {
  source: "OpenCorporates";
  dryRun: boolean;
  count: number;
  totalCount: number | null;
  page: number;
  perPage: number;
  attribution: string;
  companies: OpenCorporatesCompany[];
}

const DEFAULT_BASE_URL = "https://api.opencorporates.com/v0.4";
const DEFAULT_PER_PAGE = 30;
const MAX_PER_PAGE = 100;
const ATTRIBUTION = "Data provided by OpenCorporates (https://opencorporates.com)";
const SECRET_REDACTION = "<redacted>";

export class OpenCorporatesClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchFn: OpenCorporatesFetchFn;
  private readonly now: () => Date;

  constructor(options: OpenCorporatesClientOptions = {}) {
    this.apiKey = options.apiKey?.trim() || undefined;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => new Date());
  }

  async search(input: OpenCorporatesSearchInput = {}): Promise<OpenCorporatesSearchResult> {
    const dryRun = input.dryRun ?? false;
    const maxResults = normalizeMaxResults(input.maxResults);
    if (dryRun) {
      const companies = sampleCompanies().slice(0, maxResults);
      return {
        source: "OpenCorporates",
        dryRun: true,
        count: companies.length,
        totalCount: companies.length,
        page: 1,
        perPage: companies.length,
        attribution: ATTRIBUTION,
        companies,
      };
    }

    const url = this.buildSearchUrl(input);
    const payload = await this.requestJson(url);
    const response = (payload as { results?: { companies?: Array<{ company?: Record<string, unknown> }> } }).results;
    const rows = Array.isArray(response?.companies) ? response.companies : [];
    const companies = rows
      .map((row) => row.company)
      .filter((company): company is Record<string, unknown> => Boolean(company))
      .map((company) => normalizeCompany(company));

    return {
      source: "OpenCorporates",
      dryRun: false,
      count: companies.length,
      totalCount: numberValue((response as Record<string, unknown> | undefined)?.["total_count"]),
      page: numberValue((response as Record<string, unknown> | undefined)?.page) ?? 1,
      perPage: numberValue((response as Record<string, unknown> | undefined)?.per_page) ?? DEFAULT_PER_PAGE,
      attribution: ATTRIBUTION,
      companies,
    };
  }

  async detail(input: OpenCorporatesDetailInput): Promise<OpenCorporatesSearchResult> {
    const dryRun = input.dryRun ?? false;
    if (dryRun) {
      const companies = sampleCompanies().filter((company) => company.companyNumber === input.companyNumber).slice(0, 1);
      return {
        source: "OpenCorporates",
        dryRun: true,
        count: companies.length,
        totalCount: companies.length,
        page: 1,
        perPage: 1,
        attribution: ATTRIBUTION,
        companies,
      };
    }

    const url = new URL(`${this.baseUrl}/companies/${normalizeJurisdiction(input.jurisdictionCode)}/${encodeURIComponent(input.companyNumber)}`);
    if (this.apiKey) {
      url.searchParams.set("api_token", this.apiKey);
    }
    const payload = await this.requestJson(url);
    const company = ((payload as { results?: { company?: Record<string, unknown> } }).results?.company) as Record<string, unknown> | undefined;
    const companies = company ? [normalizeCompany(company)] : [];
    return {
      source: "OpenCorporates",
      dryRun: false,
      count: companies.length,
      totalCount: companies.length,
      page: 1,
      perPage: 1,
      attribution: ATTRIBUTION,
      companies,
    };
  }

  buildSearchUrl(input: OpenCorporatesSearchInput): URL {
    const url = new URL(`${this.baseUrl}/companies/search`);
    const query = input.query?.trim();
    if (!query) {
      throw new Error("OpenCorporates search requires a `query` string.");
    }
    url.searchParams.set("q", query);
    const jurisdiction = input.jurisdictionCode ? normalizeJurisdiction(input.jurisdictionCode) : undefined;
    if (jurisdiction) {
      url.searchParams.set("jurisdiction_code", jurisdiction);
    }
    if (input.currentStatus?.trim()) {
      url.searchParams.set("current_status", input.currentStatus.trim());
    }
    if (input.companyType?.trim()) {
      url.searchParams.set("company_type", input.companyType.trim());
    }
    if (typeof input.inactive === "boolean") {
      url.searchParams.set("inactive", input.inactive ? "true" : "false");
    }
    const incorpFrom = input.incorporationDateFrom?.trim();
    const incorpTo = input.incorporationDateTo?.trim();
    if (incorpFrom || incorpTo) {
      url.searchParams.set("incorporation_date", `${incorpFrom ?? ""}:${incorpTo ?? ""}`);
    }
    const perPage = Math.min(MAX_PER_PAGE, normalizeMaxResults(input.maxResults));
    url.searchParams.set("per_page", String(perPage));
    if (this.apiKey) {
      url.searchParams.set("api_token", this.apiKey);
    }
    return url;
  }

  sanitizeUrl(input: URL | string): string {
    const text = input.toString().replace(/(api_token=)[^&\s"')]+/gi, `$1${SECRET_REDACTION}`);
    return this.apiKey ? text.replace(new RegExp(escapeRegExp(this.apiKey), "g"), SECRET_REDACTION) : text;
  }

  private async requestJson(url: URL): Promise<unknown> {
    const response = await this.fetchFn(url, { headers: { accept: "application/json" } });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`OpenCorporates request failed (${response.status} ${response.statusText || "HTTP error"}) at ${this.sanitizeUrl(url)}: ${body.slice(0, 700)}`);
    }
    return body ? JSON.parse(body) : null;
  }
}

export function normalizeJurisdiction(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (/^[a-z]{2}_[a-z0-9_]+$/.test(trimmed)) return trimmed;
  if (/^[a-z]{2}$/.test(trimmed)) return `us_${trimmed}`;
  if (/^us[-_][a-z]{2}$/.test(trimmed)) return trimmed.replace("-", "_");
  return trimmed.replace(/-/g, "_");
}

export function normalizeCompany(row: Record<string, unknown>): OpenCorporatesCompany {
  const previousNames = Array.isArray(row["previous_names"])
    ? (row["previous_names"] as Array<Record<string, unknown>>).map((entry) => stringValue(entry?.["company_name"])).filter((name): name is string => Boolean(name))
    : [];
  const jurisdictionCode = stringValue(row["jurisdiction_code"]);
  const companyNumber = stringValue(row["company_number"]);
  return {
    name: stringValue(row["name"]),
    companyNumber,
    jurisdictionCode,
    currentStatus: stringValue(row["current_status"]),
    companyType: stringValue(row["company_type"]),
    incorporationDate: dateOnly(row["incorporation_date"]),
    dissolutionDate: dateOnly(row["dissolution_date"]),
    registeredAddress: stringValue(row["registered_address_in_full"]),
    previousNames,
    branch: stringValue(row["branch"]),
    inactive: typeof row["inactive"] === "boolean" ? (row["inactive"] as boolean) : null,
    openCorporatesUrl: stringValue(row["opencorporates_url"]) ?? (jurisdictionCode && companyNumber ? `https://opencorporates.com/companies/${jurisdictionCode}/${companyNumber}` : null),
    registryUrl: stringValue(row["registry_url"]),
  };
}

export function sampleCompanies(): OpenCorporatesCompany[] {
  return [
    {
      name: "ACME RESTAURANT GROUP, LLC",
      companyNumber: "8021234567",
      jurisdictionCode: "us_mi",
      currentStatus: "Active",
      companyType: "Limited Liability Company",
      incorporationDate: "2018-04-12",
      dissolutionDate: null,
      registeredAddress: "123 Main St, Lansing, MI 48912, United States",
      previousNames: ["ACME DINING LLC"],
      branch: null,
      inactive: false,
      openCorporatesUrl: "https://opencorporates.com/companies/us_mi/8021234567",
      registryUrl: "https://www.michigan.gov/corpentitysearch?id=8021234567",
    },
    {
      name: "MIDWEST HOSPITALITY HOLDINGS, INC.",
      companyNumber: "0001234567",
      jurisdictionCode: "us_oh",
      currentStatus: "Active",
      companyType: "Domestic For-Profit Corporation",
      incorporationDate: "2015-09-30",
      dissolutionDate: null,
      registeredAddress: "500 Market St, Columbus, OH 43215, United States",
      previousNames: [],
      branch: null,
      inactive: false,
      openCorporatesUrl: "https://opencorporates.com/companies/us_oh/0001234567",
      registryUrl: "https://businesssearch.ohiosos.gov/?charterNumber=0001234567",
    },
    {
      name: "FARMHAND COOPERATIVE OF IOWA",
      companyNumber: "F123456",
      jurisdictionCode: "us_ia",
      currentStatus: "Inactive - Dissolved",
      companyType: "Cooperative Association",
      incorporationDate: "2007-02-15",
      dissolutionDate: "2023-08-31",
      registeredAddress: "200 Co Rd 9, Schuyler, IA 50010, United States",
      previousNames: [],
      branch: null,
      inactive: true,
      openCorporatesUrl: "https://opencorporates.com/companies/us_ia/F123456",
      registryUrl: null,
    },
  ];
}

function normalizeMaxResults(maxResults?: number): number {
  if (!Number.isFinite(maxResults)) {
    return DEFAULT_PER_PAGE;
  }
  return Math.min(MAX_PER_PAGE, Math.max(1, Math.trunc(maxResults ?? DEFAULT_PER_PAGE)));
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
