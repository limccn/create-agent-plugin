# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This package is **both** the `@limccn/create-agent-plugin` generator **and** the plugin template it copies: `npx @limccn/create-agent-plugin` (entry: `src/generator/index.ts`) clones this package into a new project and rewrites its identity. The npm package name is the generator's (`@limccn/create-agent-plugin`); the demo plugin identity (`my-agent-plugin`) lives in [src/plugin/manifest.ts](src/plugin/manifest.ts). A scaffolded project flips that — npm name = plugin name, bin → `dist/cli.js`. The generator's bin name stays unscoped (`create-agent-plugin`), so `npx @limccn/create-agent-plugin` and `create-agent-plugin` after a global install invoke the same entry.

The plugin itself ships a CLI (`install | uninstall | doctor | config | mcp | version` + business subcommands) and a multi-agent installer that wires an MCP server, hook, and skill into 22 agent clients (native 8 / skill 4 / plugin 10).

## Commands

```bash
npm run build      # node build.mjs — bundles + regenerates identity files (below)
npm run typecheck  # tsc --noEmit
npm run test       # node --test "tests/*.test.ts" (needs Node ≥ 23.6 for TS type-stripping)
npm run verify     # build + typecheck + test — the full gate
node --test tests/plugin.test.ts    # single test file
node dist/cli.js install --non-interactive --target claude,codex   # smoke (after build)
node dist/cli.js doctor
```

`npm run build` produces everything else in the repo:
- bundles `dist/cli.js` (ESM CLI), `dist/hook.cjs` (CJS, zero deps, identity banner), `dist/dsh-plugin.js` (ESM, `@deepseek-ai/*` kept external), `dist/generator.js`
- syncs `assets/` from `src/assets/` and fills `skills/<skillDir>/SKILL.md` from `src/assets/SKILL.md` (the `{{token}}` source)
- regenerates `plugin.json` / `mcp.json` / `.mcp.json` / `marketplace.json` / `cordis.patch.yml` from the manifest

## Architecture

### Two layers

- `src/framework/` — **framework layer**: safe-fs, config, target registry, wizard, hook/MCP/doctor runtimes, CLI skeleton. Extracted from deepseek-vl-support, battle-tested. Keep unchanged; it's copied verbatim into every scaffolded plugin.
- `src/plugin/` — **fill layer**: the business (`tools.ts`, `hook.ts`, `doctor.ts`, `cli-business.ts`, `manifest.ts`) plus the target adapters in `src/plugin/targets/`. This is what a plugin author replaces.

### The manifest is the single source of identity

Everything the installer writes and every generated file derives from `src/plugin/manifest.ts` (name, version, brand, description, markers, config fields, tools, hook, bizCli, doctorChecks). [tests/plugin.test.ts](tests/plugin.test.ts) asserts every generated artifact round-trips the manifest — it reads `dist/`, so it fails on a clean checkout until `npm run build` has run.

**Version lives in two places** — `src/plugin/manifest.ts` and `package.json` — and the test enforces equality. When releasing, bump both, then commit the regenerated `skills/` + `.mcp.json` (the git repo itself is the plugin install source).

### Identity markers and safe writes

Each marker in `manifest.markers` is a literal string that identifies *our* artifacts. Rules (see [src/framework/safe-fs.ts](src/framework/safe-fs.ts)):
- a file/entry is ours only if it carries a marker — uninstall removes marked artifacts and never touches anything else
- first modification of an existing file backs it up to `<file>.bak`
- JSON edits are deep-merged, idempotent, leave unknown keys alone; managed text blocks use start/end markers; TOML edits are section-scoped
- **markers must stay stable across releases** — uninstall recognizes artifacts by them

### Target adapters

One `TargetAdapter` per agent client (contract in [src/framework/registry.ts](src/framework/registry.ts)): `{ id, kind: "native"|"skill"|"plugin", scope, detect, install, uninstall, manualHint }`. Grouped by kind in `src/plugin/targets/` and registered in `src/plugin/targets/index.ts` — the wizard menus, help text, and install/uninstall dispatch pick them up automatically. A failing target never blocks the others (`installAll`/`uninstallAll`/`detectAll`).

Windows gotcha in `which()`: shims are probed in PATHEXT order (`.exe` → `.cmd` → `.bat` → extensionless **last**). Extensionless-first broke raw spawn on Windows (0.2.1 regression from the deepseek-vl-support history).

### Config

Declarative, field-driven ([src/framework/config.ts](src/framework/config.ts)): `env > project <configDir>/config.json > global ~/<configDir>/config.json > field defaults`. Secret fields (`mask: true`) are masked in display and read from `--<key>` or their env var. CLI: `config get|set|path [--global]`.

### Runtime entry points

- `src/cli-entry.ts` → `dist/cli.js`: hand-rolled zero-dependency arg parsing (`VALUE_FLAGS` set distinguishes `--target claude` from boolean `--json`). `runCli` dispatches to install/uninstall/doctor/config/mcp/version, falling back to `manifest.bizCli[cmd]`. `--non-interactive` is implied when stdin isn't a TTY.
- `src/hook-entry.ts` → `dist/hook.cjs`: the hook runs inside agent hosts, so it must be CJS with zero deps; esbuild's `/*! marker */` banner doubles as the uninstall marker.
- `src/dsh-plugin.ts` → `dist/dsh-plugin.js`: `@deepseek-ai/*` stay external (the dsh profile injects them at runtime); this one file is committed to git (`.gitignore` exception) so `dsh plugin add github:<slug>` works without a build.

### The generator

`src/generator/` = `ask.ts` (interactive questions, every answer has a default, all supplyable as flags), `scaffold.ts` (copy + rewrite), `index.ts` (CLI). `scaffold` copies the package **excluding** build-generated artifacts (`dist/`, `assets/`, `skills/`, identity files) and rewrites: `src/plugin/manifest.ts`, `package.json` (name/bin/description), `src/plugin/targets/index.ts` (pruned to the selected target set), README tokens; it removes test files owned by deselected capabilities. `fillTemplate` is duplicated in `build.mjs` and `scaffold.ts` on purpose — build.mjs is a top-level-await script and can't be imported at runtime.

### Tests

`node:test` + `node:assert/strict`, mock-based (temp project dirs, injectable `home`, fake binaries), no network. Target tests run against the real adapter code in temp dirs. `tests/plugin.test.ts` and `tests/generator-skill.test.ts` are static round-trip/consistency checks.

## Gotchas

- `dist/` and `assets/` are gitignored (build output); `skills/<skillDir>/SKILL.md` is **committed** — git-installed plugins ship it directly. `skills/create-agent-plugin/SKILL.md` (the generator skill) is hand-authored, not build-synced.
- `npm pack` must contain `dist/`, `src/framework/`, `src/plugin/`, `src/assets/`, `assets/`, `src/generator/`, `tests/`, `build.mjs`, `skills/`, identity files, README, LICENSE — and must NOT contain `node_modules/` or caches (the `files` field handles this). `tests/`, `src/generator/` and `assets/` ship on purpose: `scaffold` copies the installed package root as the template and `templatePath()` reads `assets/` at runtime — a missing `assets/` silently strips AGENTS.md / command fragments from every scaffolded plugin.
- Publishing is **tag-triggered dual publish**: bump the version in both `src/plugin/manifest.ts` and `package.json`, run `npm run verify`, check `npm pack --dry-run`, commit, then push a `v*` tag — `.github/workflows/publish.yml` publishes to npmjs (`NPM_TOKEN` secret, `--access public`; prerelease versions like `0.1.0-rc1` go to the `next` dist-tag, released versions to `latest`) and to GitHub Packages (`GITHUB_TOKEN`, `https://npm.pkg.github.com`, scope `@limccn`). Pre-release validation flow: tag `v0.1.0-rc1` → smoke-test in a separate directory with `npx -y @limccn/create-agent-plugin@0.1.0-rc1 doctor` → tag `v0.1.0` for the real release. Configure the `NPM_TOKEN` repo secret (Settings → Secrets and variables → Actions) before the first tag.
- The `Read` hook demo intercepts reads — when iterating on hooks, `dist/hook.cjs` is rebuilt by `npm run build`; installed agents reference the dist path, not `src/`.
