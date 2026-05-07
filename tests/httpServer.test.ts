import assert from "node:assert/strict";
import test from "node:test";

import { isAuthorizedRequest, normalizeHttpConfig } from "../src/httpServer.js";

test("normalizes remote HTTP config from environment values", () => {
  assert.deepEqual(
    normalizeHttpConfig({
      DOL_MCP_HOST: "0.0.0.0",
      DOL_MCP_PORT: "8799",
      DOL_MCP_AUTH_TOKEN: "  secret-token  ",
      DOL_MCP_ALLOW_ORIGIN: "https://example.test",
    }),
    {
      host: "0.0.0.0",
      port: 8799,
      authToken: "secret-token",
      allowOrigin: "https://example.test",
    },
  );
});

test("defaults remote HTTP config to local-only binding", () => {
  assert.deepEqual(normalizeHttpConfig({}), {
    host: "127.0.0.1",
    port: 8787,
    authToken: undefined,
    allowOrigin: "*",
  });
});

test("uses platform PORT when DOL_MCP_PORT is not set", () => {
  assert.equal(normalizeHttpConfig({ PORT: "10000" }).port, 10000);
  assert.equal(normalizeHttpConfig({ DOL_MCP_PORT: "9000", PORT: "10000" }).port, 9000);
});

test("authorizes MCP requests only when the configured token matches", () => {
  const config = normalizeHttpConfig({ DOL_MCP_AUTH_TOKEN: "secret-token" });

  assert.equal(isAuthorizedRequest({ authorization: "Bearer secret-token" }, config), true);
  assert.equal(isAuthorizedRequest({ "x-api-key": "secret-token" }, config), true);
  assert.equal(isAuthorizedRequest({ authorization: "Bearer wrong" }, config), false);
  assert.equal(isAuthorizedRequest({}, config), false);
});

test("allows MCP requests without auth only for unprotected config", () => {
  assert.equal(isAuthorizedRequest({}, normalizeHttpConfig({})), true);
});
