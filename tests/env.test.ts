import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadDolApiKey, loadGooglePlacesApiKey, loadSamApiKey } from "../src/env.js";

test("loads DOL_API_KEY from an explicit env file without printing it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dol-whd-mcp-"));
  try {
    const envFile = join(dir, ".env");
    await writeFile(envFile, "DOL_API_KEY=abc123\n");

    const key = loadDolApiKey({ envFile, env: {} });
    assert.equal(key, "abc123");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("prefers process environment over env file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dol-whd-mcp-"));
  try {
    const envFile = join(dir, ".env");
    await writeFile(envFile, "DOL_API_KEY=file-key\n");

    const key = loadDolApiKey({ envFile, env: { DOL_API_KEY: "env-key" } });
    assert.equal(key, "env-key");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("missing DOL_API_KEY error does not include local file paths", () => {
  assert.throws(
    () => loadDolApiKey({ envFile: "missing.env", env: {} }),
    (error) => {
      assert(error instanceof Error);
      assert.equal(error.message.includes("missing.env"), false);
      assert.match(error.message, /DOL_API_KEY/);
      return true;
    },
  );
});

test("loads optional SAM.gov API key aliases without requiring one", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dol-whd-mcp-"));
  try {
    const envFile = join(dir, ".env");
    await writeFile(envFile, "SAM_API_KEY=file-sam-key\n");

    assert.equal(loadSamApiKey({ envFile, env: {} }), "file-sam-key");
    assert.equal(loadSamApiKey({ envFile, env: { SAM_GOV_API_KEY: "env-sam-key" } }), "env-sam-key");
    assert.equal(loadSamApiKey({ envFile: "missing.env", env: {} }), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadGooglePlacesApiKey returns key from env", () => {
  const key = loadGooglePlacesApiKey({ env: { GOOGLE_PLACES_API_KEY: "test-key" }, envFile: "missing.env" });
  assert.equal(key, "test-key");
});

test("loadGooglePlacesApiKey returns undefined when not set", () => {
  const key = loadGooglePlacesApiKey({ env: {}, envFile: "missing.env" });
  assert.equal(key, undefined);
});

test("loadGooglePlacesApiKey trims surrounding quotes and whitespace", () => {
  const key = loadGooglePlacesApiKey({ env: { GOOGLE_PLACES_API_KEY: ' "abc" ' }, envFile: "missing.env" });
  assert.equal(key, "abc");
});

test("loadGooglePlacesApiKey reads from env file when env var is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dol-whd-mcp-"));
  try {
    const envFile = join(dir, ".env");
    await writeFile(envFile, "GOOGLE_PLACES_API_KEY=file-places-key\n");
    assert.equal(loadGooglePlacesApiKey({ envFile, env: {} }), "file-places-key");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
