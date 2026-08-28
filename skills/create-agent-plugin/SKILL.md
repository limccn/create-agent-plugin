---
# create-agent-plugin:skill
name: create-agent-plugin
description: Scaffold a NEW multi-agent plugin (MCP tools, hooks, 22-agent installer) with create-agent-plugin. Trigger words: scaffold, scaffold plugin, create plugin, new plugin, agent plugin, plugin generator, create-agent-plugin
allowed-tools: Bash Read
---

# create-agent-plugin — scaffold a new agent plugin

Use this skill when the user wants to create a NEW agent plugin package: one
that ships MCP tools, a hook, and a multi-agent installer for 22 agent
clients (Claude Code, Codex, Copilot, Cursor, …). Do NOT use it to edit an
existing plugin project.

## When to use

- "I want to build an agent plugin" / "scaffold a plugin"
- "create a new plugin package with MCP tools" / "…with a hook"
- any request for a fresh plugin project — not changes to an existing one

## 1. Identify what the plugin needs

Before running the generator, collect (or infer from the conversation):

- **Package name** — lowercase npm name, e.g. `my-weather-mcp`
- **Brand** — display name; defaults to the package name in title case
- **Capabilities** — which demo business to keep:
  - `mcp` — MCP tools (demo `ping`)
  - `hook` — Claude Code hook (Read interception demo)
  - `cli` — business CLI subcommands + doctor checks
- **Targets** — which agents to support; default is all 22

When the user has not specified something, pass what is known and let the
generator ask for the rest interactively (the user's terminal, not a
subprocess — a non-TTY stdin reads EOF).

## 2. Environment check

- Node ≥ 18: `node --version`
- The target directory must be empty or not exist — the generator refuses
  non-empty directories with a clear message.
- Run inside the project workspace, not inside an existing plugin package
  dir: a local `package.json` with the same name shadows `npx` downloads.

## 3. Generate

Interactive (recommended for a human user):

```bash
npx -y @limccn/create-agent-plugin@latest
```

Fully scripted / non-interactive (flags replace the questions; `--yes`
accepts all remaining defaults):

```bash
npx -y @limccn/create-agent-plugin@latest my-plugin \
  --package my-plugin --brand "My Plugin" --description "…" \
  --capabilities mcp,hook,cli --targets claude,codex,copilot --yes
```

List the target ids a template supports: `npx -y @limccn/create-agent-plugin@latest --list-targets`

Quoting: same as any CLI — wrap values containing spaces in `"`. The
command is identical in bash, zsh, and PowerShell.

## 4. After generation — verify and fill

```bash
cd my-plugin
npm install
npm run verify        # build + typecheck + test
npm run build && npm pack --dry-run   # manifest check
```

Then fill in the business layer — README "What to replace" walks each file:

| File | What goes there |
|---|---|
| `src/plugin/tools.ts` | your real MCP tools |
| `src/plugin/hook.ts` | your real hook handlers |
| `src/plugin/doctor.ts` + `src/plugin/cli-business.ts` | CLI business (kept only when the `cli` capability is on) |
| `src/plugin/manifest.ts` | identity, config fields, markers — the single source of identity |

Keep `src/framework/` untouched: it is the battle-tested installer layer
(marker-based safe writes, config, registry, wizard) extracted from
deepseek-vl-support.

## 5. Publishing

- Bump `version` in `src/plugin/manifest.ts` — `npm run build` injects it
  into plugin.json / marketplace.json (check `npm pack --dry-run`).
- `npm publish`, then smoke OUTSIDE the package dir:
  `npx -y <package>@<version> version`, then in a configured project
  `npx -y <package>@<version> doctor`.

## Troubleshooting

- `npx` resolves a local `package.json` before downloading — run the
  generator from a neutral directory.
- The generator refuses a non-empty target dir; pick a fresh name or clean
  the directory.
- After capability/target pruning, the generated project's tests self-skip
  the pruned parts — the remaining suite must still pass `npm run verify`.
- Skill install: `npm i -g @limccn/create-agent-plugin` is not needed for the
  generator; the skill itself is a static file in the package under
  `skills/create-agent-plugin/SKILL.md` (AgentSkills spec).
