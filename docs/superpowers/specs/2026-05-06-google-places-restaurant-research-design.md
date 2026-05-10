# Google Places Tools for Restaurant Research Agent — Design

> **HISTORICAL DESIGN DOC — STATUS: SHIPPED.** This is the design doc written before `places_search` and `places_detail` were built. Both tools are live in the MCP and deployed on Render. Read this file for original intent and rationale; for current behavior, see `src/places.ts`, `src/server.ts` (Places tool registrations), and `README.md`. Do NOT treat anything inside as a current TODO.

**Date:** 2026-05-06
**Status:** Approved (verbal) — pending written-spec review
**Scope:** Add Google Places API integration to the DOL_MCP server to support the Restaurant Research Agent described in `INFO.md`.

---

## Context

The DOL_MCP server already exposes WHD enforcement, OFLC LCA, foreign-labor, OSHA, and SAM.gov tools. `INFO.md` describes a Restaurant Research Agent (Claude Project) that uses Google Business Profiles as its primary retrieval source in **Pass 2 — Retrieve**. The agent classifies analyst messages, plans density-based row targets, runs multiple distinct search rounds, audits coverage, deduplicates, and produces a fixed-schema output table.

These tools are the **retrieval primitive** the agent calls during Pass 2. They do not implement the round loop, classification, audit gate, dedupe-across-rounds, or ADV estimation — those live in the agent.

## Goals

1. Provide a Text Search primitive (`places_search`) the agent invokes once per round with a varied query.
2. Provide a per-place enrichment primitive (`places_detail`) for cases where the agent needs hours, opening status, or richer fields.
3. Return Google's canonical `googleMapsUri` on every place so the agent can populate the per-cell `sources` requirement from `INFO.md` (no inferred values).
4. Match the architectural pattern of `src/sam.ts` — class-based client, sample-data dry-run path, redacted request URLs, identical envelope shape.
5. Default to the basic field tier in Google's pricing model. Atmosphere-tier fields (reviews, editorial summary) are opt-in.

## Non-goals

- No multi-round wrapper tool. `INFO.md` requires that rounds "vary by source, query terms, or geographic subdivision" and audit logging accounts for them — folding rounds into a single tool call would obscure that structure from the agent's audit log.
- No deduplication across calls. The agent performs the cross-round dedupe (primary key: normalized name + address) as part of Pass 4.
- No classification (LSR/FSR/Unclear), cuisine assignment, chain detection, or ADV estimation. The tool returns raw Google `types[]`; mapping is the agent's job per its rules file.
- No Place Photos endpoint. Adds cost, not in the agent's output schema.
- No persistent cache. Optional follow-up if cost becomes a concern.

## Tools

### Tool 1: `places_search`

**Endpoint:** `POST https://places.googleapis.com/v1/places:searchText`

**Inputs:**

| Field | Type | Default | Notes |
|---|---|---|---|
| `query` | string | required | Free-text search, e.g. `"restaurants in Hillsdale, MI"`. |
| `includedTypes` | string[] | `["restaurant"]` | Google place types. Pass `[]` to disable type filtering. |
| `excludedTypes` | string[] | `[]` | Optional exclusions, e.g. `["lodging"]`. |
| `maxResults` | number (1–60) | `60` | Auto-pages until cap or no more pages. |
| `excludeClosed` | boolean | `true` | Drops `CLOSED_PERMANENTLY` and `CLOSED_TEMPORARILY`. |
| `minRating` | number (0–5) | undefined | Filter on `rating`. Places with no rating are kept. |
| `regionCode` | string | `"US"` | ISO 3166-1 alpha-2. |
| `dryRun` | boolean | auto | Defaults to `true` when no key is set. |

**Output envelope:**

```json
{
  "source": "Google Places API (New) — Text Search",
  "dryRun": false,
  "count": 18,
  "requestCount": 1,
  "query": "restaurants in Hillsdale, MI",
  "nextPageToken": null,
  "places": [ /* see per-place fields */ ]
}
```

**Per-place fields:**
`placeId`, `name`, `address`, `website`, `phone`, `types[]`, `businessStatus`, `rating`, `userRatingCount`, `priceLevel`, `location: {lat, lng}`, `googleMapsUrl`.

**Field mask sent to Google:**
`places.id, places.displayName, places.formattedAddress, places.websiteUri, places.nationalPhoneNumber, places.types, places.businessStatus, places.rating, places.userRatingCount, places.priceLevel, places.location, places.googleMapsUri, nextPageToken`.

**Pagination:**
Text Search returns up to 20 places per page, max 3 pages = 60 total. Implementation auto-pages, threading `pageToken` from the previous response. If the agent stops the loop early (e.g., hits `maxResults` mid-page), the most recent `nextPageToken` is returned in the envelope so the caller can resume.

**Cost (Places API New, post-credit):**
The chosen field mask stays in the **Text Search Pro (basic)** tier (~$32 per 1k requests). Atmosphere fields are explicitly excluded from this tool to keep cost predictable for high-round-count agent runs.

### Tool 2: `places_detail`

**Endpoint:** `GET https://places.googleapis.com/v1/places/{placeId}`

**Inputs:**

| Field | Type | Default | Notes |
|---|---|---|---|
| `placeId` | string | required | Google Place ID returned by `places_search`. |
| `includeAtmosphere` | boolean | `false` | Adds `editorialSummary` and a small `reviews[]` slice. Triggers Atmosphere-tier billing. |
| `dryRun` | boolean | auto | Defaults to `true` when no key is set. |

**Output:**
All `places_search` fields plus:
- `regularOpeningHours`, `currentOpeningHours`
- `delivery`, `dineIn`, `takeout`, `goodForGroups`
- `priceRange` (if available)
- `editorialSummary` (Atmosphere only)
- `reviews[]` — top 5 reviews with `rating`, `text`, `relativePublishTimeDescription` (Atmosphere only)

**Field masks:**
- Basic (default): `id, displayName, formattedAddress, websiteUri, nationalPhoneNumber, types, businessStatus, rating, userRatingCount, priceLevel, priceRange, location, googleMapsUri, regularOpeningHours, currentOpeningHours, delivery, dineIn, takeout, goodForGroups`
- Atmosphere additions: `editorialSummary, reviews`

## Source-tracing fit with `INFO.md`

`INFO.md`: *"every factual cell value must trace to a retrieved source… The agent will not infer cuisine, format, or service type from a restaurant's name alone."*

Tool design satisfies this:
- Every place includes `googleMapsUrl`. The agent uses this as `sources` for name, address, website, phone, hours.
- The tool does not assign cuisine, format, or service type. The agent maps `types[]` to its controlled vocabulary per its rules file. If `types[]` is empty or generic, the agent must mark the cell `Unknown`.
- The envelope's `requestCount` and `query` give the agent material for its rounds-executed log.

## Architecture

### File layout

```
src/
  places.ts          # GooglePlacesClient class, types, sample data, normalizers
  tools.ts           # add searchPlaces and getPlaceDetail handlers
  server.ts          # register places_search and places_detail tools
  env.ts             # add loadGooglePlacesApiKey()
tests/
  places.test.ts     # unit tests with mocked fetchFn + dry-run
```

### Client shape

`GooglePlacesClient` mirrors `SamGovClient`:

- Constructor: `{ apiKey?, baseUrl?, fetchFn?, now? }`.
- `search(input): Promise<PlacesSearchResult>`.
- `detail(input): Promise<PlacesDetailResult>`.
- `sanitizeUrl(url): string` — redacts API key (handles header form, not just query param).
- Private `requestJson(method, url, body, fieldMask)` — sets `X-Goog-Api-Key` and `X-Goog-FieldMask` headers, parses JSON, formats errors with redacted URLs.

### Auth differences vs SAM

| Concern | SAM.gov | Google Places |
|---|---|---|
| Auth carrier | `?api_key=...` query param | `X-Goog-Api-Key` header |
| Field selection | none (full payload) | `X-Goog-FieldMask` header (mandatory) |
| Method | GET | POST (search), GET (detail) |
| URL redaction surface | query string | not visible in URL; key is in header — sanitization still strips body echoes |

`sanitizeUrl` will redact the literal API key value if it ever appears in an echoed URL or error body, in addition to query-param form for forward compatibility.

### Dry-run / sample data

When `dryRun: true` (or no key configured), `search` returns 5 Hillsdale-themed sample restaurants with varied `types`, `priceLevel`, `rating`, and one `CLOSED_PERMANENTLY` entry to exercise the filter. `detail` returns the matching sample by `placeId` or empty. Pattern matches `sampleOpportunities()` in `sam.ts`.

### Error handling

- 4xx (bad key, quota, rate-limit): surface Google's error message, redact key from any echoed body or URL.
- Network errors: pass through.
- Retry / backoff: not implemented in MVP. Add if 429s become an operational issue.

## Testing

`tests/places.test.ts` (mocked `fetchFn`, no live calls):

1. Single-page search response → returns places, no paging.
2. Multi-page response → auto-pages, dedupes by `placeId`, stops at `maxResults`.
3. `excludeClosed: true` filters `CLOSED_PERMANENTLY`.
4. `minRating: 4.5` filters places below threshold; keeps places with no rating.
5. `dryRun: true` returns sample data without calling fetch.
6. `sanitizeUrl` redacts the API key when it appears in an echoed URL.
7. 400 from Google → throws with redacted URL and Google's error text.
8. `places_detail` basic field mask — Atmosphere fields absent unless `includeAtmosphere: true`.

## Documentation

- Append a "Google Places" section to `README.md` with `places_search` and `places_detail` examples.
- Add `GOOGLE_PLACES_API_KEY=replace-with-your-google-places-api-key` to `.env.example`.

## Open questions / deferred

- **Caching.** Repeated agent rounds may search overlapping queries. A simple in-memory LRU keyed on (query + includedTypes + excludeClosed) would cut cost. Deferred — agent is the right place to dedupe across rounds for correctness anyway.
- **Geographic biasing.** Places API (New) supports `locationBias` / `locationRestriction` (lat/lng circle or rectangle). Q2 in brainstorming chose text-only "in an area" queries. Adding a circle bias is a small follow-up if the agent's text queries return too much spillover into adjacent towns.
- **Photos endpoint.** Excluded — high cost, not in the agent's schema.

## Approval log

- **Brainstorming Q1 — Purpose:** B (standalone discovery), later refined by `INFO.md` to "retrieval primitive for Restaurant Research Agent."
- **Brainstorming Q2 — Area definition:** B (text query).
- **Brainstorming Q3 — Type filter:** B (optional `includedTypes` array, default `["restaurant"]` for the restaurant agent).
- **Architectural choices:** Two tools, agent owns the round loop. Approved verbally (2026-05-06).
