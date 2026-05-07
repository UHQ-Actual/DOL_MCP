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
        const minRating = input.minRating;
        places = places.filter((p) => p.rating === null || p.rating >= minRating);
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
  }

  private requestJson(url: string, method: string, body: Record<string, unknown> | null, fieldMask: string): Promise<Record<string, unknown>> {
    if (!this.apiKey) {
      throw new Error("GOOGLE_PLACES_API_KEY is required.");
    }
    return requestJsonImpl(this.fetchFn, url, method, body, this.apiKey, fieldMask, (text) => this.sanitizeUrl(text));
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
