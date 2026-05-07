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
