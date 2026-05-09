import {
  createCaseIdFilter,
  DatasetSearchInput,
  DolApiClient,
  EnforcementQueryInput,
  normalizeEnforcementQuery,
} from "./dolApi.js";
import { ForeignLaborDisclosureClient, ForeignLaborFileInput, ForeignLaborSearchInput } from "./foreignLabor.js";
import { LcaDisclosureClient, LcaFileInput, LcaProfileInput, LcaSearchInput } from "./lca.js";
import { OshaFieldsInput, OshaInspectionClient, OshaInspectionDetailInput, OshaInspectionSearchInput } from "./osha.js";
import { GooglePlacesClient, PlacesDetailInput, PlacesSearchInput } from "./places.js";
import { SamGovClient, SamOpportunityDetailInput, SamOpportunitySearchInput } from "./sam.js";
import { UsaSpendingAwardSearchInput, UsaSpendingClient } from "./usaspending.js";
import { AdvEstimateInput, estimateAdv } from "./adv.js";
import { CensusAreaProfileInput, CensusClient } from "./census.js";
import {
  OpenCorporatesClient,
  OpenCorporatesDetailInput,
  OpenCorporatesSearchInput,
} from "./openCorporates.js";

export interface MetadataInput {
  search?: string;
  category?: string;
  limit?: number;
}

export interface CaseLookupInput {
  case_id: string | number;
  fields?: string[] | string;
}

export function createToolHandlers(
  client: DolApiClient,
  lcaClient = new LcaDisclosureClient(),
  oshaClient = new OshaInspectionClient(client),
  samClient = new SamGovClient(),
  foreignLaborClient = new ForeignLaborDisclosureClient(),
  placesClient = new GooglePlacesClient(),
  usaSpendingClient = new UsaSpendingClient(),
  censusClient = new CensusClient(),
  openCorporatesClient = new OpenCorporatesClient(),
) {
  return {
    queryEnforcement: async (input: EnforcementQueryInput = {}) => {
      const query = normalizeEnforcementQuery(input);
      const rows = await client.getEnforcementRecords(query);
      return {
        dataset: "WHD/enforcement",
        count: rows.length,
        request_url: client.sanitizeUrl(client.buildEnforcementUrl(query)),
        rows,
      };
    },

    getCaseById: async (input: CaseLookupInput) => {
      const query = normalizeEnforcementQuery({
        limit: 10,
        fields: input.fields,
        filterObject: createCaseIdFilter(input.case_id),
      });
      const rows = await client.getEnforcementRecords(query);
      return {
        dataset: "WHD/enforcement",
        case_id: input.case_id,
        count: rows.length,
        request_url: client.sanitizeUrl(client.buildEnforcementUrl(query)),
        rows,
      };
    },

    getMetadata: async (input: MetadataInput = {}) => {
      const metadata = filterMetadata(await client.getEnforcementMetadata(), input);
      return {
        dataset: "WHD/enforcement",
        count: metadata.length,
        fields: metadata,
      };
    },

    listFields: async (input: MetadataInput = {}) => {
      const metadata = filterMetadata(await client.getEnforcementMetadata(), input);
      return {
        dataset: "WHD/enforcement",
        count: metadata.length,
        fields: metadata.map((field) => ({
          short_name: field.short_name,
          full_name: field.full_name,
          description: field.variable_description,
          category: field.variable_category,
          datatype: field.intended_datatype,
          unit: field.unit_of_measure,
        })),
      };
    },

    searchDatasets: async (input: DatasetSearchInput = {}) => {
      const datasets = await client.getDatasets(input);
      return {
        count: datasets.length,
        datasets,
      };
    },

    getLcaFiles: async (input: LcaFileInput = {}) => {
      const files = await lcaClient.getFileSet(input);
      return {
        program: "LCA Programs (H-1B, H-1B1, E-3)",
        ...files,
      };
    },

    getLcaFields: async (input: LcaSearchInput = {}) => {
      const result = await lcaClient.getFields(input);
      return {
        program: "LCA Programs (H-1B, H-1B1, E-3)",
        fiscalYear: result.fileSet.fiscalYear,
        quarter: result.fileSet.quarter,
        sourceUrl: result.fileSet.disclosure,
        localFile: result.localFile.split(/[\\/]/).pop(),
        count: result.fields.length,
        fields: result.fields,
      };
    },

    searchLca: async (input: LcaSearchInput = {}) => {
      const result = await lcaClient.search(input);
      return {
        program: "LCA Programs (H-1B, H-1B1, E-3)",
        ...result,
      };
    },

    getLcaEmployerProfile: async (input: LcaProfileInput) => {
      const profile = await lcaClient.employerProfile(input);
      return {
        program: "LCA Programs (H-1B, H-1B1, E-3)",
        note: "DOL LCA-only profile. USCIS petition approval and denial rates are not included.",
        ...profile,
      };
    },

    getForeignLaborFiles: async (input: ForeignLaborFileInput = {}) => {
      return await foreignLaborClient.getFileSet(input);
    },

    getForeignLaborFields: async (input: ForeignLaborSearchInput = {}) => {
      const result = await foreignLaborClient.getFields(input);
      return {
        program: result.fileSet.program,
        fiscalYear: result.fileSet.fiscalYear,
        fiscalQuarter: result.fileSet.fiscalQuarter,
        sourceUrl: result.fileSet.disclosure,
        localFile: result.localFile.split(/[\\/]/).pop(),
        count: result.fields.length,
        fields: result.fields,
      };
    },

    searchForeignLabor: async (input: ForeignLaborSearchInput = {}) => {
      return await foreignLaborClient.search(input);
    },

    getOshaFields: async (input: OshaFieldsInput = {}) => {
      return await oshaClient.fields(input);
    },

    searchOshaInspections: async (input: OshaInspectionSearchInput = {}) => {
      return await oshaClient.search(input);
    },

    getOshaInspection: async (input: OshaInspectionDetailInput) => {
      return await oshaClient.detail(input);
    },

    searchSamOpportunities: async (input: SamOpportunitySearchInput = {}) => {
      return await samClient.search(input);
    },

    getSamOpportunity: async (input: SamOpportunityDetailInput) => {
      return await samClient.detail(input);
    },

    searchUsaSpendingAwards: async (input: UsaSpendingAwardSearchInput = {}) => {
      return await usaSpendingClient.search(input);
    },

    estimateAdv: async (input: AdvEstimateInput) => {
      return estimateAdv(input);
    },

    getCensusAreaProfile: async (input: CensusAreaProfileInput) => {
      return await censusClient.getAreaProfile(input);
    },

    searchBusinessEntity: async (input: OpenCorporatesSearchInput) => {
      return await openCorporatesClient.search(input);
    },

    getBusinessEntity: async (input: OpenCorporatesDetailInput) => {
      return await openCorporatesClient.detail(input);
    },

    searchPlaces: async (input: PlacesSearchInput) => {
      return await placesClient.search(input);
    },

    getPlaceDetail: async (input: PlacesDetailInput) => {
      return await placesClient.detail(input);
    },

    getSamReference: async () => {
      return {
        source: "SAM.gov Opportunities API",
        procurementTypes: {
          o: "Solicitation",
          k: "Combined Synopsis/Solicitation",
          r: "Sources Sought",
          p: "Presolicitation",
          a: "Award Notice",
          s: "Special Notice",
          u: "Justification & Authorization",
          g: "Sale of Surplus Property",
          i: "Intent to Bundle",
        },
        setAsideTypes: {
          SBA: "Total Small Business Set-Aside",
          SBP: "Partial Small Business Set-Aside",
          "8A": "8(a) Set-Aside",
          "8AN": "8(a) Sole Source",
          HZC: "HUBZone Set-Aside",
          HZS: "HUBZone Sole Source",
          SDVOSBC: "Service-Disabled Veteran-Owned Small Business Set-Aside",
          SDVOSBS: "Service-Disabled Veteran-Owned Small Business Sole Source",
          WOSB: "Women-Owned Small Business",
          WOSBSS: "Women-Owned Small Business Sole Source",
          EDWOSB: "Economically Disadvantaged Women-Owned Small Business",
          EDWOSBSS: "Economically Disadvantaged Women-Owned Small Business Sole Source",
          VSA: "Veteran-Owned Small Business Set-Aside",
          VSS: "Veteran-Owned Small Business Sole Source",
        },
        notes: [
          "Live SAM.gov searches require SAM_GOV_API_KEY or SAM_API_KEY in the environment or .env file.",
          "Dry-run mode returns sample opportunities without calling SAM.gov.",
          "The SAM.gov API requires postedFrom and postedTo dates in MM/dd/yyyy format.",
        ],
      };
    },
  };
}

export function toTextResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function filterMetadata(metadata: Record<string, unknown>[], input: MetadataInput): Record<string, unknown>[] {
  const search = input.search?.trim().toLowerCase();
  const category = input.category?.trim().toLowerCase();
  const limit = normalizeMetadataLimit(input.limit ?? 50);

  return metadata
    .filter((field) => {
      const matchesSearch = search ? JSON.stringify(field).toLowerCase().includes(search) : true;
      const fieldCategory = String(field.variable_category ?? "").toLowerCase();
      const matchesCategory = category ? fieldCategory === category : true;
      return matchesSearch && matchesCategory;
    })
    .slice(0, limit);
}

function normalizeMetadataLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 50;
  }
  return Math.min(500, Math.max(1, Math.trunc(limit)));
}
