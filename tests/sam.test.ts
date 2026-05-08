import assert from "node:assert/strict";
import test from "node:test";

import { createSamPostedDateRange, SamGovClient } from "../src/sam.js";

test("builds SAM.gov posted date ranges in API format", () => {
  assert.deepEqual(createSamPostedDateRange(30, new Date("2026-05-06T12:00:00Z")), {
    postedFrom: "04/06/2026",
    postedTo: "05/06/2026",
  });
});

test("returns dry-run SAM.gov sample opportunities without an API key", async () => {
  let calls = 0;
  const client = new SamGovClient({
    fetchFn: async () => {
      calls += 1;
      throw new Error("should not call SAM.gov during dry run");
    },
    now: () => new Date("2026-05-06T12:00:00Z"),
  });

  const result = await client.search({ keywords: "cybersecurity", maxResults: 2, dryRun: true });

  assert.equal(calls, 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.count, 2);
  assert.equal(result.opportunities[0].noticeId, "sample-cloud-modernization");
});

test("searches SAM.gov opportunities across NAICS codes, deduplicates, and normalizes output", async () => {
  const requestedUrls: URL[] = [];
  const client = new SamGovClient({
    apiKey: "test-key",
    now: () => new Date("2026-05-06T12:00:00Z"),
    fetchFn: async (input) => {
      const url = new URL(input.toString());
      requestedUrls.push(url);
      const ncode = url.searchParams.get("ncode");
      return new Response(
        JSON.stringify({
          totalRecords: 2,
          opportunitiesData: [
            rawOpportunity("notice-1", ncode ?? "541512"),
            rawOpportunity(ncode === "541511" ? "notice-2" : "notice-1", ncode ?? "541512"),
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.search({
    keywords: "software",
    naicsCodes: ["541512", "541511"],
    procurementTypes: ["o", "k"],
    setAsideType: "SBA",
    state: "VA",
    postedDaysAgo: 30,
    maxResults: 10,
    dryRun: false,
  });

  assert.equal(result.dryRun, false);
  assert.equal(result.count, 2);
  assert.equal(requestedUrls.length, 2);
  assert.deepEqual(requestedUrls.map((url) => url.searchParams.get("ncode")), ["541512", "541511"]);
  assert.deepEqual(requestedUrls[0].searchParams.getAll("ptype"), ["o", "k"]);
  assert.equal(requestedUrls[0].searchParams.get("title"), "software");
  assert.equal(requestedUrls[0].searchParams.get("typeOfSetAside"), "SBA");
  assert.equal(requestedUrls[0].searchParams.get("state"), "VA");
  assert.equal(requestedUrls[0].searchParams.get("postedFrom"), "04/06/2026");
  assert.deepEqual(
    result.opportunities.map((opportunity) => opportunity.noticeId),
    ["notice-1", "notice-2"],
  );
  assert.deepEqual(result.opportunities[0], {
    noticeId: "notice-1",
    title: "Enterprise Cloud Migration",
    solicitationNumber: "W912DQ-24-R-0042",
    procurementType: "Solicitation",
    postedDate: "2026-05-01",
    responseDeadline: "2026-06-01",
    naicsCode: "541512",
    classificationCode: "D316",
    active: true,
    setAsideType: "SBA",
    setAsideDescription: "Total Small Business Set-Aside",
    agency: "DEPT OF DEFENSE",
    subAgency: "DEPT OF THE ARMY",
    office: "ARMY CONTRACTING COMMAND",
    contactName: "Jane Smith",
    contactEmail: "jane.smith@example.mil",
    contactPhone: "555-123-4567",
    performanceCity: "Arlington",
    performanceState: "VA",
    awardAmount: "12345.67",
    awardDate: "2026-05-02",
    awardeeName: "ACME FEDERAL LLC",
    samUrl: "https://sam.gov/opp/notice-1/view",
    additionalInfoUrl: "https://example.mil/info",
    attachmentCount: 2,
  });
});

test("throws a clear SAM.gov live-mode error when no API key is configured", async () => {
  const client = new SamGovClient();

  await assert.rejects(
    () => client.search({ dryRun: false }),
    /SAM_GOV_API_KEY or SAM_API_KEY is required/,
  );
});

test("looks up one SAM.gov opportunity by notice ID without a broad pre-search", async () => {
  const requestedUrls: URL[] = [];
  const client = new SamGovClient({
    apiKey: "test-key",
    now: () => new Date("2026-05-06T12:00:00Z"),
    fetchFn: async (input) => {
      const url = new URL(input.toString());
      requestedUrls.push(url);
      return new Response(
        JSON.stringify({
          totalRecords: 1,
          opportunitiesData: [rawOpportunity("notice-1", "541512")],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.detail({ noticeId: "notice-1", dryRun: false });

  assert.equal(result.count, 1);
  assert.equal(requestedUrls.length, 1);
  assert.equal(requestedUrls[0].searchParams.get("noticeid"), "notice-1");
  assert.equal(requestedUrls[0].searchParams.has("title"), false);
});

test("filters by place-of-performance city client-side without sending it to SAM.gov", async () => {
  const requestedUrls: URL[] = [];
  const client = new SamGovClient({
    apiKey: "test-key",
    now: () => new Date("2026-05-06T12:00:00Z"),
    fetchFn: async (input) => {
      const url = new URL(input.toString());
      requestedUrls.push(url);
      return new Response(
        JSON.stringify({
          totalRecords: 4,
          opportunitiesData: [
            rawOpportunityAt("notice-1", "236220", "Lansing", "MI"),
            rawOpportunityAt("notice-2", "236220", "Detroit", "MI"),
            rawOpportunityAt("notice-3", "236220", "EAST LANSING", "MI"),
            rawOpportunityAt("notice-4", "236220", "Tokyo", "JA"),
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.search({
    naicsCodes: ["236220"],
    officeState: "MI",
    placeOfPerformanceCity: "Lansing",
    maxResults: 10,
    dryRun: false,
  });

  assert.equal(result.count, 2);
  assert.deepEqual(
    result.opportunities.map((opportunity) => opportunity.noticeId).sort(),
    ["notice-1", "notice-3"],
  );
  assert.equal(requestedUrls.length, 1);
  assert.equal(requestedUrls[0].searchParams.has("placeOfPerformanceCity"), false);
  assert.equal(requestedUrls[0].searchParams.has("city"), false);
  assert.equal(requestedUrls[0].searchParams.get("state"), "MI");
});

test("filters by place-of-performance state client-side independent of office state", async () => {
  const client = new SamGovClient({
    apiKey: "test-key",
    now: () => new Date("2026-05-06T12:00:00Z"),
    fetchFn: async () =>
      new Response(
        JSON.stringify({
          totalRecords: 3,
          opportunitiesData: [
            rawOpportunityAt("notice-1", "236220", "Lansing", "MI"),
            rawOpportunityAt("notice-2", "236220", "Philadelphia", "PA"),
            rawOpportunityAt("notice-3", "236220", "Saipan", "MP"),
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });

  const result = await client.search({
    naicsCodes: ["236220"],
    placeOfPerformanceState: "MI",
    maxResults: 10,
    dryRun: false,
  });

  assert.equal(result.count, 1);
  assert.equal(result.opportunities[0].noticeId, "notice-1");
});

test("officeState routes to SAM.gov state filter and overrides legacy state alias", async () => {
  const requestedUrls: URL[] = [];
  const client = new SamGovClient({
    apiKey: "test-key",
    now: () => new Date("2026-05-06T12:00:00Z"),
    fetchFn: async (input) => {
      requestedUrls.push(new URL(input.toString()));
      return new Response(
        JSON.stringify({ totalRecords: 0, opportunitiesData: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  await client.search({ officeState: "MI", state: "CA", maxResults: 5, dryRun: false });
  assert.equal(requestedUrls[0].searchParams.get("state"), "MI");
});

function rawOpportunityAt(noticeId: string, naicsCode: string, city: string, stateCode: string): Record<string, unknown> {
  const base = rawOpportunity(noticeId, naicsCode);
  return {
    ...base,
    placeOfPerformance: { city: { name: city }, state: { code: stateCode } },
  };
}

function rawOpportunity(noticeId: string, naicsCode: string): Record<string, unknown> {
  return {
    noticeId,
    title: "Enterprise Cloud Migration",
    solicitationNumber: "W912DQ-24-R-0042",
    fullParentPathName: "DEPT OF DEFENSE.DEPT OF THE ARMY.ARMY CONTRACTING COMMAND",
    postedDate: "2026-05-01 00:00:00",
    type: "o",
    typeOfSetAside: "SBA",
    typeOfSetAsideDescription: "Total Small Business Set-Aside",
    responseDeadLine: "2026-06-01T17:00:00-05:00",
    naicsCode,
    classificationCode: "D316",
    active: "Yes",
    award: {
      date: "2026-05-02",
      amount: "12345.67",
      awardee: { name: "ACME FEDERAL LLC" },
    },
    pointOfContact: [{ type: "primary", fullName: "Jane Smith", email: "jane.smith@example.mil", phone: "555-123-4567" }],
    placeOfPerformance: {
      city: { name: "Arlington" },
      state: { code: "VA" },
    },
    additionalInfoLink: "https://example.mil/info",
    uiLink: `https://sam.gov/opp/${noticeId}/view`,
    resourceLinks: ["https://example.mil/a.pdf", "https://example.mil/b.pdf"],
  };
}
