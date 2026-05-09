# Midwest State OSHA Programs — Data Source Reference

Reference for how OSHA inspection data flows from each Midwest state into a queryable form.

## Bottom line

**None of the Midwest state-plan OSHA programs publish their own public inspection API.** All state plans submit their data into the federal OSHA Information System (OIS), which the DOL_MCP `osha_inspection_search` tool already queries via `apiprod.dol.gov/v4/get/OSHA/inspection`. For every Midwest state, the existing tool is the right starting point.

The "missing data" problem you may see for state-plan states is a **reporting cadence issue**, not an API issue. State plans push their inspection records to OIS monthly or quarterly per OSHA Directive ADM 04-00-001, so the most recent 1–3 months of activity in MIOSHA / IOSHA / Iowa OSHA / MNOSHA may not yet appear in the federal database.

## Three OSHA jurisdiction tiers

| Tier | Coverage | Federal database has the data? |
|---|---|---|
| **Federal OSHA only** | Federal OSHA inspects everything in the state | Yes, immediately |
| **Public-sector-only state plan** | Federal OSHA covers private sector; state plan covers state/local government workers | Federal: yes immediately. State plan: with reporting lag. |
| **Complete state plan** | State plan covers private + public; federal OSHA only handles federal-jurisdiction-only workers (maritime, military, USPS) | With reporting lag (typically 1–3 months) |

## Midwest matrix

| State | Program | Tier | API? | Bulk download? | Records request | Practical lag |
|---|---|---|---|---|---|---|
| **Illinois** | IL OSHA (IDOL) | Public-sector-only state plan | No | No | FOIA via labor.illinois.gov | Federal handles private sector, current. State plan only covers IL state/local govt employees. |
| **Indiana** | IOSHA (IN DOL) | Complete state plan | No | No | Online form or fax 317-233-3790 ("IOSHA Case History Request"); mail to 402 W Washington St, Room W195, Indianapolis IN 46204 | ~1–3 months |
| **Iowa** | Iowa OSHA (DIAL) | Complete state plan | No | No | iowaopenrecords.nextrequest.com or RecordsRequest@IWD.Iowa.gov | ~1–3 months |
| **Kansas** | Federal OSHA | Federal | n/a | n/a | n/a | Current |
| **Michigan** | MIOSHA (LEO) | Complete state plan | No | No | LARA records request portal | ~1–3 months |
| **Minnesota** | MNOSHA (DLI) | Complete state plan | No | No | DLI 651-284-5050 | ~1–3 months |
| **Missouri** | Federal OSHA | Federal | n/a | n/a | n/a | Current |
| **Nebraska** | Federal OSHA | Federal | n/a | n/a | n/a | Current |
| **Ohio** | Federal OSHA | Federal | n/a | n/a | n/a | Current |
| **Wisconsin** | Federal OSHA | Federal | n/a | n/a | n/a | Current |

## Federal data path (used by `osha_inspection_search`)

| Endpoint | What it serves |
|---|---|
| `https://apiprod.dol.gov/v4/get/OSHA/inspection` | All inspection records (federal + state-plan) — what `osha_inspection_search` queries |
| `https://apiprod.dol.gov/v4/get/OSHA/violation` | All citations / violations / penalties — what `includeViolations: true` joins |
| `https://www.osha.gov/ords/imis/establishment.html` | Public-facing OIS Establishment Search (HTML; same data as the API) |
| `https://www.osha.gov/data` | Federal OSHA's data hub — bulk inspection / violation files (CSV/zip), not API |
| `https://catalog.data.gov/dataset/osha-information-system-a0a2d` | OIS dataset metadata on data.gov |

## Important: things federal OIS does NOT include

| Missing | Why it matters | Where to go |
|---|---|---|
| **Injury & illness logs (Form 300/300A/301)** | Required reports from establishments with 250+ workers in some industries | `https://www.osha.gov/Establishment-Specific-Injury-and-Illness-Data` (ITA submissions) |
| **Recent state-plan inspections (last 1–3 months)** | Reporting lag | Direct records request to the state plan |
| **State-plan internal investigation memos and case notes** | Confidential | FOIA / state public records request |
| **Whistleblower complaints (OSHA 11(c) cases)** | Different program, separate system | OSHA Whistleblower Program directly |

## When the existing tool is enough

- You need inspection metadata (open date, scope, type, name, address, NAICS, SIC) → `osha_inspection_search`
- You need citation history with CFR codes, penalties, gravity scores → `osha_inspection_search` with `includeViolations: true`
- You need `employeesAtSite` for ADV Method 1 input → `osha_inspection_search` (employee count is a required OSHA field per inspection)
- You're working in MO, NE, OH, WI, KS, or IL private sector → no lag, federal data is current

## When to reach past the tool

- You need the last 90 days of activity in a state-plan state (MI, MN, IA, IN) → file a state records request (or wait for the next OIS sync)
- You need injury / illness / fatality counts at an establishment → ITA dataset, separate
- You need the actual inspection narrative / case file → FOIA the state plan or federal area office

## Possible MCP additions (not yet built)

- `osha_state_plan_lookup` — static reference tool returning tier, program name, and expected reporting lag for a given state code. Would let agents annotate sparse `osha_inspection_search` results with the right caveat.
- `osha_employer_summary` — aggregate `osha_inspection_search` rows into an employer-level rollup (total inspections, citations, penalties, repeat-violator flag) so agents stop manually doing the dedup math.

## Sources

- [LEO – MIOSHA Inspection Data (Michigan)](https://www.michigan.gov/leo/bureaus-agencies/miosha/resources/data-and-statistics/miosha-inspection-data)
- [Michigan State Plan – federal OSHA](https://www.osha.gov/stateplans/mi)
- [MNOSHA Compliance: Inspections (MN DLI)](https://www.dli.mn.gov/business/workplace-safety-and-health/mnosha-compliance-inspections)
- [Minnesota State Plan – federal OSHA](https://www.osha.gov/stateplans/mn)
- [IOSHA FAQs (Indiana DOL)](https://www.in.gov/dol/iosha/iosha-faqs/)
- [IOSHA Home (Indiana DOL)](https://www.in.gov/dol/iosha/iosha-home/)
- [Iowa OSHA – Department of Inspections, Appeals, & Licensing](https://dial.iowa.gov/iosha)
- [Records Requests – Iowa Division of Labor](https://www.iowalabor.gov/records-requests)
- [Iowa State Plan – federal OSHA](https://www.osha.gov/stateplans/ia)
- [Illinois OSHA (IDOL)](https://labor.illinois.gov/laws-rules/safety.html)
- [Illinois State Plan – federal OSHA](https://www.osha.gov/stateplans/il)
- [Federal OSHA Data Hub](https://www.osha.gov/data)
- [Federal OSHA Establishment Search](https://www.osha.gov/ords/imis/establishment.html)
- [OSHA Information System dataset – data.gov](https://catalog.data.gov/dataset/osha-information-system-a0a2d)
