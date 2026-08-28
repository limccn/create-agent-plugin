// Business CLI subcommands (registered via manifest.bizCli). Replace with
// your plugin's commands (deepseek-vl-support's `describe` lives here in
// spirit). Each entry: name → (positional args, {log, fail}) => void.
import { resolveConfig } from "../framework/config.ts";
import type { BizCliContext } from "../framework/manifest.ts";
import { manifest } from "./manifest.ts";

export const demoBizCli: Record<string, (argv: string[], ctx: BizCliContext) => Promise<void>> = {
  greet: async (_argv: string[], ctx: BizCliContext) => {
    const cfg = resolveConfig(manifest, process.cwd());
    ctx.log(`${String(cfg.values.greeting ?? "(not set)")} (from ${cfg.sources.greeting ?? "unset"})`);
  },
};
