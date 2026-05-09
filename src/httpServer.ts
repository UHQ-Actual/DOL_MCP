#!/usr/bin/env node
import { createServer as createNodeHttpServer, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DolApiClient } from "./dolApi.js";
import {
  loadDolApiKey,
  loadGooglePlacesApiKey,
  loadOpenCorporatesApiKey,
  loadSamApiKey,
} from "./env.js";
import { createServer as createMcpServer } from "./server.js";

export interface HttpConfig {
  host: string;
  port: number;
  authToken?: string;
  allowOrigin: string;
}

export interface CreateHttpServerOptions {
  config?: HttpConfig;
  serverFactory?: () => McpServer;
}

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export function normalizeHttpConfig(env: Record<string, string | undefined> = process.env): HttpConfig {
  const port = Number(env.DOL_MCP_PORT ?? env.PORT);
  return {
    host: env.DOL_MCP_HOST?.trim() || "127.0.0.1",
    port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_PORT,
    authToken: normalizeSecret(env.DOL_MCP_AUTH_TOKEN),
    allowOrigin: env.DOL_MCP_ALLOW_ORIGIN?.trim() || "*",
  };
}

export function isAuthorizedRequest(headers: IncomingHttpHeaders, config: HttpConfig): boolean {
  if (!config.authToken) {
    return true;
  }

  const authorization = firstHeader(headers.authorization);
  const apiKey = firstHeader(headers["x-api-key"]);
  return authorization === `Bearer ${config.authToken}` || apiKey === config.authToken;
}

export function createHttpServer(options: CreateHttpServerOptions = {}) {
  const config = options.config ?? normalizeHttpConfig();
  const serverFactory = options.serverFactory ?? createConfiguredMcpServer;

  return createNodeHttpServer(async (req, res) => {
    setCorsHeaders(res, config);

    if (req.method === "OPTIONS") {
      writeEmpty(res, 204);
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${config.host}:${config.port}`}`);

    if (url.pathname === "/health") {
      writeJson(res, 200, {
        ok: true,
        name: "dol-whd-mcp",
        transport: "streamable-http",
        mcpPath: "/mcp",
        authRequired: Boolean(config.authToken),
      });
      return;
    }

    if (url.pathname !== "/mcp") {
      writeJson(res, 404, { error: "Not found" });
      return;
    }

    if (!isAuthorizedRequest(req.headers, config)) {
      writeJson(res, 401, { error: "Unauthorized" });
      return;
    }

    if (req.method !== "POST") {
      writeJsonRpcError(res, 405, -32000, "Method not allowed.");
      return;
    }

    let mcpServer: McpServer | undefined;
    let transport: StreamableHTTPServerTransport | undefined;
    try {
      const parsedBody = await readJsonBody(req);
      mcpServer = serverFactory();
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await mcpServer.connect(transport);
      res.on("close", () => {
        void transport?.close();
        void mcpServer?.close();
      });
      await transport.handleRequest(req, res, parsedBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      if (!res.headersSent) {
        writeJsonRpcError(res, 500, -32603, "Internal server error");
      }
      void transport?.close();
      void mcpServer?.close();
    }
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error("MCP request body is too large.");
    }
    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  return body ? JSON.parse(body) : undefined;
}

function createConfiguredMcpServer(): McpServer {
  const client = new DolApiClient({ apiKey: loadDolApiKey() });
  return createMcpServer(client, loadSamApiKey(), loadGooglePlacesApiKey(), loadOpenCorporatesApiKey());
}

function setCorsHeaders(res: ServerResponse, config: HttpConfig): void {
  res.setHeader("Access-Control-Allow-Origin", config.allowOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, Mcp-Session-Id");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

function writeJsonRpcError(res: ServerResponse, httpStatus: number, code: number, message: string): void {
  writeJson(res, httpStatus, {
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

function writeEmpty(res: ServerResponse, status: number): void {
  res.writeHead(status);
  res.end();
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeSecret(value: string | undefined): string | undefined {
  const token = value?.trim().replace(/^['"]|['"]$/g, "");
  return token || undefined;
}

async function main(): Promise<void> {
  const config = normalizeHttpConfig();
  const server = createHttpServer({ config });
  server.listen(config.port, config.host, () => {
    process.stderr.write(`DOL MCP HTTP server listening on http://${config.host}:${config.port}/mcp\n`);
    if (!config.authToken && config.host !== "127.0.0.1" && config.host !== "localhost") {
      process.stderr.write("Warning: DOL_MCP_AUTH_TOKEN is not set for a non-local bind address.\n");
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
