#!/usr/bin/env node
// create-agent-plugin entry — scaffold a new multi-agent plugin project from
// the battle-tested template. Interactive by default; every answer has a
// default, and all of them can be supplied as flags for non-interactive /
// CI runs.
//
//   create-agent-plugin [dir] [--package <name>] [--brand <name>]
//     [--description <text>] [--github <owner/repo>]
//     [--capabilities mcp,hook,cli] [--targets claude,codex,...]
//
// The target dir must be new (or empty); nothing outside it is touched.
import { adapters } from "../plugin/targets/index.ts";
import { askQuestions, defaultAnswers, isValidPackageName, type AskOpts } from "./ask.ts";
import { printNextSteps, scaffold } from "./scaffold.ts";

const TARGET_CHOICES = adapters.map((a) => ({
  id: a.id,
  label: a.label,
  hint: a.kind,
}));

function usage(): void {
  process.stdout.write(
    [
      "create-agent-plugin — scaffold a multi-agent plugin project",
      "",
      "Usage:",
      "  create-agent-plugin [dir] [options]",
      "",
      "Options:",
      "  --package <name>      npm package name (default: the dir name)",
      "  --brand <name>        display brand (default: title-cased package name)",
      "  --description <text>  one-line description",
      "  --github <slug>       GitHub repo slug owner/repo (default: unset)",
      "  --capabilities <ids>  demo business to keep: mcp,hook,cli (default: all)",
      "  --targets <ids>       agent targets: comma-separated adapter ids (default: all)",
      "  --yes                 non-interactive: accept defaults for anything unset",
      "  --list-targets        print the available target ids and exit",
      "  --version             print the generator version",
      "  --help                this message",
      "",
    ].join("\n"),
  );
}

/** Split a comma-separated flag value. */
function splitList(v: string | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    usage();
    return 0;
  }
  if (argv.includes("--version")) {
    process.stdout.write("0.1.0\n");
    return 0;
  }
  if (argv.includes("--list-targets")) {
    for (const t of TARGET_CHOICES) process.stdout.write(`${t.id}\n`);
    return 0;
  }

  const opts: AskOpts = {};
  let yes = false;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = (): string | undefined => argv[++i];
    switch (a) {
      case "--package":
        opts.packageName = next();
        break;
      case "--brand":
        opts.brand = next();
        break;
      case "--description":
        opts.description = next();
        break;
      case "--github":
        opts.githubSlug = next();
        break;
      case "--capabilities":
        opts.capabilities = splitList(next());
        break;
      case "--targets":
        opts.targets = splitList(next());
        break;
      case "--yes":
        yes = true;
        break;
      default:
        positional.push(a);
    }
  }
  if (positional.length > 0) opts.dir = positional[0];

  // Validate capability ids before asking anything.
  const VALID_CAPS = new Set(["mcp", "hook", "cli"]);
  for (const c of opts.capabilities ?? []) {
    if (!VALID_CAPS.has(c)) {
      process.stderr.write(`unknown capability "${c}" — valid: mcp, hook, cli\n`);
      return 1;
    }
  }
  const knownTargets = new Set(TARGET_CHOICES.map((t) => t.id));
  for (const t of opts.targets ?? []) {
    if (!knownTargets.has(t)) {
      process.stderr.write(`unknown target "${t}" — run --list-targets for the full set\n`);
      return 1;
    }
  }

  if (!isValidPackageName(defaultAnswers(opts, TARGET_CHOICES).packageName)) {
    process.stderr.write(
      `invalid package name "${opts.packageName ?? ""}" — lowercase letters, digits, -; optional @scope/ prefix\n`,
    );
    return 1;
  }

  const answers = yes ? defaultAnswers(opts, TARGET_CHOICES) : await askQuestions(opts, TARGET_CHOICES);

  const result = await scaffold(answers, process.cwd());
  printNextSteps(answers, answers.dir);
  if (result.removedTests.length > 0) {
    process.stdout.write(
      `  (removed ${result.removedTests.length} capability test file(s): ${result.removedTests.join(", ")})\n`,
    );
  }
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    process.stderr.write(`create-agent-plugin failed: ${e instanceof Error ? e.message : e}\n`);
    process.exitCode = 1;
  });
