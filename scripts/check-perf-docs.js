#!/usr/bin/env node
import { readFileSync } from "node:fs";

const CHECKER_PATH = "scripts/check-perf-smoke.js";
const DOC_PATHS = ["docs/performance-budget.md", "docs/roadmap.md"];

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  if (args.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const unexpectedOption = args.find((arg) => arg.startsWith("-"));
  if (unexpectedOption) {
    console.error(`Unknown option: ${unexpectedOption}`);
    printUsage();
    process.exitCode = 2;
    return;
  }

  const traceNames = traceNamesFromChecker(readFileSync(CHECKER_PATH, "utf8"));
  const failures = traceNames.flatMap((traceName) =>
    DOC_PATHS.filter((docPath) => {
      const doc = readFileSync(docPath, "utf8");
      return !doc.includes(traceName);
    }).map((docPath) => `${docPath} is missing ${traceName}`),
  );

  if (failures.length > 0) {
    console.error("Performance documentation check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Performance documentation check passed.");
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-perf-docs.js
  node scripts/check-perf-docs.js --self-test

Checks that documented performance trace names stay in sync with the smoke
checker.`);
}

function traceNamesFromChecker(source) {
  const match = source.match(/const TRACE_NAMES = \[([\s\S]*?)\];/);
  if (!match) {
    throw new Error("TRACE_NAMES array not found");
  }

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function runSelfTest() {
  const traceNames = traceNamesFromChecker(`
    const TRACE_NAMES = [
      "perf app dispatch action",
      "perf editor open markdown",
    ];
  `);

  assert(traceNames.length === 2);
  assert(traceNames[0] === "perf app dispatch action");
  assert(traceNames[1] === "perf editor open markdown");
  console.log("Performance documentation checker self-test passed.");
}

function assert(condition) {
  if (!condition) {
    throw new Error("Performance documentation checker self-test failed");
  }
}

main();
