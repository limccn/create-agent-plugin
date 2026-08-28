// Business hook handlers. The framework's hook-runtime provides the
// stdin/stdout protocol shell; these handlers decide what to do with the
// event. Returning {} (no-op) lets the agent tool proceed untouched.
// Replace the demo Read interception with your plugin's real logic
// (e.g. deepseek-vl-support describes images and injects [Vision of ...]).
import type { HookDef, HookResult } from "../framework/manifest.ts";

export const demoHook: HookDef = {
  preToolUse: async (input: Record<string, unknown>): Promise<HookResult> => {
    if (input.hook_event_name !== "PreToolUse" || input.tool_name !== "Read") {
      return {};
    }
    const filePath = (input.tool_input as Record<string, unknown> | undefined)?.file_path;
    if (typeof filePath !== "string" || !filePath) return {};
    // Demo: just note the interception on stderr and let the read proceed.
    process.stderr.write(`[demo] read intercepted: ${filePath}\n`);
    return {};
  },
};
