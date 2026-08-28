// Demo business CLI end-to-end: subcommands, config set/get with masking,
// doctor, dry-run install, and the bizCli greet command.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifest } from "../src/plugin/manifest.ts";

const CLI = join(import.meta.dirname, "..", "dist", "cli.js");

function run(args: string[], cwd: string) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), "aps-cli-"));
  mkdirSync(d, { recursive: true });
  return d;
}

const REPO = join(import.meta.dirname, "..");

test("version prints manifest.version", () => {
  const r = run(["version"], REPO);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), manifest.version);
});

test("help lists the CLI, targets, and business subcommands", () => {
  const r = run(["help"], REPO);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes(`${manifest.name} v${manifest.version}`));
  assert.ok(r.stdout.includes("install"));
  assert.ok(r.stdout.includes("doctor"));
  assert.ok(r.stdout.includes("greet"), "bizCli subcommand must appear in help");
});

test("config get default + set/get round-trip in a scratch project", () => {
  const dir = tmpDir();
  const get = run(["config", "get", "greeting"], dir);
  assert.equal(get.stdout.trim(), "Hello, agent!");

  const set = run(["config", "set", "greeting", "你好 agent"], dir);
  assert.equal(set.status, 0);
  assert.ok(set.stdout.includes("greeting = \"你好 agent\""));

  const after = run(["config", "get", "greeting"], dir);
  assert.equal(after.stdout.trim(), "你好 agent");

  // config file landed in the project config dir
  const path = run(["config", "path"], dir);
  assert.ok(path.stdout.includes(join(manifest.markers.configDir, "config.json")));
});

test("config set token then get masks the secret", () => {
  const dir = tmpDir();
  const set = run(["config", "set", "token", "sk-abcdefghijkl"], dir);
  assert.equal(set.status, 0);
  const get = run(["config", "get", "token"], dir);
  assert.equal(get.stdout.trim(), "sk-******kl"); // first 3 + last 2
  assert.ok(!get.stdout.includes("abcdefghijkl"), "secret must not be echoed");
});

test("config get unknown key prints (not set)", () => {
  const r = run(["config", "get", "token"], tmpDir());
  assert.equal(r.stdout.trim(), "(not set)");
});

test("doctor runs the business check and passes with a default greeting", () => {
  const r = run(["doctor"], REPO);
  assert.equal(r.status, 0, r.stdout);
  assert.ok(r.stdout.includes("[OK]"));
});

test("doctor fails when the check finds a problem (greeting unset)", () => {
  const dir = tmpDir();
  // An empty project config value forces the check to fail (defaults only
  // apply when the key is absent).
  mkdirSync(join(dir, manifest.markers.configDir), { recursive: true });
  writeFileSync(join(dir, manifest.markers.configDir, "config.json"), JSON.stringify({ greeting: "" }));
  const r = run(["doctor"], dir);
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes("[ERROR]"), r.stdout);
});

test("greet business subcommand prints the resolved greeting + source", () => {
  const dir = tmpDir();
  const r = run(["greet"], dir);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes("Hello, agent!"), r.stdout);
  assert.ok(r.stdout.includes("(from default)"), r.stdout);
});

test("install unknown target fails with a clear message", () => {
  const r = run(["install", "--non-interactive", "--target", "nope"], tmpDir());
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes("unknown target: nope"), r.stderr);
});

test("unknown command fails", () => {
  const r = run(["frobnicate"], REPO);
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes("unknown command: frobnicate"));
});
