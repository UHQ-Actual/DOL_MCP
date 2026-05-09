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
  assert.equal(result.capacityInput, "none");
  assert.equal(result.capacitySource, null);
  assert.match(result.notes, /Method 1; 30 employees × \$70,000\/yr \(FSR\); multiplier 1× \(mid_metro\)/);
});

test("Method 1 with major_metro and high-COL stacks to 1.30 multiplier", () => {
  const result = estimateAdv({
    serviceType: "FSR",
    format: "Casual dining",
    employeeCount: 30,
    areaType: "major_metro",
    highCostOfLivingState: true,
  });
  assert.equal(result.appliedMultiplier, 1.3);
  assert.equal(result.estimate, Math.round(30 * 70_000 * 1.3));
  assert.match(result.notes, /multiplier 1.3× \(major_metro \+ high-COL\)/);
});

test("Method 2 with direct seatCount: capacity_input = seat_count, confidence Medium", () => {
  const result = estimateAdv({
    format: "Casual dining",
    seatCount: 80,
    capacitySource: "OpenTable",
    areaType: "mid_metro",
  });
  assert.equal(result.method, 2);
  assert.equal(result.capacityInput, "seat_count");
  assert.equal(result.capacitySource, "OpenTable");
  assert.equal(result.derivedSeatCount, 80);
  assert.equal(result.estimate, 80 * 27 * 355);
  assert.equal(result.confidence, "Medium");
  assert.match(result.notes, /capacity=seat_count \(OpenTable\), 80 seats/);
});

test("Method 2 with occupantLoad: applies 0.85 multiplier to derive seats, Medium confidence", () => {
  const result = estimateAdv({
    format: "Casual dining",
    occupantLoad: 100,
    capacitySource: "fire_marshal",
    areaType: "mid_metro",
  });
  assert.equal(result.method, 2);
  assert.equal(result.capacityInput, "occupant_load");
  assert.equal(result.derivedSeatCount, Math.round(100 * 0.85));
  assert.equal(result.estimate, Math.round(100 * 0.85) * 27 * 355);
  assert.equal(result.confidence, "Medium");
  assert.match(result.notes, /capacity=occupant_load \(fire_marshal\), 85 seats/);
});

test("Method 2 with squareFootage: 4000 sqft FSR yields ~159 seats per IBC formula", () => {
  // BOH 30% → dining 2,800 sqft → 2800/15 = 186.67 occupants → ×0.85 = 158.67 → round 159
  const result = estimateAdv({
    serviceType: "FSR",
    format: "Casual dining",
    squareFootage: 4000,
    capacitySource: "assessor",
    areaType: "mid_metro",
  });
  assert.equal(result.method, 2);
  assert.equal(result.capacityInput, "square_footage");
  assert.equal(result.capacitySource, "assessor");
  assert.equal(result.derivedSeatCount, 159);
  assert.equal(result.confidence, "Low");
  assert.equal(result.estimate, 159 * 27 * 355);
});

test("Method 2 LSR squareFootage uses 40% BOH ratio", () => {
  // 3000 sqft LSR: BOH 40% → dining 1,800 → 1800/15 = 120 → ×0.85 = 102
  const result = estimateAdv({
    serviceType: "LSR",
    format: "Fast food",
    squareFootage: 3000,
    capacitySource: "assessor",
    areaType: "mid_metro",
  });
  assert.equal(result.derivedSeatCount, 102);
});

test("Method 2 bohRatio override beats the service-type default", () => {
  const result = estimateAdv({
    serviceType: "FSR",
    format: "Casual dining",
    squareFootage: 4000,
    bohRatio: 0.5,
    areaType: "mid_metro",
  });
  // dining 2000 → 2000/15 = 133.33 → ×0.85 = 113.33 → round 113
  assert.equal(result.derivedSeatCount, 113);
});

test("Method 2 with parkingSpaces: applies format-typical ratio, Very Low confidence", () => {
  const result = estimateAdv({
    format: "Casual dining",
    parkingSpaces: 60,
    capacitySource: "satellite",
    areaType: "mid_metro",
  });
  assert.equal(result.method, 2);
  assert.equal(result.capacityInput, "parking_count");
  assert.equal(result.derivedSeatCount, Math.round(60 * 2.75));
  assert.equal(result.confidence, "Very Low");
});

test("parkingRatio override beats the format-typical default", () => {
  const result = estimateAdv({
    format: "Casual dining",
    parkingSpaces: 60,
    parkingRatio: 3.5,
    areaType: "mid_metro",
  });
  assert.equal(result.derivedSeatCount, 60 * 3.5);
});

test("capacity priority: seatCount beats occupantLoad beats squareFootage beats parkingSpaces", () => {
  const r1 = estimateAdv({
    format: "Casual dining",
    seatCount: 80,
    occupantLoad: 200,
    squareFootage: 4000,
    parkingSpaces: 60,
    areaType: "mid_metro",
  });
  assert.equal(r1.capacityInput, "seat_count");
  assert.equal(r1.derivedSeatCount, 80);

  const r2 = estimateAdv({
    format: "Casual dining",
    occupantLoad: 200,
    squareFootage: 4000,
    parkingSpaces: 60,
    areaType: "mid_metro",
  });
  assert.equal(r2.capacityInput, "occupant_load");

  const r3 = estimateAdv({
    format: "Casual dining",
    squareFootage: 4000,
    parkingSpaces: 60,
    areaType: "mid_metro",
  });
  assert.equal(r3.capacityInput, "square_footage");

  const r4 = estimateAdv({
    format: "Casual dining",
    parkingSpaces: 60,
    areaType: "mid_metro",
  });
  assert.equal(r4.capacityInput, "parking_count");
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
  assert.equal(result.capacityInput, "none");
  assert.match(result.notes, /enterprise coverage may apply regardless of single-unit estimate/);
});

test("Method 4 fallback: small-town fast food default = $1.1M × 0.85 = $935k", () => {
  const result = estimateAdv({
    format: "Fast food",
    areaType: "small_or_rural",
  });
  assert.equal(result.method, 4);
  assert.equal(result.estimate, Math.round(1_100_000 * 0.85));
  assert.equal(result.confidence, "Very Low");
  assert.equal(result.capacityInput, "none");
  assert.match(result.notes, /default: no per-unit data/);
  assert.equal(result.flsaFlag, "Above");
});

test("FLSA Borderline when range straddles $500k threshold", () => {
  const result = estimateAdv({
    format: "Cafe",
    areaType: "small_or_rural",
  });
  assert.equal(result.method, 4);
  assert.equal(result.flsaFlag, "Borderline");
});

test("FLSA Below for tiny food truck default", () => {
  const result = estimateAdv({
    format: "Food truck",
    areaType: "small_or_rural",
  });
  assert.equal(result.method, 4);
  assert.equal(result.flsaFlag, "Below");
});

test("Insufficient Data when no employee, capacity input, chain ADV, or format provided", () => {
  const result = estimateAdv({ serviceType: "FSR" });
  assert.equal(result.method, null);
  assert.equal(result.estimate, null);
  assert.equal(result.flsaFlag, "Insufficient Data");
  assert.equal(result.confidence, null);
  assert.equal(result.range, null);
  assert.equal(result.capacityInput, "none");
  assert.match(result.notes, /^Insufficient data:/);
});

test("Stale sources force confidence to Very Low even on Method 1", () => {
  const result = estimateAdv({
    serviceType: "FSR",
    format: "Casual dining",
    employeeCount: 30,
    staleSources: true,
  });
  assert.equal(result.confidence, "Very Low");
  assert.match(result.notes, /stale listing/);
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

test("Food truck with seat or capacity input falls back to Method 4 default", () => {
  const result = estimateAdv({
    format: "Food truck",
    seatCount: 10,
    areaType: "mid_metro",
  });
  assert.equal(result.method, 4);
  assert.equal(result.estimate, 250_000);
});

test("capacitySource is echoed in result.capacitySource and appears in notes", () => {
  const result = estimateAdv({
    format: "Casual dining",
    seatCount: 80,
    capacitySource: "health_permit",
    areaType: "mid_metro",
  });
  assert.equal(result.capacitySource, "health_permit");
  assert.match(result.notes, /\(health_permit\)/);
});
