# Google Places Tools Implementation Plan

> **HISTORICAL PLAN — STATUS: COMPLETED.** Every task in this plan was shipped. The unchecked checkboxes and "not yet implemented" assertions inside reflect the pre-implementation state and are NOT current TODOs. For current behavior, see `src/places.ts` and the `places_search` / `places_detail` tool registrations in `src/server.ts`.

> **For agentic workers (historical):** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `places_search` and `places_detail` MCP tools backed by Google Places API (New) Text Search and Place Details, supporting the Restaurant Research Agent workflow described in `INFO.md`.

**Architecture:** New `GooglePlacesClient` class mirrors `SamGovClient` (constructor takes `apiKey/baseUrl/fetchFn/now`, has `search()` and `detail()` methods, dry-run sample data, redacted-URL output). Auth differs from SAM — Places uses `X-Goog-Api-Key` and mandatory `X-Goog-FieldMask` headers, not query params. Tools register in `server.ts` alongside existing tools; agent owns multi-round retrieval and dedupe.

**Tech Stack:** TypeScript (ES modules), Zod for input schemas, `node:test` runner via `tsx`, Google Places API (New) at `https://places.googleapis.com/v1/places`.

**Spec:** `docs/superpowers/specs/2026-05-06-google-places-restaurant-research-design.md`.

---

## File Structure

| File | Purpose | Action |
|---|---|---|
| `src/places.ts` | Google Places client class, types, sample data, normalizer | Create |
| `tests/places.test.ts` | Unit tests for client | Create |
| `src/env.ts` | Add `loadGooglePlacesApiKey()` | Modify |
| `tests/env.test.ts` | Test new env loader | Modify |
| `src/tools.ts` | Add `searchPlaces` + `getPlaceDetail` handlers; wire `placesClient` parameter | Modify |
| `src/server.ts` | Register MCP tools, load key from env | Modify |
| `.env.example` | Add `GOOGLE_PLACES_API_KEY` placeholder | Modify |
| `README.md` | Add Places section + examples | Modify |

---

## Task 1: Add `loadGooglePlacesApiKey` to env loader

**Files:**
- Modify: `src/env.ts`
- Test: `tests/env.test.ts`

- [ ] **Step 1: Read existing test file to match style**

Run: `cat tests/env.test.ts`

- [ ] **Step 2: Write the failing test**

Append to `tests/env.test.ts`:

```typescript
test("loadGooglePlacesApiKey returns key from env", () => {
  const key = loadGooglePlacesApiKey({ env: { GOOGLE_PLACES_API_KEY: "test-key" } });
  assert.equal(key, "test-key");
});

test("loadGooglePlacesApiKey returns undefined when not set", () => {
  const key = loadGooglePlacesApiKey({ env: {}, envFile: "/nonexistent/.env" });
  assert.equal(key, undefined);
});

test("loadGooglePlacesApiKey trims surrounding quotes and whitespace", () => {
  const key = loadGooglePlacesApiKey({ env: { GOOGLE_PLACES_API_KEY: ' "abc" ' } });
  assert.equal(key, "abc");
});
```

Add `loadGooglePlacesApiKey` to the existing import at the top of the file.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/env.test.ts`
Expected: FAIL with `loadGooglePlacesApiKey is not a function` or import error.

- [ ] **Step 4: Implement the loader**

Append to `src/env.ts` after `loadSamApiKey`:

```typescript
export function loadGooglePlacesApiKey(options: LoadDolApiKeyOptions = {}): string | undefined {
  const env = options.env ?? process.env;
  const direct = normalizeKey(env.GOOGLE_PLACES_API_KEY);
  if (direct) {
    return direct;
  }

  for (const envFile of envFileCandidates(options.envFile, env.DOL_MCP_ENV_FILE)) {
    if (!existsSync(envFile)) {
      continue;
    }

    const parsed = parse(readFileSync(envFile));
    const key = normalizeKey(parsed.GOOGLE_PLACES_API_KEY);
    if (key) {
      return key;
    }
  }

  return undefined;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/env.test.ts`
Expected: PASS (all tests, including new ones).

- [ ] **Step 6: Commit**

```bash
git add src/env.ts tests/env.test.ts
git commit -m "feat: add loadGooglePlacesApiKey env loader"
```

---

## Task 2: Define Places types and skeleton client

**Files:**
- Create: `src/places.ts`
- Test: `tests/places.test.ts`

- [ ] **Step 1: Create the test file with the skeleton tests**

Create `tests/places.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/places.test.ts`
Expected: FAIL — module `../src/places.js` not found.

- [ ] **Step 3: Create `src/places.ts` with types and skeleton class**

Create `src/places.ts`:

```typescript
export type PlacesFetchFn = (input: URL | string, init?: RequestInit) => Promise<Response>;

export interface GooglePlacesClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: PlacesFetchFn;
  now?: () => Date;
}

export interface PlacesSearchInput {
  query: string;
  includedTypes?: string[];
  excludedTypes?: string[];
  maxResults?: number;
  excludeClosed?: boolean;
  minRating?: number;
  regionCode?: string;
  dryRun?: boolean;
}

export interface PlacesDetailInput {
  placeId: string;
  includeAtmosphere?: boolean;
  dryRun?: boolean;
}

export interface PlaceLocation {
  lat: number;
  lng: number;
}

export interface Place {
  placeId: string | null;
  name: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  types: string[];
  businessStatus: string | null;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: string | null;
  location: PlaceLocation | null;
  googleMapsUrl: string | null;
}

export interface PlaceDetail extends Place {
  regularOpeningHours: unknown | null;
  currentOpeningHours: unknown | null;
  delivery: boolean | null;
  dineIn: boolean | null;
  takeout: boolean | null;
  goodForGroups: boolean | null;
  priceRange: unknown | null;
  editorialSummary: string | null;
  reviews: unknown[] | null;
}

export interface PlacesSearchResult {
  source: "Google Places API (New) — Text Search";
  dryRun: boolean;
  count: number;
  requestCount: number;
  query: string;
  nextPageToken: string | null;
  places: Place[];
}

export interface PlacesDetailResult {
  source: "Google Places API (New) — Place Details";
  dryRun: boolean;
  placeId: string;
  place: PlaceDetail | null;
}

const DEFAULT_BASE_URL = "https://places.googleapis.com/v1/places";
const PLACES_REDACTION = "<redacted>";

export class GooglePlacesClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchFn: PlacesFetchFn;
  private readonly now: () => Date;

  constructor(options: GooglePlacesClientOptions = {}) {
    this.apiKey = normalizeSecret(options.apiKey);
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => new Date());
  }

  sanitizeUrl(input: URL | string): string {
    const text = input.toString();
    if (!this.apiKey) return text;
    return text.replace(new RegExp(escapeRegExp(this.apiKey), "g"), PLACES_REDACTION);
  }
}

function normalizeSecret(value: string | undefined): string | undefined {
  const key = value?.trim().replace(/^['"]|['"]$/g, "");
  return key || undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/places.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/places.ts tests/places.test.ts
git commit -m "feat: add GooglePlacesClient skeleton with types"
```

---

## Task 3: Add dry-run sample data path for `search`

**Files:**
- Modify: `src/places.ts`
- Test: `tests/places.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/places.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/places.test.ts`
Expected: FAIL — `client.search is not a function`.

- [ ] **Step 3: Implement `search` with dry-run path and sample data**

Add inside the `GooglePlacesClient` class (above `sanitizeUrl`):

```typescript
  async search(input: PlacesSearchInput): Promise<PlacesSearchResult> {
    if (!input?.query?.trim()) {
      throw new Error("places_search requires a non-empty query.");
    }
    const maxResults = normalizeMaxResults(input.maxResults);
    const excludeClosed = input.excludeClosed ?? true;
    const dryRun = input.dryRun ?? !this.apiKey;

    if (dryRun) {
      let places = samplePlaces();
      if (excludeClosed) {
        places = places.filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY" && p.businessStatus !== "CLOSED_TEMPORARILY");
      }
      if (typeof input.minRating === "number") {
        places = places.filter((p) => p.rating === null || p.rating >= (input.minRating ?? 0));
      }
      places = places.slice(0, maxResults);
      return {
        source: "Google Places API (New) — Text Search",
        dryRun: true,
        count: places.length,
        requestCount: 0,
        query: input.query,
        nextPageToken: null,
        places,
      };
    }

    throw new Error("Live Google Places search is not yet implemented.");
  }
```

Append the helper functions to `src/places.ts`:

```typescript
function normalizeMaxResults(maxResults?: number): number {
  if (!Number.isFinite(maxResults)) {
    return 60;
  }
  return Math.min(60, Math.max(1, Math.trunc(maxResults ?? 60)));
}

export function samplePlaces(): Place[] {
  return [
    {
      placeId: "sample-st-joes-cafe",
      name: "St. Joe's Café",
      address: "92 N Broad St, Hillsdale, MI 49242, USA",
      website: null,
      phone: null,
      types: ["restaurant", "food", "point_of_interest", "establishment"],
      businessStatus: "OPERATIONAL",
      rating: 4.7,
      userRatingCount: 70,
      priceLevel: null,
      location: { lat: 41.9227075, lng: -84.6323383 },
      googleMapsUrl: "https://maps.google.com/?cid=sample-st-joes-cafe",
    },
    {
      placeId: "sample-johnny-ts-bistro",
      name: "Johnny T's Bistro",
      address: "171 E South St, Hillsdale, MI 49242, USA",
      website: "https://example.com/johnnyts",
      phone: "+1 517-555-0100",
      types: ["bistro", "american_restaurant", "restaurant", "food", "point_of_interest", "establishment"],
      businessStatus: "OPERATIONAL",
      rating: 4.4,
      userRatingCount: 761,
      priceLevel: "PRICE_LEVEL_MODERATE",
      location: { lat: 41.9165153, lng: -84.623497 },
      googleMapsUrl: "https://maps.google.com/?cid=sample-johnny-ts-bistro",
    },
    {
      placeId: "sample-hunt-club",
      name: "Hunt Club of Hillsdale",
      address: "24 N Howell St, Hillsdale, MI 49242, USA",
      website: null,
      phone: null,
      types: ["bar_and_grill", "bar", "restaurant", "food"],
      businessStatus: "OPERATIONAL",
      rating: 4.3,
      userRatingCount: 800,
      priceLevel: "PRICE_LEVEL_MODERATE",
      location: { lat: 41.9206241, lng: -84.63242 },
      googleMapsUrl: "https://maps.google.com/?cid=sample-hunt-club",
    },
    {
      placeId: "sample-handmade-sandwich",
      name: "Handmade",
      address: "78 Hillsdale St, Hillsdale, MI 49242, USA",
      website: null,
      phone: null,
      types: ["sandwich_shop", "restaurant", "food"],
      businessStatus: "OPERATIONAL",
      rating: 4.7,
      userRatingCount: 380,
      priceLevel: "PRICE_LEVEL_MODERATE",
      location: { lat: 41.925196, lng: -84.631883 },
      googleMapsUrl: "https://maps.google.com/?cid=sample-handmade-sandwich",
    },
    {
      placeId: "sample-closed-diner",
      name: "Closed Diner",
      address: "1 Closed Ln, Hillsdale, MI 49242, USA",
      website: null,
      phone: null,
      types: ["restaurant", "food"],
      businessStatus: "CLOSED_PERMANENTLY",
      rating: 3.2,
      userRatingCount: 12,
      priceLevel: null,
      location: { lat: 41.92, lng: -84.63 },
      googleMapsUrl: "https://maps.google.com/?cid=sample-closed-diner",
    },
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/places.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/places.ts tests/places.test.ts
git commit -m "feat: add dry-run sample data path to GooglePlacesClient.search"
```

---

## Task 4: Implement live `search` with single-page request

**Files:**
- Modify: `src/places.ts`
- Test: `tests/places.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/places.test.ts`:

```typescript
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
```

Add this helper function inside `tests/places.test.ts` (at the bottom):

```typescript
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/places.test.ts`
Expected: FAIL — currently throws "Live Google Places search is not yet implemented."

- [ ] **Step 3: Implement live search and replace dry-run-only branch**

In `src/places.ts`, replace the body of `search` (after the `dryRun` block) — remove the `throw new Error("Live ...")` line and replace with:

```typescript
    if (!this.apiKey) {
      throw new Error("GOOGLE_PLACES_API_KEY is required for live Google Places searches. Set it in the environment or .env file.");
    }

    const url = `${this.baseUrl}:searchText`;
    const fieldMask = SEARCH_FIELD_MASK;
    const body: Record<string, unknown> = {
      textQuery: input.query.trim(),
      regionCode: input.regionCode ?? "US",
    };
    const included = normalizeStringList(input.includedTypes);
    const excluded = normalizeStringList(input.excludedTypes);
    if (included.length) body.includedTypes = included;
    if (excluded.length) body.excludedTypes = excluded;

    const places: Place[] = [];
    const seen = new Set<string>();
    let requestCount = 0;
    let nextPageToken: string | null = null;

    while (places.length < maxResults) {
      const requestBody = nextPageToken ? { ...body, pageToken: nextPageToken } : body;
      requestCount += 1;
      const payload = await this.requestJson(url, "POST", requestBody, fieldMask);
      const rows = Array.isArray(payload.places) ? payload.places : [];
      for (const row of rows) {
        const place = normalizePlace(row);
        const key = place.placeId ?? JSON.stringify(place);
        if (seen.has(key)) continue;
        if (excludeClosed && (place.businessStatus === "CLOSED_PERMANENTLY" || place.businessStatus === "CLOSED_TEMPORARILY")) continue;
        if (typeof input.minRating === "number" && place.rating !== null && place.rating < input.minRating) continue;
        seen.add(key);
        places.push(place);
        if (places.length >= maxResults) break;
      }
      nextPageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : null;
      if (!nextPageToken || places.length >= maxResults) break;
    }

    return {
      source: "Google Places API (New) — Text Search",
      dryRun: false,
      count: places.length,
      requestCount,
      query: input.query,
      nextPageToken,
      places,
    };
```

Append these constants and helpers to `src/places.ts`:

```typescript
const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.types",
  "places.businessStatus",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.location",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

function normalizeStringList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))];
}

export function normalizePlace(row: unknown): Place {
  const r = isRecord(row) ? row : {};
  const display = isRecord(r.displayName) ? r.displayName : null;
  const loc = isRecord(r.location) ? r.location : null;
  return {
    placeId: stringValue(r.id),
    name: stringValue(display?.text) ?? stringValue(r.name),
    address: stringValue(r.formattedAddress),
    website: stringValue(r.websiteUri),
    phone: stringValue(r.nationalPhoneNumber) ?? stringValue(r.internationalPhoneNumber),
    types: Array.isArray(r.types) ? r.types.filter((t): t is string => typeof t === "string") : [],
    businessStatus: stringValue(r.businessStatus),
    rating: numberValue(r.rating),
    userRatingCount: numberValue(r.userRatingCount),
    priceLevel: stringValue(r.priceLevel),
    location: loc && typeof loc.latitude === "number" && typeof loc.longitude === "number"
      ? { lat: loc.latitude as number, lng: loc.longitude as number }
      : null,
    googleMapsUrl: stringValue(r.googleMapsUri),
  };
}

async function requestJsonImpl(
  fetchFn: PlacesFetchFn,
  url: string,
  method: string,
  body: Record<string, unknown> | null,
  apiKey: string,
  fieldMask: string,
  sanitize: (text: string) => string,
): Promise<Record<string, unknown>> {
  const init: RequestInit = {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-goog-api-key": apiKey,
      "x-goog-fieldmask": fieldMask,
    },
  };
  if (body !== null) {
    init.body = JSON.stringify(body);
  }
  const response = await fetchFn(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Google Places request failed (${response.status} ${response.statusText || "HTTP error"}) at ${sanitize(url)}: ${sanitize(text).slice(0, 700)}`);
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text && text.toLowerCase() !== "null" ? text : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
```

Add the `requestJson` method inside the class (above `sanitizeUrl`):

```typescript
  private requestJson(url: string, method: string, body: Record<string, unknown> | null, fieldMask: string): Promise<Record<string, unknown>> {
    if (!this.apiKey) {
      throw new Error("GOOGLE_PLACES_API_KEY is required.");
    }
    return requestJsonImpl(this.fetchFn, url, method, body, this.apiKey, fieldMask, (text) => this.sanitizeUrl(text));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/places.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/places.ts tests/places.test.ts
git commit -m "feat: implement live Google Places Text Search request"
```

---

## Task 5: Pagination, dedupe, and filters

**Files:**
- Modify: `src/places.ts` (no code changes expected; mostly verifying with tests)
- Test: `tests/places.test.ts`

- [ ] **Step 1: Write paging + dedupe + filter tests**

Append to `tests/places.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify pass**

Run: `npm test -- tests/places.test.ts`
Expected: PASS (12 tests). Implementation already supports paging, dedupe, and filters.

- [ ] **Step 3: Commit**

```bash
git add tests/places.test.ts
git commit -m "test: add pagination, dedupe, filter, and error tests for places search"
```

---

## Task 6: Implement `places_detail`

**Files:**
- Modify: `src/places.ts`
- Test: `tests/places.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/places.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/places.test.ts`
Expected: FAIL — `client.detail is not a function`.

- [ ] **Step 3: Implement `detail`**

Add inside the `GooglePlacesClient` class (after `search`):

```typescript
  async detail(input: PlacesDetailInput): Promise<PlacesDetailResult> {
    if (!input?.placeId?.trim()) {
      throw new Error("places_detail requires a non-empty placeId.");
    }
    const dryRun = input.dryRun ?? !this.apiKey;
    if (dryRun) {
      const sample = samplePlaces().find((p) => p.placeId === input.placeId) ?? null;
      const place = sample ? toSampleDetail(sample) : null;
      return {
        source: "Google Places API (New) — Place Details",
        dryRun: true,
        placeId: input.placeId,
        place,
      };
    }
    if (!this.apiKey) {
      throw new Error("GOOGLE_PLACES_API_KEY is required for live Google Places detail lookups.");
    }
    const url = `${this.baseUrl}/${encodeURIComponent(input.placeId)}`;
    const fieldMask = input.includeAtmosphere
      ? `${DETAIL_FIELD_MASK_BASIC},${DETAIL_FIELD_MASK_ATMOSPHERE}`
      : DETAIL_FIELD_MASK_BASIC;
    const payload = await this.requestJson(url, "GET", null, fieldMask);
    const place = normalizePlaceDetail(payload);
    return {
      source: "Google Places API (New) — Place Details",
      dryRun: false,
      placeId: input.placeId,
      place,
    };
  }
```

Append the constants and helpers to `src/places.ts`:

```typescript
const DETAIL_FIELD_MASK_BASIC = [
  "id",
  "displayName",
  "formattedAddress",
  "websiteUri",
  "nationalPhoneNumber",
  "types",
  "businessStatus",
  "rating",
  "userRatingCount",
  "priceLevel",
  "priceRange",
  "location",
  "googleMapsUri",
  "regularOpeningHours",
  "currentOpeningHours",
  "delivery",
  "dineIn",
  "takeout",
  "goodForGroups",
].join(",");

const DETAIL_FIELD_MASK_ATMOSPHERE = ["editorialSummary", "reviews"].join(",");

export function normalizePlaceDetail(row: unknown): PlaceDetail | null {
  if (!isRecord(row) || !row.id) return null;
  const base = normalizePlace(row);
  return {
    ...base,
    regularOpeningHours: row.regularOpeningHours ?? null,
    currentOpeningHours: row.currentOpeningHours ?? null,
    delivery: typeof row.delivery === "boolean" ? row.delivery : null,
    dineIn: typeof row.dineIn === "boolean" ? row.dineIn : null,
    takeout: typeof row.takeout === "boolean" ? row.takeout : null,
    goodForGroups: typeof row.goodForGroups === "boolean" ? row.goodForGroups : null,
    priceRange: row.priceRange ?? null,
    editorialSummary: stringValue(isRecord(row.editorialSummary) ? row.editorialSummary.text : row.editorialSummary),
    reviews: Array.isArray(row.reviews) ? row.reviews : null,
  };
}

function toSampleDetail(place: Place): PlaceDetail {
  return {
    ...place,
    regularOpeningHours: { weekdayDescriptions: ["Monday: 9:00 AM – 9:00 PM"] },
    currentOpeningHours: null,
    delivery: false,
    dineIn: true,
    takeout: true,
    goodForGroups: true,
    priceRange: null,
    editorialSummary: null,
    reviews: null,
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/places.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/places.ts tests/places.test.ts
git commit -m "feat: implement Google Places detail endpoint"
```

---

## Task 7: Wire handlers into `tools.ts`

**Files:**
- Modify: `src/tools.ts`

- [ ] **Step 1: Add the import and parameter**

In `src/tools.ts`, top of file — add after the SAM import:

```typescript
import { GooglePlacesClient, PlacesDetailInput, PlacesSearchInput } from "./places.js";
```

Modify the `createToolHandlers` signature to accept a Places client (add at the end):

```typescript
export function createToolHandlers(
  client: DolApiClient,
  lcaClient = new LcaDisclosureClient(),
  oshaClient = new OshaInspectionClient(client),
  samClient = new SamGovClient(),
  foreignLaborClient = new ForeignLaborDisclosureClient(),
  placesClient = new GooglePlacesClient(),
) {
```

- [ ] **Step 2: Add the two handlers**

Inside the returned object in `createToolHandlers`, after `getSamReference`:

```typescript
    searchPlaces: async (input: PlacesSearchInput) => {
      return await placesClient.search(input);
    },

    getPlaceDetail: async (input: PlacesDetailInput) => {
      return await placesClient.detail(input);
    },
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS (existing suites still green).

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts
git commit -m "feat: wire Google Places handlers into createToolHandlers"
```

---

## Task 8: Register MCP tools in `server.ts`

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Add imports and load the key**

At the top of `src/server.ts`, replace the env import line:

```typescript
import { loadDolApiKey, loadGooglePlacesApiKey, loadSamApiKey } from "./env.js";
```

Add an import for the client:

```typescript
import { GooglePlacesClient } from "./places.js";
```

Modify `createServer` signature to accept the key:

```typescript
export function createServer(client: DolApiClient, samApiKey?: string, googlePlacesApiKey?: string): McpServer {
```

Update the handlers wiring to pass the Places client:

```typescript
  const handlers = createToolHandlers(
    client,
    undefined,
    undefined,
    new SamGovClient({ apiKey: samApiKey }),
    undefined,
    new GooglePlacesClient({ apiKey: googlePlacesApiKey }),
  );
```

- [ ] **Step 2: Register `places_search` tool**

Add inside `createServer`, just before `return server;`:

```typescript
  server.registerTool(
    "places_search",
    {
      title: "Search Google Places",
      description:
        "Search Google Places (New) Text Search for businesses in an area. Designed as a per-round retrieval primitive for the Restaurant Research Agent. Returns deduplicated results with googleMapsUrl for source-tracing. Auto-pages up to maxResults (Google caps at ~60 per query). Defaults to includedTypes=[\"restaurant\"] and excludeClosed=true.",
      inputSchema: {
        query: z.string().min(1).describe("Free-text search, e.g. 'restaurants in Hillsdale, MI'."),
        includedTypes: z.array(z.string()).optional().describe("Google place types to include. Pass [] to disable type filtering. Defaults to ['restaurant']."),
        excludedTypes: z.array(z.string()).optional().describe("Optional exclusion types, e.g. ['lodging']."),
        maxResults: z.number().int().min(1).max(60).optional().describe("Maximum places to return (1-60). Auto-pages until reached or no more pages."),
        excludeClosed: z.boolean().optional().describe("Drop CLOSED_PERMANENTLY and CLOSED_TEMPORARILY. Defaults to true."),
        minRating: z.number().min(0).max(5).optional().describe("Filter on rating. Places with no rating are kept."),
        regionCode: z.string().optional().describe("ISO 3166-1 alpha-2 region code. Defaults to 'US'."),
        dryRun: z.boolean().optional().describe("Return sample places without calling Google. Defaults to true when no key is configured."),
      },
    },
    async (args) => toTextResult(await handlers.searchPlaces({ ...args, includedTypes: args.includedTypes ?? ["restaurant"] })),
  );

  server.registerTool(
    "places_detail",
    {
      title: "Get Google Place Detail",
      description:
        "Look up one Google place by Place ID. Returns hours, delivery/dine-in flags, and other detail fields. Set includeAtmosphere=true to also fetch editorialSummary and reviews (higher pricing tier).",
      inputSchema: {
        placeId: z.string().min(1).describe("Google Place ID returned by places_search."),
        includeAtmosphere: z.boolean().optional().describe("Fetch editorialSummary and reviews. Defaults to false."),
        dryRun: z.boolean().optional().describe("Use sample data without calling Google."),
      },
    },
    async (args) => toTextResult(await handlers.getPlaceDetail(args)),
  );
```

- [ ] **Step 3: Update `main()` to load the key**

Replace the `main` function body:

```typescript
async function main(): Promise<void> {
  const apiKey = loadDolApiKey();
  const samApiKey = loadSamApiKey();
  const googlePlacesApiKey = loadGooglePlacesApiKey();
  const client = new DolApiClient({ apiKey });
  const server = createServer(client, samApiKey, googlePlacesApiKey);
  await server.connect(new StdioServerTransport());
}
```

- [ ] **Step 4: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors; `dist/places.js` and updated `server.js` produced.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts
git commit -m "feat: register places_search and places_detail MCP tools"
```

---

## Task 9: Update `.env.example` and `README.md`

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Append to `.env.example`**

Add a line at the end of `.env.example`:

```
GOOGLE_PLACES_API_KEY=replace-with-your-google-places-api-key
```

- [ ] **Step 2: Add Places section to README**

In `README.md`, after the SAM tools entries in the Tools list, add:

```markdown
- `places_search`: Search Google Places (New) Text Search for businesses in an area. Returns deduped results with `googleMapsUrl` for source-tracing. Designed as a per-round retrieval primitive for the Restaurant Research Agent.
- `places_detail`: Look up one Google place by Place ID. Returns hours, delivery/dine-in flags, and (optionally) editorialSummary and reviews.
```

In the Setup section, update the env block to include the new key:

```bash
DOL_API_KEY=your-api-key
SAM_GOV_API_KEY=your-sam-gov-api-key
GOOGLE_PLACES_API_KEY=your-google-places-api-key
```

Add an Examples subsection at the end of the Examples section:

````markdown
Search Google Places for restaurants in a city:

```json
{
  "query": "restaurants in Hillsdale, MI",
  "includedTypes": ["restaurant"],
  "maxResults": 30,
  "excludeClosed": true
}
```

Look up one Google place by Place ID:

```json
{
  "placeId": "ChIJN1t_tDeuEmsRUsoyG83frY4",
  "includeAtmosphere": false
}
```
````

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document Google Places tools and env setup"
```

---

## Task 10: Smoke test the live integration

**Files:** none modified.

- [ ] **Step 1: Run the live smoke test**

Run:

```bash
set -a && source .env && set +a && node -e "import('./dist/places.js').then(async ({GooglePlacesClient}) => { const c = new GooglePlacesClient({apiKey: process.env.GOOGLE_PLACES_API_KEY}); const r = await c.search({query:'restaurants in Hillsdale, MI', maxResults:5, dryRun:false}); console.log('dryRun:', r.dryRun, '| count:', r.count, '| requests:', r.requestCount); for (const p of r.places) console.log('-', p.name, '|', p.address, '|', p.rating ?? 'N/A', '|', p.googleMapsUrl); }).catch(e => { console.error('ERROR:', e.message); process.exit(1); })"
```

Expected: `dryRun: false`, count between 1 and 5, list of real Hillsdale restaurants printed.

- [ ] **Step 2: If smoke test fails, diagnose**

- 401/403: key not enabled for Places API (New) in Google Cloud Console.
- 400 with `requestField`: field-mask issue; double-check `SEARCH_FIELD_MASK` matches what Google accepts.
- Network error: check `https://places.googleapis.com` is reachable.

No commit for this task.
