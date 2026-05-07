import assert from "node:assert/strict";
import test from "node:test";

import { createOshaInspectionFilter, OshaInspectionClient } from "../src/osha.js";

test("builds OSHA inspection filters from search inputs", () => {
  assert.deepEqual(
    createOshaInspectionFilter({
      companyName: "walmart",
      state: "tx",
      city: "houston",
      naicsCode: "23",
      inspectionType: "a",
      safetyHealth: "s",
      dateFrom: "2024-01-01",
      dateTo: "2024-12-31",
    }),
    {
      and: [
        { field: "estab_name", operator: "like", value: "%WALMART%" },
        { field: "site_state", operator: "eq", value: "TX" },
        { field: "site_city", operator: "like", value: "%HOUSTON%" },
        { field: "naics_code", operator: "like", value: "23%" },
        { field: "insp_type", operator: "eq", value: "A" },
        { field: "safety_hlth", operator: "eq", value: "S" },
        { field: "open_date", operator: "gt", value: "2024-01-01" },
        { field: "open_date", operator: "lt", value: "2024-12-31" },
      ],
    },
  );
});

test("searches OSHA inspections and joins non-deleted violations", async () => {
  const calls: Array<{ agency: string; endpoint: string; query: Record<string, unknown> }> = [];
  const client = new OshaInspectionClient({
    getDatasetRecords: async (agency, endpoint, query) => {
      calls.push({ agency, endpoint, query });
      if (endpoint === "inspection") {
        return [
          {
            activity_nr: "1685394",
            estab_name: "WALMART STORES INC",
            site_address: "1234 MAIN STREET",
            site_city: "HOUSTON",
            site_state: "TX",
            site_zip: "77001",
            safety_hlth: "S",
            naics_code: "452210",
            sic_code: "5311",
            insp_type: "B",
            insp_scope: "A",
            union_status: "N",
            nr_in_estab: "245",
            open_date: "20240915",
            close_conf_date: "20241001",
            close_case_date: "20241210",
          },
        ];
      }
      return [
        {
          activity_nr: "1685394",
          citation_id: "0101001",
          standard: "19101037 A01",
          viol_type: "S",
          issuance_date: "20241120",
          abate_date: "20250115",
          abate_complete: "X",
          current_penalty: "16131",
          initial_penalty: "16131",
          contest_date: "",
          final_order_date: "20241215",
          nr_instances: "1",
          nr_exposed: "12",
          gravity: "10",
        },
        {
          activity_nr: "1685394",
          citation_id: "0101002",
          delete_flag: "X",
          current_penalty: "500",
        },
      ];
    },
    getDatasetMetadata: async () => [],
    buildDatasetUrl: () => new URL("https://example.test/"),
    sanitizeUrl: (url) => url.toString(),
  });

  const result = await client.search({
    companyName: "walmart",
    state: "tx",
    includeViolations: true,
    maxResults: 10,
  });

  assert.equal(result.dataset, "OSHA/inspection");
  assert.equal(result.count, 1);
  assert.equal(result.violationRequestCount, 1);
  assert.equal(calls[0].agency, "OSHA");
  assert.equal(calls[0].endpoint, "inspection");
  assert.equal(calls[1].endpoint, "violation");
  assert.deepEqual(calls[1].query.filterObject, { field: "activity_nr", operator: "in", value: [1685394] });
  assert.deepEqual(result.inspections[0], {
    activityNumber: 1685394,
    establishmentName: "WALMART STORES INC",
    siteAddress: "1234 MAIN STREET",
    siteCity: "HOUSTON",
    siteState: "TX",
    siteZip: "77001",
    safetyOrHealth: "Safety",
    naicsCode: "452210",
    sicCode: "5311",
    inspectionType: "B",
    inspectionTypeDescription: "Complaint",
    inspectionScope: "A",
    inspectionScopeDescription: "Comprehensive",
    unionStatus: "N",
    employeesAtSite: 245,
    openDate: "2024-09-15",
    closeConferenceDate: "2024-10-01",
    closeCaseDate: "2024-12-10",
    violations: [
      {
        citationId: "0101001",
        standard: "19101037 A01",
        violationType: "S",
        violationTypeDescription: "Serious",
        issuanceDate: "2024-11-20",
        abateDate: "2025-01-15",
        abateComplete: "X",
        currentPenalty: 16131,
        initialPenalty: 16131,
        contested: false,
        finalOrderDate: "2024-12-15",
        instances: 1,
        workersExposed: 12,
        gravity: 10,
      },
    ],
    violationCount: 1,
    totalPenalties: 16131,
  });
});

test("returns inspection records without fetching violations when disabled", async () => {
  const endpoints: string[] = [];
  const client = new OshaInspectionClient({
    getDatasetRecords: async (_agency, endpoint) => {
      endpoints.push(endpoint);
      return endpoint === "inspection" ? [{ activity_nr: "1", estab_name: "ACME", insp_type: "H" }] : [];
    },
    getDatasetMetadata: async () => [],
    buildDatasetUrl: () => new URL("https://example.test/"),
    sanitizeUrl: (url) => url.toString(),
  });

  const result = await client.search({ includeViolations: false, maxResults: 1 });

  assert.deepEqual(endpoints, ["inspection"]);
  assert.equal(result.inspections[0].inspectionTypeDescription, "Planned");
  assert.equal(result.inspections[0].violations, null);
  assert.equal(result.inspections[0].violationCount, 0);
  assert.equal(result.inspections[0].totalPenalties, 0);
});

test("looks up OSHA inspection details with in filters for DOL activity number stability", async () => {
  const calls: Array<{ endpoint: string; query: Record<string, unknown> }> = [];
  const client = new OshaInspectionClient({
    getDatasetRecords: async (_agency, endpoint, query) => {
      calls.push({ endpoint, query });
      return endpoint === "inspection" ? [{ activity_nr: "348759044", estab_name: "WALMART" }] : [];
    },
    getDatasetMetadata: async () => [],
    buildDatasetUrl: () => new URL("https://example.test/"),
    sanitizeUrl: (url) => url.toString(),
  });

  const result = await client.detail({ activityNumber: 348759044, includeViolations: true });

  assert.equal(result.count, 1);
  assert.deepEqual(calls[0].query.filterObject, { field: "activity_nr", operator: "in", value: [348759044] });
  assert.deepEqual(calls[1].query.filterObject, { field: "activity_nr", operator: "in", value: [348759044] });
});
