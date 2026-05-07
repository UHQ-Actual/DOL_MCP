import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  annualizeWage,
  buildLcaFileSet,
  LcaDisclosureClient,
  latestLikelyQuarter,
  normalizeEmployerName,
} from "../src/lca.js";

test("builds official DOL LCA disclosure URLs for a fiscal year quarter", () => {
  const files = buildLcaFileSet(2026, 1);

  assert.equal(files.disclosure, "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2026_Q1.xlsx");
  assert.equal(files.worksites, "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Worksites_FY2026_Q1.xlsx");
  assert.equal(files.sourcePageUrl, "https://www.dol.gov/agencies/eta/foreign-labor/performance");
});

test("normalizes employer names for cross-record grouping", () => {
  assert.equal(normalizeEmployerName("Google, LLC."), "GOOGLE");
  assert.equal(normalizeEmployerName("Acme International Holdings Corp"), "ACME");
});

test("annualizes common wage units", () => {
  assert.equal(annualizeWage(100, "Hour"), 208000);
  assert.equal(annualizeWage("2000", "Week"), 104000);
  assert.equal(annualizeWage(9000, "Month"), 108000);
  assert.equal(annualizeWage(125000, "Year"), 125000);
});

test("defaults to the latest likely published LCA quarter conservatively", () => {
  assert.equal(latestLikelyQuarter(2026, new Date("2026-05-06T00:00:00Z")), 1);
  assert.equal(latestLikelyQuarter(2026, new Date("2026-08-01T00:00:00Z")), 2);
});

test("searches a local LCA workbook with employer and state filters", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dol-lca-mcp-"));
  try {
    const workbookPath = join(dir, "sample-lca.xlsx");
    await writeSampleWorkbook(workbookPath);
    const client = new LcaDisclosureClient({ cacheDir: dir });

    const result = await client.search({
      fiscalYear: 2024,
      quarter: 4,
      localFile: workbookPath,
      employerName: "Google",
      state: "CA",
      maxResults: 10,
    });

    assert.equal(result.scanned, 4);
    assert.equal(result.matched, 2);
    assert.equal(result.truncated, false);
    assert.deepEqual(
      result.rows.map((row) => row.CASE_NUMBER),
      ["I-200-1", "I-200-2"],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("builds a DOL LCA employer wage and filing profile", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dol-lca-mcp-"));
  try {
    const workbookPath = join(dir, "sample-lca.xlsx");
    await writeSampleWorkbook(workbookPath);
    const client = new LcaDisclosureClient({ cacheDir: dir });

    const profile = await client.employerProfile({
      fiscalYear: 2024,
      quarter: 4,
      localFile: workbookPath,
      employerName: "Google",
      maxResults: 100,
    });

    assert.equal(profile.matchedRecords, 3);
    assert.equal(profile.totalWorkerPositions, 6);
    assert.equal(profile.statuses.CERTIFIED, 2);
    assert.equal(profile.statuses.DENIED, 1);
    assert.equal(profile.certificationRate, 66.67);
    assert.equal(profile.wageStatistics.avgAnnualWage, 156000);
    assert.equal(profile.topJobTitles[0].title, "SOFTWARE ENGINEER");
    assert.equal(profile.topJobTitles[0].count, 2);
    assert.equal(profile.topSOCCodes[0].code, "15-1252");
    assert.equal(profile.worksiteLocations[0].city, "MOUNTAIN VIEW");
    assert.equal(profile.h1bDependent, true);
    assert.equal(profile.willfulViolator, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function writeSampleWorkbook(path: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("LCA");
  sheet.addRow([
    "CASE_NUMBER",
    "CASE_STATUS",
    "EMPLOYER_NAME",
    "JOB_TITLE",
    "SOC_CODE",
    "SOC_TITLE",
    "WORKSITE_CITY",
    "WORKSITE_STATE",
    "NAICS_CODE",
    "TOTAL_WORKER_POSITIONS",
    "WAGE_RATE_OF_PAY_FROM",
    "WAGE_UNIT_OF_PAY",
    "PREVAILING_WAGE",
    "PW_UNIT_OF_PAY",
    "H-1B_DEPENDENT",
    "WILLFUL_VIOLATOR",
    "DECISION_DATE",
  ]);
  sheet.addRow(["I-200-1", "Certified", "GOOGLE LLC", "SOFTWARE ENGINEER", "15-1252", "SOFTWARE DEVELOPERS", "MOUNTAIN VIEW", "CA", "541511", 2, 100, "Hour", 80, "Hour", "Y", "N", "2024-01-15"]);
  sheet.addRow(["I-200-2", "Certified", "GOOGLE INC.", "SOFTWARE ENGINEER", "15-1252", "SOFTWARE DEVELOPERS", "MOUNTAIN VIEW", "CA", "541511", 3, 125000, "Year", 110000, "Year", "N", "N", "2024-02-15"]);
  sheet.addRow(["I-200-3", "Denied", "GOOGLE CLOUD", "DATA SCIENTIST", "15-2051", "DATA SCIENTISTS", "NEW YORK", "NY", "541511", 1, 135000, "Year", 120000, "Year", "N", "N", "2024-03-15"]);
  sheet.addRow(["I-200-4", "Certified", "OTHER CORP", "ANALYST", "15-1211", "COMPUTER SYSTEMS ANALYSTS", "DES MOINES", "IA", "541512", 1, 90000, "Year", 85000, "Year", "N", "N", "2024-03-20"]);
  await workbook.xlsx.writeFile(path);
}
