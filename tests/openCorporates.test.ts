import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCompany,
  normalizeJurisdiction,
  OpenCorporatesClient,
  sampleCompanies,
} from "../src/openCorporates.js";

test("returns dry-run sample companies without calling OpenCorporates", async () => {
  let calls = 0;
  const client = new OpenCorporatesClient({
    fetchFn: async () => {
      calls += 1;
      throw new Error("should not call OpenCorporates during dry run");
    },
  });

  const result = await client.search({ query: "Acme", dryRun: true, maxResults: 2 });

  assert.equal(calls, 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.count, 2);
  assert.equal(result.companies[0].name, sampleCompanies()[0].name);
  assert.match(result.attribution, /OpenCorporates/);
});

test("normalizeJurisdiction converts state codes to us_xx and accepts full codes", () => {
  assert.equal(normalizeJurisdiction("MI"), "us_mi");
  assert.equal(normalizeJurisdiction("us_mi"), "us_mi");
  assert.equal(normalizeJurisdiction("us-mi"), "us_mi");
  assert.equal(normalizeJurisdiction("ca"), "us_ca");
  assert.equal(normalizeJurisdiction("gb"), "us_gb"); // 2-letter is auto-us-prefixed; agents must pass full codes for non-US
});

test("builds a search URL with q, jurisdiction_code, per_page, and api_token", async () => {
  const requestedUrls: URL[] = [];
  const client = new OpenCorporatesClient({
    apiKey: "test-token",
    fetchFn: async (input) => {
      requestedUrls.push(new URL(input.toString()));
      return new Response(
        JSON.stringify({
          api_version: "0.4",
          results: {
            companies: [
              {
                company: {
                  name: "ACME RESTAURANT GROUP, LLC",
                  company_number: "8021234567",
                  jurisdiction_code: "us_mi",
                  current_status: "Active",
                  incorporation_date: "2018-04-12",
                  registered_address_in_full: "123 Main St, Lansing, MI 48912",
                  opencorporates_url: "https://opencorporates.com/companies/us_mi/8021234567",
                },
              },
            ],
            page: 1,
            per_page: 30,
            total_count: 1,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.search({
    query: "Acme Restaurant",
    jurisdictionCode: "MI",
    currentStatus: "Active",
    maxResults: 30,
  });

  assert.equal(requestedUrls.length, 1);
  assert.equal(requestedUrls[0].pathname, "/v0.4/companies/search");
  assert.equal(requestedUrls[0].searchParams.get("q"), "Acme Restaurant");
  assert.equal(requestedUrls[0].searchParams.get("jurisdiction_code"), "us_mi");
  assert.equal(requestedUrls[0].searchParams.get("current_status"), "Active");
  assert.equal(requestedUrls[0].searchParams.get("per_page"), "30");
  assert.equal(requestedUrls[0].searchParams.get("api_token"), "test-token");
  assert.equal(result.count, 1);
  assert.equal(result.companies[0].name, "ACME RESTAURANT GROUP, LLC");
  assert.equal(result.companies[0].jurisdictionCode, "us_mi");
});

test("requires a query string for search", async () => {
  const client = new OpenCorporatesClient({
    fetchFn: async () => new Response("{}", { status: 200 }),
  });

  await assert.rejects(() => client.search({}), /OpenCorporates search requires a `query` string/);
});

test("hits /companies/:jurisdiction/:number for detail lookups", async () => {
  const requestedUrls: URL[] = [];
  const client = new OpenCorporatesClient({
    apiKey: "test-token",
    fetchFn: async (input) => {
      requestedUrls.push(new URL(input.toString()));
      return new Response(
        JSON.stringify({
          results: {
            company: {
              name: "MIDWEST HOSPITALITY HOLDINGS, INC.",
              company_number: "0001234567",
              jurisdiction_code: "us_oh",
              current_status: "Active",
              incorporation_date: "2015-09-30",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.detail({ jurisdictionCode: "OH", companyNumber: "0001234567" });

  assert.equal(requestedUrls[0].pathname, "/v0.4/companies/us_oh/0001234567");
  assert.equal(result.companies[0].companyNumber, "0001234567");
});

test("redacts api_token in error messages on non-2xx responses", async () => {
  const client = new OpenCorporatesClient({
    apiKey: "secret-token-123",
    fetchFn: async () =>
      new Response("Quota exceeded", {
        status: 401,
        statusText: "Unauthorized",
      }),
  });

  await assert.rejects(
    () => client.search({ query: "Acme", jurisdictionCode: "MI" }),
    (error: Error) => {
      assert.match(error.message, /OpenCorporates request failed \(401 Unauthorized\)/);
      assert.doesNotMatch(error.message, /secret-token-123/, "api_token must be redacted");
      assert.match(error.message, /<redacted>/);
      return true;
    },
  );
});

test("normalizeCompany extracts previous names array and synthesizes opencorporates URL", () => {
  const company = normalizeCompany({
    name: "FARMHAND LLC",
    company_number: "F123456",
    jurisdiction_code: "us_ia",
    current_status: "Active",
    previous_names: [
      { company_name: "FARM HAND COOPERATIVE" },
      { company_name: "IA FARMS COOP" },
    ],
  });

  assert.deepEqual(company.previousNames, ["FARM HAND COOPERATIVE", "IA FARMS COOP"]);
  assert.equal(company.openCorporatesUrl, "https://opencorporates.com/companies/us_ia/F123456");
});
