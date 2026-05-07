import type { EnforcementQueryInput } from "./dolApi.js";
import type { ForeignLaborSearchInput } from "./foreignLabor.js";
import type { OshaInspectionSearchInput } from "./osha.js";
import type { SamOpportunitySearchInput } from "./sam.js";

export type GovernmentDataRoute = "whd_enforcement" | "osha_inspections" | "foreign_labor" | "sam_opportunities" | "unknown";

export interface GovernmentDataQuestionInput {
  question: string;
  maxResults?: number;
  dryRun?: boolean;
}

export interface GovernmentDataRoutePlan {
  route: GovernmentDataRoute;
  confidence: number;
  reason: string;
  parameters: Record<string, unknown>;
}

export interface GovernmentDataQuestionResult extends GovernmentDataRoutePlan {
  result: unknown;
}

export interface GovernmentDataRouterHandlers {
  queryEnforcement(input: EnforcementQueryInput): Promise<unknown>;
  searchOshaInspections(input: OshaInspectionSearchInput): Promise<unknown>;
  searchForeignLabor(input: ForeignLaborSearchInput): Promise<unknown>;
  searchSamOpportunities(input: SamOpportunitySearchInput): Promise<unknown>;
}

const DEFAULT_MAX_RESULTS = 10;

const WHD_SUMMARY_FIELDS = [
  "case_id",
  "trade_nm",
  "legal_name",
  "st_cd",
  "city_nm",
  "naics_code",
  "bw_atp_amt",
  "ee_violtd_cnt",
  "cmp_assd_amt",
  "findings_start_date",
  "findings_end_date",
  "flsa_repeat_violator",
];

const STATE_CODES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "PR",
  "VI",
  "GU",
  "MP",
  "AS",
]);

const STATE_NAMES: Record<string, string> = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
};

export function planGovernmentDataQuestion(input: GovernmentDataQuestionInput): GovernmentDataRoutePlan {
  const question = normalizeQuestion(input.question);
  const maxResults = normalizeMaxResults(input.maxResults);
  const state = extractState(input.question);
  const employerName = extractEmployerName(input.question);
  const naicsCodes = extractNaicsCodes(input.question);
  const socCode = extractSocCode(input.question);

  if (isSamQuestion(question)) {
    return {
      route: "sam_opportunities",
      confidence: 0.88,
      reason: "Matched SAM.gov procurement, solicitation, award, or contract opportunity terms.",
      parameters: compactObject({
        keywords: extractSamKeywords(input.question),
        naicsCodes: naicsCodes.length ? naicsCodes : undefined,
        procurementTypes: extractProcurementTypes(question),
        setAsideType: extractSetAsideType(question),
        state,
        postedDaysAgo: extractPostedDaysAgo(question),
        maxResults,
        dryRun: input.dryRun,
      }),
    };
  }

  if (isOshaQuestion(question)) {
    return {
      route: "osha_inspections",
      confidence: 0.9,
      reason: "Matched OSHA inspection, citation, workplace safety, or violation terms.",
      parameters: compactObject({
        companyName: employerName,
        state,
        naicsCode: naicsCodes[0],
        inspectionType: extractInspectionType(question),
        includeViolations: true,
        maxResults,
      }),
    };
  }

  if (isForeignLaborQuestion(question)) {
    return {
      route: "foreign_labor",
      confidence: 0.86,
      reason: "Matched foreign-labor visa, LCA, PERM, H-2A, H-2B, H-1B, CW-1, or SOC terms.",
      parameters: compactObject({
        visaProgram: extractVisaProgram(question),
        employerName,
        jobTitle: extractJobTitle(input.question),
        socCode,
        worksiteState: state,
        caseStatus: extractCaseStatus(question),
        minAnnualWage: extractMinimumAnnualWage(question),
        maxItems: maxResults,
      }),
    };
  }

  if (isWhdQuestion(question)) {
    return whdPlan(employerName, state, maxResults);
  }

  return {
    route: "unknown",
    confidence: 0.2,
    reason: "No strong database-specific terms were found. Add WHD, OSHA, H-1B/LCA/PERM/H-2A, or SAM.gov contract terms.",
    parameters: {},
  };
}

export async function answerGovernmentDataQuestion(
  input: GovernmentDataQuestionInput,
  handlers: GovernmentDataRouterHandlers,
): Promise<GovernmentDataQuestionResult> {
  const plan = planGovernmentDataQuestion(input);

  switch (plan.route) {
    case "whd_enforcement":
      return { ...plan, result: await handlers.queryEnforcement(plan.parameters as EnforcementQueryInput) };
    case "osha_inspections":
      return { ...plan, result: await handlers.searchOshaInspections(plan.parameters as OshaInspectionSearchInput) };
    case "foreign_labor":
      return { ...plan, result: await handlers.searchForeignLabor(plan.parameters as ForeignLaborSearchInput) };
    case "sam_opportunities":
      return { ...plan, result: await handlers.searchSamOpportunities(plan.parameters as SamOpportunitySearchInput) };
    case "unknown":
      return {
        ...plan,
        result: {
          message: "Question was not routed to a database.",
          availableRoutes: ["whd_enforcement", "osha_inspections", "foreign_labor", "sam_opportunities"],
        },
      };
  }
}

function whdPlan(employerName: string | undefined, state: string | undefined, maxResults: number): GovernmentDataRoutePlan {
  return {
    route: "whd_enforcement",
    confidence: 0.84,
    reason: "Matched WHD, WHISARD, wage-and-hour, back-wage, FLSA, child-labor, minimum-wage, or overtime terms.",
    parameters: {
      limit: maxResults,
      fields: WHD_SUMMARY_FIELDS,
      sort: "desc",
      sortBy: "bw_atp_amt",
      filterObject: buildWhdFilter(employerName, state),
    },
  };
}

function buildWhdFilter(employerName?: string, state?: string): unknown {
  const conditions: unknown[] = [];
  const employer = employerName?.trim().toUpperCase();
  if (employer) {
    conditions.push({
      or: [
        { field: "trade_nm", operator: "like", value: `%${employer}%` },
        { field: "legal_name", operator: "like", value: `%${employer}%` },
      ],
    });
  }
  if (state) {
    conditions.push({ field: "st_cd", operator: "eq", value: state });
  }
  if (conditions.length === 0) {
    return undefined;
  }
  return conditions.length === 1 ? conditions[0] : { and: conditions };
}

function isWhdQuestion(question: string): boolean {
  return /\b(whd|whisard|wage and hour|back wages?|flsa|child labor|minimum wage|overtime|wage theft)\b/.test(question);
}

function isOshaQuestion(question: string): boolean {
  return /\b(osha|inspection|inspections|citation|citations|workplace safety|safety inspection|fatality|catastrophe)\b/.test(question);
}

function isForeignLaborQuestion(question: string): boolean {
  return /\b(h-?1b|h-?1b1|h-?2a|h-?2b|perm|lca|e-?3|cw-?1|foreign labor|visa|soc)\b/.test(question);
}

function isSamQuestion(question: string): boolean {
  return /\b(sam\.?gov|contracts?|contracting|solicitations?|rfps?|rfqs?|sources sought|award notices?|set[- ]aside|procurement|opportunities)\b/.test(
    question,
  );
}

function extractState(question: string): string | undefined {
  for (const match of question.matchAll(/\b[A-Z]{2}\b/g)) {
    if (STATE_CODES.has(match[0])) {
      return match[0];
    }
  }

  const upper = question.toUpperCase();
  const names = Object.keys(STATE_NAMES).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`).test(upper)) {
      return STATE_NAMES[name];
    }
  }

  return undefined;
}

function extractEmployerName(question: string): string | undefined {
  const quoted = question.match(/["']([^"']{2,80})["']/);
  if (quoted) {
    return cleanEntity(quoted[1]);
  }

  const match = question.match(
    /\b(?:for|at|by|employer|company)\s+([A-Za-z0-9][A-Za-z0-9&.,' -]{1,70}?)(?=\s+\b(?:in|with|where|that|over|under|above|below|from|between|naics|soc|and|or)\b|$)/i,
  );
  return match ? cleanEntity(match[1]) : undefined;
}

function extractJobTitle(question: string): string | undefined {
  const match = question.match(/\b(?:job title|title|role)\s+["']?([A-Za-z][A-Za-z0-9 /+.#-]{1,60})["']?/i);
  return match ? cleanEntity(match[1]) : undefined;
}

function extractNaicsCodes(question: string): string[] {
  const codes = [...question.matchAll(/\bNAICS\s*[:#]?\s*(\d{2,6})\b/gi)].map((match) => match[1]);
  return [...new Set(codes)];
}

function extractSocCode(question: string): string | undefined {
  return question.match(/\bSOC\s*[:#]?\s*(\d{2}-\d{4}(?:\.\d{2})?)\b/i)?.[1];
}

function extractVisaProgram(question: string): string | undefined {
  if (/\bh-?2a\b/.test(question)) return "H-2A";
  if (/\bh-?2b\b/.test(question)) return "H-2B";
  if (/\bperm\b/.test(question)) return "PERM";
  if (/\bcw-?1?\b/.test(question)) return "CW";
  if (/\b(h-?1b|h-?1b1|lca|e-?3)\b/.test(question)) return "LCA";
  return undefined;
}

function extractCaseStatus(question: string): string | undefined {
  if (/\bcertified\b/.test(question)) return "Certified";
  if (/\bdenied\b/.test(question)) return "Denied";
  if (/\bwithdrawn\b/.test(question)) return "Withdrawn";
  return undefined;
}

function extractMinimumAnnualWage(question: string): number | undefined {
  const match = question.match(
    /\b(?:over|above|at least|min(?:imum)?(?: wage| salary)?|more than)\s+\$?\s*([0-9][0-9,]*(?:\.\d+)?)\s*(hourly|per hour|\/hour|an hour|annual|annually|per year|yearly|year)?/i,
  );
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return undefined;
  const unit = match[2]?.toLowerCase() ?? "";
  if (/(hour|\/hour)/.test(unit)) {
    return Math.round(value * 2080);
  }
  return Math.round(value);
}

function extractProcurementTypes(question: string): string[] | undefined {
  const types: string[] = [];
  if (/\bsources sought\b/.test(question)) types.push("r");
  if (/\bpre[- ]?solicitation\b/.test(question)) types.push("p");
  if (/\baward notices?\b/.test(question)) types.push("a");
  if (/\bcombined synopsis\b/.test(question)) types.push("k");
  return types.length ? [...new Set(types)] : undefined;
}

function extractSetAsideType(question: string): string | undefined {
  if (/\bhubzone\b/.test(question)) return "HZC";
  if (/\b8\s*\(?a\)?\b/.test(question)) return "8A";
  if (/\bsdvosb\b|service-disabled veteran/.test(question)) return "SDVOSBC";
  if (/\bedwosb\b|economically disadvantaged women/.test(question)) return "EDWOSB";
  if (/\bwosb\b|women-owned/.test(question)) return "WOSB";
  if (/\bsmall business\b|\bsba\b/.test(question)) return "SBA";
  return undefined;
}

function extractPostedDaysAgo(question: string): number | undefined {
  const match = question.match(/\b(?:last|past|within)\s+(\d{1,3})\s+days?\b/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.min(365, Math.max(1, Math.trunc(value))) : undefined;
}

function extractInspectionType(question: string): string | undefined {
  if (/\b(fatality|catastrophe|fatalities)\b/.test(question)) return "A";
  if (/\bcomplaints?\b/.test(question)) return "B";
  if (/\breferrals?\b/.test(question)) return "C";
  if (/\bfollow[- ]?up\b/.test(question)) return "F";
  if (/\bplanned\b/.test(question)) return "H";
  return undefined;
}

function extractSamKeywords(question: string): string | undefined {
  const match = question.match(
    /\b(?:find|show|search|list|get)?\s*([A-Za-z][A-Za-z -]{1,80}?)\s+(?:solicitations?|contracts?|rfps?|rfqs?|opportunities|sources sought|award notices?)\b/i,
  );
  if (!match) return undefined;
  const cleaned = cleanEntity(match[1].replace(/\b(?:sam gov|sam\.gov|federal|government)\b/gi, ""));
  return cleaned || undefined;
}

function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeMaxResults(maxResults?: number): number {
  if (!Number.isFinite(maxResults)) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.max(1, Math.trunc(maxResults ?? DEFAULT_MAX_RESULTS));
}

function cleanEntity(value: string): string | undefined {
  const cleaned = value
    .trim()
    .replace(/[?.,;:]+$/g, "")
    .replace(/\s+/g, " ");
  return cleaned || undefined;
}

function compactObject<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
