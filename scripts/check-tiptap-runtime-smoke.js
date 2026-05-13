#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { importBundledModule } from "../js/test/helpers/load-esbuild-module.js";

const { checkTiptapRuntimeSmoke } = await importBundledModule(
  new URL("../js/src/tiptap-runtime-smoke.ts", import.meta.url),
);

const DEFAULT_FIXTURE = "js/test/fixtures/tiptap-release-smoke.md";

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const unexpectedOption = args.find((arg) => arg.startsWith("-"));
  if (unexpectedOption) {
    console.error(`Unknown option: ${unexpectedOption}`);
    printUsage();
    process.exitCode = 2;
    return;
  }

  const fixturePath = args[0] ?? DEFAULT_FIXTURE;
  const failures = await checkTiptapRuntimeSmoke(readFileSync(fixturePath, "utf8"));

  if (failures.length > 0) {
    console.error("Tiptap runtime smoke check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Tiptap runtime smoke check passed.");
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-tiptap-runtime-smoke.js
  node scripts/check-tiptap-runtime-smoke.js <fixture.md>

Creates a real Tiptap editor in a DOM-like environment, mounts the Markdown
release fixture, checks rendered document nodes, and verifies Markdown
round-trip output remains stable.`);
}

await main();
