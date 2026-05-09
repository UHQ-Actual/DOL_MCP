import assert from "node:assert/strict";
import test from "node:test";

import { estimateAdv, normalizeFormat } from "../src/adv.js";

test("Method 1 per-employee: FSR 30 employees in mid-metro yields $2.1M, FLSA Above", () => {
  const result = estimateAdv({
    serviceType: "FSR",
    format: "Casual dining",
    chainFlag: "No",
    employeeCount: 30,
    areaType: "mid_metro",
  });
  assert.equal(result.method, 1);
  assert.equal(result.estimate, 30 * 70_000);
  assert.deepEqual(result.range, { low: Math.round(2_100_000 * 0.6), high: Math.round(2_100_000 * 1.4) });
  assert.equal(result.flsaFlag, "Above");
  assert.equal(result.confidence, "Medium");
  assert.equal(result.appliedMultiplier, 1.0);
  assert.match(result.advNotes, /^FLSA: Above; Range: \$1\.26M-\$2\.94M; Method: 1; Inputs: 30 employees @ \$70,000\/employee\/yr \(FSR\), 1× multiplier$/);
});

test("Method 1 with major_metro and high COL state stacks to 1.30 multiplier", () => {
  const result = estimateAdv({
    serviceType: "FSR",
    format: "Casual dining",
    employeeCount: 30,
    areaType: "major_metro",
    highCostOfLivingState: true,
  });
  assert.equal(result.appliedMultiplier, 1.3);
  assert.equal(result.estimate, Math.round(30 * 70_000 * 1.3));
  assert.equal(result.flsaFlag, "Above");
});

test("Method 2 per-seat: casual dining 80 seats mid-metro yields ~$767k, Borderline FLSA", () => {
  const result = estimateAdv({
    serviceType: "FSR",
    format: "Casual dining",
    seatCount: 80,
    areaType: "mid_metro",
  });
  assert.equal(result.method, 2);
  assert.equal(result.estimate, 80 * 27 * 355);
  assert.equal(result.confidence, "Low");
  // 766,800 × 0.6 = 460,080 (< $500k) and × 1.4 = 1,073,520 (> $500k) → Borderline
  assert.equal(result.flsaFlag, "Borderline");
  assert.match(result.advNotes, /Method: 2;.*80 seats × \$27\/seat\/day × 355 days\/yr/);
});

test("Method 2 with major-metro 1.20 multiplier crosses cleanly into Above", () => {
  const result = estimateAdv({
    format: "Casual dining",
    seatCount: 80,
    areaType: "major_metro",
  });
  assert.equal(result.method, 2);
  assert.equal(result.estimate, Math.round(80 * 27 * 355 * 1.2));
  assert.equal(result.flsaFlag, "Above");
});

test("Method 3 chain per-unit ADV with enterprise-coverage caveat", () => {
  const result = estimateAdv({
    chainFlag: "Yes",
    chainPerUnitAdv: 1_200_000,
    format: "Fast food",
    areaType: "mid_metro",
  });
  assert.equal(result.method, 3);
  assert.equal(result.estimate, 1_200_000);
  assert.equal(result.flsaFlag, "Above");
  assert.equal(result.confidence, "Medium");
  assert.match(result.advNotes, /Enterprise coverage may apply regardless of single-unit estimate/);
});

test("Method 4 fallback: small-town fast food default = $1.1M × 0.85 = $935k", () => {
  const result = estimateAdv({
    format: "Fast food",
    areaType: "small_or_rural",
  });
  assert.equal(result.method, 4);
  assert.equal(result.estimate, Math.round(1_100_000 * 0.85));
  assert.equal(result.confidence, "Very Low");
  assert.match(result.advNotes, /Default: no per-unit data/);
  assert.equal(result.flsaFlag, "Above");
});

test("FLSA Borderline when range straddles $500k threshold", () => {
  const result = estimateAdv({
    format: "Cafe",
    areaType: "small_or_rural",
  });
  assert.equal(result.method, 4);
  assert.equal(result.estimate, Math.round(600_000 * 0.85));
  assert.equal(result.range?.low, Math.round(Math.round(600_000 * 0.85) * 0.6));
  assert.equal(result.range?.high, Math.round(Math.round(600_000 * 0.85) * 1.4));
  assert.equal(result.flsaFlag, "Borderline");
});

test("FLSA Below for tiny food truck default", () => {
  const result = estimateAdv({
    format: "Food truck",
    areaType: "small_or_rural",
  });
  assert.equal(result.method, 4);
  assert.equal(result.estimate, Math.round(250_000 * 0.85));
  assert.equal(result.flsaFlag, "Below");
});

test("Insufficient Data when no employee, seat, chain ADV, or format provided", () => {
  const result = estimateAdv({ serviceType: "FSR" });
  assert.equal(result.method, null);
  assert.equal(result.estimate, null);
  assert.equal(result.flsaFlag, "Insufficient Data");
  assert.equal(result.confidence, null);
  assert.equal(result.range, null);
  assert.match(result.advNotes, /^FLSA: Insufficient Data; Range: --; Method: --;/);
});

test("Stale sources force confidence to Very Low even on Method 1", () => {
  const result = estimateAdv({
    serviceType: "FSR",
    format: "Casual dining",
    employeeCount: 30,
    staleSources: true,
  });
  assert.equal(result.confidence, "Very Low");
  assert.match(result.advNotes, /Stale listing/);
});

test("List-page employee data caps Method 1 confidence at Low", () => {
  const result = estimateAdv({
    serviceType: "FSR",
    format: "Casual dining",
    employeeCount: 30,
    listPageEmployeeData: true,
  });
  assert.equal(result.method, 1);
  assert.equal(result.confidence, "Low");
});

test("Method 3 takes precedence over employeeCount when chain per-unit ADV is provided", () => {
  const result = estimateAdv({
    chainFlag: "Yes",
    chainPerUnitAdv: 950_000,
    employeeCount: 25,
    format: "Fast casual",
    areaType: "mid_metro",
  });
  assert.equal(result.method, 3);
});

test("Cuisine qualifier with em-dash is stripped before benchmark lookup", () => {
  assert.equal(normalizeFormat("Casual dining — Italian"), "casual_dining");
  assert.equal(normalizeFormat("Bar & grill — American"), "bar_grill");
  assert.equal(normalizeFormat("Food truck — Korean"), "food_truck");
  assert.equal(normalizeFormat("Pizzeria"), "pizzeria");
  assert.equal(normalizeFormat("Counter service"), "fast_food_or_counter");
  assert.equal(normalizeFormat("Unknown"), "other");
});

test("Food truck with seat count falls back to Method 4 default", () => {
  const result = estimateAdv({
    format: "Food truck",
    seatCount: 10,
    areaType: "mid_metro",
  });
  assert.equal(result.method, 4);
  assert.equal(result.estimate, 250_000);
});
