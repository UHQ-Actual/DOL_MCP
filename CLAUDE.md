# DOL_MCP — Claude Code Notes

TypeScript MCP server exposing U.S. labor-enforcement and contract data as tools for Claude Code, Claude.ai (web + mobile), and any other MCP client.

## Quick orientation for new development cycles

- **Live deployment**: https://dol-whd-mcp.onrender.com (streamable HTTP MCP at `/mcp`, health at `/health`). Render auto-deploys on every push to `UHQ-Actual/DOL_MCP:main` via `render.yaml`.
- **Public repo**: [github.com/UHQ-Actual/DOL_MCP](https://github.com/UHQ-Actual/DOL_MCP). Source is git-subtree-split out of the parent monorepo `Coding/` at `WHD/DOL_MCP/`.
- **Agent behavioral rules**: `systemprompt.md` (in repo root) holds `<DEPLOYMENT>`, `<INTERACTION>`, and `<TOOL_ROUTING>` blocks. **The MCP server cannot push prompt updates to clients** — when you change `systemprompt.md`, the user must paste the new content into their Claude Project / connector for the rules to take effect.
- **Tests**: 131 tests, all mocked-fetch. `npm test` runs in ~10s. Always green before commit.
- **Tool count**: 27 tools across 13 sources (see "What it does" below).
- **Cold-start caveat**: Render free-tier spins down after 15 min idle. First request after a pause adds 30-50s warm-up. JSONL caches in `.cache/foreign-labor/` are wiped along with the container.

## What it does

| Source | Tools |
|---|---|
| DOL WHD Enforcement (WHISARD) | `whd_enforcement_query`, `whd_enforcement_case`, `whd_enforcement_metadata`, `whd_enforcement_fields` |
| DOL Datasets catalog | `dol_datasets_search` |
| OFLC LCA (H-1B, H-1B1, E-3) | `lca_disclosure_files`, `lca_disclosure_fields`, `lca_search`, `lca_employer_profile` |
| OFLC Foreign Labor (LCA, PERM, H-2A, H-2B, CW) | `foreign_labor_files`, `foreign_labor_fields`, `foreign_labor_search` |
| OSHA inspections + violations | `osha_fields`, `osha_inspection_search`, `osha_inspection_detail` |
| SAM.gov Opportunities | `sam_opportunities_search`, `sam_opportunity_detail`, `sam_reference` |
| USAspending.gov Awards | `usaspending_award_search` |
| Google Places (New) | `places_search`, `places_detail` |
| FLSA $500k screening | `adv_estimate` |
| Census ACS area profile | `census_area_profile` |
| Business entity registration | `business_entity_search`, `business_entity_detail` (OpenCorporates) |
| OSHA jurisdiction reference | `osha_state_plan_lookup` |
| State SOS portal reference | `sos_portal_lookup` |
| Plain-English router | `ask_government_data` |

Registered with Claude Code at user scope: `claude mcp add dol-whd -s user -- node <repo>/dist/server.js`.

## Geographic scope

This project's primary research area is the **U.S. Midwest** — 10 states. When a tool takes a `state` filter, default to these unless the user specifies otherwise:

| State | Code |
|---|---|
| Illinois | IL |
| Indiana | IN |
| Iowa | IA |
| Kansas | KS |
| Michigan | MI |
| Minnesota | MN |
| Missouri | MO |
| Nebraska | NE |
| Ohio | OH |
| Wisconsin | WI |

Most tools (`lca_search`, `osha_inspection_search`, `sam_opportunities_search`, etc.) accept exactly one `state` per call, so multi-state queries fan out into multiple tool calls and the caller merges/dedupes.

## WHD district offices in the region

Research and case-selection work in this project ties back to nine WHD district offices across the Midwest:

| Office | State |
|---|---|
| Chicago | IL |
| Columbus | OH |
| Des Moines | IA |
| Detroit | MI |
| Grand Rapids | MI |
| Indianapolis | IN |
| Kansas City | MO |
| Minneapolis | MN |
| St. Louis | MO |

When the user mentions "the offices" or names one of these cities without context, assume they mean the WHD district office, not a generic city query.

## Common commands

```bash
npm install          # In WSL: must reinstall, never copy node_modules across Windows/WSL
npm run build        # tsc -p tsconfig.json → dist/
npm run typecheck    # tsc --noEmit
npm test             # tsx --test tests/*.test.ts (mocked fetch only; ~131 tests, ~10s)
npm start            # stdio MCP (dist/server.js)
npm run start:http   # streamable HTTP MCP at :8787
```

To push DOL_MCP-only history to GitHub (subtree split; runs from the parent monorepo root, not from `WHD/DOL_MCP/`):

```bash
gh auth switch -u UHQ-Actual
git subtree split --prefix=WHD/DOL_MCP HEAD -b dol-mcp-export
git push https://github.com/UHQ-Actual/DOL_MCP.git dol-mcp-export:main
gh auth switch -u TrueCrimeDev
git branch -D dol-mcp-export
```

Render auto-deploys on push to `main`. Verify with `curl https://dol-whd-mcp.onrender.com/health`.

## File layout

Pattern: one file per upstream API, mirroring `sam.ts` / `places.ts`.

| File | Purpose |
|---|---|
| `src/dolApi.ts` | DOL Open Data API client (WHD + dataset catalog) |
| `src/lca.ts` | OFLC LCA disclosure workbook discovery + XLSX stream-parse |
| `src/foreignLabor.ts` | Unified LCA / PERM / H-2A / H-2B / CW disclosure search |
| `src/osha.ts` | OSHA inspection + violation client (built on `DolApiClient`) |
| `src/sam.ts` | SAM.gov Opportunities client |
| `src/usaspending.ts` | USAspending.gov award-search client (keyless POST API) |
| `src/adv.ts` | Pure Annual Dollar Volume calculator (no API) for FLSA $500k screening |
| `src/census.ts` | Census Bureau geocoder + ACS 5-year client for area population and tier classification |
| `src/openCorporates.ts` | OpenCorporates v0.4 API client for state business-registration lookups (free tier ~50/day; key in `OPENCORPORATES_API_KEY`) |
| `src/oshaJurisdiction.ts` | Static OSHA jurisdiction reference (50 states + DC + territories) — tier, program name, expected reporting lag, records-request path |
| `src/sosPortal.ts` | Static SOS portal reference (50 states + DC + territories) — portal URL, agency, bulk-download availability/pricing. Midwest 10 verified; rest are general |
| `src/places.ts` | Google Places (New) Text Search + Place Details |
| `src/queryRouter.ts` | `ask_government_data` plain-English routing |
| `src/tools.ts` | `createToolHandlers()` wires clients to handlers |
| `src/server.ts` | `createServer()` registers MCP tools with Zod schemas |
| `src/httpServer.ts` | Streamable HTTP transport |
| `src/env.ts` | `loadDolApiKey` / `loadSamApiKey` / `loadGooglePlacesApiKey` / `loadOpenCorporatesApiKey` (env-then-file resolution) |
| `tests/<name>.test.ts` | Per-source unit tests using `node:test`, fetch always mocked |

## Adding a new tool

1. Create `src/<source>.ts` with a class taking `{ apiKey?, baseUrl?, fetchFn?, now? }`.
2. Add `loadXApiKey()` to `src/env.ts` if it needs a key.
3. Provide a `dryRun` path returning sample fixtures (see `samplePlaces()`, `sampleOpportunities()`) — keeps callers without keys functional and lets tests run without the network.
4. `sanitizeUrl()` must redact the API key from any echoed URL or error body.
5. Add a handler in `createToolHandlers()` (`src/tools.ts`).
6. Register the MCP tool in `src/server.ts` with a Zod input schema.
7. Load the key in `main()`.
8. Write `tests/<source>.test.ts` covering: dry-run, live single-page, paging/dedupe if applicable, error redaction.

Every tool result envelope includes `source`, `count`, `dryRun`, and `nextPageToken` if pageable. Match `places.ts` / `sam.ts` exactly — agent callers depend on the consistent shape.

## Environment

Keys resolve via `src/env.ts` in this order:

1. `process.env.<KEY>`
2. `process.env.DOL_MCP_ENV_FILE` if set
3. `<cwd>/.env`
4. `<dir-of-env.ts>/../.env`

### All env vars

| Variable | Used by | Required? | Notes |
|---|---|---|---|
| `DOL_API_KEY` | DOL Open Data API (WHD, OSHA, datasets) | **Required** | Server refuses to start without it. Free at https://api.dol.gov/. |
| `SAM_API_KEY` (or `SAM_GOV_API_KEY`) | SAM.gov Opportunities | Optional | Without it, SAM tools default to `dryRun`. Free at https://sam.gov/. |
| `GOOGLE_PLACES_API_KEY` | Google Places (New) | Optional | Without it, Places tools default to `dryRun`. Paid; create at https://console.cloud.google.com/. |
| `OPENCORPORATES_API_KEY` | OpenCorporates v0.4 | Optional | Without it, business_entity_* tools work but rate-limited to ~50/day with attribution. Free signup at https://opencorporates.com/. |
| `DOL_MCP_HOST` | HTTP server | Optional | Default `127.0.0.1`. Set `0.0.0.0` for Render. |
| `DOL_MCP_PORT` (or `PORT`) | HTTP server | Optional | Default `8787`. Render injects `PORT`. |
| `DOL_MCP_AUTH_TOKEN` | HTTP server | Optional | When set, requires `Authorization: Bearer <token>` or `X-API-Key`. **Currently disabled** in production because Claude.ai's connector form has no Bearer-token field; the Render URL itself is the secret. |
| `DOL_MCP_ALLOW_ORIGIN` | HTTP server CORS | Optional | Default `*`. Set to `https://claude.ai` for the production deploy. |
| `DOL_MCP_ENV_FILE` | env-file resolution | Optional | Override the default `.env` lookup. |

`.env` is gitignored. **`.history/` is gitignored** because the VSCode "Local History" extension snapshots `.env` to `.env_<timestamp>` files that contain live API keys — never commit these.

### Production deployment

Render reads `render.yaml` and provisions everything. Secrets (`DOL_API_KEY`, `SAM_API_KEY`, `GOOGLE_PLACES_API_KEY`, `OPENCORPORATES_API_KEY`) are marked `sync: false` in the YAML — Render prompts for them on Blueprint Apply and never persists them to git. After any new env var is added to `render.yaml`, the operator must paste the value into the Render Environment tab; the YAML change alone won't populate the value.

Verify the deploy:

```bash
curl https://dol-whd-mcp.onrender.com/health
# {"ok":true,"name":"dol-whd-mcp","transport":"streamable-http","mcpPath":"/mcp","authRequired":false}
```

## Gotchas

- **WSL ↔ Windows node_modules.** If `npx tsx` errors about `@esbuild/win32-x64`, the modules came from Windows. Fix: `rm -rf node_modules && npm install` in WSL.
- **Lefthook hangs.** The parent git repo has lefthook hooks that block on lint/types of unrelated projects in this WSL setup. Bypass with `LEFTHOOK=0 git commit -m "..."` (lefthook's own opt-out — not `--no-verify`, which is more nuclear).
- **Google Places `includedType` vs `includedTypes`.** Text Search uses `includedType` (singular string); Nearby Search uses `includedTypes` (plural array). Don't conflate. The MCP schema accepts an array for forward compat, but the Text Search wire payload sends only the first element. Clean this up if you ever extend to Nearby Search.
- **DOL 429 retries.** `DolApiClient` retries 429 / 502 / 503 / 504 up to 4 times with exponential backoff (~2s, 4s, 8s, 16s, capped at 16s per attempt; respects `Retry-After` capped at 30s). Total max wait per request is ~30s, comfortably under the 60s Claude.ai MCP transport timeout. Tune via the `maxRetries` constructor option.
- **`foreign_labor_search` first-call cost.** First request per `(visaProgram, fiscalYear, fiscalQuarter)` downloads + stream-parses the official OFLC XLSX (30-90s for LCA quarters) and writes a gzipped JSONL alongside it in `cacheDir`. Subsequent calls bypass the XLSX entirely and stream-read the JSONL (1-3s). On Render free-tier the container's ephemeral disk wipes after 15 min idle, so the cache rebuilds on cold start. **Per `<TOOL_ROUTING>` rules: don't pull this tool unless the user explicitly asks about visa data.**
- **OpenCorporates rate limit.** Free tier ~50 lookups/day. The `<TOOL_ROUTING>` block restricts `business_entity_search` to legal-identity / ownership questions to avoid burning the budget on universe-building queries that should hit `places_search` instead.
- **Render free-tier cold start.** ~30-50s on the first request after 15+ min idle. JSONL caches reset along with the container. If this becomes painful, options are (a) upgrade to Starter $7/mo for always-warm, (b) external uptime ping every 10 min, or (c) external object storage for cache durability.
- **Repo lives in a monorepo-ish parent.** This project sits at `WHD/DOL_MCP/` inside a larger `Coding/` git repo. To push DOL_MCP-only history to GitHub: `git subtree split --prefix=WHD/DOL_MCP HEAD -b dol-mcp-export && git push https://github.com/UHQ-Actual/DOL_MCP.git dol-mcp-export:main`.
- **GitHub account.** Public repo at [UHQ-Actual/DOL_MCP](https://github.com/UHQ-Actual/DOL_MCP). Switch with `gh auth switch -u UHQ-Actual` before pushes, then back to `TrueCrimeDev`.

## Conventions

- Conventional Commits, scoped: `feat(dol-mcp):`, `fix(dol-mcp):`, `test(dol-mcp):`, `docs(dol-mcp):`, `chore(dol-mcp):`.
- Trailer for Claude commits: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Never log API key values. Route every echoed URL or error body through `sanitizeUrl()`.
- Spec/plan filenames use ISO `YYYY-MM-DD-<topic>-design.md` / `YYYY-MM-DD-<topic>.md`.
- After any change to `systemprompt.md`, remind the operator to paste the new content into their Claude Project / connector — the MCP server can't push prompt updates to clients.

## Agent behavioral rules — `systemprompt.md` summary

The full rules live in `systemprompt.md`; this is a quick orientation so you don't re-derive them.

**`<DEPLOYMENT>`** — Region scope (Midwest), state list, WHD hub-table mapping, priority industries (restaurants, car washes, construction, logistics/warehousing, agriculture, meat and poultry processing, janitorial, landscaping, retail and grocery, home care, hospitality), regional priorities (meat processing in IA/NE/MN/KS/MO; auto-supply in MI/OH/IN; H-2A footprints in MI/OH/WI/IL).

**`<INTERACTION>`** — Clarifying questions reach the user via the `AskUserQuestion` tool only, never as free-text prose questions. Bundle related sub-questions into one call (max 4 per call). Default to acting on Midwest scope rather than asking which states.

**`<TOOL_ROUTING>`** — Match tool subset to question domain:
- Industry research, not consumer recommendations. **Never filter, sort, or truncate by rating, popularity, or review count unless the user explicitly asks.**
- **HARD RULE — visa data is opt-in.** Never call `foreign_labor_search` / `lca_*` / `foreign_labor_*` unless the user has explicitly asked about visa workers, H-1B, H-2A, H-2B, LCA, PERM, or guest-worker programs. "Adding completeness" is not a justification.
- Restaurants → `places_search` + `places_detail` + `adv_estimate`; no visa data.
- Farms → H-2A only; never H-2B.
- Construction / hospitality / non-ag seasonal → H-2B only; never H-2A.
- Federal contracts → SAM + USAspending; no labor data unless requested.
- Tech / specialty occupations → LCA tools.
- **Establishment research tool chain**: `census_area_profile` → `places_search` → `osha_inspection_search` (for `employeesAtSite`) → `adv_estimate`.
- **`business_entity_search` only** for legal-identity / ownership / DBA-to-legal-entity / registered-agent questions; not for general universe building.
- **DBA vs legal entity cross-reference**: Places returns trade names; WHD/OSHA/registry use legal entities. When enforcement returns zero hits on a trade name, look up the legal entity via `business_entity_search` and retry.
- **State vs city filtering**: prefer state filter (server-side) over city (client-side) for fan-outs.
- **WHD `findings_end_date`**: date violations stopped, NOT case-conclusion. Wider window (≥ 2022-10-01) for "recent" queries.
- **State-plan OSHA reporting lag**: in MI/MN/IA/IN, recent inspections may lag federal OIS by 1-3 months. Annotate, don't suppress.

## Companion docs

- `systemprompt.md` — Agent behavioral rules (`<DEPLOYMENT>`, `<INTERACTION>`, `<TOOL_ROUTING>` blocks). Must be pasted into the operator's Claude Project / connector to take effect; the MCP server can't push prompt updates.
- `INFO.md` — Spec for the Restaurant Research Agent (Claude Project) that uses `places_search` as its Pass 2 retrieval primitive. Source-tracing requirement (`googleMapsUrl` per row) drives the Places field mask.
- `docs/data-sources/state-osha-programs.md` — Federal vs state-plan OSHA jurisdiction map for the 10 Midwest states; explains why `osha_inspection_search` data lags 1-3 months in state-plan states (MI/MN/IA/IN) and what's missing entirely (injury logs, narratives). Pairs with the `osha_state_plan_lookup` tool.
- `docs/data-sources/state-business-registration.md` — Midwest Secretary of State / DFI business-entity portals; free search vs paid bulk; registered-agent and officer search availability per state. Pairs with the `sos_portal_lookup` and `business_entity_search` tools.
- `docs/superpowers/specs/2026-05-06-google-places-restaurant-research-design.md`
- `docs/superpowers/plans/2026-05-06-google-places-tools.md`
- `render.yaml` — Render Blueprint. Adds new env-var slots (`sync: false` for secrets) when new clients require keys.
- `README.md` — User-facing tool reference and usage examples.
