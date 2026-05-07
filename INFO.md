# How the Restaurant Research Agent Works

A walkthrough of what happens between a request and a candidate list.

---

## What it is

The Restaurant Research Agent is a research accelerator for WHD case selection analysts. An analyst sends it a target area — a city, ZIP code, or neighborhood — and the agent returns a deduplicated, source-traced list of restaurants in that area, formatted to a fixed schema, with screening estimates of each establishment's annual dollar volume and a flag for the FLSA $500K enterprise coverage threshold.

It does not select cases. It does not investigate. It produces the research package an analyst would otherwise spend hours assembling by hand, the same way every time.

The agent runs on Claude inside a Claude Project. Three files do the work: a system prompt that defines behavior, a classification rules file that defines vocabulary and scoring criteria, and an ADV estimation file that defines the dollar-volume methodology. The analyst sees a chat interface, types a request, and receives a structured response.

---

## Message classification

Every interaction starts with the analyst's first message. The agent classifies it into one of four categories:

- **Location only** ("Lansing, MI" or a ZIP code). Runs the full workflow with default parameters.
- **Location with constraints** ("Lansing FSR only, 25 rows max"). Confirms the parsed constraints in the area summary, then runs the workflow with filters applied.
- **Question without a location** ("what do you do?"). Conversational answer, no table.
- **Ambiguous area** ("Springfield" with no state). Asks one clarifying question and waits. The reply re-enters classification on the next turn.

This is the first gate. Most workflow problems trace back to a misclassified opening message.

---

## Pass 1: Plan

The agent looks up the target area's population, calculates a density-based row target (roughly population divided by 250), and applies a tier floor:

- Under 5,000: minimum 15 rows
- 5,000 to 25,000: minimum 30
- 25,000 to 75,000: minimum 50
- Over 75,000: minimum 80

The minimums prevent undercoverage in larger areas while keeping small-town requests reasonable. The analyst can override the count by saying so.

After setting the target, the agent lists four to six search strategies it intends to use.

---

## Pass 2: Retrieve

The agent searches public business listings, always starting with Google Business Profiles and Yelp. From there it enriches candidates with one or two additional sources from a ranked list (Bing Places, BBB, Facebook, Chamber of Commerce, Yellow Pages, Secretary of State entity searches), preferring direct business profiles over aggregated list pages.

Search rounds scale with the target:

- Under 30 rows: 3 rounds
- 30 to 60: 4 rounds
- 60 to 100: 5 rounds
- Over 100: 6 rounds

A round is one distinct query to one source. Each round must vary by source, query terms, or geographic subdivision — rewording the same query against the same source doesn't count.

For each candidate, the agent normalizes the data: trims legal suffixes from names, formats addresses consistently, assigns service type (LSR, FSR, Unclear), assigns cuisine and format from controlled vocabularies, determines chain status, and assigns confidence based on corroboration.

A critical rule applies throughout: every factual cell value must trace to a retrieved source. The agent will not infer cuisine, format, or service type from a restaurant's name alone. If no source confirms a value, the cell is marked Unknown.

---

## Pass 3: Audit Gate

Before producing output, the agent audits its own coverage:

- **Below 60%**: does not proceed. Executes at least two more rounds with new strategies, then re-audits.
- **60% to 85%**: executes at least one more round, then may proceed.
- **Above 85%**: proceeds to synthesis.

A diminishing-returns rule lets the agent stop after two consecutive rounds produce fewer than three new candidates each, regardless of coverage percentage. A 4,000-person town may simply not have 30 restaurants, and the gate is designed to recognize that and report it honestly rather than pad the list.

The audit logs target, actual, coverage percentage, rounds executed, and a shortfall explanation if coverage is below 85%.

---

## Pass 4: Synthesize

Three operations clean the data into final form:

- **Deduplicate.** Primary key: normalized name plus address. Secondary signal: matching website URL. When duplicates are found, the agent keeps the higher-confidence row.
- **Filter.** Closed businesses are removed unless explicitly requested. User filters apply here.
- **Rank.** If more candidates remain than the target, the agent keeps the highest-confidence rows first, then the most complete data. Anything cut is noted as partial coverage.

After this pass, the candidate list is final.

---

## Pass 5: Estimate ADV

The agent adds annual dollar volume estimates to every row. Four methods, ranked by input availability:

- **Method 1 — Per-employee** (preferred): employee count × per-employee benchmark ($65K LSR, $70K FSR, $67K Unclear).
- **Method 2 — Per-seat**: seat count × per-seat-per-day benchmark × operating days, varying by format.
- **Method 3 — Chain brand average**: publicly reported per-unit sales from franchise disclosures.
- **Method 4 — Format default** (fallback): flat ADV by format category, lowest confidence.

A geographic multiplier follows: 1.20 for major metros, 1.00 for mid-size, 0.85 for small/rural, plus 0.10 for high cost-of-living states.

Each estimate carries a ±40% range and a confidence level (Medium, Low, or Very Low — never High). The range determines the FLSA $500K flag:

- Range low end ≥ $500K: **Above**
- Range high end ≤ $500K: **Below**
- $500K within range: **Borderline**
- Inputs insufficient: **Insufficient Data**

The Borderline flag is important. An ADV estimate near the threshold cannot be cleanly assigned to either side, and the flag prevents false confidence in either direction. A required disclaimer below the ADV table makes clear that these are screening signals, not coverage determinations.

---

## Preflight

Before output reaches the analyst, the agent runs a silent contract check covering column order, source-tracing, link formatting, NAICS-to-service-type matching, confidence values, coverage accounting, the workplace reviews search line, and Audit Gate satisfaction. Failures trigger a fix-and-retry loop. When working correctly, this loop is invisible.

---

## The output

A single response with six sections in this order:

1. **Area summary.** City, state, population with source, size context.
2. **Main table.** Eleven columns: name, service_type, cuisine, format, address, website, naics_code, chain_flag, sources, confidence, notes.
3. **CSV link.** Single-line Markdown link.
4. **QC bullets.** Likely duplicates (capped at 10), missing fields, coverage accounting, search rounds log, shortfall explanation, diminishing-returns note.
5. **ADV Screening Estimates table.** One row per main-table row with estimate, range, method, FLSA flag, confidence, notes. Disclaimer line below.
6. **Workplace reviews search.** Final-line Markdown link to a Google query for employee reviews in the area.

The agent's job ends here. The analyst runs their own verification pass before forwarding anything to the District Director.

---

## What happens next (out of scope for the agent)

- **Analyst verification.** Spot-checks geographic scope, validates high-confidence rows, clicks websites, flags marginal inclusions. Preflight catches contract violations; analyst review catches judgment calls.
- **Target selection.** District Director reviews the analyst's forwarded subset and selects investigations.
- **Investigation.** Intake through closure happens in the human workflow.

The separation is deliberate. It's what makes the agent defensible as a research accelerator and keeps it from drifting into territory requiring human judgment, discretion, or legal authority.

---

## Why the workflow looks the way it does

A few design choices show up in the workflow but aren't obvious from the steps alone:

- **The four-pass structure with an Audit Gate** prevents premature synthesis. Without it, the model would finish whatever it had at the moment it felt like stopping.
- **Three reference files instead of one system prompt** because the 8,000-character instruction slot is a hard limit. Behavioral rules go in the system prompt; classification vocabulary and ADV methodology go in companion files the model reads on demand.
- **Source-tracing on every cell** is what makes the output a research package rather than a list of names. The grounding rules are reinforced at three different points in the system prompt because they're the rule most likely to drift over a long generation.
- **ADV estimates as screening signals, not findings.** The disclaimer line is non-negotiable because the alternative — analysts treating ±40% public-data estimates as coverage determinations — is a real legal risk.
- **One clarifying question per turn, then stop.** Prevents expensive workflows on the wrong area, which would waste the analyst's time on a 50-row list of restaurants in the wrong Springfield.

Each choice traces back to a failure mode the agent would otherwise hit. Together they're what separate a research accelerator from a fancy autocomplete.
