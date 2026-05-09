import assert from "node:assert/strict";
import test from "node:test";

import {
  bucketAreaType,
  bucketRowScalingTier,
  CensusClient,
  isHighCostOfLivingState,
  rowScalingFloor,
  rowScalingTarget,
} from "../src/census.js";

test("returns dry-run sample profile without making any HTTP request", async () => {
  let calls = 0;
  const client = new CensusClient({
    fetchFn: async () => {
      calls += 1;
      throw new Error("should not call Census during dry run");
    },
  });

  const profile = await client.getAreaProfile({ dryRun: true });

  assert.equal(calls, 0);
  assert.equal(profile.resolved.placeName, "Hillsdale city");
  assert.equal(profile.resolved.stateCode, "MI");
  assert.equal(profile.population, 8124);
  assert.equal(profile.areaType, "small_or_rural");
  assert.equal(profile.rowScalingTier, "5k_to_25k");
  assert.equal(profile.rowScalingFloor, 30);
  assert.equal(profile.rowScalingTarget, Math.max(30, Math.ceil(8124 / 250)));
  assert.equal(profile.advMultiplierBase, 0.85);
  assert.equal(profile.highCostOfLivingState, false);
});

test("resolves city + state via geocoder, then fetches population from ACS", async () => {
  const requested: string[] = [];
  const client = new CensusClient({
    acsYear: 2022,
    fetchFn: async (input) => {
      const url = input.toString();
      requested.push(url);
      if (url.includes("geocoder")) {
        return new Response(
          JSON.stringify({
            result: {
              addressMatches: [
                {
                  geographies: {
                    "Incorporated Places": [
                      { GEOID: "2638140", NAME: "Hillsdale city", STATE: "26", PLACE: "38140" },
                    ],
                    Counties: [{ NAME: "Hillsdale County", STATE: "26", COUNTY: "059" }],
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify([
          ["NAME", "B01003_001E", "state", "place"],
          ["Hillsdale city, Michigan", "8124", "26", "38140"],
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const profile = await client.getAreaProfile({ city: "Hillsdale", state: "MI" });

  assert.equal(requested.length, 2);
  assert.match(requested[0], /geocoding\.geo\.census\.gov/);
  assert.match(requested[1], /api\.census\.gov\/data\/2022\/acs\/acs5/);
  assert.equal(profile.resolved.placeFips, "38140");
  assert.equal(profile.resolved.stateFips, "26");
  assert.equal(profile.resolved.countyFips, "059");
  assert.equal(profile.population, 8124);
  assert.equal(profile.areaType, "small_or_rural");
  assert.equal(profile.advMultiplierBase, 0.85);
  assert.equal(profile.highCostOfLivingState, false);
});

test("flags high cost-of-living for California cities", async () => {
  const client = new CensusClient({
    fetchFn: async (input) => {
      const url = input.toString();
      if (url.includes("geocoder")) {
        return new Response(
          JSON.stringify({
            result: {
              addressMatches: [
                {
                  geographies: {
                    "Incorporated Places": [
                      { GEOID: "0644000", NAME: "Los Angeles city", STATE: "06", PLACE: "44000" },
                    ],
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify([
          ["NAME", "B01003_001E", "state", "place"],
          ["Los Angeles city, California", "3898747", "06", "44000"],
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const profile = await client.getAreaProfile({ city: "Los Angeles", state: "CA" });

  assert.equal(profile.areaType, "major_metro");
  assert.equal(profile.advMultiplierBase, 1.2);
  assert.equal(profile.highCostOfLivingState, true);
  assert.match(profile.notes, /high-COL state/);
});

test("propagates a clear error when the geocoder finds no match", async () => {
  const client = new CensusClient({
    fetchFn: async (input) => {
      const url = input.toString();
      if (url.includes("geocoder")) {
        return new Response(
          JSON.stringify({ result: { addressMatches: [] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error("ACS should not be called when geocoding fails");
    },
  });

  await assert.rejects(
    () => client.getAreaProfile({ city: "NotARealPlace", state: "MI" }),
    /Census geocoder returned no match/,
  );
});

test("requires city+state OR placeFips+stateFips", async () => {
  const client = new CensusClient({
    fetchFn: async () => {
      throw new Error("should not be reached");
    },
  });

  await assert.rejects(() => client.getAreaProfile({}), /requires either \(city \+ state\)/);
});

test("bucketing helpers match the Restaurant Research Agent row-scaling table", () => {
  // population thresholds from the prompt
  assert.equal(bucketAreaType(50), "small_or_rural");
  assert.equal(bucketAreaType(24_999), "small_or_rural");
  assert.equal(bucketAreaType(25_000), "mid_metro");
  assert.equal(bucketAreaType(499_999), "mid_metro");
  assert.equal(bucketAreaType(500_000), "major_metro");
  assert.equal(bucketAreaType(8_000_000), "major_metro");

  assert.equal(bucketRowScalingTier(2_500), "under_5k");
  assert.equal(bucketRowScalingTier(5_000), "5k_to_25k");
  assert.equal(bucketRowScalingTier(24_999), "5k_to_25k");
  assert.equal(bucketRowScalingTier(25_000), "25k_to_75k");
  assert.equal(bucketRowScalingTier(75_000), "over_75k");

  assert.equal(rowScalingFloor(2_500), 15);
  assert.equal(rowScalingFloor(8_000), 30);
  assert.equal(rowScalingFloor(50_000), 50);
  assert.equal(rowScalingFloor(120_000), 80);

  // target = max(ceil(pop/250), floor)
  assert.equal(rowScalingTarget(2_500), 15); // ceil(10) vs floor 15
  assert.equal(rowScalingTarget(8_124), 33); // ceil(32.5) = 33 vs floor 30 → 33
  assert.equal(rowScalingTarget(50_000), 200); // ceil(200) vs floor 50 → 200
  assert.equal(rowScalingTarget(120_000), 480); // ceil(480) vs floor 80 → 480
});

test("isHighCostOfLivingState matches the prompt's CA/NY/MA/WA/HI list", () => {
  for (const code of ["CA", "NY", "MA", "WA", "HI"]) {
    assert.equal(isHighCostOfLivingState(code), true, `${code} should be high-COL`);
  }
  for (const code of ["MI", "OH", "TX", "FL", "IL"]) {
    assert.equal(isHighCostOfLivingState(code), false, `${code} should not be high-COL`);
  }
});
