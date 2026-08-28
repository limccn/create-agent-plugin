// dsh (DeepSeek Harness) native cordis plugin template: registers every
// manifest tool as a first-party dsh tool (same names/descriptions as the
// MCP server), so `dsh plugin --profile web add <package>` gives a dsh
// session the plugin's tools with no extra config.
//
// Activation: package.json "dsh" key → cordis.patch.yml insert line → the
// profile pnpm closure loads this module (package main entry) and injects
// @deepseek-ai/cordis + @deepseek-ai/dsh-tools at runtime. Those packages are
// devDependencies here for types only — this file is bundled with them
// external (see build.mjs), so the plugin never ships its own copies.
import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { resolveConfig } from "./framework/config.ts";
import { manifest } from "./plugin/manifest.ts";

/** Stable plugin id — must match the cordis.patch.yml insert id. */
export const name = manifest.name;

export const inject = ["tools"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parametersFromSchema(schema: Record<string, unknown>): any {
  const props = (schema.properties as Record<string, unknown> | undefined) ?? {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    const p = (v ?? {}) as Record<string, unknown>;
    out[k] = { ...p, required: required.includes(k) };
  }
  return out;
}

export function apply(ctx: Context): void {
  for (const tool of manifest.tools) {
    ctx.tools.register(
      defineTool({
        name: tool.name,
        description: tool.description,
        parameters: parametersFromSchema(tool.inputSchema),
        output: {
          schema: { type: "string" },
          render: (_args, value) => [{ type: "text", text: String(value) }],
        },
        async execute(args, exec) {
          if (exec.signal?.aborted) throw new Error(`${tool.name}: cancelled`);
          const result = await tool.handler(args as Record<string, unknown>, {
            config: resolveConfig(manifest, process.cwd()).values,
            log: (msg) => process.stderr.write(`[${manifest.name}] ${msg}\n`),
          });
          return typeof result === "string" ? result : JSON.stringify(result, null, 2);
        },
      }),
    );
  }
}
