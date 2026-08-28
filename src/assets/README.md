# {{name}} — {{brand}}

> {{description}}

Zero runtime dependencies, Node ≥ 18, MIT. This package ships one CLI
(`install | uninstall | doctor | config | mcp | version`) and a
multi-agent installer that wires the plugin's MCP server, hook, and skill
into **22 agent clients** (native 8 + skill 4 + plugin 10): Claude Code,
Codex, OpenCode, Qwen, Reasonix, Kilo, WorkBuddy, Devin, Trae, Pi, OMP,
dsh, Copilot, Cursor, Kiro, OpenClaw, Hermes, VS Code, ChatGPT-Codex,
Grok, NanoClaw, and any other spec-compliant agent.

The demo business is a `ping` MCP tool and a minimal Read hook — replace
them with yours (see [What to replace](#what-to-replace)). Everything
installer-related lives in `src/framework/` and is battle-tested: it was
extracted from [deepseek-vl-support](https://github.com/limccn/deepseek-vl-support),
which has run these mechanisms in production since 0.1.

This repo is **both** the `@limccn/create-agent-plugin` generator package
**and** the plugin template itself: `npx @limccn/create-agent-plugin`
copies this package and rewrites the identity; or clone the repo and edit
it directly.

## Quick start (as a developer of this plugin)

```bash
npm install
npm run verify        # build + typecheck + test
npm run build && npm pack --dry-run   # tarball manifest check
node dist/cli.js install   # interactive wizard — installs into agent clients
```

Non-interactive / CI:

```bash
node dist/cli.js install --non-interactive --target claude,codex --preset custom
node dist/cli.js doctor
```

## Directory layout

```
src/
  plugin/        #  FILL LAYER — your business (tools, hook, doctor, CLI,
                 #  manifest). The installer derives everything from here.
  framework/     #  FRAMEWORK LAYER — safe-fs, config, registry, wizard,
                 #  hook/mcp/doctor runtimes. Copy and mostly don't touch.
dist/            #  build output: cli.js (ESM) + hook.cjs (CJS, zero deps)
assets/          #  skill template (SKILL.md with {{...}} tokens)
skills/<skillDir>/ #  build-synced skill copy (committed; git install source)
plugin.json      #  Agent Plugins manifest — INJECTED by build from the
mcp.json         #  manifest (single source of identity). Committed so the
.mcp.json        #  repo is a valid plugin install source. mcp.json == .mcp.json
marketplace.json
cordis.patch.yml #  dsh cordis activation patch (injected by build)
tests/           #  framework + business tests (node --test, mock-based)
```

The build (`npm run build`) bundles the five artifacts, fills the skill
copies, and regenerates the identity files from `src/plugin/manifest.ts` —
the manifest is the **single source of identity** (AC-style guarantee:
`tests/plugin.test.ts` asserts every generated file round-trips it).

## What to replace

| File | What goes there |
|---|---|
| `src/plugin/manifest.ts` | name, version, brand, description, markers, config fields, `tools`, `hook`, `bizCli`, `doctorChecks` — the single source of identity |
| `src/plugin/tools.ts` | your real MCP tools (exported as `ping` for now) |
| `src/plugin/hook.ts` | your real hook handlers (Read interception demo) |
| `src/plugin/doctor.ts` | your real doctor checks |
| `src/plugin/cli-business.ts` | your CLI subcommands (registered via `bizCli`) |
| `tests/` | business tests mirroring the framework test patterns |

Keep `src/framework/` unchanged: it implements marker-based safe writes
(never overwrites a user file lacking the plugin's marker; `.bak` backup on
first write; idempotent re-install; marker-based uninstall), config with
env overrides and masking, the adapter registry, the wizard, and the hook /
MCP / doctor runtimes.

## Creating a new plugin without the generator

```bash
git clone https://github.com/limccn/create-agent-plugin my-plugin
cd my-plugin
# 1. edit src/plugin/manifest.ts — name/brand/markers (everything derives)
# 2. replace the demo business per "What to replace"
# 3. optionally prune targets: edit src/plugin/targets/index.ts
npm install && npm run verify
```

## Publishing

1. **Version**: bump `version` in `src/plugin/manifest.ts` — the build
   injects it into `plugin.json` and `marketplace.json` (both
   `metadata.version` and `plugins[0].version`). Commit the regenerated
   `skills/` + `.mcp.json` with the bump — the git repo is the plugin
   install source.
2. **All green**: `npm run verify`.
3. **Pack manifest**: `npm pack --dry-run` — must contain `dist/`,
   `src/framework/`, `src/plugin/`, `src/assets/`, `assets/`,
   `skills/<skillDir>/`, `plugin.json`, `mcp.json`, `.mcp.json`,
   `README.md`, `LICENSE`; must NOT contain `tests/`, `node_modules/`,
   `src/generator/`, temp files.
4. **Publish**: `npm publish` (first time: `--access public`).
5. **Post-publish smoke** (in a SEPARATE directory outside the package):
   `npx -y <name>@<version> version`, then in a configured project
   `npx -y <name>@<version> doctor`.

Rollback: npm cannot delete versions — `npm deprecate <name>@<ver> "broken
— use <new-version> instead"`. The installer writes `.bak` backups before
every write; `uninstall` reverses by marker.

## Adding a target

Targets are `TargetAdapter`s in `src/plugin/targets/` registered in
`src/plugin/targets/index.ts` — each implements the framework contract
from `src/framework/registry.ts`:

```ts
{
  id: "my-agent",                       // --target my-agent
  kind: "native" | "skill" | "plugin",  // drives scope/detect semantics
  label: "My Agent",                    // pure display name
  scope: "project" | "global",
  detect(ctx): boolean | "manual",      // installed? (or manual guidance)
  install(ctx),                          // write managed artifacts
  uninstall(ctx),                       // remove only marked artifacts
  manualHint?,                          // shown when detect returns "manual"
}
```

Register it in `src/plugin/targets/index.ts` and re-run `npm run verify`.
Details on the safe-file rules and the install/uninstall lifecycle: read
`src/framework/safe-fs.ts` and `src/framework/registry.ts` — they are the
canonical docs. The full 22-target reference implementation lives in
[deepseek-vl-support](https://github.com/limccn/deepseek-vl-support).

## Skill installation

- **The plugin's skill** (`assets/SKILL.md`, synced to
  `skills/<skillDir>/` by build): the installer writes it into each
  supported agent (`.claude/skills/`, `.agents/skills/`, …). Single source
  is `src/assets/SKILL.md` with `{{...}}` tokens filled by build.
- **The generator skill** (`skills/create-agent-plugin/SKILL.md` in the
  `@limccn/create-agent-plugin` package): guides an AI agent through
  scaffolding a new plugin — requirement identification, generation,
  verification, and publishing. Install it where your agents read skills
  (e.g. copy to `.claude/skills/create-agent-plugin/`).
