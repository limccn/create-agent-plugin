// Business MCP tools. Replace `ping` with your plugin's real tools; the
// framework serves them over stdio, exposes them in mcp.json / plugin.json,
// and registers them in every agent client.
import type { ToolDef, ToolContext } from "../framework/manifest.ts";

export const ping: ToolDef = {
  name: "ping",
  description:
    "Health check for the plugin: returns pong plus the configured greeting. Use it to verify the plugin's MCP server is reachable.",
  inputSchema: {
    type: "object",
    properties: {
      echo: { type: "string", description: "Optional string echoed back." },
    },
  },
  handler: async (args: Record<string, unknown>, ctx: ToolContext) => {
    const greeting = String(ctx.config.greeting ?? "Hello, agent!");
    return {
      pong: "ok",
      echo: args.echo ?? null,
      greeting,
    };
  },
};
