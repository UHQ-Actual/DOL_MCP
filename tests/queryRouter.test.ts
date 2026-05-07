import assert from "node:assert/strict";
import test from "node:test";

import { answerGovernmentDataQuestion, planGovernmentDataQuestion, type GovernmentDataRouterHandlers } from "../src/queryRouter.js";

test("routes OSHA questions to inspection search with extracted company and state", async () => {
  const calls: unknown[] = [];
  const handlers = fakeHandlers({
    searchOshaInspections: async (input) => {
      calls.push(input);
      return { dataset: "OSHA/inspection", count: 0, inspections: [] };
    },
  });

  const result = await answerGovernmentDataQuestion(
    { question: "Show OSHA inspections and citations for Walmart in TX", maxResults: 7 },
    handlers,
  );

  assert.equal(result.route, "osha_inspections");
  assert.deepEqual(calls, [
    {
      companyName: "Walmart",
      state: "TX",
      includeViolations: true,
      maxResults: 7,
    },
  ]);
});

test("routes SAM.gov opportunity questions with keywords, NAICS, and state", async () => {
  const plan = planGovernmentDataQuestion({
    question: "Find cybersecurity solicitations NAICS 541512 in Virginia",
    maxResults: 12,
    dryRun: true,
  });

  assert.equal(plan.route, "sam_opportunities");
  assert.deepEqual(plan.parameters, {
    keywords: "cybersecurity",
    naicsCodes: ["541512"],
    state: "VA",
    maxResults: 12,
    dryRun: true,
  });
});

test("routes foreign labor questions to unified disclosure search", async () => {
  const calls: unknown[] = [];
  const handlers = fakeHandlers({
    searchForeignLabor: async (input) => {
      calls.push(input);
      return { program: "H-2A", matched: 0, records: [] };
    },
  });

  const result = await answerGovernmentDataQuestion(
    { question: "H-2A certified farm jobs in IA SOC 45-2092 over $20 hourly", maxResults: 3 },
    handlers,
  );

  assert.equal(result.route, "foreign_labor");
  assert.deepEqual(calls, [
    {
      visaProgram: "H-2A",
      worksiteState: "IA",
      socCode: "45-2092",
      caseStatus: "Certified",
      minAnnualWage: 41600,
      maxItems: 3,
    },
  ]);
});

test("routes WHD wage questions to enforcement search with a DOL filter object", async () => {
  const calls: unknown[] = [];
  const handlers = fakeHandlers({
    queryEnforcement: async (input) => {
      calls.push(input);
      return { dataset: "WHD/enforcement", count: 0, rows: [] };
    },
  });

  const result = await answerGovernmentDataQuestion(
    { question: "WHD back wage cases for Chipotle in California", maxResults: 5 },
    handlers,
  );

  assert.equal(result.route, "whd_enforcement");
  assert.deepEqual(calls, [
    {
      limit: 5,
      fields: [
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
      ],
      sort: "desc",
      sortBy: "bw_atp_amt",
      filterObject: {
        and: [
          {
            or: [
              { field: "trade_nm", operator: "like", value: "%CHIPOTLE%" },
              { field: "legal_name", operator: "like", value: "%CHIPOTLE%" },
            ],
          },
          { field: "st_cd", operator: "eq", value: "CA" },
        ],
      },
    },
  ]);
});

function fakeHandlers(overrides: Partial<GovernmentDataRouterHandlers> = {}): GovernmentDataRouterHandlers {
  return {
    queryEnforcement: async () => ({}),
    searchOshaInspections: async () => ({}),
    searchForeignLabor: async () => ({}),
    searchSamOpportunities: async () => ({}),
    ...overrides,
  };
}
