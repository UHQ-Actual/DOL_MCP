import assert from "node:assert/strict";
import test from "node:test";

import { getOshaJurisdiction } from "../src/oshaJurisdiction.js";

test("Michigan resolves to MIOSHA, complete state plan, ~90 day lag", () => {
  const result = getOshaJurisdiction({ stateCode: "MI" });
  assert.equal(result.jurisdiction.tier, "complete_state_plan");
  assert.equal(result.jurisdiction.programName, "MIOSHA");
  assert.equal(result.jurisdiction.expectedReportingLagDays, 90);
  assert.match(result.jurisdiction.notes, /complete state plan/);
  assert.match(result.caveat, /MIOSHA/);
});

test("Illinois is public-sector-only state plan; private sector flagged as federal", () => {
  const result = getOshaJurisdiction({ stateCode: "IL" });
  assert.equal(result.jurisdiction.tier, "public_only_state_plan");
  assert.equal(result.jurisdiction.programName, "IL OSHA");
  assert.match(result.jurisdiction.notes, /public-sector-only/);
  assert.match(result.jurisdiction.notes, /federal OSHA covers private sector/);
});

test("Ohio is federal OSHA, no lag", () => {
  const result = getOshaJurisdiction({ stateCode: "OH" });
  assert.equal(result.jurisdiction.tier, "federal_osha");
  assert.equal(result.jurisdiction.programName, "Federal OSHA");
  assert.equal(result.jurisdiction.expectedReportingLagDays, 0);
  assert.match(result.caveat, /data is current/);
});

test("California resolves to Cal/OSHA, complete state plan", () => {
  const result = getOshaJurisdiction({ stateCode: "CA" });
  assert.equal(result.jurisdiction.tier, "complete_state_plan");
  assert.equal(result.jurisdiction.programName, "Cal/OSHA");
});

test("Lowercase and whitespace-padded codes are accepted", () => {
  const result = getOshaJurisdiction({ stateCode: " mn " });
  assert.equal(result.jurisdiction.stateCode, "MN");
  assert.equal(result.jurisdiction.programName, "MNOSHA");
});

test("Unknown state code throws a clear error", () => {
  assert.throws(
    () => getOshaJurisdiction({ stateCode: "ZZ" }),
    /Unknown state code "ZZ"/,
  );
});

test("Midwest priority states have correct tier classification", () => {
  const tiers = {
    IL: "public_only_state_plan",
    IN: "complete_state_plan",
    IA: "complete_state_plan",
    KS: "federal_osha",
    MI: "complete_state_plan",
    MN: "complete_state_plan",
    MO: "federal_osha",
    NE: "federal_osha",
    OH: "federal_osha",
    WI: "federal_osha",
  };
  for (const [code, expectedTier] of Object.entries(tiers)) {
    const result = getOshaJurisdiction({ stateCode: code });
    assert.equal(result.jurisdiction.tier, expectedTier, `${code} should be ${expectedTier}`);
  }
});

test("All complete-state-plan jurisdictions have a programName and 90-day lag", () => {
  const completePlanStates = ["AK", "AZ", "CA", "HI", "IN", "IA", "KY", "MD", "MI", "MN", "NV", "NM", "NC", "OR", "PR", "SC", "TN", "UT", "VT", "VA", "WA", "WY"];
  for (const code of completePlanStates) {
    const result = getOshaJurisdiction({ stateCode: code });
    assert.equal(result.jurisdiction.tier, "complete_state_plan", `${code} should be a complete state plan`);
    assert.equal(result.jurisdiction.expectedReportingLagDays, 90);
    assert.ok(result.jurisdiction.programName, `${code} should have a program name`);
  }
});
