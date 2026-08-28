// Business layer manifest — THE single source of identity for this plugin.
// The generator rewrites this file (plus package.json) when scaffolding a
// new plugin; everything else is derived by build.mjs. All values here are
// plain literals so the generator can regenerate the file structurally.
import type { PluginManifest } from "../framework/manifest.ts";
import { ping } from "./tools.ts";
import { demoHook } from "./hook.ts";
import { demoDoctorChecks } from "./doctor.ts";
import { demoBizCli } from "./cli-business.ts";

export const manifest: PluginManifest = {
  name: "my-agent-plugin",
  version: "0.1.0-rc2",
  brand: "My Agent Plugin",
  description: "A scaffolded agent plugin: MCP tools + hooks + multi-agent installer.",
  githubSlug: "limccn/my-agent-plugin",

  // Identity markers. Keep stable across releases — uninstall recognizes
  // artifacts by these strings and never touches files without them.
  markers: {
    hook: "my-agent-plugin-hook",
    hookCommand: "my-agent-plugin-hook",
    skill: "my-agent-plugin:skill",
    command: "my-agent-plugin:command",
    commandFile: "demo.md",
    skillDir: "my-agent-plugin",
    configDir: ".my-agent-plugin",
    cursorDir: "my-agent-plugin",
    cursorMarkerFile: ".my-agent-plugin-managed",
    cursorMarker: "my-agent-plugin:managed",
    agentsStart: "<!-- my-agent-plugin:start -->",
    agentsEnd: "<!-- my-agent-plugin:end -->",
  },

  config: [
    {
      key: "greeting",
      label: "Greeting",
      type: "string",
      env: "DEMO_GREETING",
      default: "Hello, agent!",
      placeholder: "e.g. Hello from my plugin",
    },
    {
      key: "token",
      label: "API token",
      type: "string",
      env: "DEMO_TOKEN",
      mask: true,
      placeholder: "sk-...",
    },
  ],

  tools: [ping],

  // Skill body ships as assets/SKILL.md (byte-synced to skills/<skillDir>/).
  skill: { filename: "SKILL.md" },

  hook: demoHook,

  bizCli: demoBizCli,
  doctorChecks: demoDoctorChecks,
};
