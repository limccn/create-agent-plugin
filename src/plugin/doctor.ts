// Business doctor checks. Replace with real checks for your plugin (e.g.
// deepseek-vl-support probes the vision endpoint's /v1/models). Keep them
// pure functions of the resolved config so `doctor` stays fast and local.
import type { DoctorCheck } from "../framework/manifest.ts";

export const demoDoctorChecks: DoctorCheck[] = [
  {
    id: "greeting",
    label: "greeting configured",
    run: async (config) => {
      const g = config.greeting;
      if (g === undefined || String(g).trim() === "") {
        return ["greeting is not set — run `config set greeting <text>` or set DEMO_GREETING."];
      }
      return [];
    },
  },
];
