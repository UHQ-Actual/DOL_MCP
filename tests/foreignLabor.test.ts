import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import ExcelJS from "exceljs";

import { ForeignLaborDisclosureClient, jsonlPathFor, normalizeForeignLaborProgram } from "../src/foreignLabor.js";

test("discovers official DOL foreign-labor disclosure links from the performance page", async () => {
  const client = new ForeignLaborDisclosureClient({
    fetchFn: async () =>
      new Response(
        `
          <a href="/sites/dolgov/files/ETA/oflc/pdfs/PERM_Disclosure_Data_FY2026_Q1.xlsx">PERM</a>
          <a href="/sites/dolgov/files/ETA/oflc/pdfs/PERM_Record_Layout_FY2026_Q1.pdf">PERM layout</a>
          <a href="/sites/dolgov/files/ETA/oflc/pdfs/H-2A_Disclosure_Data_FY2026_Q1.xlsx">H-2A</a>
          <a href="/sites/dolgov/files/ETA/oflc/pdfs/H-2A_Addendum_B_Employ_FY2026_Q1.xlsx">H-2A addendum</a>
        `,
        { status: 200, headers: { "content-type": "text/html" } },
      ),
  });

  const files = await client.getFileSet({ visaProgram: "H-2A", fiscalYear: 2026, fiscalQuarter: "Q1" });

  assert.equal(files.program, "H-2A");
  assert.equal(files.disclosure, "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-2A_Disclosure_Data_FY2026_Q1.xlsx");
  assert.deepEqual(files.auxiliaryFiles, [
    "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-2A_Addendum_B_Employ_FY2026_Q1.xlsx",
  ]);
});

test("discovers older FY2020-style disclosure file names", async () => {
  const client = new ForeignLaborDisclosureClient({
    fetchFn: async () =>
      new Response(
        `
          <a href="/sites/dolgov/files/ETA/oflc/pdfs/PERM%20FY2020.xlsx">PERM FY2020</a>
          <a href="/sites/dolgov/files/ETA/oflc/pdfs/PERM_Record_Layout_FY2020.pdf">PERM layout</a>
          <a href="/sites/dolgov/files/ETA/oflc/pdfs/H-2A%20FY2020.xlsx">H-2A FY2020</a>
          <a href="/sites/dolgov/files/ETA/oflc/pdfs/H-2A%20Record%20Layout%20FY20.pdf">H-2A layout</a>
        `,
        { status: 200, headers: { "content-type": "text/html" } },
      ),
  });

  const permFiles = await client.getFileSet({ visaProgram: "PERM", fiscalYear: 2020, fiscalQuarter: "Q4" });
  const h2aFiles = await client.getFileSet({ visaProgram: "H-2A", fiscalYear: 2020, fiscalQuarter: "Q4" });

  assert.equal(permFiles.disclosure, "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/PERM%20FY2020.xlsx");
  assert.equal(h2aFiles.disclosure, "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-2A%20FY2020.xlsx");
});

test("normalizes foreign-labor program aliases", () => {
  assert.equal(normalizeForeignLaborProgram("h1b"), "LCA");
  assert.equal(normalizeForeignLaborProgram("PERM"), "PERM");
  assert.equal(normalizeForeignLaborProgram("CW-1"), "CW");
});

test("searches and normalizes a PERM disclosure workbook", async () => {
  const dir = await mkdtemp(join(tmpdir(), "foreign-labor-mcp-"));
  try {
    const workbookPath = join(dir, "perm.xlsx");
    await writePermWorkbook(workbookPath);
    const client = new ForeignLaborDisclosureClient({ cacheDir: dir });

    const result = await client.search({
      visaProgram: "PERM",
      fiscalYear: 2026,
      fiscalQuarter: "Q1",
      localFile: workbookPath,
      employerName: "Intel",
      worksiteState: "CA",
      minAnnualWage: 150000,
      maxItems: 10,
    });

    assert.equal(result.program, "PERM");
    assert.equal(result.matched, 1);
    assert.equal(result.records[0].case_number, "A-12345-67890");
    assert.equal(result.records[0].visa_class, "PERM");
    assert.equal(result.records[0].case_status, "Certified");
    assert.equal(result.records[0].employer_name, "Intel Corporation");
    assert.equal(result.records[0].job_title, "Software Engineer");
    assert.equal(result.records[0].soc_code, "15-1252");
    assert.equal(result.records[0].wage_annual_min, 185000);
    assert.equal(result.records[0].worksite_state, "CA");
    assert.equal(result.records[0].h1b_dependent, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("searches and normalizes an H-2A disclosure workbook with hourly wages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "foreign-labor-mcp-"));
  try {
    const workbookPath = join(dir, "h2a.xlsx");
    await writeH2aWorkbook(workbookPath);
    const client = new ForeignLaborDisclosureClient({ cacheDir: dir });

    const result = await client.search({
      visaProgram: "H-2A",
      fiscalYear: 2026,
      fiscalQuarter: "Q1",
      localFile: workbookPath,
      socCode: "45-2092",
      worksiteState: "IA",
      caseStatus: "Certified",
      maxItems: 0,
    });

    assert.equal(result.program, "H-2A");
    assert.equal(result.matched, 1);
    assert.equal(result.records[0].case_number, "H-300-26001-000001");
    assert.equal(result.records[0].visa_class, "H-2A");
    assert.equal(result.records[0].wage_rate_of_pay_from, 16);
    assert.equal(result.records[0].wage_unit_of_pay, "Hour");
    assert.equal(result.records[0].wage_annual_min, 33280);
    assert.equal(result.records[0].total_worker_positions, 24);
    assert.equal(result.records[0].source_file, "h2a.xlsx");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("builds a gzipped JSONL cache on the first XLSX scan and reads from it on the second", async () => {
  const dir = await mkdtemp(join(tmpdir(), "foreign-labor-mcp-"));
  try {
    const workbookPath = join(dir, "perm.xlsx");
    await writePermWorkbook(workbookPath);
    const client = new ForeignLaborDisclosureClient({ cacheDir: dir });

    const jsonlPath = jsonlPathFor(workbookPath);
    assert.equal(existsSync(jsonlPath), false, "JSONL cache should not exist before first scan");

    const first = await client.search({
      visaProgram: "PERM",
      fiscalYear: 2026,
      fiscalQuarter: "Q1",
      localFile: workbookPath,
      maxItems: 0,
    });

    assert.equal(existsSync(jsonlPath), true, "first scan must produce a JSONL.gz cache");
    const cacheStat = await stat(jsonlPath);
    assert.ok(cacheStat.size > 0, "JSONL cache should be non-empty");
    assert.equal(first.scanned, 2);
    assert.equal(first.records.length, 2);

    const second = await client.search({
      visaProgram: "PERM",
      fiscalYear: 2026,
      fiscalQuarter: "Q1",
      localFile: workbookPath,
      employerName: "Intel",
      worksiteState: "CA",
      maxItems: 10,
    });

    assert.equal(second.matched, 1, "filter must still apply on the JSONL fast path");
    assert.equal(second.records[0].employer_name, "Intel Corporation");
    assert.equal(second.records[0].soc_code, "15-1252");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function writePermWorkbook(path: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("PERM");
  sheet.addRow([
    "CASE_NUMBER",
    "CASE_STATUS",
    "RECEIVED_DATE",
    "DECISION_DATE",
    "EMPLOYER_NAME",
    "EMPLOYER_ADDRESS_1",
    "EMPLOYER_CITY",
    "EMPLOYER_STATE_PROVINCE",
    "EMPLOYER_POSTAL_CODE",
    "EMPLOYER_COUNTRY",
    "EMPLOYER_PHONE",
    "NAICS_CODE",
    "JOB_TITLE",
    "SOC_CODE",
    "SOC_TITLE",
    "WAGE_OFFER_FROM",
    "WAGE_OFFER_UNIT_OF_PAY",
    "PREVAILING_WAGE",
    "PW_UNIT_OF_PAY",
    "WORKSITE_CITY",
    "WORKSITE_STATE",
    "WORKSITE_POSTAL_CODE",
  ]);
  sheet.addRow([
    "A-12345-67890",
    "Certified",
    "2026-01-01",
    "2026-02-01",
    "Intel Corporation",
    "2200 Mission College Blvd",
    "Santa Clara",
    "CA",
    "95054",
    "UNITED STATES OF AMERICA",
    "555-0100",
    "334413",
    "Software Engineer",
    "15-1252",
    "Software Developers",
    185000,
    "Year",
    132000,
    "Year",
    "Santa Clara",
    "CA",
    "95054",
  ]);
  sheet.addRow(["A-12345-00000", "Denied", "2026-01-01", "2026-02-01", "Other", "", "", "CA", "", "", "", "", "Analyst", "13-1111", "", 80000, "Year", 75000, "Year", "Austin", "TX", "73301"]);
  await workbook.xlsx.writeFile(path);
}

async function writeH2aWorkbook(path: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("H2A");
  sheet.addRow([
    "CASE_NUMBER",
    "CASE_STATUS",
    "VISA_CLASS",
    "RECEIVED_DATE",
    "DECISION_DATE",
    "EMPLOYER_NAME",
    "EMPLOYER_ADDRESS",
    "EMPLOYER_CITY",
    "EMPLOYER_STATE",
    "EMPLOYER_POSTAL_CODE",
    "JOB_TITLE",
    "SOC_CODE",
    "SOC_TITLE",
    "WAGE_RATE_OF_PAY_FROM",
    "WAGE_UNIT_OF_PAY",
    "WORKSITE_CITY",
    "WORKSITE_STATE",
    "TOTAL_WORKER_POSITIONS",
  ]);
  sheet.addRow([
    "H-300-26001-000001",
    "Certified",
    "H-2A",
    "2025-10-01",
    "2025-12-15",
    "Example Farms LLC",
    "100 Farm Road",
    "Ames",
    "IA",
    "50010",
    "Agricultural Equipment Operator",
    "45-2092.00",
    "Farmworkers and Laborers, Crop",
    16,
    "Hour",
    "Ames",
    "IA",
    24,
  ]);
  await workbook.xlsx.writeFile(path);
}
