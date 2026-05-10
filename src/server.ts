#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { DolApiClient } from "./dolApi.js";
import {
  loadDolApiKey,
  loadGooglePlacesApiKey,
  loadOpenCorporatesApiKey,
  loadSamApiKey,
} from "./env.js";
import { OpenCorporatesClient } from "./openCorporates.js";
import { GooglePlacesClient } from "./places.js";
import { answerGovernmentDataQuestion } from "./queryRouter.js";
import { SamGovClient } from "./sam.js";
import { createToolHandlers, toTextResult } from "./tools.js";

export function createServer(
  client: DolApiClient,
  samApiKey?: string,
  googlePlacesApiKey?: string,
  openCorporatesApiKey?: string,
): McpServer {
  const server = new McpServer({
    name: "dol-whd-mcp",
    version: "0.1.0",
  });
  const handlers = createToolHandlers(
    client,
    undefined,
    undefined,
    new SamGovClient({ apiKey: samApiKey }),
    undefined,
    new GooglePlacesClient({ apiKey: googlePlacesApiKey }),
    undefined,
    undefined,
    new OpenCorporatesClient({ apiKey: openCorporatesApiKey }),
  );

  server.registerTool(
    "ask_government_data",
    {
      title: "Ask Government Data",
      description:
        "Route a plain-English question to the right source: WHD enforcement, OSHA inspections, DOL foreign-labor/LCA disclosures, or SAM.gov contract opportunities.",
      inputSchema: {
        question: z.string().min(1).describe("Plain-English question to route and execute."),
        maxResults: z.number().int().min(1).max(1000).optional().describe("Maximum records to return from the selected database."),
        dryRun: z
          .boolean()
          .optional()
          .describe("For SAM.gov questions, return sample opportunities instead of calling the live SAM.gov API."),
      },
    },
    async (args) => toTextResult(await answerGovernmentDataQuestion(args, handlers)),
  );

  server.registerTool(
    "whd_enforcement_query",
    {
      title: "Query WHD Enforcement Records",
      description:
        "Query concluded Wage and Hour Division compliance actions from the DOL WHD Enforcement (WHISARD) dataset. IMPORTANT date semantics: `findings_end_date` is the date violations STOPPED occurring, NOT the date the case was concluded. Investigation lag from end-of-violation to case-closed is typically 6-24 months. When filtering for 'cases from 2024-2025,' use a wider findings_end_date window (e.g., findings_end_date >= 2022-10-01) and rank by recency; a strict 2024-2025 findings filter will return an artificially small slice. The `ld_dt` field is the dataset load date, not the case-conclusion date.",
      inputSchema: {
        limit: z.number().int().min(1).max(10000).optional().describe("Maximum records to return. DOL max is 10000."),
        offset: z.number().int().min(0).optional().describe("Records to skip for paging."),
        fields: z
          .union([z.array(z.string()), z.string()])
          .optional()
          .describe("Field names to return, as an array or comma-separated string."),
        sort: z.enum(["asc", "desc"]).optional().describe("Sort direction."),
        sort_by: z.string().optional().describe("Field name to sort by."),
        filter_object: z.unknown().optional().describe("DOL filter_object JSON with field/operator/value or and/or groups."),
      },
    },
    async (args) => toTextResult(await handlers.queryEnforcement(args)),
  );

  server.registerTool(
    "whd_enforcement_case",
    {
      title: "Get WHD Enforcement Case",
      description: "Look up WHD Enforcement records by numeric case_id.",
      inputSchema: {
        case_id: z.union([z.number().int(), z.string()]).describe("Numeric WHD case_id."),
        fields: z
          .union([z.array(z.string()), z.string()])
          .optional()
          .describe("Optional field names to return, as an array or comma-separated string."),
      },
    },
    async (args) => toTextResult(await handlers.getCaseById(args)),
  );

  server.registerTool(
    "whd_enforcement_metadata",
    {
      title: "Get WHD Enforcement Metadata",
      description: "Return metadata rows for the WHD Enforcement (WHISARD) dataset, optionally filtered by text.",
      inputSchema: {
        search: z.string().optional().describe("Case-insensitive search across metadata fields."),
        category: z.string().optional().describe("Optional exact variable_category filter, such as measure or location."),
        limit: z.number().int().min(1).max(500).optional().describe("Maximum metadata rows to return."),
      },
    },
    async (args) => toTextResult(await handlers.getMetadata(args)),
  );

  server.registerTool(
    "whd_enforcement_fields",
    {
      title: "List WHD Enforcement Fields",
      description: "Return concise WHD Enforcement field names, labels, descriptions, categories, data types, and units.",
      inputSchema: {
        search: z.string().optional().describe("Case-insensitive field search."),
        category: z.string().optional().describe("Optional exact variable_category filter, such as measure or location."),
        limit: z.number().int().min(1).max(500).optional().describe("Maximum fields to return."),
      },
    },
    async (args) => toTextResult(await handlers.listFields(args)),
  );

  server.registerTool(
    "dol_datasets_search",
    {
      title: "Search DOL Datasets",
      description: "Search the public DOL v4 datasets catalog. This endpoint does not require the API key.",
      inputSchema: {
        search: z.string().optional().describe("Text to search for in dataset metadata."),
        agency: z.string().optional().describe("Agency text to match, such as WHD."),
        limit: z.number().int().min(1).max(500).optional().describe("Maximum datasets to return."),
      },
    },
    async (args) => toTextResult(await handlers.searchDatasets(args)),
  );

  server.registerTool(
    "lca_disclosure_files",
    {
      title: "Get DOL LCA Disclosure File URLs",
      description:
        "Return official DOL OFLC LCA disclosure, Appendix A, worksite, and record-layout URLs for a fiscal year quarter.",
      inputSchema: {
        fiscalYear: z.number().int().min(2009).max(2100).optional().describe("Federal fiscal year, such as 2026."),
        quarter: z.number().int().min(1).max(4).optional().describe("Fiscal quarter, 1 through 4."),
      },
    },
    async (args) => toTextResult(await handlers.getLcaFiles(args)),
  );

  const lcaSearchSchema = {
    fiscalYear: z.number().int().min(2009).max(2100).optional().describe("Federal fiscal year, such as 2026."),
    quarter: z.number().int().min(1).max(4).optional().describe("Fiscal quarter, 1 through 4."),
    localFile: z
      .string()
      .optional()
      .describe("Optional path to an already-downloaded official LCA disclosure XLSX file."),
    employerName: z.string().optional().describe("Employer name filter."),
    searchMode: z.enum(["contains", "exact"]).optional().describe("Employer match mode."),
    state: z.string().optional().describe("Two-letter worksite or employer state filter."),
    city: z.string().optional().describe("Worksite or employer city substring filter."),
    jobTitle: z.string().optional().describe("Job title substring filter."),
    socCode: z.string().optional().describe("SOC code prefix filter."),
    naicsCode: z.string().optional().describe("NAICS code prefix filter."),
    caseStatus: z.string().optional().describe("Case status, such as CERTIFIED or DENIED."),
    visaClass: z.string().optional().describe("Visa class, such as H-1B, H-1B1, or E-3."),
    minAnnualWage: z.number().optional().describe("Minimum annualized offered wage."),
    dateFrom: z.string().optional().describe("Inclusive lower date bound in YYYY-MM-DD form."),
    dateTo: z.string().optional().describe("Inclusive upper date bound in YYYY-MM-DD form."),
    dateField: z.string().optional().describe("DOL date field to filter on, default DECISION_DATE."),
    maxResults: z.number().int().min(1).max(5000).optional().describe("Maximum rows to return."),
  };

  server.registerTool(
    "lca_disclosure_fields",
    {
      title: "List DOL LCA Disclosure Fields",
      description: "Read field names from a DOL LCA disclosure XLSX file.",
      inputSchema: lcaSearchSchema,
    },
    async (args) => toTextResult(await handlers.getLcaFields(args)),
  );

  server.registerTool(
    "lca_search",
    {
      title: "Search DOL LCA Disclosure Data",
      description:
        "Search official DOL OFLC LCA disclosure XLSX data by employer, worksite, job title, SOC, NAICS, status, visa class, wage, and dates.",
      inputSchema: lcaSearchSchema,
    },
    async (args) => toTextResult(await handlers.searchLca(args)),
  );

  server.registerTool(
    "lca_employer_profile",
    {
      title: "Build DOL LCA Employer Profile",
      description:
        "Build a DOL LCA-only employer profile with certification counts, wage statistics, top job titles, SOC codes, worksites, H-1B dependent, and willful violator flags.",
      inputSchema: {
        ...lcaSearchSchema,
        employerName: z.string().describe("Employer name to profile."),
      },
    },
    async (args) => toTextResult(await handlers.getLcaEmployerProfile(args)),
  );

  const foreignLaborSearchSchema = {
    visaProgram: z.string().optional().describe("Foreign labor program: LCA, PERM, H-2A, H-2B, or CW."),
    fiscalYear: z.number().int().min(2020).max(2030).optional().describe("DOL fiscal year, 2020 through 2030."),
    fiscalQuarter: z.string().optional().describe("Fiscal quarter: Q1, Q2, Q3, or Q4."),
    localFile: z
      .string()
      .optional()
      .describe("Optional path to an already-downloaded official disclosure XLSX file."),
    employerName: z.string().optional().describe("Case-insensitive employer legal-name substring filter."),
    jobTitle: z.string().optional().describe("Case-insensitive job-title substring filter."),
    socCode: z.string().optional().describe("SOC code prefix filter."),
    worksiteState: z.string().optional().describe("Two-letter worksite state code."),
    caseStatus: z.string().optional().describe("Case status, such as Certified, Denied, Withdrawn, or Certified - Withdrawn."),
    minAnnualWage: z.number().optional().describe("Minimum offered wage after annualization."),
    maxItems: z.number().int().min(0).optional().describe("Maximum matching records to return. Use 0 for no cap."),
  };

  server.registerTool(
    "foreign_labor_files",
    {
      title: "Get DOL Foreign Labor Disclosure Files",
      description:
        "Discover official DOL OFLC disclosure workbook, record-layout, and auxiliary file URLs for LCA, PERM, H-2A, H-2B, or CW.",
      inputSchema: {
        visaProgram: z.string().optional().describe("Foreign labor program: LCA, PERM, H-2A, H-2B, or CW."),
        fiscalYear: z.number().int().min(2020).max(2030).optional().describe("DOL fiscal year, 2020 through 2030."),
        fiscalQuarter: z.string().optional().describe("Fiscal quarter: Q1, Q2, Q3, or Q4."),
      },
    },
    async (args) => toTextResult(await handlers.getForeignLaborFiles(args)),
  );

  server.registerTool(
    "foreign_labor_fields",
    {
      title: "List DOL Foreign Labor Disclosure Fields",
      description: "Read field names from an official DOL foreign-labor disclosure XLSX file.",
      inputSchema: foreignLaborSearchSchema,
    },
    async (args) => toTextResult(await handlers.getForeignLaborFields(args)),
  );

  server.registerTool(
    "foreign_labor_search",
    {
      title: "Search DOL Foreign Labor Disclosure Data",
      description:
        "Stream-search and normalize DOL OFLC disclosure XLSX records across LCA, PERM, H-2A, H-2B, and CW programs. ROUTE BY VISA PROGRAM: H-2A is AGRICULTURAL seasonal labor (farms, ranches, NAICS 11) — never use H-2B for farms. H-2B is NON-AGRICULTURAL seasonal labor (landscaping, hospitality, construction, seafood processing) — never use H-2A here. LCA covers H-1B / H-1B1 / E-3 specialty occupations (tech, healthcare, engineering, academics) and is wrong for ag or seasonal labor. PERM is permanent labor certification (green-card sponsorship). CW is CNMI-only. DO NOT call this tool for general restaurant or business research — restaurants almost never sponsor visa workers; use places_search instead. The first call for a given (visaProgram, fiscalYear, fiscalQuarter) downloads the official disclosure workbook and builds a gzipped JSONL cache (slow, can take 30-90s for big LCA quarters); subsequent calls hit the cache in 1-3 seconds. To avoid first-call timeouts, narrow with maxItems and one or more of employerName, worksiteState, socCode, or caseStatus.",
      inputSchema: foreignLaborSearchSchema,
    },
    async (args) => toTextResult(await handlers.searchForeignLabor(args)),
  );

  const oshaSearchSchema = {
    companyName: z.string().optional().describe("Establishment name substring filter."),
    state: z.string().optional().describe("Two-letter site state filter."),
    city: z.string().optional().describe("Site city substring filter."),
    naicsCode: z.string().optional().describe("NAICS code prefix filter, such as 23 for construction."),
    inspectionType: z
      .string()
      .optional()
      .describe("OSHA inspection type code, such as A, B, C, F, G, H, J, K, or L."),
    safetyHealth: z.string().optional().describe("S for safety inspections or H for health inspections."),
    dateFrom: z.string().optional().describe("Lower open_date bound in YYYY-MM-DD form; DOL operator is gt."),
    dateTo: z.string().optional().describe("Upper open_date bound in YYYY-MM-DD form; DOL operator is lt."),
    includeViolations: z.boolean().optional().describe("Fetch and join OSHA violation/citation details. Defaults to true."),
    maxResults: z.number().int().min(1).max(5000).optional().describe("Maximum inspections to return."),
    offset: z.number().int().min(0).optional().describe("Inspection records to skip for paging."),
  };

  server.registerTool(
    "osha_fields",
    {
      title: "List OSHA Dataset Fields",
      description: "Return metadata fields for the official DOL OSHA inspection or violation dataset.",
      inputSchema: {
        dataset: z.enum(["inspection", "violation"]).optional().describe("OSHA dataset to inspect. Defaults to inspection."),
        search: z.string().optional().describe("Case-insensitive search across metadata fields."),
        limit: z.number().int().min(1).max(500).optional().describe("Maximum fields to return."),
      },
    },
    async (args) => toTextResult(await handlers.getOshaFields(args)),
  );

  server.registerTool(
    "osha_inspection_search",
    {
      title: "Search OSHA Inspections",
      description:
        "Search official DOL OSHA inspection records and optionally join non-deleted violation/citation records by activity_nr.",
      inputSchema: oshaSearchSchema,
    },
    async (args) => toTextResult(await handlers.searchOshaInspections(args)),
  );

  server.registerTool(
    "osha_inspection_detail",
    {
      title: "Get OSHA Inspection Detail",
      description: "Look up one OSHA inspection by activity number and optionally join violation/citation records.",
      inputSchema: {
        activityNumber: z.union([z.number().int(), z.string()]).describe("OSHA inspection activity_nr."),
        includeViolations: z.boolean().optional().describe("Fetch and join OSHA violation/citation details. Defaults to true."),
      },
    },
    async (args) => toTextResult(await handlers.getOshaInspection(args)),
  );

  server.registerTool(
    "sos_portal_lookup",
    {
      title: "Look Up State Business Registration Portal by State",
      description:
        "Static reference: returns the URL and agency for the Secretary of State (or DFI / Corporation Commission, depending on the state) business-entity search portal for a given US state. Use this when the user wants to verify an entity manually, file a records request, or use a state's own search form. Includes bulk-download availability and pricing where published. The 10 Midwest states are verified with detailed notes; the other 40 states are encoded with general portal URLs that should be sanity-checked before enforcement use. For programmatic lookups, prefer business_entity_search via OpenCorporates.",
      inputSchema: {
        stateCode: z.string().min(2).max(2).describe("USPS two-letter state code (e.g., MI, OH, CA). Case-insensitive."),
      },
    },
    async (args) => toTextResult(await handlers.getSosPortal(args)),
  );

  server.registerTool(
    "osha_state_plan_lookup",
    {
      title: "Look Up OSHA Jurisdiction by State",
      description:
        "Static reference: returns the OSHA jurisdiction tier (federal_osha / public_only_state_plan / complete_state_plan), program name (MIOSHA, Cal/OSHA, IOSHA, etc.), administering agency, expected reporting lag in days for state-plan submissions to federal OIS, public-records request path, and a one-line caveat the agent can paste alongside `osha_inspection_search` results. Use this when an agent's OSHA query in MI / MN / IA / IN / CA / WA returns sparse recent data — the lookup tells the agent (and the user) why and how to get fresher data.",
      inputSchema: {
        stateCode: z.string().min(2).max(2).describe("USPS two-letter state code (e.g., MI, OH, CA). Case-insensitive."),
      },
    },
    async (args) => toTextResult(await handlers.getOshaJurisdiction(args)),
  );

  const samSearchSchema = {
    keywords: z.string().optional().describe("Opportunity title keywords."),
    naicsCodes: z.array(z.string()).optional().describe("NAICS codes to search; each code is queried separately and deduplicated."),
    procurementTypes: z
      .array(z.string())
      .optional()
      .describe("SAM.gov procurement type codes, such as o, k, r, p, a, or s. Defaults to o and k."),
    setAsideType: z.string().optional().describe("SAM.gov typeOfSetAside code, such as SBA, 8A, HZC, SDVOSBC, WOSB, or EDWOSB."),
    officeState: z
      .string()
      .optional()
      .describe("Two-letter contracting OFFICE state code. Sent server-side as SAM.gov's `state=` filter; does NOT filter by where the work is performed."),
    state: z
      .string()
      .optional()
      .describe("Deprecated alias for officeState. SAM.gov's state parameter filters by contracting office, not place of performance."),
    placeOfPerformanceState: z
      .string()
      .optional()
      .describe("Two-letter place-of-performance state code. Filtered client-side after fetch because SAM.gov's API has no server-side POP state filter."),
    placeOfPerformanceCity: z
      .string()
      .optional()
      .describe("Place-of-performance city substring (case-insensitive). Filtered client-side after fetch because SAM.gov has no server-side city filter. For metro areas fan out across multiple cities (e.g., Lansing, East Lansing) and merge."),
    postedDaysAgo: z.number().int().min(1).max(365).optional().describe("Search opportunities posted within the last N days."),
    maxResults: z.number().int().min(1).max(1000).optional().describe("Maximum opportunities to return after filtering."),
    dryRun: z.boolean().optional().describe("Return sample opportunities without calling SAM.gov. Defaults to true when no SAM key is configured."),
  };

  server.registerTool(
    "sam_opportunities_search",
    {
      title: "Search SAM.gov Contract Opportunities",
      description:
        "Search the official SAM.gov Opportunities API by title keywords, NAICS codes, procurement type, set-aside, contracting office state, and posted date range. Place-of-performance state and city filters are applied client-side because SAM.gov's v2 API does not support them server-side. Note: SAM.gov returns SOLICITATIONS (announcements), not awarded contracts; awardAmount is null on most rows. For awarded federal contracts with dollar amounts, use USAspending.gov instead.",
      inputSchema: samSearchSchema,
    },
    async (args) => toTextResult(await handlers.searchSamOpportunities(args)),
  );

  server.registerTool(
    "sam_opportunity_detail",
    {
      title: "Get SAM.gov Opportunity Detail",
      description: "Look up one SAM.gov opportunity by notice ID. Live mode requires a SAM.gov API key in the environment.",
      inputSchema: {
        noticeId: z.string().describe("SAM.gov noticeId."),
        dryRun: z.boolean().optional().describe("Use sample data without calling SAM.gov."),
      },
    },
    async (args) => toTextResult(await handlers.getSamOpportunity(args)),
  );

  server.registerTool(
    "sam_reference",
    {
      title: "List SAM.gov Codes",
      description: "Return common SAM.gov procurement type and set-aside codes used by the opportunity search tool.",
      inputSchema: {},
    },
    async () => toTextResult(await handlers.getSamReference()),
  );

  server.registerTool(
    "usaspending_award_search",
    {
      title: "Search USAspending.gov Federal Awards",
      description:
        "Search USAspending.gov for federal contract and assistance awards with KNOWN obligated dollar amounts. Use this when the user asks 'how much was contract X for' or 'all federal contracts in Y over $Z' — SAM.gov returns solicitations not awards. No API key required. Filters by NAICS, PSC, recipient, awarding agency, place-of-performance state/city/county FIPS, award amount range, and start-date range. Defaults to contract award types (A, B, C, D) for the past 12 months.",
      inputSchema: {
        keywords: z.string().optional().describe("Free-text keyword filter. USAspending matches against award description, recipient, and PIID."),
        awardTypes: z
          .array(z.string())
          .optional()
          .describe("USAspending award type codes. Contracts: A=BPA Call, B=Purchase Order, C=Delivery Order, D=Definitive Contract. Defaults to A,B,C,D."),
        recipientName: z.string().optional().describe("Recipient (vendor/contractor) name substring."),
        recipientState: z.string().optional().describe("Two-letter recipient/HQ state code."),
        awardingAgency: z.string().optional().describe("Top-tier awarding agency name, e.g. 'Department of Defense'."),
        naicsCodes: z.array(z.string()).optional().describe("NAICS code prefixes to require, such as 236, 237, 238 for construction."),
        pscCodes: z.array(z.string()).optional().describe("Product/Service Code (PSC/FSC) values, such as Y1AA for new construction."),
        placeOfPerformanceState: z.string().optional().describe("Two-letter place-of-performance state code."),
        placeOfPerformanceCity: z.string().optional().describe("Place-of-performance city. Exact match (case-insensitive) against USAspending's POP city — fan out across 'Lansing', 'East Lansing' for metros."),
        placeOfPerformanceCountyFips: z.string().optional().describe("3-digit county FIPS code (e.g. '049' for Eaton County, MI). Used when POP city alone is too narrow."),
        awardAmountMin: z.number().optional().describe("Minimum award amount in dollars."),
        awardAmountMax: z.number().optional().describe("Maximum award amount in dollars."),
        startDateFrom: z.string().optional().describe("Inclusive lower start_date bound in YYYY-MM-DD form."),
        startDateTo: z.string().optional().describe("Inclusive upper start_date bound in YYYY-MM-DD form."),
        fiscalYear: z
          .number()
          .int()
          .min(2008)
          .max(2100)
          .optional()
          .describe("Federal fiscal year shorthand (Oct prior year through Sep). Sets start_date and end_date when no explicit range provided."),
        sortBy: z.string().optional().describe("Sort field. Defaults to 'Award Amount'."),
        sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction. Defaults to desc."),
        maxResults: z.number().int().min(1).max(1000).optional().describe("Maximum awards to return after pagination."),
        dryRun: z.boolean().optional().describe("Return sample awards without calling USAspending."),
      },
    },
    async (args) => toTextResult(await handlers.searchUsaSpendingAwards(args)),
  );

  server.registerTool(
    "places_search",
    {
      title: "Search Google Places",
      description:
        "Search Google Places (New) Text Search for businesses in an area. Designed as a per-round retrieval primitive for the Restaurant Research Agent. Returns deduplicated results with googleMapsUrl for source-tracing. Auto-pages up to maxResults (Google caps at ~60 per query). Defaults to includedTypes=['restaurant'] and excludeClosed=true.",
      inputSchema: {
        query: z.string().min(1).describe("Free-text search, e.g. 'restaurants in Hillsdale, MI'."),
        includedTypes: z.array(z.string()).optional().describe("Google place types to include. Pass [] to disable type filtering. Defaults to ['restaurant']."),
        excludedTypes: z.array(z.string()).optional().describe("Optional exclusion types, e.g. ['lodging']."),
        maxResults: z.number().int().min(1).max(60).optional().describe("Maximum places to return (1-60). Auto-pages until reached or no more pages."),
        excludeClosed: z.boolean().optional().describe("Drop CLOSED_PERMANENTLY and CLOSED_TEMPORARILY. Defaults to true."),
        minRating: z.number().min(0).max(5).optional().describe("Filter on rating. Places with no rating are kept."),
        regionCode: z.string().optional().describe("ISO 3166-1 alpha-2 region code. Defaults to 'US'."),
        cityFilter: z.string().optional().describe("Drop any place whose formatted address does not contain this substring (case-insensitive). Use 'Hillsdale, MI' to keep only in-town results when Google's text search spills into adjacent municipalities."),
        dryRun: z.boolean().optional().describe("Return sample places without calling Google. Defaults to true when no key is configured."),
      },
    },
    async (args) => toTextResult(await handlers.searchPlaces({ ...args, includedTypes: args.includedTypes ?? ["restaurant"] })),
  );

  server.registerTool(
    "places_detail",
    {
      title: "Get Google Place Detail",
      description:
        "Look up one Google place by Place ID. Returns hours, delivery/dine-in flags, and other detail fields. Set includeAtmosphere=true to also fetch editorialSummary and reviews (higher pricing tier).",
      inputSchema: {
        placeId: z.string().min(1).describe("Google Place ID returned by places_search."),
        includeAtmosphere: z.boolean().optional().describe("Fetch editorialSummary and reviews. Defaults to false."),
        dryRun: z.boolean().optional().describe("Use sample data without calling Google."),
      },
    },
    async (args) => toTextResult(await handlers.getPlaceDetail(args)),
  );

  server.registerTool(
    "census_area_profile",
    {
      title: "Resolve US Place to Population, Area Tier, and Multiplier Base",
      description:
        "Look up a US city/town/CDP via the Census geocoder, then fetch its total population from the ACS 5-year estimate. Returns: total population, area tier (major_metro / mid_metro / small_or_rural matching the adv_estimate multiplier table), row-scaling tier and target (matching the Restaurant Research Agent's row-scaling formula max(pop/250, floor)), county FIPS for usaspending_award_search, state FIPS, place FIPS, and the high-cost-of-living-state flag for CA/NY/MA/WA/HI. Use this BEFORE adv_estimate when sizing an enforcement universe or running a restaurant research workflow against an unfamiliar city. Free Census API; no key required for basic queries.",
      inputSchema: {
        city: z.string().optional().describe("US city / town / place name. Pair with `state`. Example: 'Hillsdale'."),
        state: z.string().optional().describe("USPS two-letter state code. Pair with `city`. Example: 'MI'."),
        placeFips: z.string().optional().describe("Direct Census place FIPS. Pair with `stateFips` to skip the geocoder entirely."),
        stateFips: z.string().optional().describe("Direct Census state FIPS (e.g. '26' for Michigan). Pair with `placeFips`."),
        acsYear: z.number().int().min(2010).max(2030).optional().describe("ACS 5-year vintage to query. Defaults to 2022."),
        dryRun: z.boolean().optional().describe("Return a sample Hillsdale, MI profile without calling the Census API."),
      },
    },
    async (args) => toTextResult(await handlers.getCensusAreaProfile(args)),
  );

  server.registerTool(
    "business_entity_search",
    {
      title: "Search State Business Registration via OpenCorporates",
      description:
        "Search Secretary of State / DFI business registrations via OpenCorporates (sourced directly from official state registries; data lineage is auditable). Use to map a trade name to its legal entity, identify the registered agent for service of process, find related entities under common ownership, or confirm an establishment is an active legal entity. Free tier is ~50 lookups/day with attribution; higher volume requires an OPENCORPORATES_API_KEY env var. For US states, pass the two-letter state code (MI, IL, etc.) as `jurisdictionCode` and it auto-prefixes to OpenCorporates' `us_xx` format. Returns name, company number, status, type, incorporation date, registered address, previous names, and an opencorporates_url for source-tracing.",
      inputSchema: {
        query: z.string().min(1).describe("Entity name (or partial name) to search. Required."),
        jurisdictionCode: z
          .string()
          .optional()
          .describe("Two-letter US state code (MI, IL, OH, etc.) or full OpenCorporates code (us_mi). When omitted, searches all jurisdictions globally — narrow this for restaurant/labor research where state matters."),
        currentStatus: z
          .string()
          .optional()
          .describe("Filter by entity status. Common values vary by state: Active, Dissolved, Withdrawn, Revoked, Forfeited, Inactive, Inactive - Dissolved."),
        companyType: z.string().optional().describe("Filter by company type, e.g. 'Limited Liability Company', 'Domestic For-Profit Corporation', 'Cooperative Association'."),
        inactive: z.boolean().optional().describe("Set true to include only inactive entities, false for only active. Omit for both."),
        incorporationDateFrom: z.string().optional().describe("Lower bound for incorporation_date in YYYY-MM-DD form."),
        incorporationDateTo: z.string().optional().describe("Upper bound for incorporation_date in YYYY-MM-DD form."),
        maxResults: z.number().int().min(1).max(100).optional().describe("Maximum companies to return per page. OpenCorporates caps at 100."),
        dryRun: z.boolean().optional().describe("Return sample companies without calling OpenCorporates. Useful when no API key is configured or for offline testing."),
      },
    },
    async (args) => toTextResult(await handlers.searchBusinessEntity(args)),
  );

  server.registerTool(
    "business_entity_detail",
    {
      title: "Get Business Entity Detail via OpenCorporates",
      description:
        "Look up one entity by jurisdiction + state company number via OpenCorporates. Use after `business_entity_search` to get the full canonical record (full address, previous names, branch info, dissolution date, registry URL). Free with attribution.",
      inputSchema: {
        jurisdictionCode: z.string().min(1).describe("Two-letter US state code (e.g., MI) or full OpenCorporates code (us_mi)."),
        companyNumber: z.string().min(1).describe("State-issued company / entity / charter number."),
        dryRun: z.boolean().optional().describe("Return sample data without calling OpenCorporates."),
      },
    },
    async (args) => toTextResult(await handlers.getBusinessEntity(args)),
  );

  server.registerTool(
    "adv_estimate",
    {
      title: "Estimate Annual Dollar Volume (ADV) and FLSA $500K Coverage Flag",
      description:
        "Deterministic ADV screening calculator for FLSA enterprise-coverage triage. Encodes Methods 1-4 (per-employee, capacity-derived, chain per-unit, format default), the geographic multiplier, ±40% range math, and the $500,000 FLSA flag (Above / Below / Borderline / Insufficient Data). NOT a coverage determination — screening signal only. Method selection priority: chain per-unit ADV > employee count > capacity input > format default. Method 2 capacity input priority (highest first): seatCount > occupantLoad (×0.85 → seats) > squareFootage (BOH subtract + IBC 15-sqft-per-occupant + ×0.85) > parkingSpaces (× format-typical seats-per-space). Always pass capacitySource so the audit trail records where the number came from. Best practice: read employeeCount from osha_inspection_search results and pass it in here when an OSHA inspection record exists for the establishment (employee_count is a required OSHA field). Returns separate columns for estimate, range, method, capacity_input, capacity_source, flsa_flag, confidence, and a derivation-chain notes string.",
      inputSchema: {
        serviceType: z
          .enum(["LSR", "FSR", "Unclear"])
          .optional()
          .describe("Service type. Required for Method 1 per-employee benchmarks; also drives default BOH ratio for square-footage derivation (FSR=30%, LSR=40%, Unclear=35%). Defaults to Unclear if omitted."),
        format: z
          .string()
          .optional()
          .describe("Restaurant format, optionally with cuisine qualifier (e.g. 'Casual dining — Italian', 'Pizzeria', 'Fast food'). Lead term is normalized; cuisine after em-dash is ignored for benchmarks. Required for Methods 2 and 4."),
        chainFlag: z
          .enum(["Yes", "No", "Unknown"])
          .optional()
          .describe("Whether the establishment is part of a multi-location brand. Drives Method 3 selection and adds the enterprise-coverage caveat to notes when Yes."),
        employeeCount: z.number().positive().optional().describe("Total employees at the single establishment. Triggers Method 1 (per-employee). Look in osha_inspection_search results first — OSHA records always include employee count."),
        listPageEmployeeData: z
          .boolean()
          .optional()
          .describe("Set true when employeeCount came from a list/aggregator page rather than a direct profile or OSHA record. Caps Method 1 confidence at Low."),
        seatCount: z
          .number()
          .positive()
          .optional()
          .describe("Direct dining seat count. Highest-confidence Method 2 capacity input. Sources: published menu, OpenTable / Resy / Tock inventory, owner interviews, news articles. Confidence: Medium."),
        occupantLoad: z
          .number()
          .positive()
          .optional()
          .describe("Posted maximum occupant load from Certificate of Occupancy, fire marshal permit, or ABC license. Tool applies 0.85 conversion to seated capacity (accounts for staff, BOH, standing). Used only when seatCount is absent. Confidence: Medium."),
        squareFootage: z
          .number()
          .positive()
          .optional()
          .describe("Total establishment square footage from county assessor, real estate listing (LoopNet/Crexi), CO, or building permit. Tool subtracts BOH (default 30% FSR / 40% LSR / 35% Unclear), divides remaining dining area by 15 sqft per occupant (IBC A-2 standard), then multiplies by 0.85 for seated capacity. Used only when seatCount and occupantLoad are absent. Confidence: Low."),
        parkingSpaces: z
          .number()
          .positive()
          .optional()
          .describe("Striped parking spaces from satellite imagery or zoning permit. Tool multiplies by format-typical seats-per-space (FSR/casual/fine 2.75; LSR/fast 2.25; bar 1.75). Last-resort capacity input — only when no other capacity data is available. Confidence: Very Low."),
        capacitySource: z
          .string()
          .optional()
          .describe("Free-text label for where the capacity number came from. Recommended values: 'assessor', 'CO', 'fire_marshal', 'ABC', 'health_permit', 'OSHA', 'OpenTable', 'Resy', 'LoopNet', 'Crexi', 'real_estate_listing', 'satellite', 'photos', 'news_article', 'owner_interview', 'zoning_permit', 'format_default'. Echoed in the notes field for audit."),
        bohRatio: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Override the default back-of-house fraction (0.30 FSR / 0.40 LSR / 0.35 Unclear) for square-footage derivation. Use when you have a verified BOH split."),
        parkingRatio: z
          .number()
          .positive()
          .optional()
          .describe("Override the default seats-per-parking-space ratio (FSR 2.75, LSR 2.25, bar 1.75). Use only when local zoning specifies a different ratio."),
        chainPerUnitAdv: z
          .number()
          .positive()
          .optional()
          .describe("Brand-reported per-unit annual sales (from Franchise Disclosure Document or industry report). Triggers Method 3 when chainFlag is Yes; takes precedence over Methods 1 and 2."),
        areaType: z
          .enum(["major_metro", "mid_metro", "small_or_rural"])
          .optional()
          .describe("Area tier for the cost-of-living multiplier. major_metro = 1.20×; mid_metro = 1.00× (default); small_or_rural = 0.85×. Get this from census_area_profile."),
        highCostOfLivingState: z
          .boolean()
          .optional()
          .describe("Add +0.10 to the area multiplier for CA, NY, MA, WA, or HI. Get this from census_area_profile."),
        staleSources: z
          .boolean()
          .optional()
          .describe("Set true when the underlying source data is older than 12 months. Forces confidence to Very Low."),
      },
    },
    async (args) => toTextResult(await handlers.estimateAdv(args)),
  );

  return server;
}

async function main(): Promise<void> {
  const apiKey = loadDolApiKey();
  const samApiKey = loadSamApiKey();
  const googlePlacesApiKey = loadGooglePlacesApiKey();
  const openCorporatesApiKey = loadOpenCorporatesApiKey();
  const client = new DolApiClient({ apiKey });
  const server = createServer(client, samApiKey, googlePlacesApiKey, openCorporatesApiKey);
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
