---
# my-agent-plugin:skill
name: my-agent-plugin
description: Demo skill for the My Agent Plugin plugin — how the plugin's MCP tools and hook work, and how to configure them. Trigger words: my-agent-plugin, plugin config, ping tool, agent plugin
allowed-tools: Bash Read
---

# My Agent Plugin — demo plugin skill

This plugin ships a demo MCP tool (`ping`) and a demo Read hook. Use this
skill when the task involves the plugin's tools or configuration.

## When to use

- verifying the plugin's MCP server is reachable (call `ping`)
- checking or changing the plugin's config
- understanding what the plugin does

## How to use

Run in the Bash tool:

```bash
npx my-agent-plugin config get
npx my-agent-plugin doctor
```

The `ping` tool (via MCP, in agent clients) returns `{pong: "ok"}` plus the
configured greeting. The hook prints a `[demo] read intercepted:` line to
stderr on every Read — it never blocks the tool.

## Config

- `greeting` (env `DEMO_GREETING`) — the greeting string returned by `ping`
- `token` (env `DEMO_TOKEN`, masked) — example secret field

Set values with `npx my-agent-plugin config set <key> <value>` (project) or with the
`--global` flag. Env vars override file values.
