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
