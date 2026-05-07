import { EnforcementQueryInput, FilterCondition } from "./dolApi.js";

export interface OshaInspectionSearchInput {
  companyName?: string;
  state?: string;
  city?: string;
  naicsCode?: string;
  inspectionType?: string;
  safetyHealth?: string;
  dateFrom?: string;
  dateTo?: string;
  includeViolations?: boolean;
  maxResults?: number;
  offset?: number;
}

export interface OshaInspectionDetailInput {
  activityNumber: string | number;
  includeViolations?: boolean;
}

export interface OshaFieldsInput {
  dataset?: "inspection" | "violation";
  search?: string;
  limit?: number;
}

export interface OshaInspectionSearchResult {
  dataset: "OSHA/inspection";
  count: number;
  scanned: number;
  violationRequestCount: number;
  inspections: OshaInspectionRecord[];
}

export interface OshaInspectionRecord {
  activityNumber: number | string | null;
  establishmentName: string | null;
  siteAddress: string | null;
  siteCity: string | null;
  siteState: string | null;
  siteZip: string | null;
  safetyOrHealth: string | null;
  naicsCode: string | null;
  sicCode: string | null;
  inspectionType: string | null;
  inspectionTypeDescription: string | null;
  inspectionScope: string | null;
  inspectionScopeDescription: string | null;
  unionStatus: string | null;
  employeesAtSite: number | null;
  openDate: string | null;
  closeConferenceDate: string | null;
  closeCaseDate: string | null;
  violations: OshaViolationRecord[] | null;
  violationCount: number;
  totalPenalties: number;
}

export interface OshaViolationRecord {
  citationId: string | null;
  standard: string | null;
  violationType: string | null;
  violationTypeDescription: string | null;
  issuanceDate: string | null;
  abateDate: string | null;
  abateComplete: string | null;
  currentPenalty: number;
  initialPenalty: number;
  contested: boolean;
  finalOrderDate: string | null;
  instances: number | null;
  workersExposed: number | null;
  gravity: number | null;
}

interface OshaDolClient {
  getDatasetRecords(agency: string, endpoint: string, query?: EnforcementQueryInput): Promise<Record<string, unknown>[]>;
  getDatasetMetadata(agency: string, endpoint: string): Promise<Record<string, unknown>[]>;
  buildDatasetUrl(agency: string, endpoint: string, query?: EnforcementQueryInput): URL;
  sanitizeUrl(input: URL | string): string;
}

const OSHA_AGENCY = "OSHA";
const INSPECTION_ENDPOINT = "inspection";
const VIOLATION_ENDPOINT = "violation";
const PAGE_SIZE = 1000;
const VIOLATION_BATCH_SIZE = 50;

const INSPECTION_TYPE_DESCRIPTIONS: Record<string, string> = {
  A: "Accident/Fatality/Catastrophe",
  B: "Complaint",
  C: "Referral",
  D: "Monitoring",
  E: "Variance",
  F: "Follow-up",
  G: "Unprogrammed Related",
  H: "Planned",
  I: "Unprogrammed",
  J: "Unprogrammed Other",
  K: "Programmed Other",
  L: "Other",
};

const INSPECTION_SCOPE_DESCRIPTIONS: Record<string, string> = {
  A: "Comprehensive",
  B: "Partial",
  C: "Records Only",
  D: "No Inspection",
};

const VIOLATION_TYPE_DESCRIPTIONS: Record<string, string> = {
  S: "Serious",
  W: "Willful",
  R: "Repeat",
  O: "Other-than-Serious",
  U: "Unclassified",
  F: "Failure to Abate",
};

export class OshaInspectionClient {
  constructor(private readonly client: OshaDolClient) {}

  async search(input: OshaInspectionSearchInput = {}): Promise<OshaInspectionSearchResult> {
    const maxResults = normalizeMaxResults(input.maxResults);
    let offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const rows: Record<string, unknown>[] = [];
    const filterObject = createOshaInspectionFilter(input);

    while (rows.length < maxResults) {
      const limit = Math.min(PAGE_SIZE, maxResults - rows.length);
      const page = await this.client.getDatasetRecords(OSHA_AGENCY, INSPECTION_ENDPOINT, {
        limit,
        offset,
        sort: "desc",
        sortBy: "open_date",
        filterObject,
      });
      rows.push(...page.slice(0, maxResults - rows.length));
      if (page.length < limit) {
        break;
      }
      offset += limit;
    }

    const violationMap =
      input.includeViolations === false ? new Map<string, OshaViolationRecord[]>() : await this.getViolationsForInspections(rows);
    const inspections = rows.map((row) => normalizeInspection(row, input.includeViolations !== false, violationMap));

    return {
      dataset: "OSHA/inspection",
      count: inspections.length,
      scanned: rows.length,
      violationRequestCount: input.includeViolations === false ? 0 : Math.ceil(uniqueActivityNumbers(rows).length / VIOLATION_BATCH_SIZE),
      inspections,
    };
  }

  async detail(input: OshaInspectionDetailInput): Promise<OshaInspectionSearchResult> {
    const rows = await this.client.getDatasetRecords(OSHA_AGENCY, INSPECTION_ENDPOINT, {
      limit: 1,
      filterObject: activityFilter(input.activityNumber),
    });
    const violationMap =
      input.includeViolations === false ? new Map<string, OshaViolationRecord[]>() : await this.getViolationsForInspections(rows);
    const inspections = rows.map((row) => normalizeInspection(row, input.includeViolations !== false, violationMap));

    return {
      dataset: "OSHA/inspection",
      count: inspections.length,
      scanned: rows.length,
      violationRequestCount: input.includeViolations === false ? 0 : Math.ceil(uniqueActivityNumbers(rows).length / VIOLATION_BATCH_SIZE),
      inspections,
    };
  }

  async fields(input: OshaFieldsInput = {}): Promise<{ dataset: string; count: number; fields: Record<string, unknown>[] }> {
    const endpoint = input.dataset ?? "inspection";
    const search = input.search?.trim().toLowerCase();
    const limit = Math.min(500, Math.max(1, Math.trunc(input.limit ?? 100)));
    const fields = (await this.client.getDatasetMetadata(OSHA_AGENCY, endpoint))
      .filter((field) => (search ? JSON.stringify(field).toLowerCase().includes(search) : true))
      .slice(0, limit);

    return {
      dataset: `OSHA/${endpoint}`,
      count: fields.length,
      fields,
    };
  }

  private async getViolationsForInspections(rows: Record<string, unknown>[]): Promise<Map<string, OshaViolationRecord[]>> {
    const ids = uniqueActivityNumbers(rows);
    const map = new Map<string, OshaViolationRecord[]>();

    for (const batch of chunk(ids, VIOLATION_BATCH_SIZE)) {
      const filterObject = { field: "activity_nr", operator: "in", value: batch };
      const violations = await this.client.getDatasetRecords(OSHA_AGENCY, VIOLATION_ENDPOINT, {
        limit: 10000,
        filterObject,
      });
      for (const row of violations) {
        if (stringValue(row.delete_flag)?.toUpperCase() === "X") {
          continue;
        }
        const activityNumber = stringValue(row.activity_nr);
        if (!activityNumber) {
          continue;
        }
        const normalized = normalizeViolation(row);
        const existing = map.get(activityNumber) ?? [];
        existing.push(normalized);
        map.set(activityNumber, existing);
      }
    }

    return map;
  }
}

export function createOshaInspectionFilter(input: OshaInspectionSearchInput): unknown {
  const conditions: FilterCondition[] = [];
  const companyName = input.companyName?.trim();
  const state = input.state?.trim().toUpperCase();
  const city = input.city?.trim();
  const naicsCode = input.naicsCode?.trim();
  const inspectionType = input.inspectionType?.trim().toUpperCase();
  const safetyHealth = input.safetyHealth?.trim().toUpperCase();

  if (companyName) {
    conditions.push({ field: "estab_name", operator: "like", value: `%${companyName.toUpperCase()}%` });
  }
  if (state) {
    conditions.push({ field: "site_state", operator: "eq", value: state });
  }
  if (city) {
    conditions.push({ field: "site_city", operator: "like", value: `%${city.toUpperCase()}%` });
  }
  if (naicsCode) {
    conditions.push({ field: "naics_code", operator: "like", value: `${naicsCode}%` });
  }
  if (inspectionType) {
    conditions.push({ field: "insp_type", operator: "eq", value: inspectionType });
  }
  if (safetyHealth) {
    conditions.push({ field: "safety_hlth", operator: "eq", value: safetyHealth });
  }
  if (input.dateFrom) {
    conditions.push({ field: "open_date", operator: "gt", value: input.dateFrom });
  }
  if (input.dateTo) {
    conditions.push({ field: "open_date", operator: "lt", value: input.dateTo });
  }

  if (conditions.length === 0) {
    return undefined;
  }
  return conditions.length === 1 ? conditions[0] : { and: conditions };
}

function normalizeInspection(
  row: Record<string, unknown>,
  includeViolations: boolean,
  violationMap: Map<string, OshaViolationRecord[]>,
): OshaInspectionRecord {
  const activityNumber = stringValue(row.activity_nr);
  const violations = includeViolations && activityNumber ? (violationMap.get(activityNumber) ?? []) : null;
  const violationRows = violations ?? [];

  return {
    activityNumber: numericOrString(row.activity_nr),
    establishmentName: stringValue(row.estab_name),
    siteAddress: stringValue(row.site_address),
    siteCity: stringValue(row.site_city),
    siteState: stringValue(row.site_state),
    siteZip: stringValue(row.site_zip),
    safetyOrHealth: describeSafetyHealth(row.safety_hlth),
    naicsCode: stringValue(row.naics_code),
    sicCode: stringValue(row.sic_code),
    inspectionType: stringValue(row.insp_type),
    inspectionTypeDescription: describeCode(row.insp_type, INSPECTION_TYPE_DESCRIPTIONS),
    inspectionScope: stringValue(row.insp_scope),
    inspectionScopeDescription: describeCode(row.insp_scope, INSPECTION_SCOPE_DESCRIPTIONS),
    unionStatus: stringValue(row.union_status),
    employeesAtSite: numberValue(row.nr_in_estab),
    openDate: dateValue(row.open_date),
    closeConferenceDate: dateValue(row.close_conf_date),
    closeCaseDate: dateValue(row.close_case_date),
    violations,
    violationCount: violationRows.length,
    totalPenalties: round(violationRows.reduce((sum, violation) => sum + violation.currentPenalty, 0), 2),
  };
}

function normalizeViolation(row: Record<string, unknown>): OshaViolationRecord {
  return {
    citationId: stringValue(row.citation_id),
    standard: stringValue(row.standard),
    violationType: stringValue(row.viol_type),
    violationTypeDescription: describeCode(row.viol_type, VIOLATION_TYPE_DESCRIPTIONS),
    issuanceDate: dateValue(row.issuance_date),
    abateDate: dateValue(row.abate_date),
    abateComplete: stringValue(row.abate_complete),
    currentPenalty: numberValue(row.current_penalty) ?? 0,
    initialPenalty: numberValue(row.initial_penalty) ?? 0,
    contested: Boolean(dateValue(row.contest_date)),
    finalOrderDate: dateValue(row.final_order_date),
    instances: numberValue(row.nr_instances),
    workersExposed: numberValue(row.nr_exposed),
    gravity: numberValue(row.gravity),
  };
}

function activityFilter(activityNumber: string | number): FilterCondition {
  return {
    field: "activity_nr",
    operator: "in",
    value: [numericOrString(activityNumber) ?? String(activityNumber)],
  };
}

function uniqueActivityNumbers(rows: Record<string, unknown>[]): Array<string | number> {
  return [...new Set(rows.map((row) => numericOrString(row.activity_nr)).filter((value) => value !== null))];
}

function describeSafetyHealth(value: unknown): string | null {
  const code = stringValue(value)?.toUpperCase();
  if (code === "S") return "Safety";
  if (code === "H") return "Health";
  return code ?? null;
}

function describeCode(value: unknown, descriptions: Record<string, string>): string | null {
  const code = stringValue(value)?.toUpperCase();
  if (!code) return null;
  return descriptions[code] ?? code;
}

function dateValue(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }
  return text;
}

function numericOrString(value: unknown): number | string | null {
  const number = numberValue(value);
  if (number !== null) return number;
  return stringValue(value);
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeMaxResults(maxResults?: number): number {
  if (!Number.isFinite(maxResults)) {
    return 100;
  }
  return Math.min(5000, Math.max(1, Math.trunc(maxResults ?? 100)));
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
