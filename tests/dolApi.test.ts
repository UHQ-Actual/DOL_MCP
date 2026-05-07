import assert from "node:assert/strict";
import test from "node:test";

import {
  DolApiClient,
  createCaseIdFilter,
  normalizeEnforcementQuery,
  redactSecret,
} from "../src/dolApi.js";

test("builds a WHD enforcement URL with paging, fields, sort, and filter_object", () => {
  const client = new DolApiClient({ apiKey: "secret-key" });
  const query = normalizeEnforcementQuery({
    limit: 25,
    offset: 50,
    fields: ["case_id", "trade_nm"],
    sort: "desc",
    sortBy: "bw_atp_amt",
    filterObject: { field: "st_cd", operator: "eq", value: "IA" },
  });

  const url = client.buildEnforcementUrl(query);
  assert.equal(url.pathname, "/v4/get/WHD/enforcement/json");
  assert.equal(url.searchParams.get("limit"), "25");
  assert.equal(url.searchParams.get("offset"), "50");
  assert.equal(url.searchParams.get("fields"), "case_id,trade_nm");
  assert.equal(url.searchParams.get("sort"), "desc");
  assert.equal(url.searchParams.get("sort_by"), "bw_atp_amt");
  assert.deepEqual(JSON.parse(url.searchParams.get("filter_object") ?? "{}"), {
    field: "st_cd",
    operator: "eq",
    value: "IA",
  });
  assert.equal(url.searchParams.get("X-API-KEY"), "secret-key");
  assert.equal(client.sanitizeUrl(url).includes("secret-key"), false);
});

test("normalizes limits to DOL API bounds and omits empty optional parameters", () => {
  const query = normalizeEnforcementQuery({
    limit: 25000,
    offset: -12,
    fields: [],
    sort: undefined,
  });

  assert.equal(query.limit, 10000);
  assert.equal(query.offset, 0);
  assert.equal(query.fields, undefined);
  assert.equal(query.sort, undefined);
});

test("fetches records from DOL data array responses", async () => {
  const client = new DolApiClient({
    apiKey: "secret-key",
    fetchFn: async () =>
      new Response(JSON.stringify({ data: [{ case_id: 123, trade_nm: "Example" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  const rows = await client.getEnforcementRecords({ limit: 1 });
  assert.deepEqual(rows, [{ case_id: 123, trade_nm: "Example" }]);
});

test("retries transient DOL API failures before returning data", async () => {
  let attempts = 0;
  const client = new DolApiClient({
    apiKey: "secret-key",
    sleepFn: async () => undefined,
    fetchFn: async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("rate limited", { status: 429 });
      }
      return new Response(JSON.stringify({ data: [{ case_id: 456 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const rows = await client.getEnforcementRecords({ limit: 1 });

  assert.equal(attempts, 2);
  assert.deepEqual(rows, [{ case_id: 456 }]);
});

test("builds datasets URL with a limit so local filtering can see beyond the first page", () => {
  const client = new DolApiClient({ apiKey: "secret-key" });

  const url = client.buildDatasetsUrl({ search: "WHD", agency: "WHD", limit: 100 });

  assert.equal(url.pathname, "/v4/datasets");
  assert.equal(url.searchParams.get("limit"), "100");
});

test("searches datasets using a broad catalog fetch while preserving output limit", async () => {
  let requestedLimit: string | null = null;
  const client = new DolApiClient({
    apiKey: "secret-key",
    fetchFn: async (input) => {
      const url = new URL(input.toString());
      requestedLimit = url.searchParams.get("limit");
      return new Response(
        JSON.stringify([
          { id: 1, name: "Other" },
          { id: 10246, name: "Enforcement", tablename: "WHD_enforcement", agency: { abbr: "WHD" } },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const datasets = await client.getDatasets({ search: "WHD_enforcement", agency: "WHD", limit: 1 });

  assert.equal(requestedLimit, "500");
  assert.deepEqual(datasets, [
    { id: 10246, name: "Enforcement", tablename: "WHD_enforcement", agency: { abbr: "WHD" } },
  ]);
});

test("redacts API keys from HTTP errors", async () => {
  const client = new DolApiClient({
    apiKey: "secret-key",
    fetchFn: async () => new Response("bad secret-key", { status: 403 }),
  });

  await assert.rejects(
    () => client.getEnforcementRecords({ limit: 1 }),
    (error) => {
      assert(error instanceof Error);
      assert.equal(error.message.includes("secret-key"), false);
      assert.equal(error.message.includes("X-API-KEY=<redacted>"), true);
      return true;
    },
  );
});

test("creates a case_id equality filter", () => {
  assert.deepEqual(createCaseIdFilter(1813827), {
    field: "case_id",
    operator: "eq",
    value: 1813827,
  });
});

test("redacts arbitrary secret occurrences in text", () => {
  assert.equal(redactSecret("prefix secret-key suffix", "secret-key"), "prefix <redacted> suffix");
});
