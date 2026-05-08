import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAward, sampleAwards, UsaSpendingClient } from "../src/usaspending.js";

test("returns dry-run sample awards without making any HTTP request", async () => {
  let calls = 0;
  const client = new UsaSpendingClient({
    fetchFn: async () => {
      calls += 1;
      throw new Error("should not call USAspending during dry run");
    },
  });

  const result = await client.search({ dryRun: true, maxResults: 2 });

  assert.equal(calls, 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.count, 2);
  assert.equal(result.awards[0].recipientName, sampleAwards()[0].recipientName);
});

test("posts a filter body with NAICS, POP city, and award-amount bounds", async () => {
  const captured: Array<{ url: string; body: unknown }> = [];
  const client = new UsaSpendingClient({
    now: () => new Date("2026-05-08T12:00:00Z"),
    fetchFn: async (url, init) => {
      captured.push({ url: url.toString(), body: init?.body ? JSON.parse(init.body as string) : null });
      return new Response(
        JSON.stringify({
          results: [
            {
              "Award ID": "W912DQ24C0001",
              generated_internal_id: "CONT_AWD_W912DQ24C0001_USAGOV",
              "Recipient Name": "ACME CONSTRUCTION LLC",
              "Award Amount": "12500000.00",
              "Awarding Agency": "DEPT OF DEFENSE",
              "Awarding Sub Agency": "DEPT OF THE ARMY",
              "Start Date": "2024-01-15",
              "End Date": "2026-12-31",
              "Description": "VA Lansing Outpatient Renovation",
              naics_code: "236220",
              naics_description: "Commercial and Institutional Building Construction",
              "Place of Performance City Code": "LANSING",
              "Place of Performance State Code": "MI",
              "Place of Performance Country Code": "USA",
            },
          ],
          page_metadata: { hasNext: false, page: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.search({
    naicsCodes: ["236", "237"],
    placeOfPerformanceState: "MI",
    placeOfPerformanceCity: "Lansing",
    placeOfPerformanceCountyFips: "065",
    awardAmountMin: 5000000,
    fiscalYear: 2025,
    maxResults: 25,
  });

  assert.equal(captured.length, 1);
  const body = captured[0].body as Record<string, unknown>;
  assert.equal(body.subawards, false);
  assert.equal(body.page, 1);
  assert.equal(body.limit, 25);
  assert.equal(body.sort, "Award Amount");
  assert.equal(body.order, "desc");

  const filters = body.filters as Record<string, unknown>;
  assert.deepEqual(filters.award_type_codes, ["A", "B", "C", "D"]);
  assert.deepEqual(filters.time_period, [{ start_date: "2024-10-01", end_date: "2025-09-30" }]);
  assert.deepEqual(filters.naics_codes, { require: [["236"], ["237"]] });
  assert.deepEqual(filters.award_amounts, [{ lower_bound: 5000000 }]);
  assert.deepEqual(filters.place_of_performance_locations, [
    { country: "USA", state: "MI", city: "LANSING", county: "065" },
  ]);

  assert.equal(result.count, 1);
  assert.equal(result.awards[0].awardAmount, 12500000);
  assert.equal(result.awards[0].usaSpendingUrl, "https://www.usaspending.gov/award/CONT_AWD_W912DQ24C0001_USAGOV");
  assert.equal(result.awards[0].naicsCode, "236220");
  assert.equal(result.awards[0].performanceCity, "LANSING");
});

test("paginates until maxResults is reached or hasNext is false", async () => {
  const requestedPages: number[] = [];
  const client = new UsaSpendingClient({
    now: () => new Date("2026-05-08T12:00:00Z"),
    fetchFn: async (_url, init) => {
      const body = JSON.parse(init?.body as string) as { page: number; limit: number };
      requestedPages.push(body.page);
      const remaining = body.page <= 2;
      return new Response(
        JSON.stringify({
          results: Array.from({ length: 3 }, (_, idx) => ({
            "Award ID": `award-p${body.page}-${idx}`,
            generated_internal_id: `gen-${body.page}-${idx}`,
            "Award Amount": 1000000 + idx,
            "Place of Performance State Code": "MI",
          })),
          page_metadata: { hasNext: remaining, page: body.page },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.search({ maxResults: 7 });

  assert.deepEqual(requestedPages, [1, 2, 3]);
  assert.equal(result.awards.length, 7);
  assert.equal(result.requestCount, 3);
});

test("normalizeAward tolerates loose number and date formats", () => {
  const award = normalizeAward({
    "Award ID": "P123",
    generated_internal_id: "GEN-P123",
    "Award Amount": "  4250000.50  ",
    "Start Date": "2025-01-15 00:00:00",
    "Recipient Name": "  ",
    naics_code: 236220,
  });

  assert.equal(award.awardAmount, 4250000.5);
  assert.equal(award.startDate, "2025-01-15");
  assert.equal(award.recipientName, null);
  assert.equal(award.naicsCode, "236220");
  assert.equal(award.usaSpendingUrl, "https://www.usaspending.gov/award/GEN-P123");
});

test("surfaces non-2xx HTTP errors with status and snippet", async () => {
  const client = new UsaSpendingClient({
    fetchFn: async () =>
      new Response("rate limited, please retry later", {
        status: 429,
        statusText: "Too Many Requests",
      }),
  });

  await assert.rejects(
    () => client.search({ maxResults: 1 }),
    /USAspending request failed \(429 Too Many Requests\): rate limited/,
  );
});
