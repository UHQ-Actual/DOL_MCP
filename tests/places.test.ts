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
