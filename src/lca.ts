import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import XlsxStreamReader from "xlsx-stream-reader";

export type LcaSearchMode = "contains" | "exact";

export interface LcaFileInput {
  fiscalYear?: number;
  quarter?: number;
}

export interface LcaFileSet {
  fiscalYear: number;
  quarter: number;
  sourcePageUrl: string;
  disclosure: string;
  appendixA: string;
  worksites: string;
  recordLayout: string;
  appendixARecordLayout: string;
  worksiteRecordLayout: string;
}

export interface LcaSearchInput extends LcaFileInput {
  localFile?: string;
  employerName?: string;
  searchMode?: LcaSearchMode;
  state?: string;
  city?: string;
  jobTitle?: string;
  socCode?: string;
  naicsCode?: string;
  caseStatus?: string;
  visaClass?: string;
  minAnnualWage?: number;
  dateFrom?: string;
  dateTo?: string;
  dateField?: string;
  maxResults?: number;
}

export interface LcaProfileInput extends LcaSearchInput {
  employerName: string;
}

export interface LcaSearchResult {
  fiscalYear: number;
  quarter: number;
  sourceUrl: string;
  localFile: string;
  matched: number;
  scanned: number;
  truncated: boolean;
  rows: LcaRecord[];
}

export type LcaRecord = Record<string, string | number | boolean | null>;

export interface LcaEmployerProfile {
  employer: string;
  fiscalYear: number;
  quarter: number;
  matchedRecords: number;
  totalWorkerPositions: number;
  statuses: Record<string, number>;
  certificationRate: number | null;
  wageStatistics: {
    avgAnnualWage: number | null;
    medianAnnualWage: number | null;
    minAnnualWage: number | null;
    maxAnnualWage: number | null;
    avgPrevailingWage: number | null;
  };
  topJobTitles: Array<{ title: string; count: number; avgAnnualWage: number | null; minAnnualWage: number | null; maxAnnualWage: number | null }>;
  topSOCCodes: Array<{ code: string; title: string | null; count: number; avgAnnualWage: number | null }>;
  worksiteLocations: Array<{ city: string; state: string; count: number }>;
  h1bDependent: boolean | null;
  willfulViolator: boolean | null;
  dataSources: string[];
}

export interface LcaDisclosureClientOptions {
  cacheDir?: string;
  fetchFn?: typeof fetch;
}

const OFLC_BASE_URL = "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs";
const OFLC_PERFORMANCE_PAGE = "https://www.dol.gov/agencies/eta/foreign-labor/performance";
const USER_AGENT = "dol-whd-mcp/0.1.0";

const EMPLOYER_FIELDS = ["EMPLOYER_NAME", "EMPLOYER_BUSINESS_DBA", "TRADE_NAME_DBA"];
const STATE_FIELDS = ["WORKSITE_STATE", "WORKSITE_STATE_1", "EMPLOYER_STATE"];
const CITY_FIELDS = ["WORKSITE_CITY", "WORKSITE_CITY_1", "EMPLOYER_CITY"];
const JOB_TITLE_FIELDS = ["JOB_TITLE"];
const SOC_CODE_FIELDS = ["SOC_CODE"];
const SOC_TITLE_FIELDS = ["SOC_TITLE"];
const NAICS_FIELDS = ["NAICS_CODE"];
const STATUS_FIELDS = ["CASE_STATUS"];
const VISA_FIELDS = ["VISA_CLASS"];
const WORKER_FIELDS = ["TOTAL_WORKER_POSITIONS", "WORKER_POSITIONS"];
const H1B_DEPENDENT_FIELDS = ["H-1B_DEPENDENT", "H1B_DEPENDENT"];
const WILLFUL_FIELDS = ["WILLFUL_VIOLATOR"];
const WAGE_FROM_FIELDS = ["WAGE_RATE_OF_PAY_FROM", "WAGE_RATE_OF_PAY"];
const WAGE_UNIT_FIELDS = ["WAGE_UNIT_OF_PAY"];
const PREVAILING_WAGE_FIELDS = ["PREVAILING_WAGE", "PW_WAGE"];
const PREVAILING_WAGE_UNIT_FIELDS = ["PW_UNIT_OF_PAY", "PREVAILING_WAGE_UNIT"];

export class LcaDisclosureClient {
  private readonly cacheDir: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: LcaDisclosureClientOptions = {}) {
    this.cacheDir = resolve(options.cacheDir ?? ".cache/dol-lca");
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getFileSet(input: LcaFileInput = {}): Promise<LcaFileSet> {
    const fiscalYear = input.fiscalYear ?? currentFederalFiscalYear();
    const quarter = input.quarter ?? latestLikelyQuarter(fiscalYear);
    return buildLcaFileSet(fiscalYear, quarter);
  }

  async getFields(input: LcaSearchInput = {}): Promise<{ fileSet: LcaFileSet; localFile: string; fields: string[] }> {
    const fileSet = await this.getFileSet(input);
    const localFile = await this.resolveDisclosureFile(fileSet, input.localFile);
    const { headers } = await readLcaWorkbook(localFile, () => false, 0);
    return { fileSet, localFile, fields: headers };
  }

  async search(input: LcaSearchInput = {}): Promise<LcaSearchResult> {
    const fileSet = await this.getFileSet(input);
    const localFile = await this.resolveDisclosureFile(fileSet, input.localFile);
    const maxResults = normalizeMaxResults(input.maxResults);
    const matcher = createLcaMatcher(input);
    const scan = await readLcaWorkbook(localFile, matcher, maxResults);

    return {
      fiscalYear: fileSet.fiscalYear,
      quarter: fileSet.quarter,
      sourceUrl: fileSet.disclosure,
      localFile: basename(localFile),
      matched: scan.matched,
      scanned: scan.scanned,
      truncated: scan.truncated,
      rows: scan.rows,
    };
  }

  async employerProfile(input: LcaProfileInput): Promise<LcaEmployerProfile> {
    const result = await this.search({
      ...input,
      maxResults: input.maxResults ?? 5000,
      searchMode: input.searchMode ?? "contains",
    });
    return buildEmployerProfile(input.employerName, result);
  }

  private async resolveDisclosureFile(fileSet: LcaFileSet, localFile?: string): Promise<string> {
    if (localFile) {
      return resolve(localFile);
    }

    await mkdir(this.cacheDir, { recursive: true });
    const target = resolve(this.cacheDir, basename(fileSet.disclosure));
    if (existsSync(target)) {
      return target;
    }

    await downloadFile(this.fetchFn, fileSet.disclosure, target);
    return target;
  }
}

export function buildLcaFileSet(fiscalYear: number, quarter: number): LcaFileSet {
  const fy = normalizeFiscalYear(fiscalYear);
  const q = normalizeQuarter(quarter);
  const suffix = `FY${fy}_Q${q}`;
  return {
    fiscalYear: fy,
    quarter: q,
    sourcePageUrl: OFLC_PERFORMANCE_PAGE,
    disclosure: `${OFLC_BASE_URL}/LCA_Disclosure_Data_${suffix}.xlsx`,
    appendixA: `${OFLC_BASE_URL}/LCA_Appendix_A_${suffix}.xlsx`,
    worksites: `${OFLC_BASE_URL}/LCA_Worksites_${suffix}.xlsx`,
    recordLayout: `${OFLC_BASE_URL}/LCA_Record_Layout_${suffix}.pdf`,
    appendixARecordLayout: `${OFLC_BASE_URL}/LCA_Appendix_A_Record_Layout_${suffix}.pdf`,
    worksiteRecordLayout: `${OFLC_BASE_URL}/LCA_Worksite_Record_Layout_${suffix}.pdf`,
  };
}

export function currentFederalFiscalYear(date = new Date()): number {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 9 ? year + 1 : year;
}

export function latestLikelyQuarter(fiscalYear: number, date = new Date()): number {
  const currentFy = currentFederalFiscalYear(date);
  if (fiscalYear < currentFy) {
    return 4;
  }
  if (fiscalYear > currentFy) {
    return 1;
  }

  const month = date.getUTCMonth();
  if (month >= 9) return 1;
  if (month >= 6) return 2;
  return 1;
}

export function normalizeEmployerName(value: string): string {
  return value
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(INC|INCORPORATED|LLC|LTD|LIMITED|CORP|CORPORATION|COMPANY|CO|LP|LLP|PLC|GROUP|HOLDINGS|INTERNATIONAL|INTL)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function annualizeWage(value: unknown, unit: unknown): number | null {
  const wage = toNumber(value);
  if (wage === null) {
    return null;
  }
  const normalizedUnit = String(unit ?? "Year").toUpperCase();
  if (normalizedUnit.includes("HOUR")) return wage * 2080;
  if (normalizedUnit.includes("WEEK") && !normalizedUnit.includes("BI")) return wage * 52;
  if (normalizedUnit.includes("BI")) return wage * 26;
  if (normalizedUnit.includes("MONTH")) return wage * 12;
  return wage;
}

export function buildEmployerProfile(employerName: string, result: LcaSearchResult): LcaEmployerProfile {
  const wages: number[] = [];
  const prevailingWages: number[] = [];
  const statuses = new Map<string, number>();
  const jobStats = new Map<string, { count: number; wages: number[] }>();
  const socStats = new Map<string, { title: string | null; count: number; wages: number[] }>();
  const locationStats = new Map<string, { city: string; state: string; count: number }>();
  let totalWorkerPositions = 0;
  let h1bDependent: boolean | null = null;
  let willfulViolator: boolean | null = null;

  for (const row of result.rows) {
    const status = (stringField(row, STATUS_FIELDS) ?? "UNKNOWN").toUpperCase();
    increment(statuses, status);

    totalWorkerPositions += toNumber(firstField(row, WORKER_FIELDS)) ?? 0;

    const wage = annualizeWage(firstField(row, WAGE_FROM_FIELDS), firstField(row, WAGE_UNIT_FIELDS));
    if (wage !== null) {
      wages.push(wage);
    }

    const prevailingWage = annualizeWage(firstField(row, PREVAILING_WAGE_FIELDS), firstField(row, PREVAILING_WAGE_UNIT_FIELDS));
    if (prevailingWage !== null) {
      prevailingWages.push(prevailingWage);
    }

    const title = stringField(row, JOB_TITLE_FIELDS);
    if (title) {
      const stats = jobStats.get(title) ?? { count: 0, wages: [] as number[] };
      stats.count += 1;
      if (wage !== null) stats.wages.push(wage);
      jobStats.set(title, stats);
    }

    const socCode = stringField(row, SOC_CODE_FIELDS);
    if (socCode) {
      const stats = socStats.get(socCode) ?? { title: stringField(row, SOC_TITLE_FIELDS) ?? null, count: 0, wages: [] as number[] };
      stats.count += 1;
      if (!stats.title) stats.title = stringField(row, SOC_TITLE_FIELDS) ?? null;
      if (wage !== null) stats.wages.push(wage);
      socStats.set(socCode, stats);
    }

    const city = stringField(row, CITY_FIELDS);
    const state = stringField(row, STATE_FIELDS);
    if (city && state) {
      const key = `${city}|${state}`;
      const stats = locationStats.get(key) ?? { city, state, count: 0 };
      stats.count += 1;
      locationStats.set(key, stats);
    }

    h1bDependent = coalesceBoolean(h1bDependent, booleanField(row, H1B_DEPENDENT_FIELDS));
    willfulViolator = coalesceBoolean(willfulViolator, booleanField(row, WILLFUL_FIELDS));
  }

  const certified = [...statuses.entries()]
    .filter(([status]) => status === "CERTIFIED")
    .reduce((sum, [, count]) => sum + count, 0);

  return {
    employer: employerName,
    fiscalYear: result.fiscalYear,
    quarter: result.quarter,
    matchedRecords: result.matched,
    totalWorkerPositions,
    statuses: Object.fromEntries(statuses),
    certificationRate: result.matched > 0 ? round((certified / result.matched) * 100, 2) : null,
    wageStatistics: {
      avgAnnualWage: average(wages),
      medianAnnualWage: median(wages),
      minAnnualWage: min(wages),
      maxAnnualWage: max(wages),
      avgPrevailingWage: average(prevailingWages),
    },
    topJobTitles: [...jobStats.entries()]
      .map(([title, stats]) => ({
        title,
        count: stats.count,
        avgAnnualWage: average(stats.wages),
        minAnnualWage: min(stats.wages),
        maxAnnualWage: max(stats.wages),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    topSOCCodes: [...socStats.entries()]
      .map(([code, stats]) => ({
        code,
        title: stats.title,
        count: stats.count,
        avgAnnualWage: average(stats.wages),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    worksiteLocations: [...locationStats.values()].sort((a, b) => b.count - a.count).slice(0, 20),
    h1bDependent,
    willfulViolator,
    dataSources: [result.sourceUrl, OFLC_PERFORMANCE_PAGE],
  };
}

function createLcaMatcher(input: LcaSearchInput): (row: LcaRecord) => boolean {
  const employerNeedle = input.employerName ? normalizeEmployerName(input.employerName) : undefined;
  const searchMode = input.searchMode ?? "contains";
  const state = input.state?.trim().toUpperCase();
  const city = input.city?.trim().toUpperCase();
  const jobTitle = input.jobTitle?.trim().toUpperCase();
  const socCode = input.socCode?.trim().toUpperCase();
  const naicsCode = input.naicsCode?.trim();
  const caseStatus = input.caseStatus?.trim().toUpperCase();
  const visaClass = input.visaClass?.trim().toUpperCase();
  const dateField = input.dateField?.trim().toUpperCase() || "DECISION_DATE";
  const fromTime = input.dateFrom ? Date.parse(input.dateFrom) : undefined;
  const toTime = input.dateTo ? Date.parse(input.dateTo) : undefined;

  return (row) => {
    if (employerNeedle) {
      const employer = normalizeEmployerName(stringField(row, EMPLOYER_FIELDS) ?? "");
      const match = searchMode === "exact" ? employer === employerNeedle : employer.includes(employerNeedle);
      if (!match) return false;
    }
    if (state && stringField(row, STATE_FIELDS)?.toUpperCase() !== state) return false;
    if (city && !stringField(row, CITY_FIELDS)?.toUpperCase().includes(city)) return false;
    if (jobTitle && !stringField(row, JOB_TITLE_FIELDS)?.toUpperCase().includes(jobTitle)) return false;
    if (socCode && !stringField(row, SOC_CODE_FIELDS)?.toUpperCase().startsWith(socCode)) return false;
    if (naicsCode && !stringField(row, NAICS_FIELDS)?.startsWith(naicsCode)) return false;
    if (caseStatus && stringField(row, STATUS_FIELDS)?.toUpperCase() !== caseStatus) return false;
    if (visaClass && stringField(row, VISA_FIELDS)?.toUpperCase() !== visaClass) return false;
    if (input.minAnnualWage !== undefined) {
      const wage = annualizeWage(firstField(row, WAGE_FROM_FIELDS), firstField(row, WAGE_UNIT_FIELDS));
      if (wage === null || wage < input.minAnnualWage) return false;
    }
    if (fromTime !== undefined || toTime !== undefined) {
      const value = row[dateField];
      const time = typeof value === "string" || typeof value === "number" ? Date.parse(String(value)) : NaN;
      if (!Number.isFinite(time)) return false;
      if (fromTime !== undefined && time < fromTime) return false;
      if (toTime !== undefined && time > toTime) return false;
    }
    return true;
  };
}

async function readLcaWorkbook(
  localFile: string,
  matcher: (row: LcaRecord) => boolean,
  maxResults: number,
): Promise<{ headers: string[]; matched: number; scanned: number; truncated: boolean; rows: LcaRecord[] }> {
  let headers: string[] = [];
  let matched = 0;
  let scanned = 0;
  const rows: LcaRecord[] = [];

  await new Promise<void>((resolvePromise, reject) => {
    const workbookReader = new XlsxStreamReader({
      verbose: false,
      formatting: false,
    });

    workbookReader.on("error", reject);
    workbookReader.on("worksheet", (worksheetReader) => {
      if (worksheetReader.id > 1) {
        worksheetReader.skip();
        return;
      }

      worksheetReader.on("row", (row) => {
        if (Number(row.attributes.r) === 1) {
          headers = headersFromSparseRow(row.values);
          return;
        }

        const record = recordFromSparseRow(headers, row.values);
        scanned += 1;
        if (!matcher(record)) {
          return;
        }

        matched += 1;
        if (rows.length < maxResults) {
          rows.push(record);
        }
      });
      worksheetReader.process();
    });
    workbookReader.on("end", () => resolvePromise());

    createReadStream(localFile).on("error", reject).pipe(workbookReader);
  });

  return { headers, matched, scanned, truncated: matched > rows.length, rows };
}

async function downloadFile(fetchFn: typeof fetch, url: string, target: string): Promise<void> {
  const tmp = `${target}.tmp`;
  const response = await fetchFn(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`DOL LCA disclosure download failed (${response.status} ${response.statusText || "HTTP error"}) for ${url}`);
  }

  try {
    await pipeline(Readable.fromWeb(response.body as any), createWriteStream(tmp));
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

function headersFromSparseRow(values: unknown[]): string[] {
  const headers: string[] = [];
  values.forEach((value, colNum) => {
    if (colNum > 0) {
      headers[colNum - 1] = normalizeHeader(cellToPlain(value));
    }
  });
  return headers;
}

function recordFromSparseRow(headers: string[], values: unknown[]): LcaRecord {
  const record: LcaRecord = {};
  headers.forEach((header, index) => {
    if (header) {
      record[header] = cellToPlain(values[index + 1]);
    }
  });
  return record;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_");
}

function cellToPlain(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellToPlain(value.result);
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  }
  return String(value);
}

function normalizeFiscalYear(fiscalYear: number): number {
  const value = Math.trunc(fiscalYear);
  if (value < 2009 || value > 2100) {
    throw new Error("LCA fiscalYear must be between 2009 and 2100.");
  }
  return value;
}

function normalizeQuarter(quarter: number): number {
  const value = Math.trunc(quarter);
  if (value < 1 || value > 4) {
    throw new Error("LCA quarter must be between 1 and 4.");
  }
  return value;
}

function normalizeMaxResults(maxResults?: number): number {
  if (!Number.isFinite(maxResults)) {
    return 25;
  }
  return Math.min(5000, Math.max(1, Math.trunc(maxResults ?? 25)));
}

function firstField(row: LcaRecord, fields: string[]): LcaRecord[string] | undefined {
  for (const field of fields) {
    if (row[field] !== undefined && row[field] !== null && row[field] !== "") {
      return row[field];
    }
  }
  return undefined;
}

function stringField(row: LcaRecord, fields: string[]): string | undefined {
  const value = firstField(row, fields);
  return value === undefined ? undefined : String(value).trim();
}

function booleanField(row: LcaRecord, fields: string[]): boolean | null {
  const value = stringField(row, fields)?.toUpperCase();
  if (!value) return null;
  if (["Y", "YES", "TRUE"].includes(value)) return true;
  if (["N", "NO", "FALSE"].includes(value)) return false;
  return null;
}

function coalesceBoolean(current: boolean | null, next: boolean | null): boolean | null {
  if (current === true || next === true) return true;
  if (current === false || next === false) return false;
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function average(values: number[]): number | null {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 2) : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? round(sorted[mid], 2) : round((sorted[mid - 1] + sorted[mid]) / 2, 2);
}

function min(values: number[]): number | null {
  return values.length ? Math.min(...values) : null;
}

function max(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
