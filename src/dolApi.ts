export type DolFormat = "json" | "csv" | "xml";
export type SortDirection = "asc" | "desc";

export type FetchFn = (input: URL | string, init?: RequestInit) => Promise<Response>;
export type SleepFn = (ms: number) => Promise<void>;

export interface DolApiClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: FetchFn;
  maxRetries?: number;
  sleepFn?: SleepFn;
}

export interface EnforcementQueryInput {
  limit?: number;
  offset?: number;
  fields?: string[] | string;
  sort?: SortDirection;
  sortBy?: string;
  sort_by?: string;
  filterObject?: unknown;
  filter_object?: unknown;
}

export interface EnforcementQuery {
  limit?: number;
  offset?: number;
  fields?: string[];
  sort?: SortDirection;
  sortBy?: string;
  filterObject?: unknown;
}

export interface FilterCondition {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "in" | "not_in" | "like";
  value: unknown;
}

export interface DatasetSearchInput {
  search?: string;
  agency?: string;
  limit?: number;
}

const DEFAULT_BASE_URL = "https://apiprod.dol.gov/v4";
const MAX_DOL_LIMIT = 10000;
const REDACTED = "<redacted>";

export class DolApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;
  private readonly maxRetries: number;
  private readonly sleepFn: SleepFn;

  constructor(options: DolApiClientOptions) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) {
      throw new Error("DOL_API_KEY is missing. Set it in the environment or a local .env file.");
    }

    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.maxRetries = Math.max(0, Math.trunc(options.maxRetries ?? 2));
    this.sleepFn = options.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  buildEnforcementUrl(query: EnforcementQueryInput = {}): URL {
    return this.buildDataUrl("WHD", "enforcement", "json", normalizeEnforcementQuery(query));
  }

  buildEnforcementMetadataUrl(): URL {
    return this.buildDataUrl("WHD", "enforcement", "json", {}, true);
  }

  buildDatasetUrl(
    agency: string,
    endpoint: string,
    query: EnforcementQueryInput = {},
    format: DolFormat = "json",
  ): URL {
    return this.buildDataUrl(agency, endpoint, format, normalizeEnforcementQuery(query));
  }

  buildDatasetMetadataUrl(agency: string, endpoint: string, format: DolFormat = "json"): URL {
    return this.buildDataUrl(agency, endpoint, format, {}, true);
  }

  buildDatasetsUrl(input: DatasetSearchInput = {}): URL {
    const url = new URL(`${this.baseUrl}/datasets`);
    url.searchParams.set("limit", String(normalizeLimit(input.limit ?? 500)));
    if (input.search?.trim()) {
      url.searchParams.set("search", input.search.trim());
    }
    if (input.agency?.trim()) {
      url.searchParams.set("agency", input.agency.trim());
    }
    return url;
  }

  sanitizeUrl(input: URL | string): string {
    const url = new URL(input.toString());
    if (url.searchParams.has("X-API-KEY")) {
      url.searchParams.set("X-API-KEY", REDACTED);
    }
    return redactSecret(url.toString(), this.apiKey);
  }

  async getEnforcementRecords(query: EnforcementQueryInput = {}): Promise<Record<string, unknown>[]> {
    const payload = await this.requestJson(this.buildEnforcementUrl(query));
    return extractArray(payload) as Record<string, unknown>[];
  }

  async getEnforcementMetadata(): Promise<Record<string, unknown>[]> {
    const payload = await this.requestJson(this.buildEnforcementMetadataUrl());
    return extractArray(payload) as Record<string, unknown>[];
  }

  async getDatasetRecords(
    agency: string,
    endpoint: string,
    query: EnforcementQueryInput = {},
  ): Promise<Record<string, unknown>[]> {
    const payload = await this.requestJson(this.buildDatasetUrl(agency, endpoint, query));
    return extractArray(payload) as Record<string, unknown>[];
  }

  async getDatasetMetadata(agency: string, endpoint: string): Promise<Record<string, unknown>[]> {
    const payload = await this.requestJson(this.buildDatasetMetadataUrl(agency, endpoint));
    return extractArray(payload) as Record<string, unknown>[];
  }

  async getDatasets(input: DatasetSearchInput = {}): Promise<Record<string, unknown>[]> {
    const payload = await this.requestJson(
      this.buildDatasetsUrl({
        ...input,
        limit: Math.max(500, input.limit ?? 25),
      }),
    );
    const datasets = extractArray(payload) as Record<string, unknown>[];
    const search = input.search?.trim().toLowerCase();
    const agency = input.agency?.trim().toLowerCase();
    const filtered = datasets.filter((dataset) => {
      const matchesSearch = search ? JSON.stringify(dataset).toLowerCase().includes(search) : true;
      const matchesAgency = agency ? JSON.stringify(dataset).toLowerCase().includes(agency) : true;
      return matchesSearch && matchesAgency;
    });
    return filtered.slice(0, normalizeLimit(input.limit ?? 25));
  }

  private buildDataUrl(
    agency: string,
    endpoint: string,
    format: DolFormat,
    query: EnforcementQuery,
    metadata = false,
  ): URL {
    const suffix = metadata ? "/metadata" : "";
    const url = new URL(
      `${this.baseUrl}/get/${encodeURIComponent(agency)}/${encodeURIComponent(endpoint)}/${format}${suffix}`,
    );

    appendQueryParam(url, "limit", query.limit);
    appendQueryParam(url, "offset", query.offset);
    appendQueryParam(url, "fields", query.fields?.join(","));
    appendQueryParam(url, "sort", query.sort);
    appendQueryParam(url, "sort_by", query.sortBy);
    appendQueryParam(url, "filter_object", serializeFilterObject(query.filterObject));
    url.searchParams.set("X-API-KEY", this.apiKey);
    return url;
  }

  private async requestJson(url: URL): Promise<unknown> {
    let response = await this.fetchFn(url, {
      headers: { accept: "application/json" },
    });
    for (let attempt = 1; isTransientStatus(response.status) && attempt <= this.maxRetries; attempt += 1) {
      await this.sleepFn(retryDelayMs(response, attempt));
      response = await this.fetchFn(url, {
        headers: { accept: "application/json" },
      });
    }
    const body = await response.text();
    const safeBody = redactSecret(body, this.apiKey);

    if (!response.ok) {
      throw new Error(
        `DOL API request failed (${response.status} ${response.statusText || "HTTP error"}) at ${this.sanitizeUrl(
          url,
        )}: ${truncate(safeBody, 700)}`,
      );
    }

    try {
      return body ? JSON.parse(body) : null;
    } catch (error) {
      throw new Error(`DOL API returned non-JSON content at ${this.sanitizeUrl(url)}: ${truncate(safeBody, 700)}`);
    }
  }
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) {
      return Math.max(0, retryDate - Date.now());
    }
  }
  return Math.min(5000, 500 * attempt);
}

export function normalizeEnforcementQuery(input: EnforcementQueryInput = {}): EnforcementQuery {
  const fields = normalizeFields(input.fields);
  const sortBy = input.sortBy ?? input.sort_by;
  const filterObject = input.filterObject ?? input.filter_object;

  return {
    limit: input.limit === undefined ? undefined : normalizeLimit(input.limit),
    offset: input.offset === undefined ? undefined : Math.max(0, Math.trunc(input.offset)),
    fields,
    sort: input.sort,
    sortBy: sortBy?.trim() || undefined,
    filterObject,
  };
}

export function createCaseIdFilter(caseId: string | number): FilterCondition {
  const value = typeof caseId === "number" ? caseId : Number(caseId);
  if (!Number.isFinite(value)) {
    throw new Error("case_id must be numeric.");
  }
  return {
    field: "case_id",
    operator: "eq",
    value,
  };
}

export function redactSecret(text: string, secret?: string): string {
  const withoutApiKeyParam = text.replace(/(X-API-KEY=)[^&\s"')]+/gi, `$1${REDACTED}`);
  if (!secret) {
    return withoutApiKeyParam;
  }
  return withoutApiKeyParam.replace(new RegExp(escapeRegExp(secret), "g"), REDACTED);
}

function normalizeFields(fields: string[] | string | undefined): string[] | undefined {
  const parts = Array.isArray(fields) ? fields : fields?.split(",");
  const normalized = parts?.map((field) => field.trim()).filter(Boolean);
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 10;
  }
  return Math.min(MAX_DOL_LIMIT, Math.max(1, Math.trunc(limit)));
}

function appendQueryParam(url: URL, key: string, value: number | string | undefined): void {
  if (value !== undefined && value !== "") {
    url.searchParams.set(key, String(value));
  }
}

function serializeFilterObject(filterObject: unknown): string | undefined {
  if (filterObject === undefined || filterObject === null || filterObject === "") {
    return undefined;
  }
  return typeof filterObject === "string" ? filterObject : JSON.stringify(filterObject);
}

function extractArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (isRecord(payload)) {
    for (const key of ["data", "results", "records", "datasets", "items"]) {
      const value = payload[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
