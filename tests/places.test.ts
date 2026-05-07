import assert from "node:assert/strict";
import test from "node:test";

import { GooglePlacesClient } from "../src/places.js";

test("constructs without an API key", () => {
  const client = new GooglePlacesClient();
  assert.ok(client);
});

test("sanitizeUrl redacts API key when present in URL", () => {
  const client = new GooglePlacesClient({ apiKey: "secret-abc" });
  const sanitized = client.sanitizeUrl("https://places.googleapis.com/v1/places:searchText?key=secret-abc");
  assert.ok(!sanitized.includes("secret-abc"));
  assert.ok(sanitized.includes("<redacted>"));
});

test("returns dry-run sample places without calling fetch", async () => {
  let calls = 0;
  const client = new GooglePlacesClient({
    fetchFn: async () => {
      calls += 1;
      throw new Error("should not call Google during dry run");
    },
  });

  const result = await client.search({ query: "restaurants in Hillsdale, MI", maxResults: 3, dryRun: true });

  assert.equal(calls, 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.source, "Google Places API (New) — Text Search");
  assert.equal(result.count, 3);
  assert.equal(result.places.length, 3);
  assert.equal(result.places[0].placeId, "sample-st-joes-cafe");
  assert.ok(result.places[0].googleMapsUrl);
});

test("dry-run defaults on when no API key is configured", async () => {
  const client = new GooglePlacesClient();
  const result = await client.search({ query: "anything" });
  assert.equal(result.dryRun, true);
});

test("dry-run excludeClosed filters CLOSED_PERMANENTLY samples", async () => {
  const client = new GooglePlacesClient();
  const open = await client.search({ query: "x", dryRun: true, maxResults: 10, excludeClosed: true });
  const all = await client.search({ query: "x", dryRun: true, maxResults: 10, excludeClosed: false });
  assert.ok(all.count > open.count, "all should include closed; open should not");
  assert.ok(open.places.every((p) => p.businessStatus !== "CLOSED_PERMANENTLY"));
});

test("live search sends X-Goog-Api-Key and X-Goog-FieldMask headers and POST body", async () => {
  const captured: { url: string; init: RequestInit | undefined }[] = [];
  const client = new GooglePlacesClient({
    apiKey: "test-key",
    fetchFn: async (input, init) => {
      captured.push({ url: input.toString(), init });
      return new Response(JSON.stringify({ places: [rawPlace("place-1", "Demo")] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await client.search({
    query: "restaurants in Hillsdale, MI",
    includedTypes: ["restaurant"],
    maxResults: 20,
    dryRun: false,
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, "https://places.googleapis.com/v1/places:searchText");
  const headers = new Headers(captured[0].init?.headers as HeadersInit);
  assert.equal(headers.get("x-goog-api-key"), "test-key");
  assert.ok(headers.get("x-goog-fieldmask")?.includes("places.id"));
  assert.equal(captured[0].init?.method, "POST");
  const body = JSON.parse(String(captured[0].init?.body));
  assert.equal(body.textQuery, "restaurants in Hillsdale, MI");
  assert.deepEqual(body.includedTypes, ["restaurant"]);
  assert.equal(body.regionCode, "US");
  assert.equal(result.dryRun, false);
  assert.equal(result.requestCount, 1);
  assert.equal(result.count, 1);
  assert.equal(result.places[0].placeId, "place-1");
  assert.equal(result.places[0].name, "Demo");
});

test("auto-pages until maxResults reached and dedupes by placeId", async () => {
  const responses = [
    { places: [rawPlace("p1", "One"), rawPlace("p2", "Two")], nextPageToken: "tok-1" },
    { places: [rawPlace("p2", "Two-Dup"), rawPlace("p3", "Three")], nextPageToken: "tok-2" },
    { places: [rawPlace("p4", "Four")], nextPageToken: null },
  ];
  let i = 0;
  const client = new GooglePlacesClient({
    apiKey: "k",
    fetchFn: async () => new Response(JSON.stringify(responses[i++]), { status: 200 }),
  });

  const result = await client.search({ query: "x", maxResults: 60, dryRun: false });

  assert.equal(result.requestCount, 3);
  assert.deepEqual(result.places.map((p) => p.placeId), ["p1", "p2", "p3", "p4"]);
});

test("stops paging once maxResults is reached", async () => {
  const responses = [
    { places: [rawPlace("p1", "One"), rawPlace("p2", "Two")], nextPageToken: "tok-1" },
    { places: [rawPlace("p3", "Three")], nextPageToken: "tok-2" },
  ];
  let i = 0;
  const client = new GooglePlacesClient({
    apiKey: "k",
    fetchFn: async () => new Response(JSON.stringify(responses[i++]), { status: 200 }),
  });

  const result = await client.search({ query: "x", maxResults: 2, dryRun: false });

  assert.equal(result.requestCount, 1);
  assert.equal(result.places.length, 2);
});

test("excludeClosed filters CLOSED_PERMANENTLY and CLOSED_TEMPORARILY in live mode", async () => {
  const client = new GooglePlacesClient({
    apiKey: "k",
    fetchFn: async () => new Response(JSON.stringify({ places: [
      rawPlace("p1", "Open"),
      rawPlace("p2", "Closed Perm", { businessStatus: "CLOSED_PERMANENTLY" }),
      rawPlace("p3", "Closed Temp", { businessStatus: "CLOSED_TEMPORARILY" }),
    ] }), { status: 200 }),
  });

  const result = await client.search({ query: "x", excludeClosed: true, dryRun: false });

  assert.deepEqual(result.places.map((p) => p.placeId), ["p1"]);
});

test("minRating filters places below threshold; null ratings are kept", async () => {
  const client = new GooglePlacesClient({
    apiKey: "k",
    fetchFn: async () => new Response(JSON.stringify({ places: [
      rawPlace("p1", "Hi", { rating: 4.6 }),
      rawPlace("p2", "Lo", { rating: 3.9 }),
      rawPlace("p3", "Null", { rating: null }),
    ] }), { status: 200 }),
  });

  const result = await client.search({ query: "x", minRating: 4.5, dryRun: false });

  assert.deepEqual(result.places.map((p) => p.placeId), ["p1", "p3"]);
});

test("throws clear error when no API key in live mode", async () => {
  const client = new GooglePlacesClient();
  await assert.rejects(
    () => client.search({ query: "x", dryRun: false }),
    /GOOGLE_PLACES_API_KEY is required/,
  );
});

test("detail returns dry-run sample matching placeId", async () => {
  const client = new GooglePlacesClient();
  const result = await client.detail({ placeId: "sample-st-joes-cafe", dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(result.placeId, "sample-st-joes-cafe");
  assert.equal(result.place?.name, "St. Joe's Café");
});

test("detail returns null place for unknown sample id", async () => {
  const client = new GooglePlacesClient();
  const result = await client.detail({ placeId: "nope", dryRun: true });
  assert.equal(result.place, null);
});

test("live detail uses GET, basic field mask, no atmosphere fields by default", async () => {
  const captured: { url: string; init: RequestInit | undefined }[] = [];
  const client = new GooglePlacesClient({
    apiKey: "k",
    fetchFn: async (input, init) => {
      captured.push({ url: input.toString(), init });
      return new Response(JSON.stringify({
        ...rawPlace("p1", "Demo"),
        regularOpeningHours: { weekdayDescriptions: ["Monday: 9-5"] },
        delivery: true,
        dineIn: true,
        takeout: false,
      }), { status: 200 });
    },
  });

  const result = await client.detail({ placeId: "p1", dryRun: false });

  assert.equal(captured[0].url, "https://places.googleapis.com/v1/places/p1");
  assert.equal(captured[0].init?.method, "GET");
  const headers = new Headers(captured[0].init?.headers as HeadersInit);
  const mask = headers.get("x-goog-fieldmask") ?? "";
  assert.ok(mask.includes("regularOpeningHours"));
  assert.ok(!mask.includes("editorialSummary"), "atmosphere field should be absent");
  assert.ok(!mask.includes("reviews"));
  assert.equal(result.place?.placeId, "p1");
  assert.equal(result.place?.delivery, true);
  assert.equal(result.place?.editorialSummary, null);
});

test("live detail with includeAtmosphere adds editorialSummary and reviews to mask", async () => {
  const captured: { url: string; init: RequestInit | undefined }[] = [];
  const client = new GooglePlacesClient({
    apiKey: "k",
    fetchFn: async (input, init) => {
      captured.push({ url: input.toString(), init });
      return new Response(JSON.stringify(rawPlace("p1", "Demo")), { status: 200 });
    },
  });

  await client.detail({ placeId: "p1", includeAtmosphere: true, dryRun: false });

  const headers = new Headers(captured[0].init?.headers as HeadersInit);
  const mask = headers.get("x-goog-fieldmask") ?? "";
  assert.ok(mask.includes("editorialSummary"));
  assert.ok(mask.includes("reviews"));
});

test("surfaces Google error response with redacted key", async () => {
  const client = new GooglePlacesClient({
    apiKey: "secret-xyz",
    fetchFn: async () => new Response(JSON.stringify({ error: { message: "Bad request: secret-xyz" } }), { status: 400 }),
  });

  await assert.rejects(
    () => client.search({ query: "x", dryRun: false }),
    (err: Error) => {
      assert.ok(!err.message.includes("secret-xyz"), "error message should redact key");
      assert.ok(err.message.includes("<redacted>"));
      return true;
    },
  );
});

function rawPlace(id: string, name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    displayName: { text: name, languageCode: "en" },
    formattedAddress: `${name} address`,
    websiteUri: null,
    nationalPhoneNumber: null,
    types: ["restaurant", "food"],
    businessStatus: "OPERATIONAL",
    rating: 4.5,
    userRatingCount: 100,
    priceLevel: "PRICE_LEVEL_MODERATE",
    location: { latitude: 41.9, longitude: -84.6 },
    googleMapsUri: `https://maps.google.com/?cid=${id}`,
    ...overrides,
  };
}
