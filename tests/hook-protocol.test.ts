// Hook protocol: one JSON on stdout, exit 0 always, no-op `{}` on anything
// missing/failing (AC5 — a hook must never block the agent tool).
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifest } from "../src/plugin/manifest.ts";

const CLI = join(import.meta.dirname, "..", "dist", "cli.js");
const HOOK = join(import.meta.dirname, "..", "dist", "hook.cjs");

function runHook(mode: string | undefined, input: string) {
  const args = mode ? [HOOK, mode] : [HOOK];
  const r = spawnSync(process.execPath, args, { input, encoding: "utf8" });
  return r;
}

test("hook with empty stdin: prints {} and exits 0 (AC5)", () => {
  const r = spawnSync(process.execPath, [HOOK], { input: "", encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "{}");
});

test("hook with no preToolUse handler configured: {} regardless of event", () => {
  // demoHook only handles PreToolUse(Read); a SessionStart event falls through.
  const r = runHook(undefined, JSON.stringify({ hook_event_name: "SessionStart" }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "{}");
});

test("hook session start mode ('start') without a sessionStart handler: {}", () => {
  const r = runHook("start", JSON.stringify({ hook_event_name: "SessionStart" }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "{}");
});

test("hook PreToolUse Read event: {} + business handler runs (stderr log)", () => {
  const r = runHook(
    undefined,
    JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: { file_path: "C:/img/photo.png" },
    }),
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "{}"); // demo handler never blocks
  assert.ok(r.stderr.includes("[demo] read intercepted: C:/img/photo.png"), r.stderr);
});

test("hook PreToolUse non-Read event: {} without business side effects", () => {
  const r = runHook(
    undefined,
    JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } }),
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "{}");
  assert.ok(!r.stderr.includes("read intercepted"), r.stderr);
});

test("hook garbage stdin: {} and exit 0 (never crash the tool)", () => {
  const r = spawnSync(process.execPath, [HOOK], { input: "{not json", encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "{}");
});

test("cli version round-trips the manifest", () => {
  const r = spawnSync(process.execPath, [CLI, "version"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), manifest.version);
});
