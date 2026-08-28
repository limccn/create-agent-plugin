// Generator integration tests (E4): run dist/generator.js against scratch
// dirs and verify the scaffolded project.
//  - AC8: identity (package name / brand / version) replaced; the generated
//    project builds, tests, and is self-consistent
//  - AC9: target + capability pruning — dry-run install only mentions the
//    selected targets; unknown (pruned) targets are rejected
//  - refusal of a non-empty target dir
//
// The generated project's build needs esbuild — the test links the
// template's node_modules with a junction (no network install in tests).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { adapters } from "../src/plugin/targets/index.ts";

const ROOT = join(import.meta.dirname, "..");
const GEN = join(ROOT, "dist", "generator.js");

function runGen(args: string[], cwd: string) {
  return spawnSync(process.execPath, [GEN, ...args], { cwd, encoding: "utf8" });
}

function runIn(proj: string, args: string[]) {
  return spawnSync(process.execPath, args, { cwd: proj, encoding: "utf8" });
}

/** Junction the template node_modules into a generated project so `npm run
 *  build` / tests resolve esbuild + types without a network install. */
function linkNodeModules(proj: string): void {
  symlinkSync(join(ROOT, "node_modules"), join(proj, "node_modules"), "junction");
}

test("generator: --list-targets prints every template adapter id in order", () => {
  const r = runGen(["--list-targets"], mkdtempSync(join(tmpdir(), "aps-gen-")));
  assert.equal(r.status, 0, r.stderr);
  const ids = r.stdout.trim().split(/\r?\n/).filter(Boolean);
  // A pruned template registers fewer targets — the listing must mirror the
  // template's own registry, not a fixed count.
  assert.deepEqual(ids, adapters.map((a) => a.id), "listing matches the template registry");
});

test("generator: default scaffold replaces identity; project builds and tests (AC8)", { timeout: 180_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "aps-gen-"));
  const r = runGen(["demo-plugin", "--package", "demo-plugin", "--yes"], dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const proj = join(dir, "demo-plugin");

  // package.json: name + bin + description replaced.
  const pkg = JSON.parse(readFileSync(join(proj, "package.json"), "utf8"));
  assert.equal(pkg.name, "demo-plugin");
  assert.equal(pkg.bin["demo-plugin"], "dist/cli.js");
  assert.ok(String(pkg.description).includes("agent plugin"));

  // manifest.ts: brand, markers, config envs replaced.
  const msrc = readFileSync(join(proj, "src/plugin/manifest.ts"), "utf8");
  assert.ok(msrc.includes('name: "demo-plugin"'), "manifest name");
  assert.ok(msrc.includes('brand: "Demo Plugin"'), "manifest brand");
  assert.ok(msrc.includes('configDir: ".demo-plugin"'), "marker configDir");
  assert.ok(msrc.includes("DEMO_PLUGIN_GREETING"), "config env prefix");
  assert.ok(!msrc.includes("my-agent-plugin"), "no template identity leaks");

  // Capability tests follow the template's own set: a template generated with
  // --capabilities (a pruned template) no longer ships the test files of
  // deselected capabilities, so assertions must derive from what the template
  // actually carries rather than a fixed all-capabilities list.
  const TEMPLATE_CAP_TESTS = ["tests/mcp.test.ts", "tests/hook-protocol.test.ts", "tests/cli.test.ts"].filter(
    (rel) => existsSync(join(ROOT, rel)),
  );
  for (const t of TEMPLATE_CAP_TESTS) {
    assert.ok(existsSync(join(proj, t)), `${t} kept (template carries it)`);
  }

  // The generated project builds and its tests pass.
  linkNodeModules(proj);
  const b = runIn(proj, [join(proj, "build.mjs")]);
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const t = runIn(proj, ["--test", "tests/*.test.ts"]);
  assert.equal(t.status, 0, t.stdout + t.stderr);
});

test("generator: scoped package name (@scope/xxx) scaffolds safe path markers", { timeout: 60_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "aps-gen-"));
  const r = runGen(["scoped", "--package", "@scope/demo-pkg", "--yes"], dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const proj = join(dir, "scoped");

  const msrc = readFileSync(join(proj, "src/plugin/manifest.ts"), "utf8");
  // Path-ish markers: no `/`, no `@` (skill dirs, config dir, hook filename,
  // SKILL.md frontmatter `name:`).
  assert.ok(msrc.includes('name: "@scope/demo-pkg"'), "manifest keeps the full scoped name");
  assert.ok(msrc.includes('skillDir: "demo-pkg"'), "skillDir is the unscoped short name");
  assert.ok(msrc.includes('configDir: ".demo-pkg"'), "configDir is the unscoped short name");
  assert.ok(msrc.includes('cursorDir: "demo-pkg"'), "cursorDir is the unscoped short name");
  assert.ok(msrc.includes('hook: "demo-pkg-hook"'), "hook is the unscoped short name");
  assert.ok(msrc.includes('hookCommand: "demo-pkg-hook"'), "hookCommand is the unscoped short name");
  // String-content markers: the full scoped name is preserved.
  assert.ok(msrc.includes('skill: "@scope/demo-pkg:skill"'), "skill marker keeps the full name");
  assert.ok(msrc.includes('command: "@scope/demo-pkg:command"'), "command marker keeps the full name");
  assert.ok(
    msrc.includes('agentsStart: "<!-- @scope/demo-pkg:start -->"'),
    "agentsStart keeps the full name",
  );

  // package.json: the npm name stays the full scoped name; bin is the last
  // segment (split("/").pop()).
  const pkg = JSON.parse(readFileSync(join(proj, "package.json"), "utf8"));
  assert.equal(pkg.name, "@scope/demo-pkg");
  assert.equal(pkg.bin["demo-pkg"], "dist/cli.js");

  // README: {{name}} keeps the full scoped name (npx usage).
  const readme = readFileSync(join(proj, "README.md"), "utf8");
  assert.ok(readme.startsWith("# @scope/demo-pkg"), "README title keeps the full name");
});

test("generator: pruning — selected targets only, capability tests removed (AC9)", { timeout: 180_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "aps-gen-"));
  // Pick the template's own first two targets (native + plugin in the full
  // template) and drop the rest — a pruned template (e.g. generated with
  // --targets claude,codex) may not even have a copilot, so hard-coded ids
  // would make the test fail on its own output.
  const tplIds = adapters.map((a) => a.id);
  const picked = tplIds.slice(0, 2);
  const dropped = tplIds.slice(2);
  const labelOf = (id: string): string => adapters.find((a) => a.id === id)!.label;
  const r = runGen(
    ["mini", "--package", "mini-agent", "--targets", picked.join(","), "--capabilities", "mcp,hook", "--yes"],
    dir,
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const proj = join(dir, "mini");

  // Registry: exactly one import per picked target, nothing else.
  const idx = readFileSync(join(proj, "src/plugin/targets/index.ts"), "utf8");
  const importLines = idx.split("\n").filter((l) => l.startsWith("import { "));
  assert.equal(importLines.length, picked.length, idx);

  // Capability pruning: cli tests removed, mcp/hook kept; manifest has no
  // bizCli/doctorChecks.
  assert.ok(!existsSync(join(proj, "tests/cli.test.ts")), "cli tests removed");
  assert.ok(existsSync(join(proj, "tests/mcp.test.ts")), "mcp tests kept");
  assert.ok(existsSync(join(proj, "tests/hook-protocol.test.ts")), "hook tests kept");
  const msrc = readFileSync(join(proj, "src/plugin/manifest.ts"), "utf8");
  assert.ok(!msrc.includes("bizCli"), "bizCli pruned");
  assert.ok(!msrc.includes("doctorChecks"), "doctorChecks pruned");

  // Dry-run install only touches the selected targets; the rest stay out.
  linkNodeModules(proj);
  const b = runIn(proj, [join(proj, "build.mjs")]);
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const cli = join(proj, "dist", "cli.js");
  const dry = runIn(proj, [cli, "install", "--non-interactive", "--dry-run", "--target", picked.join(",")]);
  assert.equal(dry.status, 0, dry.stdout + dry.stderr);
  for (const id of picked) assert.ok(dry.stdout.includes(labelOf(id)), `dry-run mentions ${labelOf(id)}`);
  for (const id of dropped) assert.ok(!dry.stdout.includes(labelOf(id)), `dry-run omits ${labelOf(id)}`);

  // A template target that was not picked is unknown to the generated CLI
  // (with only the full template's first two, e.g. claude+codex, picking
  // copilot fails exactly like any other pruned target).
  const bad = dropped[0] ?? "definitely-not-a-target";
  const badRun = runIn(proj, [cli, "install", "--non-interactive", "--dry-run", "--target", bad]);
  assert.equal(badRun.status, 1, badRun.stdout + badRun.stderr);
  assert.ok(badRun.stderr.includes(`unknown target: ${bad}`), badRun.stderr);
});

test("generator: refuses a non-empty target directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "aps-gen-"));
  writeFileSync(join(dir, "existing.txt"), "x");
  const r = runGen([".", "--package", "x-agent", "--yes"], dir);
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes("not empty"), r.stderr);
});

test("generator: unknown target id fails fast with guidance", () => {
  const known = adapters[0]?.id ?? "claude";
  const r = runGen(["--targets", `${known},nope`, "--yes"], mkdtempSync(join(tmpdir(), "aps-gen-")));
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes('unknown target "nope"'), r.stderr);
});
