#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const metadata = JSON.parse(
  execFileSync("cargo", ["metadata", "--format-version", "1", "--no-deps"], {
    encoding: "utf8",
  })
);

const workspacePackages = new Set(
  metadata.packages
    .filter((pkg) => metadata.workspace_members.includes(pkg.id))
    .map((pkg) => pkg.name)
);

const allowedWorkspaceDeps = {
  "papyro-desktop": new Set(["papyro-app"]),
  "papyro-mobile": new Set(["papyro-app"]),
  "papyro-app": new Set([
    "papyro-core",
    "papyro-editor",
    "papyro-platform",
    "papyro-storage",
    "papyro-ui",
  ]),
  "papyro-core": new Set(),
  "papyro-editor": new Set(["papyro-core"]),
  "papyro-platform": new Set(["papyro-core"]),
  "papyro-storage": new Set(["papyro-core"]),
  "papyro-ui": new Set(["papyro-core", "papyro-editor"]),
};

const dioxusAllowed = new Set([
  "papyro-app",
  "papyro-desktop",
  "papyro-mobile",
  "papyro-ui",
]);

const failures = [];

for (const pkg of metadata.packages) {
  if (!workspacePackages.has(pkg.name)) continue;

  const allowed = allowedWorkspaceDeps[pkg.name];
  if (!allowed) {
    failures.push(`${pkg.name}: missing dependency rule`);
    continue;
  }

  for (const dep of pkg.dependencies) {
    if (workspacePackages.has(dep.name) && !allowed.has(dep.name)) {
      failures.push(`${pkg.name} -> ${dep.name}`);
    }

    if (dep.name === "dioxus" && !dioxusAllowed.has(pkg.name)) {
      failures.push(`${pkg.name} -> dioxus`);
    }
  }
}

if (failures.length > 0) {
  console.error("Workspace dependency check failed:");
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log("Workspace dependency check passed.");
