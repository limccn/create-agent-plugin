// Interactive Q&A for create-agent-plugin (zero dependencies, readline).
// Every question has a default — Enter accepts it. Non-interactive runs
// (all flags supplied) skip straight to scaffolding; partial flags ask only
// for what is missing.
//
// Multi-select questions use the wizard convention from the installer:
// comma-separated numbers or names, bare Enter = all.
import { createInterface } from "node:readline/promises";

export interface GenAnswers {
  /** Target directory (relative to cwd or absolute), e.g. "my-agent-plugin". */
  dir: string;
  /** npm package name — also the CLI bin name and MCP server key. */
  packageName: string;
  /** Display brand, e.g. "My Agent Plugin". */
  brand: string;
  /** One-line package description. */
  description: string;
  /** GitHub repo slug (owner/repo) for git-source install hints; empty = unset. */
  githubSlug: string;
  /** Selected demo capabilities: subset of ["mcp", "hook", "cli"]. */
  capabilities: string[];
  /** Selected target adapter ids: subset of the 22 template targets. */
  targets: string[];
}

export interface AskOpts {
  dir?: string;
  packageName?: string;
  brand?: string;
  description?: string;
  githubSlug?: string;
  capabilities?: string[];
  targets?: string[];
}

export interface Choice {
  id: string;
  label: string;
  /** Extra detail shown in the menu, e.g. "MCP tools (ping)". */
  hint?: string;
}

const CAPABILITIES: Choice[] = [
  { id: "mcp", label: "mcp", hint: "MCP tools (ping) exposed to agent clients" },
  { id: "hook", label: "hook", hint: "Claude Code hook (Read interception demo)" },
  { id: "cli", label: "cli", hint: "business CLI subcommand (greet) + doctor checks" },
];

/** "my-agent-plugin" -> "My Agent Plugin" */
function titleCase(s: string): string {
  return s
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** npm package names: lowercase, no spaces; scoped names allowed. */
export function isValidPackageName(s: string): boolean {
  if (!s) return false;
  if (s.startsWith("@")) {
    const [scope, rest] = s.split("/");
    if (!rest || !/^@[a-z0-9][a-z0-9-]*$/.test(scope ?? "")) return false;
    s = rest;
  }
  return /^[a-z0-9][a-z0-9-]*$/.test(s);
}

const DEFAULT_DESCRIPTION =
  "An agent plugin scaffolded from @limccn/create-agent-plugin: MCP tools + hooks + multi-agent installer.";

/** Pure defaults for everything the user did not supply — also the
 *  non-interactive answers (`--yes`). */
export function defaultAnswers(opts: AskOpts, targets: Choice[]): GenAnswers {
  const dir = opts.dir ?? "my-agent-plugin";
  const packageName = opts.packageName ?? dir.split(/[\\/]/).pop() ?? "my-agent-plugin";
  return {
    dir,
    packageName,
    brand: opts.brand ?? titleCase(packageName),
    description: opts.description ?? DEFAULT_DESCRIPTION,
    githubSlug: opts.githubSlug ?? "",
    capabilities: opts.capabilities ?? CAPABILITIES.map((c) => c.id),
    targets: opts.targets ?? targets.map((t) => t.id),
  };
}

export async function askQuestions(
  opts: AskOpts,
  targets: Choice[],
): Promise<GenAnswers> {
  const d = defaultAnswers(opts, targets);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (prompt: string): Promise<string> => {
    const line = await rl.question(prompt);
    return (line ?? "").trim();
  };
  const askWithDefault = async (prompt: string, dflt: string): Promise<string> => {
    const line = await ask(`${prompt} [${dflt}] > `);
    return line === "" ? dflt : line;
  };
  /** Number/name multi-select; bare Enter = everything. */
  const askMulti = async (label: string, choices: Choice[]): Promise<string[]> => {
    for (;;) {
      process.stdout.write(`\n${label} (comma-separated numbers or names, Enter = all):\n`);
      choices.forEach((c, i) => {
        process.stdout.write(`  ${i + 1}. ${c.label}${c.hint ? ` — ${c.hint}` : ""}\n`);
      });
      const line = await ask("> ");
      if (line === "") return choices.map((c) => c.id);
      const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
      const picked: string[] = [];
      let bad = false;
      for (const p of parts) {
        const asNum = Number(p);
        if (p !== "" && Number.isInteger(asNum) && asNum >= 1 && asNum <= choices.length) {
          picked.push(choices[asNum - 1]!.id);
        } else if (choices.some((c) => c.id === p)) {
          picked.push(p);
        } else {
          bad = true;
          break;
        }
      }
      if (!bad && picked.length > 0) return [...new Set(picked)];
      process.stdout.write(`  (invalid selection — use numbers or ids from the list)\n`);
    }
  };

  try {
    // 1. Project directory.
    const dir = opts.dir ?? (await askWithDefault("Project directory", d.dir));
    // 2. Package name — defaults to the directory name when valid.
    let packageName = opts.packageName ?? (await askWithDefault("npm package name", d.packageName));
    while (!isValidPackageName(packageName)) {
      process.stdout.write(`  (package names: lowercase letters, digits, -; optional @scope/ prefix)\n`);
      packageName = await ask("npm package name > ");
      if (packageName === "") packageName = d.packageName;
    }
    // 3. Brand — defaults to the package name in title case.
    const brand = opts.brand ?? (await askWithDefault("Brand name", d.brand));
    // 4. Description.
    const description = opts.description ?? (await askWithDefault("Description", d.description));
    // 5. GitHub slug (optional; skip when publishing is not planned yet).
    const githubSlug = opts.githubSlug ?? (await ask("GitHub repo slug (owner/repo, Enter to skip) > "));
    // 6. Capabilities.
    const capabilities =
      opts.capabilities ?? (await askMulti("Capabilities (demo business to keep)", CAPABILITIES));
    // 7. Targets.
    const targetsPicked = opts.targets ?? (await askMulti("Agent targets to support", targets));

    return {
      dir,
      packageName,
      brand,
      description,
      githubSlug,
      capabilities,
      targets: targetsPicked,
    };
  } finally {
    rl.close();
  }
}

export { CAPABILITIES };
