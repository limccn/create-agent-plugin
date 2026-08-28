// Generator skill conformance (AC10 + F2): skills/create-agent-plugin/SKILL.md
// must satisfy the Agent Skills spec (name == parent dir, trigger-word
// description, space-separated allowed-tools, frontmatter marker line) and
// ship in the npm tarball. Single-repo topology: the repo root IS the package
// — "byte-identical with the packaged copy" is guaranteed by the files
// whitelist, which the test pins so the guarantee cannot silently slip.
// Scaffolded projects prune skills/ (build-regenerated), so the suite
// self-skips when the generator skill is not part of the template.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

const ROOT = join(import.meta.dirname, "..");
const DIR = join(ROOT, "skills", "create-agent-plugin");

describe("generator skill", { skip: !existsSync(DIR) }, () => {
  const FILE = join(DIR, "SKILL.md");
  const skill = readFileSync(FILE, "utf8");
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatter, "frontmatter block");
  const meta = Object.fromEntries(
    frontmatter![1]!.split("\n").map((l) => {
      const i = l.indexOf(":");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
  );

  test("skill: name matches the parent dir (kebab-case)", () => {
    assert.equal(meta.name, "create-agent-plugin");
    assert.equal(meta.name, DIR.split(/[\\/]/).pop());
    assert.match(meta.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test("skill: description 1-1024 chars with trigger words", () => {
    const d = meta.description ?? "";
    assert.ok(d.length >= 1 && d.length <= 1024, `length ${d.length}`);
    for (const w of ["scaffold", "plugin"]) assert.ok(d.toLowerCase().includes(w), `trigger word "${w}"`);
  });

  test("skill: allowed-tools space-separated (no commas)", () => {
    assert.equal(meta["allowed-tools"], "Bash Read");
    assert.ok(!skill.includes("allowed-tools: Bash, Read"));
  });

  test("skill: frontmatter marker line retained (uninstall marker convention)", () => {
    assert.ok(skill.includes("# create-agent-plugin:skill"), "marker line");
    assert.ok(!skill.includes("{{"), "no unfilled placeholders");
  });

  test("skill: packaged via the files whitelist (byte-identical single copy)", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const files: string[] = pkg.files ?? [];
    assert.ok(files.includes("skills/"), "skills/ in files — the repo-root copy IS the packaged copy");
    assert.ok(files.includes("README.md") && files.includes("LICENSE"), "readme + license ship");
  });
});
