# DOL_MCP — Claude Code Notes

TypeScript MCP server exposing U.S. labor-enforcement and contract data as tools for Claude Code.

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
npm test             # tsx --test tests/*.test.ts (mocked fetch only)
npm start            # stdio MCP (dist/server.js)
npm run start:http   # streamable HTTP MCP at :8787
```

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
| `src/places.ts` | Google Places (New) Text Search + Place Details |
| `src/queryRouter.ts` | `ask_government_data` plain-English routing |
| `src/tools.ts` | `createToolHandlers()` wires clients to handlers |
| `src/server.ts` | `createServer()` registers MCP tools with Zod schemas |
| `src/httpServer.ts` | Streamable HTTP transport |
| `src/env.ts` | `loadDolApiKey` / `loadSamApiKey` / `loadGooglePlacesApiKey` |
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

`.env` is gitignored. **`.history/` is gitignored** because the VSCode "Local History" extension snapshots `.env` to `.env_<timestamp>` files that contain live API keys — never commit these.

## Gotchas

- **WSL ↔ Windows node_modules.** If `npx tsx` errors about `@esbuild/win32-x64`, the modules came from Windows. Fix: `rm -rf node_modules && npm install` in WSL.
- **Lefthook hangs.** The parent git repo has lefthook hooks that block on lint/types of unrelated projects in this WSL setup. Bypass with `LEFTHOOK=0 git commit -m "..."` (lefthook's own opt-out — not `--no-verify`, which is more nuclear).
- **Google Places `includedType` vs `includedTypes`.** Text Search uses `includedType` (singular string); Nearby Search uses `includedTypes` (plural array). Don't conflate. The MCP schema accepts an array for forward compat, but the Text Search wire payload sends only the first element. Clean this up if you ever extend to Nearby Search.
- **No retries on 429.** By design (YAGNI). Add a single backoff-retry if Google Places rate-limits become operational.
- **`foreign_labor_search` first-call cost.** First request per `(visaProgram, fiscalYear, fiscalQuarter)` downloads + stream-parses the official OFLC XLSX (30-90s for LCA quarters) and writes a gzipped JSONL alongside it in `cacheDir`. Subsequent calls bypass the XLSX entirely and stream-read the JSONL (1-3s). On Render free-tier, the container's ephemeral disk wipes after 15 min idle so the cache rebuilds on cold start.
- **Repo lives in a monorepo-ish parent.** This project sits at `WHD/DOL_MCP/` inside a larger `Coding/` git repo. To push DOL_MCP-only history to GitHub: `git subtree split --prefix=WHD/DOL_MCP HEAD -b dol-mcp-export && git push https://github.com/UHQ-Actual/DOL_MCP.git dol-mcp-export:main`.
- **GitHub account.** Public repo at [UHQ-Actual/DOL_MCP](https://github.com/UHQ-Actual/DOL_MCP). Switch with `gh auth switch -u UHQ-Actual` before pushes, then back to `TrueCrimeDev`.

## Conventions

- Conventional Commits, scoped: `feat(dol-mcp):`, `fix(dol-mcp):`, `test(dol-mcp):`, `docs(dol-mcp):`, `chore(dol-mcp):`.
- Trailer for Claude commits: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Never log API key values. Route every echoed URL or error body through `sanitizeUrl()`.
- Spec/plan filenames use ISO `YYYY-MM-DD-<topic>-design.md` / `YYYY-MM-DD-<topic>.md`.

## Companion docs

- `INFO.md` — Spec for the Restaurant Research Agent (Claude Project) that uses `places_search` as its Pass 2 retrieval primitive. Source-tracing requirement (`googleMapsUrl` per row) drives the Places field mask.
- `docs/superpowers/specs/2026-05-06-google-places-restaurant-research-design.md`
- `docs/superpowers/plans/2026-05-06-google-places-tools.md`
- `README.md` — User-facing tool reference and usage examples.
