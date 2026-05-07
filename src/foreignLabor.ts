import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import XlsxStreamReader from "xlsx-stream-reader";

export type ForeignLaborProgram = "LCA" | "PERM" | "H-2A" | "H-2B" | "CW";
export type ForeignLaborQuarter = "Q1" | "Q2" | "Q3" | "Q4";

export interface ForeignLaborFileInput {
  visaProgram?: string;
  fiscalYear?: number;
  fiscalQuarter?: ForeignLaborQuarter | string;
}

export interface ForeignLaborSearchInput extends ForeignLaborFileInput {
  localFile?: string;
  employerName?: string;
  jobTitle?: string;
  socCode?: string;
  worksiteState?: string;
  caseStatus?: string;
  minAnnualWage?: number;
  maxItems?: number;
}

export interface ForeignLaborFileSet {
  program: ForeignLaborProgram;
  fiscalYear: number;
  fiscalQuarter: ForeignLaborQuarter;
  sourcePageUrl: string;
  disclosure: string;
  recordLayout: string | null;
  auxiliaryFiles: string[];
}

export interface ForeignLaborSearchResult {
  program: ForeignLaborProgram;
  fiscalYear: number;
  fiscalQuarter: ForeignLaborQuarter;
  sourceUrl: string;
  localFile: string;
  matched: number;
  scanned: number;
  truncated: boolean;
  records: ForeignLaborRecord[];
}

export interface ForeignLaborFieldsResult {
  fileSet: ForeignLaborFileSet;
  localFile: string;
  fields: string[];
}

export interface ForeignLaborDisclosureClientOptions {
  cacheDir?: string;
  fetchFn?: typeof fetch;
}

export interface ForeignLaborRecord {
  case_number: string | null;
  visa_class: string | null;
  case_status: string | null;
  received_date: string | null;
  decision_date: string | null;
  employment_start_date: string | null;
  employment_end_date: string | null;
  employer_name: string | null;
  employer_address: string | null;
  employer_city: string | null;
  employer_state: string | null;
  employer_postal_code: string | null;
  employer_country: string | null;
  employer_phone: string | null;
  employer_fein: string | null;
  naics_code: string | null;
  agent_attorney_name: string | null;
  agent_attorney_firm: string | null;
  job_title: string | null;
  soc_code: string | null;
  soc_title: string | null;
  wage_rate_of_pay_from: number | null;
  wage_rate_of_pay_to: number | null;
  wage_unit_of_pay: string | null;
  wage_annual_min: number | null;
  prevailing_wage: number | null;
  pw_unit_of_pay: string | null;
  pw_wage_level: string | null;
  pw_source: string | null;
  worksite_address: string | null;
  worksite_city: string | null;
  worksite_county: string | null;
  worksite_state: string | null;
  worksite_postal_code: string | null;
  full_time_position: string | null;
  total_worker_positions: number | null;
  new_employment: number | null;
  continued_employment: number | null;
  change_previous_employment: number | null;
  new_concurrent_employment: number | null;
  change_employer: number | null;
  amended_petition: number | null;
  h1b_dependent: string | null;
  willful_violator: string | null;
  support_h1b: string | null;
  source_file: string;
}

type RawRecord = Record<string, string | number | boolean | null>;

const OFLC_PERFORMANCE_PAGE = "https://www.dol.gov/agencies/eta/foreign-labor/performance";
const DOL_ORIGIN = "https://www.dol.gov";
const USER_AGENT = "dol-whd-mcp/0.1.0";

const PROGRAM_FILE_PATTERNS: Record<ForeignLaborProgram, string[]> = {
  LCA: ["LCA_Disclosure_Data"],
  PERM: ["PERM_Disclosure_Data"],
  "H-2A": ["H-2A_Disclosure_Data"],
  "H-2B": ["H-2B_Disclosure_Data"],
  CW: ["CW-1_Disclosure_Data", "CW_Disclosure_Data"],
};

const PROGRAM_DEFAULT_VISA_CLASS: Record<ForeignLaborProgram, string> = {
  LCA: "LCA",
  PERM: "PERM",
  "H-2A": "H-2A",
  "H-2B": "H-2B",
  CW: "CW-1",
};

const FIELD_ALIASES = {
  caseNumber: ["CASE_NUMBER", "CASE_NO", "CASE_ID"],
  visaClass: ["VISA_CLASS", "CLASS_OF_ADMISSION"],
  caseStatus: ["CASE_STATUS", "STATUS"],
  receivedDate: ["RECEIVED_DATE", "CASE_RECEIVED_DATE"],
  decisionDate: ["DECISION_DATE", "CASE_DECISION_DATE", "CERTIFICATION_BEGIN_DATE"],
  employmentStartDate: ["EMPLOYMENT_START_DATE", "BEGIN_DATE", "PERIOD_OF_EMPLOYMENT_START_DATE", "WORK_START_DATE"],
  employmentEndDate: ["EMPLOYMENT_END_DATE", "END_DATE", "PERIOD_OF_EMPLOYMENT_END_DATE", "WORK_END_DATE"],
  employerName: ["EMPLOYER_NAME", "EMPLOYER_BUSINESS_DBA", "TRADE_NAME_DBA"],
  employerAddress: ["EMPLOYER_ADDRESS", "EMPLOYER_ADDRESS_1", "EMPLOYER_ADDRESS1", "EMPLOYER_STREET_ADDRESS"],
  employerCity: ["EMPLOYER_CITY"],
  employerState: ["EMPLOYER_STATE", "EMPLOYER_STATE_PROVINCE"],
  employerPostalCode: ["EMPLOYER_POSTAL_CODE", "EMPLOYER_ZIP_CODE"],
  employerCountry: ["EMPLOYER_COUNTRY"],
  employerPhone: ["EMPLOYER_PHONE", "EMPLOYER_PHONE_NUMBER"],
  employerFein: ["EMPLOYER_FEIN", "FEIN", "EMPLOYER_EIN"],
  naicsCode: ["NAICS_CODE"],
  attorneyName: ["AGENT_ATTORNEY_NAME", "ATTORNEY_AGENT_NAME", "AGENT_REPRESENTING_EMPLOYER"],
  attorneyFirm: ["AGENT_ATTORNEY_FIRM", "AGENT_ATTORNEY_LAW_FIRM_BUSINESS_NAME", "ATTORNEY_AGENT_FIRM_NAME"],
  jobTitle: ["JOB_TITLE"],
  socCode: ["SOC_CODE", "SOC_OCC_CODE"],
  socTitle: ["SOC_TITLE", "SOC_OCC_TITLE"],
  wageFrom: ["WAGE_RATE_OF_PAY_FROM", "WAGE_RATE_OF_PAY", "WAGE_OFFER_FROM", "BASIC_RATE_OF_PAY"],
  wageTo: ["WAGE_RATE_OF_PAY_TO", "WAGE_OFFER_TO"],
  wageUnit: ["WAGE_UNIT_OF_PAY", "WAGE_OFFER_UNIT_OF_PAY", "RATE_OF_PAY_UNIT"],
  prevailingWage: ["PREVAILING_WAGE", "PW_WAGE"],
  prevailingWageUnit: ["PW_UNIT_OF_PAY", "PREVAILING_WAGE_UNIT"],
  prevailingWageLevel: ["PW_WAGE_LEVEL", "PREVAILING_WAGE_LEVEL"],
  prevailingWageSource: ["PW_SOURCE", "PREVAILING_WAGE_SOURCE"],
  worksiteAddress: ["WORKSITE_ADDRESS", "WORKSITE_ADDRESS_1", "WORKSITE_STREET_ADDRESS"],
  worksiteCity: ["WORKSITE_CITY", "WORKSITE_CITY_1", "PLACE_OF_EMPLOYMENT_CITY"],
  worksiteCounty: ["WORKSITE_COUNTY", "WORKSITE_COUNTY_1", "PLACE_OF_EMPLOYMENT_COUNTY"],
  worksiteState: ["WORKSITE_STATE", "WORKSITE_STATE_1", "PLACE_OF_EMPLOYMENT_STATE"],
  worksitePostalCode: ["WORKSITE_POSTAL_CODE", "WORKSITE_POSTAL_CODE_1", "PLACE_OF_EMPLOYMENT_POSTAL_CODE"],
  fullTime: ["FULL_TIME_POSITION"],
  totalWorkers: ["TOTAL_WORKER_POSITIONS", "WORKER_POSITIONS", "TOTAL_WORKERS_NEEDED"],
  newEmployment: ["NEW_EMPLOYMENT"],
  continuedEmployment: ["CONTINUED_EMPLOYMENT"],
  changePreviousEmployment: ["CHANGE_PREVIOUS_EMPLOYMENT"],
  newConcurrentEmployment: ["NEW_CONCURRENT_EMPLOYMENT"],
  changeEmployer: ["CHANGE_EMPLOYER"],
  amendedPetition: ["AMENDED_PETITION"],
  h1bDependent: ["H-1B_DEPENDENT", "H1B_DEPENDENT"],
  willfulViolator: ["WILLFUL_VIOLATOR"],
  supportH1b: ["SUPPORT_H1B", "STATUTORY_BASIS"],
} as const;

export class ForeignLaborDisclosureClient {
  private readonly cacheDir: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: ForeignLaborDisclosureClientOptions = {}) {
    this.cacheDir = resolve(options.cacheDir ?? ".cache/foreign-labor");
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getFileSet(input: ForeignLaborFileInput = {}): Promise<ForeignLaborFileSet> {
    const program = normalizeForeignLaborProgram(input.visaProgram ?? "LCA");
    const fiscalYear = normalizeFiscalYear(input.fiscalYear ?? currentFederalFiscalYear());
    const fiscalQuarter = normalizeQuarter(input.fiscalQuarter ?? latestLikelyQuarter(fiscalYear));
    const links = await this.getPerformanceLinks();
    const candidates = selectProgramLinks(links, program, fiscalYear, fiscalQuarter);
    const disclosure = candidates.find((link) => isDisclosureLink(link, program));
    if (!disclosure) {
      throw new Error(`No ${program} disclosure workbook found for FY${fiscalYear} ${fiscalQuarter} on the DOL performance page.`);
    }

    return {
      program,
      fiscalYear,
      fiscalQuarter,
      sourcePageUrl: OFLC_PERFORMANCE_PAGE,
      disclosure,
      recordLayout: candidates.find((link) => /record[_-]?layout/i.test(link)) ?? null,
      auxiliaryFiles: candidates.filter((link) => link !== disclosure && !/record[_-]?layout/i.test(link)),
    };
  }

  async getFields(input: ForeignLaborSearchInput = {}): Promise<ForeignLaborFieldsResult> {
    const fileSet = await this.getFileSet(input);
    const localFile = await this.resolveDisclosureFile(fileSet, input.localFile);
    const { headers } = await readWorkbook(localFile, () => false, 0);
    return { fileSet, localFile, fields: headers };
  }

  async search(input: ForeignLaborSearchInput = {}): Promise<ForeignLaborSearchResult> {
    const fileSet = input.localFile
      ? await this.localFileSet(input)
      : await this.getFileSet(input);
    const localFile = await this.resolveDisclosureFile(fileSet, input.localFile);
    const limit = normalizeMaxItems(input.maxItems);
    const matcher = createMatcher(input);
    const scan = await readWorkbook(localFile, (row) => {
      const normalized = normalizeForeignLaborRecord(row, fileSet.program, basename(localFile));
      return matcher(normalized);
    }, limit);

    return {
      program: fileSet.program,
      fiscalYear: fileSet.fiscalYear,
      fiscalQuarter: fileSet.fiscalQuarter,
      sourceUrl: fileSet.disclosure,
      localFile: basename(localFile),
      matched: scan.matched,
      scanned: scan.scanned,
      truncated: scan.truncated,
      records: scan.rows.map((row) => normalizeForeignLaborRecord(row, fileSet.program, basename(localFile))),
    };
  }

  private async localFileSet(input: ForeignLaborSearchInput): Promise<ForeignLaborFileSet> {
    const program = normalizeForeignLaborProgram(input.visaProgram ?? "LCA");
    const fiscalYear = normalizeFiscalYear(input.fiscalYear ?? currentFederalFiscalYear());
    const fiscalQuarter = normalizeQuarter(input.fiscalQuarter ?? latestLikelyQuarter(fiscalYear));
    const localName = basename(input.localFile ?? "local.xlsx");
    return {
      program,
      fiscalYear,
      fiscalQuarter,
      sourcePageUrl: OFLC_PERFORMANCE_PAGE,
      disclosure: localName,
      recordLayout: null,
      auxiliaryFiles: [],
    };
  }

  private async resolveDisclosureFile(fileSet: ForeignLaborFileSet, localFile?: string): Promise<string> {
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

  private async getPerformanceLinks(): Promise<string[]> {
    const response = await this.fetchFn(OFLC_PERFORMANCE_PAGE, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) {
      throw new Error(`DOL foreign-labor performance page request failed (${response.status} ${response.statusText || "HTTP error"}).`);
    }
    const html = await response.text();
    return extractLinks(html);
  }
}

export function normalizeForeignLaborProgram(value: string): ForeignLaborProgram {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (["LCA", "H1B", "H-1B", "H1B1", "E3", "E-3"].includes(normalized)) return "LCA";
  if (normalized === "PERM") return "PERM";
  if (["H2A", "H-2A"].includes(normalized)) return "H-2A";
  if (["H2B", "H-2B"].includes(normalized)) return "H-2B";
  if (["CW", "CW1", "CW-1"].includes(normalized)) return "CW";
  throw new Error("visaProgram must be one of LCA, PERM, H-2A, H-2B, or CW.");
}

export function normalizeForeignLaborRecord(row: RawRecord, program: ForeignLaborProgram, sourceFile: string): ForeignLaborRecord {
  const wageFrom = numberField(row, FIELD_ALIASES.wageFrom);
  const wageTo = numberField(row, FIELD_ALIASES.wageTo);
  const wageUnit = stringField(row, FIELD_ALIASES.wageUnit);
  const prevailingWage = numberField(row, FIELD_ALIASES.prevailingWage);

  return {
    case_number: stringField(row, FIELD_ALIASES.caseNumber),
    visa_class: stringField(row, FIELD_ALIASES.visaClass) ?? PROGRAM_DEFAULT_VISA_CLASS[program],
    case_status: stringField(row, FIELD_ALIASES.caseStatus),
    received_date: dateOnly(firstField(row, FIELD_ALIASES.receivedDate)),
    decision_date: dateOnly(firstField(row, FIELD_ALIASES.decisionDate)),
    employment_start_date: dateOnly(firstField(row, FIELD_ALIASES.employmentStartDate)),
    employment_end_date: dateOnly(firstField(row, FIELD_ALIASES.employmentEndDate)),
    employer_name: stringField(row, FIELD_ALIASES.employerName),
    employer_address: stringField(row, FIELD_ALIASES.employerAddress),
    employer_city: stringField(row, FIELD_ALIASES.employerCity),
    employer_state: stringField(row, FIELD_ALIASES.employerState),
    employer_postal_code: stringField(row, FIELD_ALIASES.employerPostalCode),
    employer_country: stringField(row, FIELD_ALIASES.employerCountry),
    employer_phone: stringField(row, FIELD_ALIASES.employerPhone),
    employer_fein: stringField(row, FIELD_ALIASES.employerFein),
    naics_code: stringField(row, FIELD_ALIASES.naicsCode),
    agent_attorney_name: stringField(row, FIELD_ALIASES.attorneyName),
    agent_attorney_firm: stringField(row, FIELD_ALIASES.attorneyFirm),
    job_title: stringField(row, FIELD_ALIASES.jobTitle),
    soc_code: stringField(row, FIELD_ALIASES.socCode),
    soc_title: stringField(row, FIELD_ALIASES.socTitle),
    wage_rate_of_pay_from: wageFrom,
    wage_rate_of_pay_to: wageTo,
    wage_unit_of_pay: wageUnit,
    wage_annual_min: annualizeWage(wageFrom, wageUnit),
    prevailing_wage: prevailingWage,
    pw_unit_of_pay: stringField(row, FIELD_ALIASES.prevailingWageUnit),
    pw_wage_level: stringField(row, FIELD_ALIASES.prevailingWageLevel),
    pw_source: stringField(row, FIELD_ALIASES.prevailingWageSource),
    worksite_address: stringField(row, FIELD_ALIASES.worksiteAddress),
    worksite_city: stringField(row, FIELD_ALIASES.worksiteCity),
    worksite_county: stringField(row, FIELD_ALIASES.worksiteCounty),
    worksite_state: stringField(row, FIELD_ALIASES.worksiteState),
    worksite_postal_code: stringField(row, FIELD_ALIASES.worksitePostalCode),
    full_time_position: stringField(row, FIELD_ALIASES.fullTime),
    total_worker_positions: numberField(row, FIELD_ALIASES.totalWorkers),
    new_employment: numberField(row, FIELD_ALIASES.newEmployment),
    continued_employment: numberField(row, FIELD_ALIASES.continuedEmployment),
    change_previous_employment: numberField(row, FIELD_ALIASES.changePreviousEmployment),
    new_concurrent_employment: numberField(row, FIELD_ALIASES.newConcurrentEmployment),
    change_employer: numberField(row, FIELD_ALIASES.changeEmployer),
    amended_petition: numberField(row, FIELD_ALIASES.amendedPetition),
    h1b_dependent: stringField(row, FIELD_ALIASES.h1bDependent),
    willful_violator: stringField(row, FIELD_ALIASES.willfulViolator),
    support_h1b: stringField(row, FIELD_ALIASES.supportH1b),
    source_file: sourceFile,
  };
}

function selectProgramLinks(links: string[], program: ForeignLaborProgram, fiscalYear: number, fiscalQuarter: ForeignLaborQuarter): string[] {
  const yearNeedle = `FY${fiscalYear}`.toUpperCase();
  const quarterNeedle = fiscalQuarter.toUpperCase();
  const patterns = [
    ...PROGRAM_FILE_PATTERNS[program],
    program,
    program.replace("-", ""),
    program === "CW" ? "CW-1" : program,
  ].map((pattern) => pattern.toUpperCase());
  const programLinks = links.filter((link) => {
    const upper = basename(link).toUpperCase();
    return upper.includes(yearNeedle) && patterns.some((pattern) => upper.includes(pattern));
  });

  const quarterLinks = programLinks.filter((link) => basename(link).toUpperCase().includes(quarterNeedle));
  if (quarterLinks.length > 0) {
    return quarterLinks;
  }

  return fiscalQuarter === "Q4" ? programLinks : [];
}

function isDisclosureLink(link: string, program: ForeignLaborProgram): boolean {
  const upper = basename(link).toUpperCase();
  if (!upper.endsWith(".XLSX")) return false;
  if (/(ADDENDUM|APPENDIX|WORKSITE)/i.test(upper)) return false;
  if (PROGRAM_FILE_PATTERNS[program].some((pattern) => upper.includes(pattern.toUpperCase()))) return true;
  const programNeedles = [program, program.replace("-", ""), program === "CW" ? "CW-1" : program].map((value) => value.toUpperCase());
  return programNeedles.some((needle) => upper.includes(needle));
}

function createMatcher(input: ForeignLaborSearchInput): (record: ForeignLaborRecord) => boolean {
  const employer = input.employerName?.trim().toUpperCase();
  const jobTitle = input.jobTitle?.trim().toUpperCase();
  const socCode = input.socCode?.trim().toUpperCase();
  const worksiteState = input.worksiteState?.trim().toUpperCase();
  const caseStatus = input.caseStatus?.trim().toUpperCase();

  return (record) => {
    if (employer && !record.employer_name?.toUpperCase().includes(employer)) return false;
    if (jobTitle && !record.job_title?.toUpperCase().includes(jobTitle)) return false;
    if (socCode && !record.soc_code?.toUpperCase().startsWith(socCode)) return false;
    if (worksiteState && record.worksite_state?.toUpperCase() !== worksiteState) return false;
    if (caseStatus && record.case_status?.toUpperCase() !== caseStatus) return false;
    if (input.minAnnualWage && (record.wage_annual_min === null || record.wage_annual_min < input.minAnnualWage)) return false;
    return true;
  };
}

async function readWorkbook(
  localFile: string,
  matcher: (row: RawRecord) => boolean,
  maxRows: number | null,
): Promise<{ headers: string[]; matched: number; scanned: number; truncated: boolean; rows: RawRecord[] }> {
  let headers: string[] = [];
  let matched = 0;
  let scanned = 0;
  const rows: RawRecord[] = [];

  await new Promise<void>((resolvePromise, reject) => {
    const workbookReader = new XlsxStreamReader({ verbose: false, formatting: false });
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
        if (!matcher(record)) return;
        matched += 1;
        if (maxRows === null || rows.length < maxRows) {
          rows.push(record);
        }
      });
      worksheetReader.process();
    });
    workbookReader.on("end", () => resolvePromise());
    createReadStream(localFile).on("error", reject).pipe(workbookReader);
  });

  return { headers, matched, scanned, truncated: maxRows !== null && matched > rows.length, rows };
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
    throw new Error(`DOL foreign-labor disclosure download failed (${response.status} ${response.statusText || "HTTP error"}) for ${url}`);
  }
  try {
    await pipeline(Readable.fromWeb(response.body as any), createWriteStream(tmp));
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

function extractLinks(html: string): string[] {
  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => absoluteDolUrl(match[1]))
    .filter((link) => /\.(xlsx|pdf)$/i.test(link));
  return [...new Set(links)];
}

function absoluteDolUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${DOL_ORIGIN}${value.startsWith("/") ? "" : "/"}${value}`;
}

function headersFromSparseRow(values: unknown[]): string[] {
  const headers: string[] = [];
  values.forEach((value, colNum) => {
    if (colNum > 0) headers[colNum - 1] = normalizeHeader(cellToPlain(value));
  });
  return headers;
}

function recordFromSparseRow(headers: string[], values: unknown[]): RawRecord {
  const record: RawRecord = {};
  headers.forEach((header, index) => {
    if (header) record[header] = cellToPlain(values[index + 1]);
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

function firstField(row: RawRecord, fields: readonly string[]): RawRecord[string] | undefined {
  for (const field of fields) {
    const value = row[field];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function stringField(row: RawRecord, fields: readonly string[]): string | null {
  const value = firstField(row, fields);
  if (value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function numberField(row: RawRecord, fields: readonly string[]): number | null {
  return toNumber(firstField(row, fields));
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function annualizeWage(value: unknown, unit: unknown): number | null {
  const wage = toNumber(value);
  if (wage === null) return null;
  const normalizedUnit = String(unit ?? "Year").toUpperCase();
  if (normalizedUnit.includes("HOUR")) return wage * 2080;
  if (normalizedUnit.includes("WEEK") && !normalizedUnit.includes("BI")) return wage * 52;
  if (normalizedUnit.includes("BI")) return wage * 26;
  if (normalizedUnit.includes("MONTH")) return wage * 12;
  return wage;
}

function dateOnly(value: unknown): string | null {
  const text = value === undefined || value === null ? null : String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  return text;
}

function normalizeFiscalYear(fiscalYear: number): number {
  const value = Math.trunc(fiscalYear);
  if (value < 2020 || value > 2030) {
    throw new Error("fiscalYear must be between 2020 and 2030 for unified foreign-labor disclosure parsing.");
  }
  return value;
}

function normalizeQuarter(value: ForeignLaborQuarter | string): ForeignLaborQuarter {
  const quarter = value.toString().trim().toUpperCase();
  if (["Q1", "1"].includes(quarter)) return "Q1";
  if (["Q2", "2"].includes(quarter)) return "Q2";
  if (["Q3", "3"].includes(quarter)) return "Q3";
  if (["Q4", "4"].includes(quarter)) return "Q4";
  throw new Error("fiscalQuarter must be Q1, Q2, Q3, or Q4.");
}

function normalizeMaxItems(maxItems?: number): number | null {
  if (maxItems === 0) return null;
  if (!Number.isFinite(maxItems)) return 100;
  return Math.max(1, Math.trunc(maxItems ?? 100));
}

function currentFederalFiscalYear(date = new Date()): number {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 9 ? year + 1 : year;
}

function latestLikelyQuarter(fiscalYear: number, date = new Date()): ForeignLaborQuarter {
  const currentFy = currentFederalFiscalYear(date);
  if (fiscalYear < currentFy) return "Q4";
  if (fiscalYear > currentFy) return "Q1";
  const month = date.getUTCMonth();
  if (month >= 9) return "Q1";
  if (month >= 6) return "Q2";
  return "Q1";
}
