import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "dotenv";

export interface LoadDolApiKeyOptions {
  envFile?: string;
  env?: Record<string, string | undefined>;
}

export function loadDolApiKey(options: LoadDolApiKeyOptions = {}): string {
  const env = options.env ?? process.env;
  const direct = normalizeKey(env.DOL_API_KEY);
  if (direct) {
    return direct;
  }

  for (const envFile of envFileCandidates(options.envFile, env.DOL_MCP_ENV_FILE)) {
    if (!existsSync(envFile)) {
      continue;
    }

    const parsed = parse(readFileSync(envFile));
    const key = normalizeKey(parsed.DOL_API_KEY);
    if (key) {
      return key;
    }
  }

  throw new Error("DOL_API_KEY is missing. Set it in the environment or a local .env file.");
}

export function loadSamApiKey(options: LoadDolApiKeyOptions = {}): string | undefined {
  const env = options.env ?? process.env;
  const direct = normalizeKey(env.SAM_GOV_API_KEY) ?? normalizeKey(env.SAM_API_KEY);
  if (direct) {
    return direct;
  }

  for (const envFile of envFileCandidates(options.envFile, env.DOL_MCP_ENV_FILE)) {
    if (!existsSync(envFile)) {
      continue;
    }

    const parsed = parse(readFileSync(envFile));
    const key = normalizeKey(parsed.SAM_GOV_API_KEY) ?? normalizeKey(parsed.SAM_API_KEY);
    if (key) {
      return key;
    }
  }

  return undefined;
}

export function loadGooglePlacesApiKey(options: LoadDolApiKeyOptions = {}): string | undefined {
  const env = options.env ?? process.env;
  const direct = normalizeKey(env.GOOGLE_PLACES_API_KEY);
  if (direct) {
    return direct;
  }

  for (const envFile of envFileCandidates(options.envFile, env.DOL_MCP_ENV_FILE)) {
    if (!existsSync(envFile)) {
      continue;
    }

    const parsed = parse(readFileSync(envFile));
    const key = normalizeKey(parsed.GOOGLE_PLACES_API_KEY);
    if (key) {
      return key;
    }
  }

  return undefined;
}

function envFileCandidates(explicitFile?: string, envFile?: string): string[] {
  if (explicitFile) {
    return [explicitFile];
  }

  const candidates = [
    envFile,
    resolve(process.cwd(), ".env"),
    resolve(dirname(fileURLToPath(import.meta.url)), "../.env"),
  ];
  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))];
}

function normalizeKey(value: string | undefined): string | undefined {
  const key = value?.trim().replace(/^['"]|['"]$/g, "");
  return key || undefined;
}
