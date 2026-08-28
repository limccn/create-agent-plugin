---
# {{name}}:skill
name: {{skillDir}}
description: Demo skill for the {{brand}} plugin — how the plugin's MCP tools and hook work, and how to configure them. Trigger words: {{name}}, plugin config, ping tool, agent plugin
allowed-tools: Bash Read
---

# {{brand}} — demo plugin skill

This plugin ships a demo MCP tool (`ping`) and a demo Read hook. Use this
skill when the task involves the plugin's tools or configuration.

## When to use

- verifying the plugin's MCP server is reachable (call `ping`)
- checking or changing the plugin's config
- understanding what the plugin does

## How to use

Run in the Bash tool:

```bash
npx {{name}} config get
npx {{name}} doctor
```

The `ping` tool (via MCP, in agent clients) returns `{pong: "ok"}` plus the
configured greeting. The hook prints a `[demo] read intercepted:` line to
stderr on every Read — it never blocks the tool.

## Config

- `greeting` (env `DEMO_GREETING`) — the greeting string returned by `ping`
- `token` (env `DEMO_TOKEN`, masked) — example secret field

Set values with `npx {{name}} config set <key> <value>` (project) or with the
`--global` flag. Env vars override file values.
