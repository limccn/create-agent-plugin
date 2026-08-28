// MCP stdio server: JSON-RPC handshake, tools/list from the manifest, and a
// real tools/call through the ping tool (config flows into tool context).
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifest } from "../src/plugin/manifest.ts";

const CLI = join(import.meta.dirname, "..", "dist", "cli.js");

interface Rpc {
  id?: unknown;
  result?: { serverInfo?: { name?: string; version?: string }; tools?: Array<{ name: string }>; content?: Array<{ type: string; text: string }> };
  error?: { code: number; message: string };
}

function mcpSession(lines: string[]): Rpc[] {
  const r = spawnSync(process.execPath, [CLI, "mcp"], {
    input: lines.join("\n") + "\n",
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Rpc);
}

test("initialize returns the manifest's identity", () => {
  const [res] = mcpSession([JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } })]);
  assert.equal(res.result?.serverInfo?.name, manifest.name);
  assert.equal(res.result?.serverInfo?.version, manifest.version);
});

test("tools/list exposes the manifest tools", () => {
  const [res] = mcpSession([JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })]);
  const names = res.result?.tools?.map((t) => t.name) ?? [];
  assert.ok(names.includes("ping"), `tools: ${names.join(", ")}`);
});

test("tools/call ping returns pong with echo + resolved config", () => {
  const [res] = mcpSession([
    JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ping", arguments: { echo: "hi" } } }),
  ]);
  const text = res.result?.content?.[0]?.text ?? "";
  const data = JSON.parse(text);
  assert.equal(data.pong, "ok");
  assert.equal(data.echo, "hi");
  assert.equal(data.greeting, "Hello, agent!"); // default layer flowed into ToolContext
});

test("tools/call unknown tool returns a JSON-RPC error", () => {
  const [res] = mcpSession([JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } })]);
  assert.equal(res.error?.code, -32602);
});
