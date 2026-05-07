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

    throw new Error("Live Google Places search is not yet implemented.");
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
