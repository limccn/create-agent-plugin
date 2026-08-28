// src/dsh-plugin.ts
import { defineTool } from "@deepseek-ai/dsh-tools";

// src/framework/config.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function projectConfigDir(manifest2, cwd) {
  return join(cwd, manifest2.markers.configDir);
}
function projectConfigPath(manifest2, cwd) {
  return join(projectConfigDir(manifest2, cwd), "config.json");
}
function globalConfigDir(manifest2, home = homedir()) {
  return join(home, manifest2.markers.configDir);
}
function globalConfigPath(manifest2, home = homedir()) {
  return join(globalConfigDir(manifest2, home), "config.json");
}
function readJsonFile(p) {
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    return typeof data === "object" && data !== null ? data : null;
  } catch {
    return null;
  }
}
function envOf(field) {
  const v = process.env[field.env];
  if (v === void 0 || v === "") return void 0;
  return v;
}
function coerce(field, raw) {
  switch (field.type) {
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
    case "boolean":
      return raw === "true" || raw === "1";
    case "json":
    case "string":
    default:
      return raw;
  }
}
function resolveConfig(manifest2, cwd, home) {
  const project = readJsonFile(projectConfigPath(manifest2, cwd));
  const global = readJsonFile(globalConfigPath(manifest2, home));
  const values = {};
  const sources = {};
  let file = null;
  for (const field of manifest2.config) {
    if (field.default !== void 0) {
      values[field.key] = field.default;
      sources[field.key] = "default";
    }
  }
  if (global) {
    file = globalConfigPath(manifest2, home);
    for (const field of manifest2.config) {
      const v = global[field.key];
      if (v !== void 0) {
        values[field.key] = v;
        sources[field.key] = "global";
      }
    }
  }
  if (project) {
    file = projectConfigPath(manifest2, cwd);
    for (const field of manifest2.config) {
      const v = project[field.key];
      if (v !== void 0) {
        values[field.key] = v;
        sources[field.key] = "project";
      }
    }
  }
  for (const field of manifest2.config) {
    const raw = envOf(field);
    if (raw !== void 0) {
      values[field.key] = coerce(field, raw);
      sources[field.key] = "env";
    }
  }
  return { values, sources, file };
}

// src/plugin/tools.ts
var ping = {
  name: "ping",
  description: "Health check for the plugin: returns pong plus the configured greeting. Use it to verify the plugin's MCP server is reachable.",
  inputSchema: {
    type: "object",
    properties: {
      echo: { type: "string", description: "Optional string echoed back." }
    }
  },
  handler: async (args, ctx) => {
    const greeting = String(ctx.config.greeting ?? "Hello, agent!");
    return {
      pong: "ok",
      echo: args.echo ?? null,
      greeting
    };
  }
};

// src/plugin/hook.ts
var demoHook = {
  preToolUse: async (input) => {
    if (input.hook_event_name !== "PreToolUse" || input.tool_name !== "Read") {
      return {};
    }
    const filePath = input.tool_input?.file_path;
    if (typeof filePath !== "string" || !filePath) return {};
    process.stderr.write(`[demo] read intercepted: ${filePath}
`);
    return {};
  }
};

// src/plugin/doctor.ts
var demoDoctorChecks = [
  {
    id: "greeting",
    label: "greeting configured",
    run: async (config) => {
      const g = config.greeting;
      if (g === void 0 || String(g).trim() === "") {
        return ["greeting is not set \u2014 run `config set greeting <text>` or set DEMO_GREETING."];
      }
      return [];
    }
  }
];

// src/plugin/cli-business.ts
var demoBizCli = {
  greet: async (_argv, ctx) => {
    const cfg = resolveConfig(manifest, process.cwd());
    ctx.log(`${String(cfg.values.greeting ?? "(not set)")} (from ${cfg.sources.greeting ?? "unset"})`);
  }
};

// src/plugin/manifest.ts
var manifest = {
  name: "my-agent-plugin",
  version: "0.1.1",
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
    agentsEnd: "<!-- my-agent-plugin:end -->"
  },
  config: [
    {
      key: "greeting",
      label: "Greeting",
      type: "string",
      env: "DEMO_GREETING",
      default: "Hello, agent!",
      placeholder: "e.g. Hello from my plugin"
    },
    {
      key: "token",
      label: "API token",
      type: "string",
      env: "DEMO_TOKEN",
      mask: true,
      placeholder: "sk-..."
    }
  ],
  tools: [ping],
  // Skill body ships as assets/SKILL.md (byte-synced to skills/<skillDir>/).
  skill: { filename: "SKILL.md" },
  hook: demoHook,
  bizCli: demoBizCli,
  doctorChecks: demoDoctorChecks
};

// src/dsh-plugin.ts
var name = manifest.name;
var inject = ["tools"];
function parametersFromSchema(schema) {
  const props = schema.properties ?? {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    const p = v ?? {};
    out[k] = { ...p, required: required.includes(k) };
  }
  return out;
}
function apply(ctx) {
  for (const tool of manifest.tools) {
    ctx.tools.register(
      defineTool({
        name: tool.name,
        description: tool.description,
        parameters: parametersFromSchema(tool.inputSchema),
        output: {
          schema: { type: "string" },
          render: (_args, value) => [{ type: "text", text: String(value) }]
        },
        async execute(args, exec) {
          if (exec.signal?.aborted) throw new Error(`${tool.name}: cancelled`);
          const result = await tool.handler(args, {
            config: resolveConfig(manifest, process.cwd()).values,
            log: (msg) => process.stderr.write(`[${manifest.name}] ${msg}
`)
          });
          return typeof result === "string" ? result : JSON.stringify(result, null, 2);
        }
      })
    );
  }
}
export {
  apply,
  inject,
  name
};
