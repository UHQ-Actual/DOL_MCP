# DOL WHD MCP

TypeScript MCP server for Department of Labor WHD Enforcement, OFLC LCA disclosure, OSHA inspection, and SAM.gov contract opportunity data.

## Setup

```bash
npm install
npm run build
```

Create a local `.env` file:

```bash
DOL_API_KEY=your-api-key
SAM_GOV_API_KEY=your-sam-gov-api-key
GOOGLE_PLACES_API_KEY=your-google-places-api-key
```

The server also accepts `DOL_API_KEY`, `SAM_GOV_API_KEY`, or `SAM_API_KEY` from the process environment. SAM.gov tools can run in dry-run mode without a SAM key. Tool responses redact request URLs and never return keys.

## Run Locally Over Stdio

```bash
npm start
```

Example MCP client config:

```json
{
  "mcpServers": {
    "dol-whd": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "<project-directory>"
    }
  }
}
```

## Run Remotely Over HTTP

Build first, then start the Streamable HTTP MCP endpoint:

```bash
npm run build
npm run start:http
```

Defaults:

- MCP endpoint: `http://127.0.0.1:8787/mcp`
- Health check: `http://127.0.0.1:8787/health`
- Transport: MCP Streamable HTTP, stateless per request.

Remote environment knobs:

```bash
DOL_MCP_HOST=127.0.0.1
DOL_MCP_PORT=8787
DOL_MCP_AUTH_TOKEN=change-this-before-exposing
DOL_MCP_ALLOW_ORIGIN=*
```

If `DOL_MCP_AUTH_TOKEN` is set, MCP clients must send either:

```http
Authorization: Bearer change-this-before-exposing
```

or:

```http
X-API-Key: change-this-before-exposing
```

Keep the default host for local-only access. To make it reachable from another machine, bind to a reachable interface such as `0.0.0.0` and put it behind a trusted tunnel or reverse proxy with authentication. The DOL and SAM.gov API keys remain server-side in `.env`.

## Deploy To Render

The repo ships a `render.yaml` Blueprint that provisions a free Node web service.

1. From the [Render dashboard](https://dashboard.render.com/), click **New → Blueprint** and point it at `https://github.com/UHQ-Actual/DOL_MCP`.
2. Render reads `render.yaml`, creates the `dol-whd-mcp` service, generates a fresh `DOL_MCP_AUTH_TOKEN`, and prompts for the API key secrets (`DOL_API_KEY`, `SAM_API_KEY`, `GOOGLE_PLACES_API_KEY`).
3. After the first deploy the public URL is `https://dol-whd-mcp.onrender.com` (or whatever Render assigns). Verify with:

   ```bash
   curl https://<your-service>.onrender.com/health
   ```

4. Copy the `DOL_MCP_AUTH_TOKEN` value out of the Render env var panel — you need it for the MCP client.

## Connect From Claude (Phone Or Web)

Claude.ai's mobile app shares Custom Connectors with the web UI, so adding the remote MCP once unlocks it on every device tied to that account.

1. In Claude.ai, open **Settings → Connectors → Add custom connector**.
2. Use the values from the Render deploy:
   - **URL**: `https://<your-service>.onrender.com/mcp`
   - **Auth header**: `Authorization: Bearer <DOL_MCP_AUTH_TOKEN>`
3. Save. The connector now lists every tool registered by `createServer()` (WHD, OFLC LCA, Foreign Labor, OSHA, SAM.gov, Google Places, `ask_government_data`).
4. Toggle the connector on inside any conversation to call the tools from your phone or laptop.

## Tools

- `ask_government_data`: Route a plain-English question to the right database and execute the query against WHD enforcement, OSHA inspections, DOL foreign-labor/LCA disclosures, or SAM.gov opportunities.
- `whd_enforcement_query`: Query `WHD/enforcement` with `limit`, `offset`, `fields`, `sort`, `sort_by`, and `filter_object`.
- `whd_enforcement_case`: Look up a numeric `case_id`.
- `whd_enforcement_metadata`: Return full metadata rows, with optional `search`, `category`, and `limit`.
- `whd_enforcement_fields`: Return concise field descriptions for query building.
- `dol_datasets_search`: Search the public DOL datasets catalog.
- `lca_disclosure_files`: Return official DOL OFLC LCA disclosure and record-layout URLs for a fiscal year quarter.
- `lca_disclosure_fields`: Read field names from a DOL LCA disclosure XLSX file.
- `lca_search`: Search DOL OFLC LCA disclosure data by employer, worksite, title, SOC, NAICS, status, visa class, wage, and dates.
- `lca_employer_profile`: Build a DOL LCA-only employer profile with certification counts, wage statistics, top job titles, SOC codes, worksites, H-1B dependent, and willful violator flags.
- `foreign_labor_files`: Discover official DOL OFLC disclosure workbook, record-layout, and auxiliary file URLs for `LCA`, `PERM`, `H-2A`, `H-2B`, or `CW`.
- `foreign_labor_fields`: Read field names from an official DOL foreign-labor disclosure XLSX file.
- `foreign_labor_search`: Stream-search DOL OFLC foreign-labor disclosure workbooks and return a unified schema across LCA, PERM, H-2A, H-2B, and CW-1. First call per quarter downloads + parses the workbook and writes a gzipped JSONL cache alongside it; subsequent calls read the cache in 1-3 seconds.
- `osha_fields`: Return metadata for the official DOL OSHA `inspection` or `violation` dataset.
- `osha_inspection_search`: Search OSHA inspections by establishment, state, city, NAICS, inspection type, safety/health, and open-date range. Optionally joins non-deleted violation/citation records.
- `osha_inspection_detail`: Look up one OSHA inspection by `activity_nr` and optionally join violation/citation records.
- `sam_opportunities_search`: Search official SAM.gov contract opportunities by title keywords, NAICS codes, procurement types, set-aside code, contracting-office state, place-of-performance state/city, and posted date range. SAM.gov returns SOLICITATIONS, not awarded contracts; use `usaspending_award_search` for awarded dollar amounts.
- `sam_opportunity_detail`: Look up one SAM.gov opportunity by `noticeId`.
- `sam_reference`: Return common SAM.gov procurement type and set-aside codes.
- `usaspending_award_search`: Search USAspending.gov for federal awards with KNOWN obligated dollar amounts. Filters by NAICS, PSC, recipient, awarding agency, place-of-performance state/city/county FIPS, award amount range, and start-date range. Defaults to contract award types (A, B, C, D). No API key required.
- `places_search`: Search Google Places (New) Text Search for businesses in an area. Returns deduped results with `googleMapsUrl` for source-tracing. Designed as a per-round retrieval primitive for the Restaurant Research Agent.
- `places_detail`: Look up one Google place by Place ID. Returns hours, delivery/dine-in flags, and (optionally) editorialSummary and reviews.
- `adv_estimate`: Deterministic Annual Dollar Volume calculator for FLSA $500k enterprise-coverage screening. Encodes Methods 1-4 (per-employee, per-seat, chain per-unit, format default), the geographic cost-of-living multiplier, +/-40% range, and the FLSA flag (Above / Below / Borderline / Insufficient Data). Screening signal only; not a coverage determination.
- `census_area_profile`: Resolve a US city/town/CDP to total population (ACS 5-year), area tier (`major_metro` / `mid_metro` / `small_or_rural`), row-scaling tier and target (matching the Restaurant Research Agent's `max(pop/250, floor)` formula), county FIPS for follow-on `usaspending_award_search`, and the high-cost-of-living-state flag. Pairs with `adv_estimate` for end-to-end research workflows.
- `business_entity_search`: Search Secretary of State / DFI business registrations across all 50 states via OpenCorporates. Sourced directly from official state registries; data lineage is auditable. Returns name, company number, status, type, incorporation date, registered address, previous names, and an `opencorporates_url` per record. Free tier ~50 lookups/day; set `OPENCORPORATES_API_KEY` for higher volume. See [docs/data-sources/state-business-registration.md](docs/data-sources/state-business-registration.md) for per-state coverage notes.
- `business_entity_detail`: Look up one entity by jurisdiction code + state company number via OpenCorporates. Returns the full canonical record (registered address, dissolution date, previous names, registry URL).

LCA tools use official OFLC disclosure workbooks from the DOL Performance Data page. The workbooks can be large, so downloaded files are cached under `.cache/dol-lca/`. You can also pass `localFile` with an already-downloaded official LCA disclosure XLSX file.

The LCA profile is DOL-only. USCIS H-1B petition approval and denial rates are not included unless a separate USCIS data source is added.

Foreign-labor tools read the DOL Performance Data page to discover current disclosure links, then stream-parse XLSX files row by row. Supported programs are `LCA`, `PERM`, `H-2A`, `H-2B`, and `CW`; supported unified-parser fiscal years are 2020 through 2030. Use `localFile` to point at an already-downloaded official workbook.

OSHA tools use the official DOL Open Data API datasets `OSHA/inspection` and `OSHA/violation`. Violation rows are joined to inspections by `activity_nr`; rows with `delete_flag` equal to `X` are excluded from joined output.

SAM.gov tools use the official Opportunities API at `https://api.sam.gov/opportunities/v2/search`. Live searches require `SAM_GOV_API_KEY` or `SAM_API_KEY`; dry-run searches return sample opportunities without calling SAM.gov. The API requires posted date bounds, so `postedDaysAgo` is converted to `postedFrom` and `postedTo` in `MM/dd/yyyy` format.

## Examples

Filter Iowa records with back wages:

```json
{
  "limit": 10,
  "fields": ["case_id", "trade_nm", "st_cd", "bw_atp_amt", "findings_end_date"],
  "sort": "desc",
  "sort_by": "bw_atp_amt",
  "filter_object": {
    "and": [
      { "field": "st_cd", "operator": "eq", "value": "IA" },
      { "field": "bw_atp_amt", "operator": "gt", "value": 0 }
    ]
  }
}
```

Search field metadata:

```json
{
  "search": "backwage",
  "limit": 20
}
```

Search LCA disclosure data:

```json
{
  "fiscalYear": 2026,
  "quarter": 1,
  "employerName": "Google",
  "state": "CA",
  "jobTitle": "software",
  "maxResults": 25
}
```

Build a DOL LCA employer profile:

```json
{
  "fiscalYear": 2026,
  "quarter": 1,
  "employerName": "Google",
  "searchMode": "contains",
  "maxResults": 5000
}
```

Search unified DOL foreign-labor disclosures:

```json
{
  "visaProgram": "H-2A",
  "fiscalYear": 2026,
  "fiscalQuarter": "Q1",
  "worksiteState": "IA",
  "caseStatus": "Certified",
  "maxItems": 100
}
```

Search PERM certifications:

```json
{
  "visaProgram": "PERM",
  "fiscalYear": 2026,
  "fiscalQuarter": "Q1",
  "employerName": "Intel",
  "minAnnualWage": 150000,
  "maxItems": 500
}
```

Search OSHA inspections with joined citations:

```json
{
  "companyName": "Walmart",
  "state": "TX",
  "includeViolations": true,
  "maxResults": 25
}
```

Search fatality/catastrophe construction inspections:

```json
{
  "state": "TX",
  "naicsCode": "23",
  "inspectionType": "A",
  "dateFrom": "2024-01-01",
  "includeViolations": true,
  "maxResults": 100
}
```

Search SAM.gov opportunities in dry-run mode:

```json
{
  "keywords": "cybersecurity",
  "naicsCodes": ["541512"],
  "setAsideType": "SBA",
  "postedDaysAgo": 30,
  "maxResults": 10,
  "dryRun": true
}
```

Search live SAM.gov opportunities after adding a SAM key:

```json
{
  "keywords": "software development",
  "naicsCodes": ["541512", "541511"],
  "procurementTypes": ["o", "k", "r"],
  "state": "VA",
  "postedDaysAgo": 30,
  "maxResults": 100,
  "dryRun": false
}
```

Ask a plain-English routed question:

```json
{
  "question": "Show OSHA inspections and citations for Walmart in TX",
  "maxResults": 10
}
```

Ask for SAM.gov opportunities in dry-run mode:

```json
{
  "question": "Find cybersecurity solicitations NAICS 541512 in Virginia",
  "maxResults": 10,
  "dryRun": true
}
```

Ask for DOL foreign-labor disclosure records:

```json
{
  "question": "H-2A certified farm jobs in IA SOC 45-2092 over $20 hourly",
  "maxResults": 10
}
```

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

## Data Source Reference

Background reference for sources the MCP queries (and a few it doesn't yet but agents may need to reach):

- [Midwest State OSHA Programs](docs/data-sources/state-osha-programs.md) — federal vs state-plan jurisdiction map for IL, IN, IA, KS, MI, MN, MO, NE, OH, WI; how state-plan reporting cadence affects `osha_inspection_search` results; what the federal OIS does and doesn't cover.
- [Midwest State Business Registration Searches](docs/data-sources/state-business-registration.md) — Secretary of State / DFI portals, free search vs. paid bulk download, registered-agent and officer searches; IL, IN, IA, KS, MI, MN, MO, NE, OH, WI.
