export type OshaJurisdictionTier =
  | "complete_state_plan"
  | "public_only_state_plan"
  | "federal_osha";

export interface OshaJurisdictionRecord {
  stateCode: string;
  stateName: string;
  tier: OshaJurisdictionTier;
  programName: string | null;
  programFullName: string | null;
  agency: string | null;
  expectedReportingLagDays: number;
  programWebsite: string | null;
  recordsRequest: string | null;
  notes: string;
}

export interface OshaJurisdictionLookupInput {
  stateCode: string;
}

export interface OshaJurisdictionLookupResult {
  source: "DOL_MCP OSHA Jurisdiction Reference";
  query: { stateCode: string };
  jurisdiction: OshaJurisdictionRecord;
  caveat: string;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming",
  AS: "American Samoa", GU: "Guam", MP: "Northern Mariana Islands",
  PR: "Puerto Rico", VI: "US Virgin Islands",
};

const COMPLETE_STATE_PLANS: Record<string, Pick<OshaJurisdictionRecord, "programName" | "programFullName" | "agency" | "programWebsite" | "recordsRequest">> = {
  AK: { programName: "AKOSH", programFullName: "Alaska Occupational Safety and Health", agency: "Alaska Department of Labor and Workforce Development", programWebsite: "https://labor.alaska.gov/lss/oshhome.htm", recordsRequest: null },
  AZ: { programName: "ADOSH", programFullName: "Arizona Division of Occupational Safety and Health", agency: "Industrial Commission of Arizona", programWebsite: "https://www.azica.gov/divisions/adosh", recordsRequest: null },
  CA: { programName: "Cal/OSHA", programFullName: "California Division of Occupational Safety and Health", agency: "California Department of Industrial Relations", programWebsite: "https://www.dir.ca.gov/dosh/", recordsRequest: null },
  HI: { programName: "HIOSH", programFullName: "Hawaii Occupational Safety and Health Division", agency: "Hawaii Department of Labor and Industrial Relations", programWebsite: "https://labor.hawaii.gov/hiosh/", recordsRequest: null },
  IN: { programName: "IOSHA", programFullName: "Indiana Occupational Safety and Health Administration", agency: "Indiana Department of Labor", programWebsite: "https://www.in.gov/dol/iosha/", recordsRequest: "Online form at https://www.in.gov/dol/iosha/iosha-faqs/ or fax 317-233-3790" },
  IA: { programName: "Iowa OSHA", programFullName: "Iowa Occupational Safety and Health Administration", agency: "Iowa Department of Inspections, Appeals, & Licensing (DIAL)", programWebsite: "https://dial.iowa.gov/iosha", recordsRequest: "iowaopenrecords.nextrequest.com or RecordsRequest@IWD.Iowa.gov" },
  KY: { programName: "KY OSH", programFullName: "Kentucky Occupational Safety and Health Program", agency: "Kentucky Labor Cabinet", programWebsite: "https://kentucky.gov/services/Pages/service.aspx?id=132", recordsRequest: null },
  MD: { programName: "MOSH", programFullName: "Maryland Occupational Safety and Health", agency: "Maryland Division of Labor and Industry", programWebsite: "https://www.dllr.state.md.us/labor/mosh/", recordsRequest: null },
  MI: { programName: "MIOSHA", programFullName: "Michigan Occupational Safety and Health Administration", agency: "Michigan Department of Licensing and Regulatory Affairs (LARA)", programWebsite: "https://www.michigan.gov/leo/bureaus-agencies/miosha", recordsRequest: "LARA records request portal" },
  MN: { programName: "MNOSHA", programFullName: "Minnesota Occupational Safety and Health Administration", agency: "Minnesota Department of Labor and Industry", programWebsite: "https://www.dli.mn.gov/business/workplace-safety-and-health", recordsRequest: "DLI 651-284-5050" },
  NV: { programName: "NV OSHA", programFullName: "Nevada Occupational Safety and Health Administration", agency: "Nevada Division of Industrial Relations", programWebsite: "https://dir.nv.gov/OSHA/Home/", recordsRequest: null },
  NM: { programName: "NM OHSB", programFullName: "New Mexico Occupational Health and Safety Bureau", agency: "New Mexico Environment Department", programWebsite: "https://www.env.nm.gov/ohsb/", recordsRequest: null },
  NC: { programName: "NC OSH", programFullName: "North Carolina Occupational Safety and Health", agency: "North Carolina Department of Labor", programWebsite: "https://www.labor.nc.gov/safety-and-health", recordsRequest: null },
  OR: { programName: "Oregon OSHA", programFullName: "Oregon Occupational Safety and Health Division", agency: "Oregon Department of Consumer and Business Services", programWebsite: "https://osha.oregon.gov/", recordsRequest: null },
  PR: { programName: "PR OSHO", programFullName: "Puerto Rico Occupational Safety and Health Office", agency: "Puerto Rico Department of Labor and Human Resources", programWebsite: null, recordsRequest: null },
  SC: { programName: "SC OSH", programFullName: "South Carolina Occupational Safety and Health", agency: "South Carolina Department of Labor, Licensing and Regulation", programWebsite: "https://llr.sc.gov/osh/", recordsRequest: null },
  TN: { programName: "TOSHA", programFullName: "Tennessee Occupational Safety and Health Administration", agency: "Tennessee Department of Labor and Workforce Development", programWebsite: "https://www.tn.gov/workforce/employees/safety-health.html", recordsRequest: null },
  UT: { programName: "UOSH", programFullName: "Utah Occupational Safety and Health", agency: "Utah Labor Commission", programWebsite: "https://laborcommission.utah.gov/divisions/uosh/", recordsRequest: null },
  VT: { programName: "VOSHA", programFullName: "Vermont Occupational Safety and Health Administration", agency: "Vermont Department of Labor", programWebsite: "https://labor.vermont.gov/wage-and-hour/vosha", recordsRequest: null },
  VA: { programName: "VOSH", programFullName: "Virginia Occupational Safety and Health", agency: "Virginia Department of Labor and Industry", programWebsite: "https://www.doli.virginia.gov/vosh-programs/", recordsRequest: null },
  WA: { programName: "DOSH", programFullName: "Washington Division of Occupational Safety and Health", agency: "Washington State Department of Labor and Industries", programWebsite: "https://www.lni.wa.gov/safety-health/", recordsRequest: null },
  WY: { programName: "WY OSHA", programFullName: "Wyoming Occupational Safety and Health", agency: "Wyoming Department of Workforce Services", programWebsite: "https://wyomingworkforce.org/businesses/osha/", recordsRequest: null },
};

const PUBLIC_ONLY_STATE_PLANS: Record<string, Pick<OshaJurisdictionRecord, "programName" | "programFullName" | "agency" | "programWebsite" | "recordsRequest">> = {
  CT: { programName: "CONN-OSHA", programFullName: "Connecticut Occupational Safety and Health Division", agency: "Connecticut Department of Labor", programWebsite: "https://www.ctdol.state.ct.us/osha/", recordsRequest: null },
  IL: { programName: "IL OSHA", programFullName: "Illinois Occupational Safety and Health (public sector)", agency: "Illinois Department of Labor", programWebsite: "https://labor.illinois.gov/laws-rules/safety.html", recordsRequest: "FOIA via labor.illinois.gov" },
  ME: { programName: "Maine OSH", programFullName: "Maine Occupational Safety and Health (public sector)", agency: "Maine Department of Labor", programWebsite: "https://www.maine.gov/labor/bls/safetyandhealth/", recordsRequest: null },
  MA: { programName: "MA OSHA", programFullName: "Massachusetts Workplace Safety and Health (public sector)", agency: "Massachusetts Department of Labor Standards", programWebsite: "https://www.mass.gov/orgs/department-of-labor-standards", recordsRequest: null },
  NJ: { programName: "NJ PEOSH", programFullName: "New Jersey Public Employees Occupational Safety and Health", agency: "New Jersey Department of Labor and Workforce Development", programWebsite: "https://www.nj.gov/labor/lsse/employer/Public_Employees_OSH.html", recordsRequest: null },
  NY: { programName: "NY PESH", programFullName: "New York Public Employee Safety and Health", agency: "New York State Department of Labor", programWebsite: "https://dol.ny.gov/public-employee-safety-and-health-pesh", recordsRequest: null },
  VI: { programName: "VIDOL OSH", programFullName: "US Virgin Islands Occupational Safety and Health", agency: "USVI Department of Labor", programWebsite: null, recordsRequest: null },
};

const FEDERAL_OSHA_FALLBACK = {
  programName: "Federal OSHA",
  programFullName: "US Occupational Safety and Health Administration",
  agency: "US Department of Labor",
  programWebsite: "https://www.osha.gov/",
  recordsRequest: "https://www.osha.gov/foia",
};

const STATE_PLAN_LAG_DAYS = 90;
const FEDERAL_LAG_DAYS = 0;

export function getOshaJurisdiction(input: OshaJurisdictionLookupInput): OshaJurisdictionLookupResult {
  const stateCode = input.stateCode?.trim().toUpperCase();
  if (!stateCode || !STATE_NAMES[stateCode]) {
    throw new Error(`Unknown state code "${input.stateCode}". Pass a USPS two-letter code (e.g., MI, OH, CA).`);
  }

  const stateName = STATE_NAMES[stateCode];
  const completePlan = COMPLETE_STATE_PLANS[stateCode];
  if (completePlan) {
    return {
      source: "DOL_MCP OSHA Jurisdiction Reference",
      query: { stateCode },
      jurisdiction: {
        stateCode,
        stateName,
        tier: "complete_state_plan",
        ...completePlan,
        expectedReportingLagDays: STATE_PLAN_LAG_DAYS,
        notes: `${stateCode} runs a complete state plan. ${completePlan.programName} covers private + state/local public sector workplaces. Federal OSHA only handles federal-jurisdiction-only workers (maritime, military, USPS) here. State-plan inspections are submitted to the federal OIS on a 1-3 month cadence; recent activity may be missing from osha_inspection_search results. For fresher data, request directly from ${completePlan.programName}.`,
      },
      caveat: `osha_inspection_search returns ${completePlan.programName} data through the federal OIS with a typical 1-3 month reporting lag. Recent inspections (last 90 days) may not yet appear.`,
    };
  }

  const publicPlan = PUBLIC_ONLY_STATE_PLANS[stateCode];
  if (publicPlan) {
    return {
      source: "DOL_MCP OSHA Jurisdiction Reference",
      query: { stateCode },
      jurisdiction: {
        stateCode,
        stateName,
        tier: "public_only_state_plan",
        ...publicPlan,
        expectedReportingLagDays: STATE_PLAN_LAG_DAYS,
        notes: `${stateCode} runs a public-sector-only state plan. ${publicPlan.programName} covers state and local government workers; federal OSHA covers private sector. For private-sector restaurants, manufacturing, etc., osha_inspection_search returns federal OSHA data (current). For state/local government workplaces, the data is ${publicPlan.programName} with the usual 1-3 month state-plan reporting lag.`,
      },
      caveat: `Private sector ${stateCode} inspections are federal OSHA (current). Public sector inspections come via ${publicPlan.programName} with 1-3 month lag.`,
    };
  }

  return {
    source: "DOL_MCP OSHA Jurisdiction Reference",
    query: { stateCode },
    jurisdiction: {
      stateCode,
      stateName,
      tier: "federal_osha",
      ...FEDERAL_OSHA_FALLBACK,
      expectedReportingLagDays: FEDERAL_LAG_DAYS,
      notes: `${stateCode} is under federal OSHA jurisdiction (no state plan). osha_inspection_search returns current federal OSHA data with no reporting lag.`,
    },
    caveat: `${stateCode} is federal OSHA — osha_inspection_search data is current.`,
  };
}
