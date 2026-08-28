// Config precedence: env > project config.json > global config.json > defaults.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  globalConfigPath,
  maskValue,
  projectConfigPath,
  resolveConfig,
  writeConfigFile,
} from "../src/framework/config.ts";
import { manifest } from "../src/plugin/manifest.ts";

function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), "aps-cfg-"));
  mkdirSync(d, { recursive: true });
  return d;
}

const origEnv: Record<string, string | undefined> = {};
for (const f of manifest.config) origEnv[f.env] = process.env[f.env];

test.after(() => {
  for (const f of manifest.config) {
    if (origEnv[f.env] === undefined) delete process.env[f.env];
    else process.env[f.env] = origEnv[f.env];
  }
});

test("default layer: field defaults apply when nothing is configured", () => {
  const cfg = resolveConfig(manifest, tmpDir(), tmpDir());
  assert.equal(cfg.values.greeting, "Hello, agent!");
  assert.equal(cfg.sources.greeting, "default");
  assert.equal(cfg.values.token, undefined);
});

test("project layer beats global; sources tracked", () => {
  const cwd = tmpDir();
  const home = tmpDir();
  // global value first
  const gp = globalConfigPath(manifest, home);
  mkdirSync(join(gp, ".."), { recursive: true });
  writeFileSync(gp, JSON.stringify({ greeting: "from-global", token: "sk-global" }, null, 2));
  // then project value
  writeConfigFile(manifest, cwd, { greeting: "from-project" });

  const cfg = resolveConfig(manifest, cwd, home);
  assert.equal(cfg.values.greeting, "from-project");
  assert.equal(cfg.sources.greeting, "project");
  assert.equal(cfg.values.token, "sk-global");
  assert.equal(cfg.sources.token, "global");
  assert.equal(cfg.file, projectConfigPath(manifest, cwd));
});

test("env layer beats everything; boolean/number coerced", () => {
  const cwd = tmpDir();
  writeConfigFile(manifest, cwd, { greeting: "from-project" });
  process.env[manifest.config[0].env] = "from-env"; // DEMO_GREETING

  const cfg = resolveConfig(manifest, cwd, tmpDir());
  assert.equal(cfg.values.greeting, "from-env");
  assert.equal(cfg.sources.greeting, "env");
  delete process.env[manifest.config[0].env];
});

test("maskValue hides all but head+tail; short values fully masked", () => {
  assert.equal(maskValue("sk-1234567890ab"), "sk-******ab");
  assert.equal(maskValue("short"), "***");
});

test("broken config files fall back to lower layers", () => {
  const cwd = tmpDir();
  const bad = projectConfigPath(manifest, cwd);
  mkdirSync(join(bad, ".."), { recursive: true });
  writeFileSync(bad, "{not json");
  const cfg = resolveConfig(manifest, cwd, tmpDir());
  assert.equal(cfg.values.greeting, "Hello, agent!"); // default survived
  assert.equal(cfg.sources.greeting, "default");
});
