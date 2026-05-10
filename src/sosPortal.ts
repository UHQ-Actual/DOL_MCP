export type SosAgencyType =
  | "secretary_of_state"
  | "department_of_financial_institutions"
  | "corporation_commission"
  | "department_of_state"
  | "other";

export type SosVerifiedScope = "verified" | "general";

export interface SosPortalRecord {
  stateCode: string;
  stateName: string;
  agency: string;
  agencyType: SosAgencyType;
  agencyUrl: string | null;
  portalUrl: string;
  searchableBy: string[];
  bulkAvailable: boolean;
  bulkPricing: string | null;
  bulkUrl: string | null;
  recordsRequestPath: string | null;
  notes: string;
  verifiedScope: SosVerifiedScope;
}

export interface SosPortalLookupInput {
  stateCode: string;
}

export interface SosPortalLookupResult {
  source: "DOL_MCP State SOS Portal Reference";
  query: { stateCode: string };
  portal: SosPortalRecord;
  hint: string;
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

type VerifiedSource = Omit<SosPortalRecord, "stateCode" | "stateName" | "verifiedScope">;

const VERIFIED: Record<string, VerifiedSource> = {
  IL: {
    agency: "Illinois Secretary of State, Department of Business Services",
    agencyType: "secretary_of_state",
    agencyUrl: "https://www.ilsos.gov/departments/business-services/business-searches.html",
    portalUrl: "https://apps.ilsos.gov/businessentitysearch/",
    searchableBy: ["entity name", "file number", "partial name"],
    bulkAvailable: false,
    bulkPricing: "Paid contract via IL DBS, contact 217-782-6961",
    bulkUrl: null,
    recordsRequestPath: "FOIA via labor.illinois.gov",
    notes: "Database covers Corporations, Not-for-Profit Corporations, LPs, LLCs, LLPs. Public portal disallows bulk copying.",
  },
  IN: {
    agency: "Indiana Secretary of State (INBiz)",
    agencyType: "secretary_of_state",
    agencyUrl: "https://www.in.gov/sos/business/",
    portalUrl: "https://bsd.sos.in.gov/publicbusinesssearch",
    searchableBy: ["entity name", "type", "status", "location", "registered agent name"],
    bulkAvailable: true,
    bulkPricing: "Paid subscription tiered by volume",
    bulkUrl: "https://inbiz.in.gov/Inbiz/BulkDataServices/Index",
    recordsRequestPath: "Online form at https://www.in.gov/dol/iosha/iosha-faqs/ or fax 317-233-3790",
    notes: "Returns Business ID, Name, Type, Principal Office Address, Registered Agent Name, Status. Full profile includes Governing Person Information.",
  },
  IA: {
    agency: "Iowa Secretary of State",
    agencyType: "secretary_of_state",
    agencyUrl: "https://sos.iowa.gov/businesses/business-entities-search-help",
    portalUrl: "https://sos.iowa.gov/search/business/search.aspx",
    searchableBy: ["entity name", "partial name", "filing number"],
    bulkAvailable: true,
    bulkPricing: "Contact for quote",
    bulkUrl: null,
    recordsRequestPath: "Email ftf@sos.iowa.gov or call 515-281-5204",
    notes: "Free, no account. ~600k entities, ~1M filings. Fast Track Filing system processed 500k+ documents since 2018.",
  },
  KS: {
    agency: "Kansas Secretary of State (BESS — Business Entity Search Station)",
    agencyType: "secretary_of_state",
    agencyUrl: "https://sos.ks.gov/business/business-useful-links.html",
    portalUrl: "https://www.sos.ks.gov/eforms/BusinessEntity/Search.aspx",
    searchableBy: ["entity name", "ID number", "keyword", "registered agent name"],
    bulkAvailable: true,
    bulkPricing: "Contact 785-296-4564",
    bulkUrl: null,
    recordsRequestPath: "Business Services Division 785-296-4564",
    notes: "Native registered-agent search useful for finding all entities under one agent.",
  },
  MI: {
    agency: "Michigan Department of Licensing and Regulatory Affairs (LARA), Corporations Division",
    agencyType: "other",
    agencyUrl: "https://www.michigan.gov/lara/bureau-list/cscl/corps",
    portalUrl: "https://www.michigan.gov/corpentitysearch",
    searchableBy: ["entity name", "entity ID", "formation date"],
    bulkAvailable: false,
    bulkPricing: "Contact LARA Corporations Division",
    bulkUrl: null,
    recordsRequestPath: "LARA records request portal",
    notes: "MiBusiness Registry Portal launched June 23, 2025; legacy COFS URLs (cofs.lara.state.mi.us) are RETIRED. Always use michigan.gov/corpentitysearch.",
  },
  MN: {
    agency: "Minnesota Secretary of State, Business and Liens",
    agencyType: "secretary_of_state",
    agencyUrl: "https://www.sos.state.mn.us/",
    portalUrl: "https://mblsportal.sos.mn.gov/Business/Search",
    searchableBy: ["entity name", "filing number"],
    bulkAvailable: true,
    bulkPricing: "$30/week commercial; FREE for journalists / researchers / non-commercial",
    bulkUrl: "https://www.sos.mn.gov/business-liens/business-liens-data/business-data-available/",
    recordsRequestPath: "Business Information Lines 651-296-2803 or 1-877-551-6767",
    notes: "Cheapest legitimate path to a recurring Midwest business roster: free non-commercial license available. Weekly active-business CSV.",
  },
  MO: {
    agency: "Missouri Secretary of State, Business Services Division",
    agencyType: "secretary_of_state",
    agencyUrl: "https://www.sos.mo.gov/business",
    portalUrl: "https://bsd.sos.mo.gov/",
    searchableBy: ["entity name", "registered agent", "charter number"],
    bulkAvailable: false,
    bulkPricing: "Contact MO SOS",
    bulkUrl: null,
    recordsRequestPath: "Contact MO SOS Business Services",
    notes: "Returns name (with previous names), charter number, type, status, formation date, registered agent. Previous-names tracking is unusually useful for rebrands.",
  },
  NE: {
    agency: "Nebraska Secretary of State, Business Services Division",
    agencyType: "secretary_of_state",
    agencyUrl: "https://sos.nebraska.gov/business-services/business-services-division",
    portalUrl: "https://sos.nebraska.gov/business-services/corporate-and-business",
    searchableBy: ["entity name", "trade name", "trademark"],
    bulkAvailable: true,
    bulkPricing: "$15 per 1,000 records (cheapest published Midwest bulk)",
    bulkUrl: "https://www.nebraska.gov/SpecialRequestSearches/index.cgi",
    recordsRequestPath: "Business Services Division 402-471-4079",
    notes: "Cheapest paid bulk in the Midwest at $15/1k records. Free corporate, business, trade name, trademark, service mark search.",
  },
  OH: {
    agency: "Ohio Secretary of State, Business Services",
    agencyType: "secretary_of_state",
    agencyUrl: "https://www.ohiosos.gov/business",
    portalUrl: "https://businesssearch.ohiosos.gov/",
    searchableBy: ["entity name"],
    bulkAvailable: true,
    bulkPricing: "FREE monthly reports (new filings, dissolutions, trademarks, cancellations) on second Saturday each month",
    bulkUrl: "https://www.ohiosos.gov/business/business-reports",
    recordsRequestPath: "Business Services Division 1-877-SOS-FILE",
    notes: "Only no-cost recurring bulk source in the Midwest. Free monthly reports include new filings, subsequent filings, trademarks, debarments, dissolutions.",
  },
  WI: {
    agency: "Wisconsin Department of Financial Institutions",
    agencyType: "department_of_financial_institutions",
    agencyUrl: "https://dfi.wi.gov/Pages/BusinessServices/BusinessEntities/GeneralInformation.aspx",
    portalUrl: "https://apps.dfi.wi.gov/apps/corpsearch/search.aspx",
    searchableBy: ["entity name", "advanced filters via /Advanced.aspx"],
    bulkAvailable: false,
    bulkPricing: "Contact WI DFI",
    bulkUrl: null,
    recordsRequestPath: "Contact WI DFI directly",
    notes: "GOTCHA: Wisconsin business registration is administered by the DEPARTMENT OF FINANCIAL INSTITUTIONS, not the Secretary of State. Searches for 'Wisconsin SOS business' lead to dead ends.",
  },
};

const GENERIC_AGENCY_BY_STATE: Record<string, { agency: string; agencyType: SosAgencyType; portalUrl: string; agencyUrl: string }> = {
  AL: { agency: "Alabama Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://arc-sos.state.al.us/cgi/corpname.mbr/input", agencyUrl: "https://www.sos.alabama.gov/business-services" },
  AK: { agency: "Alaska Department of Commerce, Division of Corporations", agencyType: "other", portalUrl: "https://www.commerce.alaska.gov/cbp/main/search/entities", agencyUrl: "https://www.commerce.alaska.gov/web/cbpl" },
  AZ: { agency: "Arizona Corporation Commission", agencyType: "corporation_commission", portalUrl: "https://ecorp.azcc.gov/EntitySearch/Index", agencyUrl: "https://www.azcc.gov/" },
  AR: { agency: "Arkansas Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://www.sos.arkansas.gov/corps/search_corps.php", agencyUrl: "https://www.sos.arkansas.gov/business-commercial-services-bcs" },
  CA: { agency: "California Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://bizfileonline.sos.ca.gov/search/business", agencyUrl: "https://www.sos.ca.gov/business-programs" },
  CO: { agency: "Colorado Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://www.coloradosos.gov/biz/BusinessEntityCriteriaExt.do", agencyUrl: "https://www.coloradosos.gov/biz/" },
  CT: { agency: "Connecticut Secretary of the State", agencyType: "department_of_state", portalUrl: "https://service.ct.gov/business/s/onlinebusinesssearch", agencyUrl: "https://portal.ct.gov/SOTS" },
  DE: { agency: "Delaware Division of Corporations", agencyType: "other", portalUrl: "https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx", agencyUrl: "https://corp.delaware.gov/" },
  DC: { agency: "DC Department of Licensing and Consumer Protection", agencyType: "other", portalUrl: "https://corponline.dcra.dc.gov/Account.aspx/LogOn", agencyUrl: "https://dlcp.dc.gov/" },
  FL: { agency: "Florida Department of State, Division of Corporations (Sunbiz)", agencyType: "department_of_state", portalUrl: "https://search.sunbiz.org/Inquiry/CorporationSearch/ByName", agencyUrl: "https://dos.fl.gov/sunbiz/" },
  GA: { agency: "Georgia Secretary of State, Corporations Division", agencyType: "secretary_of_state", portalUrl: "https://ecorp.sos.ga.gov/BusinessSearch", agencyUrl: "https://sos.ga.gov/corporations-division" },
  HI: { agency: "Hawaii Department of Commerce and Consumer Affairs (BREG)", agencyType: "other", portalUrl: "https://hbe.ehawaii.gov/documents/search.html", agencyUrl: "https://cca.hawaii.gov/breg/" },
  ID: { agency: "Idaho Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://sosbiz.idaho.gov/search/business", agencyUrl: "https://sos.idaho.gov/business/" },
  KY: { agency: "Kentucky Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://sosbes.sos.ky.gov/BusSearchNProfile/Search.aspx", agencyUrl: "https://sos.ky.gov/bus/" },
  LA: { agency: "Louisiana Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://coraweb.sos.la.gov/CommercialSearch/CommercialSearch.aspx", agencyUrl: "https://www.sos.la.gov/BusinessServices/" },
  ME: { agency: "Maine Secretary of State, Bureau of Corporations", agencyType: "secretary_of_state", portalUrl: "https://icrs.informe.org/nei-sos-icrs/ICRS", agencyUrl: "https://www.maine.gov/sos/cec/corp/" },
  MD: { agency: "Maryland Department of Assessments and Taxation", agencyType: "other", portalUrl: "https://egov.maryland.gov/BusinessExpress/EntitySearch", agencyUrl: "https://dat.maryland.gov/" },
  MA: { agency: "Massachusetts Secretary of the Commonwealth, Corporations Division", agencyType: "department_of_state", portalUrl: "https://corp.sec.state.ma.us/CorpWeb/CorpSearch/CorpSearch.aspx", agencyUrl: "https://www.sec.state.ma.us/divisions/corporations/" },
  MS: { agency: "Mississippi Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://corp.sos.ms.gov/corp/portal/c/page/corpBusinessIdSearch/portal.aspx", agencyUrl: "https://www.sos.ms.gov/business-services" },
  MT: { agency: "Montana Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://biz.sosmt.gov/search/business", agencyUrl: "https://sosmt.gov/business/" },
  NV: { agency: "Nevada Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://esos.nv.gov/EntitySearch/OnlineEntitySearch", agencyUrl: "https://www.nvsos.gov/sos/businesses" },
  NH: { agency: "New Hampshire Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://quickstart.sos.nh.gov/online/BusinessInquire", agencyUrl: "https://www.sos.nh.gov/corporate-division" },
  NJ: { agency: "New Jersey Department of the Treasury, Division of Revenue and Enterprise Services", agencyType: "other", portalUrl: "https://www.njportal.com/DOR/BusinessNameSearch/Search/BusinessName", agencyUrl: "https://www.nj.gov/treasury/revenue/" },
  NM: { agency: "New Mexico Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://enterprise.sos.nm.gov/search", agencyUrl: "https://www.sos.nm.gov/business-services/" },
  NY: { agency: "New York Department of State, Division of Corporations", agencyType: "department_of_state", portalUrl: "https://apps.dos.ny.gov/publicInquiry/", agencyUrl: "https://dos.ny.gov/division-corporations" },
  NC: { agency: "North Carolina Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://www.sosnc.gov/search/index/corp", agencyUrl: "https://www.sosnc.gov/divisions/business_registration" },
  ND: { agency: "North Dakota Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://firststop.sos.nd.gov/search/business", agencyUrl: "https://sos.nd.gov/business/business-services-overview" },
  OK: { agency: "Oklahoma Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://www.sos.ok.gov/corp/corpInquiryFind.aspx", agencyUrl: "https://www.sos.ok.gov/business/" },
  OR: { agency: "Oregon Secretary of State, Corporation Division", agencyType: "secretary_of_state", portalUrl: "https://sos.oregon.gov/business/Pages/find.aspx", agencyUrl: "https://sos.oregon.gov/business/" },
  PA: { agency: "Pennsylvania Department of State, Bureau of Corporations and Charitable Organizations", agencyType: "department_of_state", portalUrl: "https://file.dos.pa.gov/search/business", agencyUrl: "https://www.dos.pa.gov/BusinessCharities/" },
  RI: { agency: "Rhode Island Department of State, Business Services Division", agencyType: "department_of_state", portalUrl: "https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx", agencyUrl: "https://www.sos.ri.gov/divisions/business-services" },
  SC: { agency: "South Carolina Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://businessfilings.sc.gov/BusinessFiling/Entity/Search", agencyUrl: "https://sos.sc.gov/online-filings" },
  SD: { agency: "South Dakota Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://sosenterprise.sd.gov/BusinessServices/Business/FilingSearch.aspx", agencyUrl: "https://sosenterprise.sd.gov/" },
  TN: { agency: "Tennessee Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://tnbear.tn.gov/Ecommerce/FilingSearch.aspx", agencyUrl: "https://sos.tn.gov/business-services" },
  TX: { agency: "Texas Secretary of State (SOSDirect — paid)", agencyType: "secretary_of_state", portalUrl: "https://www.sos.state.tx.us/corp/sosda/index.shtml", agencyUrl: "https://www.sos.state.tx.us/corp/" },
  UT: { agency: "Utah Department of Commerce, Division of Corporations", agencyType: "other", portalUrl: "https://businessregistration.utah.gov/EntitySearch/OnlineEntitySearch", agencyUrl: "https://corporations.utah.gov/" },
  VT: { agency: "Vermont Secretary of State, Corporations Division", agencyType: "secretary_of_state", portalUrl: "https://bizfilings.vermont.gov/online/BusinessInquire", agencyUrl: "https://sos.vermont.gov/corporations/" },
  VA: { agency: "Virginia State Corporation Commission", agencyType: "corporation_commission", portalUrl: "https://cis.scc.virginia.gov/EntitySearch/Index", agencyUrl: "https://scc.virginia.gov/clk/" },
  WA: { agency: "Washington Secretary of State, Corporations and Charities Division", agencyType: "secretary_of_state", portalUrl: "https://ccfs.sos.wa.gov/#/", agencyUrl: "https://www.sos.wa.gov/corporations-charities" },
  WV: { agency: "West Virginia Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://apps.sos.wv.gov/business/corporations/", agencyUrl: "https://sos.wv.gov/business-licensing/" },
  WY: { agency: "Wyoming Secretary of State", agencyType: "secretary_of_state", portalUrl: "https://wyobiz.wyo.gov/Business/FilingSearch.aspx", agencyUrl: "https://sos.wyo.gov/business/" },
};

export function getSosPortal(input: SosPortalLookupInput): SosPortalLookupResult {
  const stateCode = input.stateCode?.trim().toUpperCase();
  if (!stateCode || !STATE_NAMES[stateCode]) {
    throw new Error(`Unknown state code "${input.stateCode}". Pass a USPS two-letter code (e.g., MI, OH, CA).`);
  }

  const stateName = STATE_NAMES[stateCode];
  const verified = VERIFIED[stateCode];
  if (verified) {
    return {
      source: "DOL_MCP State SOS Portal Reference",
      query: { stateCode },
      portal: {
        stateCode,
        stateName,
        ...verified,
        verifiedScope: "verified",
      },
      hint: `Search ${stateName} business registrations at ${verified.portalUrl} (${verified.agency}). For programmatic access, use business_entity_search via OpenCorporates.`,
    };
  }

  const generic = GENERIC_AGENCY_BY_STATE[stateCode];
  if (generic) {
    return {
      source: "DOL_MCP State SOS Portal Reference",
      query: { stateCode },
      portal: {
        stateCode,
        stateName,
        agency: generic.agency,
        agencyType: generic.agencyType,
        agencyUrl: generic.agencyUrl,
        portalUrl: generic.portalUrl,
        searchableBy: ["entity name"],
        bulkAvailable: false,
        bulkPricing: null,
        bulkUrl: null,
        recordsRequestPath: null,
        notes: `${stateName} entry uses general portal data; verify URL and capabilities directly with the agency before relying on it for enforcement work. The DOL_MCP project has detailed/verified data for the 10 Midwest states only.`,
        verifiedScope: "general",
      },
      hint: `Search ${stateName} business registrations at ${generic.portalUrl} (${generic.agency}). For programmatic access, use business_entity_search via OpenCorporates.`,
    };
  }

  return {
    source: "DOL_MCP State SOS Portal Reference",
    query: { stateCode },
    portal: {
      stateCode,
      stateName,
      agency: "Unknown",
      agencyType: "other",
      agencyUrl: null,
      portalUrl: "https://opencorporates.com/",
      searchableBy: [],
      bulkAvailable: false,
      bulkPricing: null,
      bulkUrl: null,
      recordsRequestPath: null,
      notes: `No portal entry encoded for ${stateName} in this build. Use business_entity_search via OpenCorporates as the primary path; verify the local agency separately.`,
      verifiedScope: "general",
    },
    hint: `No verified portal data for ${stateName}. Use business_entity_search via OpenCorporates as the primary path.`,
  };
}
