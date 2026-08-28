// safe-fs safety rules: markers, backups, deep-merge, idempotency, and the
// "never touch a user file without our marker" invariant. (AC4)
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backupFile,
  deepMerge,
  removeJsonKey,
  removeManagedBlock,
  tomlKey,
  upsertJsonKey,
  upsertManagedBlock,
  upsertTomlSection,
  removeTomlSection,
} from "../src/framework/safe-fs.ts";

function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), "aps-safe-"));
  mkdirSync(d, { recursive: true });
  return d;
}

const MARKER = "my-plugin:managed";
const START = "<!-- my-plugin:start -->";
const END = "<!-- my-plugin:end -->";

test("upsertJsonKey: creates file, deep-merges, idempotent, leaves unknown keys", () => {
  const d = tmpDir();
  const p = join(d, "settings.json");

  const first = upsertJsonKey(p, "hook", { command: "node hook.cjs", enabled: true });
  assert.equal(first.changed, true);

  const second = upsertJsonKey(p, "hook", { enabled: false }); // patch only
  assert.equal(second.changed, true);
  const data = JSON.parse(readFileSync(p, "utf8"));
  assert.equal(data.hook.command, "node hook.cjs"); // untouched
  assert.equal(data.hook.enabled, false); // patched

  const third = upsertJsonKey(p, "hook", { enabled: false });
  assert.equal(third.changed, false); // idempotent
});

test("removeJsonKey: only removes entries carrying our marker", () => {
  const d = tmpDir();
  const p = join(d, "settings.json");
  writeFileSync(
    p,
    JSON.stringify(
      {
        ours: { command: `node hook.cjs ${MARKER}` },
        theirs: { command: "node user-hook.cjs" },
      },
      null,
      2,
    ) + "\n",
  );

  const removed = removeJsonKey(p, "theirs", MARKER);
  assert.equal(removed.changed, false); // no marker → untouched

  const ours = removeJsonKey(p, "ours", MARKER);
  assert.equal(ours.changed, true);
  const data = JSON.parse(readFileSync(p, "utf8"));
  assert.equal(data.theirs.command, "node user-hook.cjs"); // survivor kept
  assert.equal("ours" in data, false);
});

test("upsertManagedBlock: insert, replace, idempotent, backup on first change", () => {
  const d = tmpDir();
  const p = join(d, "AGENTS.md");
  writeFileSync(p, "# Project\n");

  const first = upsertManagedBlock(p, `${START}\nblock\n${END}`, START, END);
  assert.equal(first.changed, true);
  assert.equal(existsSync(`${p}.bak`), true); // first modification backs up

  const content1 = readFileSync(p, "utf8");
  assert.ok(content1.includes(START) && content1.includes("# Project"));

  // replace with new content → backs up again (pre-modification state)
  const second = upsertManagedBlock(p, `${START}\nnew block\n${END}`, START, END);
  assert.equal(second.changed, true);
  assert.ok(readFileSync(p, "utf8").includes("new block"));

  const third = upsertManagedBlock(p, `${START}\nnew block\n${END}`, START, END);
  assert.equal(third.changed, false); // idempotent
});

test("removeManagedBlock: removes only the block, keeps the rest", () => {
  const d = tmpDir();
  const p = join(d, "AGENTS.md");
  writeFileSync(p, `# Project\n\n${START}\nblock\n${END}\n\n# End\n`);
  const r = removeManagedBlock(p, START, END);
  assert.equal(r.changed, true);
  const content = readFileSync(p, "utf8");
  assert.ok(!content.includes(START));
  assert.ok(content.includes("# Project"));
  assert.ok(content.includes("# End"));
});

test("deepMerge: patch wins, arrays replace, unknown keys kept", () => {
  assert.deepEqual(deepMerge({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 9 } }), {
    a: 1,
    b: { c: 9, d: 3 },
  });
  assert.deepEqual(deepMerge({ arr: [1, 2] }, { arr: [3] }), { arr: [3] });
  assert.deepEqual(deepMerge({ a: 1 }, { b: 2 }), { a: 1, b: 2 });
});

test("backupFile: copies the pre-modification state", () => {
  const d = tmpDir();
  const p = join(d, "f.txt");
  writeFileSync(p, "original");
  const bak = backupFile(p);
  assert.ok(bak && bak.endsWith(".bak"));
  assert.equal(readFileSync(bak!, "utf8"), "original");
});

test("upsertTomlSection / removeTomlSection: section-scoped edits", () => {
  const d = tmpDir();
  const p = join(d, "config.toml");
  writeFileSync(p, "[user]\nname = \"limc\"\n");

  const first = upsertTomlSection(p, "mcp_servers.demo", "[mcp_servers.demo]\ncommand = \"npx\"\n");
  assert.equal(first.changed, true);
  let content = readFileSync(p, "utf8");
  assert.ok(content.includes("[mcp_servers.demo]"));
  assert.ok(content.includes("[user]"));

  const again = upsertTomlSection(p, "mcp_servers.demo", "[mcp_servers.demo]\ncommand = \"npx\"\n");
  assert.equal(again.changed, false); // idempotent

  const removed = removeTomlSection(p, "mcp_servers.demo");
  assert.equal(removed.changed, true);
  content = readFileSync(p, "utf8");
  assert.ok(!content.includes("mcp_servers.demo"));
  assert.ok(content.includes("[user]"));
});

test("tomlKey: bare-safe keys as-is, everything else basic-string quoted", () => {
  assert.equal(tomlKey("demo"), "demo");
  assert.equal(tomlKey("my-agent-plugin"), "my-agent-plugin");
  assert.equal(tomlKey("a1_b2-c3"), "a1_b2-c3");
  assert.equal(tomlKey("@scope/xxx"), '"@scope/xxx"');
  assert.equal(tomlKey("foo.bar"), '"foo.bar"');
});

test("upsertTomlSection / removeTomlSection: quoted non-bare section names", () => {
  const d = tmpDir();
  const p = join(d, "config.toml");
  writeFileSync(p, "[user]\nname = \"limc\"\n");
  const sectionName = "mcp_servers.@scope/xxx";
  const block = `[mcp_servers."@scope/xxx"]\ncommand = "npx"\n`;

  const first = upsertTomlSection(p, sectionName, block);
  assert.equal(first.changed, true);
  let content = readFileSync(p, "utf8");
  assert.ok(content.includes('[mcp_servers."@scope/xxx"]'), "quoted header written");
  assert.ok(content.includes("[user]"));

  const again = upsertTomlSection(p, sectionName, block);
  assert.equal(again.changed, false); // idempotent (quoted header matched)

  const removed = removeTomlSection(p, sectionName);
  assert.equal(removed.changed, true);
  content = readFileSync(p, "utf8");
  assert.ok(!content.includes("@scope/xxx"), "section removed");
  assert.ok(content.includes("[user]"));
});

test("upsertTomlSection / removeTomlSection: bare and quoted spellings both match", () => {
  const d = tmpDir();
  const p = join(d, "config.toml");
  // Old-version artifact: the section was written with a BARE header that is
  // actually illegal TOML for this name — uninstall must still find it.
  writeFileSync(p, '[mcp_servers.@scope/xxx]\ncommand = "npx"\n\n[user]\nname = "limc"\n');

  const again = upsertTomlSection(p, "mcp_servers.@scope/xxx", '[mcp_servers."@scope/xxx"]\ncommand = "npx"\n');
  assert.equal(again.changed, true, "bare header replaced by the quoted spelling");
  let content = readFileSync(p, "utf8");
  assert.ok(content.includes('[mcp_servers."@scope/xxx"]'));
  assert.ok(!content.includes("[mcp_servers.@scope/xxx]"), "old bare header replaced");

  const removed = removeTomlSection(p, "mcp_servers.@scope/xxx");
  assert.equal(removed.changed, true, "quoted header removed");
  content = readFileSync(p, "utf8");
  assert.ok(!content.includes("@scope/xxx"));
  assert.ok(content.includes("[user]"), "unrelated section kept");

  // And the reverse direction: a quoted-name upsert must hit an existing
  // bare header (no duplication) and leave it in place.
  writeFileSync(p, "[mcp_servers.demo]\ncommand = \"npx\"\n");
  const bareAgain = upsertTomlSection(p, "mcp_servers.demo", "[mcp_servers.demo]\ncommand = \"npx\"\n");
  assert.equal(bareAgain.changed, false, "bare header idempotent");

  // Mixed file: quoted scoped section + bare unscoped section coexist.
  writeFileSync(p, '[mcp_servers."@scope/xxx"]\ncommand = "npx"\n\n[mcp_servers.demo]\ncommand = "npx"\n');
  const mixed = upsertTomlSection(p, "mcp_servers.demo", "[mcp_servers.demo]\ncommand = \"npx\"\n");
  assert.equal(mixed.changed, false, "bare name hits its own bare header, not the quoted one");
  const mixedRemove = removeTomlSection(p, "mcp_servers.@scope/xxx");
  assert.equal(mixedRemove.changed, true, "quoted name hits its own quoted header, not the bare one");
  assert.ok(readFileSync(p, "utf8").includes("[mcp_servers.demo]"), "sibling bare section untouched");
});

test("upsertTomlSection / removeTomlSection: a dot INSIDE a quoted segment is not a key separator", () => {
  const d = tmpDir();
  const p = join(d, "config.toml");
  // `foo.bar` renders quoted (bare would be parsed as a nested key); the
  // matcher must compare the whole string and keep the dot intact.
  writeFileSync(p, '[mcp_servers."foo.bar"]\ncommand = "npx"\n\n[user]\nname = "limc"\n');
  const again = upsertTomlSection(p, "mcp_servers.foo.bar", '[mcp_servers."foo.bar"]\ncommand = "npx"\n');
  assert.equal(again.changed, false, "quoted dotted name matched (dot not split)");
  const removed = removeTomlSection(p, "mcp_servers.foo.bar");
  assert.equal(removed.changed, true, "quoted dotted name removed");
  const content = readFileSync(p, "utf8");
  assert.ok(!content.includes("foo.bar"), "dotted section gone");
  assert.ok(content.includes("[user]"), "unrelated section kept");
});
