import assert from "node:assert/strict";
import test from "node:test";

import { getSosPortal } from "../src/sosPortal.js";

test("Michigan returns the new MiBusiness Registry URL, not the retired COFS URL", () => {
  const result = getSosPortal({ stateCode: "MI" });
  assert.equal(result.portal.verifiedScope, "verified");
  assert.equal(result.portal.portalUrl, "https://www.michigan.gov/corpentitysearch");
  assert.match(result.portal.notes, /MiBusiness Registry Portal launched June 23, 2025/);
  assert.doesNotMatch(result.portal.portalUrl, /cofs/i);
});

test("Wisconsin flags the DFI-not-SOS gotcha", () => {
  const result = getSosPortal({ stateCode: "WI" });
  assert.equal(result.portal.verifiedScope, "verified");
  assert.equal(result.portal.agencyType, "department_of_financial_institutions");
  assert.match(result.portal.notes, /DEPARTMENT OF FINANCIAL INSTITUTIONS, not the Secretary of State/);
});

test("Ohio reports the free monthly bulk feed", () => {
  const result = getSosPortal({ stateCode: "OH" });
  assert.equal(result.portal.verifiedScope, "verified");
  assert.equal(result.portal.bulkAvailable, true);
  assert.match(result.portal.bulkPricing as string, /FREE monthly reports/);
  assert.equal(result.portal.bulkUrl, "https://www.ohiosos.gov/business/business-reports");
});

test("Minnesota flags the free non-commercial bulk license", () => {
  const result = getSosPortal({ stateCode: "MN" });
  assert.equal(result.portal.verifiedScope, "verified");
  assert.match(result.portal.bulkPricing as string, /FREE for journalists/);
});

test("Nebraska reports the cheapest paid bulk pricing", () => {
  const result = getSosPortal({ stateCode: "NE" });
  assert.equal(result.portal.verifiedScope, "verified");
  assert.match(result.portal.bulkPricing as string, /\$15 per 1,000 records/);
});

test("All 10 Midwest states are verified, not general", () => {
  const midwest = ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "OH", "WI"];
  for (const code of midwest) {
    const result = getSosPortal({ stateCode: code });
    assert.equal(result.portal.verifiedScope, "verified", `${code} should be verified`);
    assert.ok(result.portal.portalUrl, `${code} should have a portalUrl`);
  }
});

test("Non-Midwest states fall through to general data with verifiable URLs", () => {
  const ca = getSosPortal({ stateCode: "CA" });
  assert.equal(ca.portal.verifiedScope, "general");
  assert.match(ca.portal.portalUrl, /^https:\/\//);
  assert.match(ca.portal.notes, /general portal data/);

  const ny = getSosPortal({ stateCode: "NY" });
  assert.equal(ny.portal.verifiedScope, "general");
  assert.equal(ny.portal.agencyType, "department_of_state");
});

test("Lowercase and whitespace-padded codes are accepted", () => {
  const result = getSosPortal({ stateCode: " mi " });
  assert.equal(result.portal.stateCode, "MI");
});

test("Unknown state code throws a clear error", () => {
  assert.throws(
    () => getSosPortal({ stateCode: "ZZ" }),
    /Unknown state code "ZZ"/,
  );
});

test("Hint text always points at the portal URL", () => {
  for (const code of ["MI", "OH", "CA", "NY", "TX"]) {
    const result = getSosPortal({ stateCode: code });
    assert.match(result.hint, new RegExp(escapeRegex(result.portal.portalUrl)));
  }
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
