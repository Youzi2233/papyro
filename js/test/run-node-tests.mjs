import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const testRoot = join(packageRoot, "test");
const testFilePattern = /\.test\.(?:cjs|js|mjs|ts|tsx)$/u;

const testFiles = findFiles(testRoot)
  .filter((file) => testFilePattern.test(file))
  .map((file) => relative(packageRoot, file))
  .sort();
const extraArgs = process.argv.slice(2);

if (testFiles.length === 0) {
  console.error("No Node test files found.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    "--import",
    "./test/helpers/register-esbuild-test-loader.mjs",
    "--test",
    ...extraArgs,
    ...testFiles,
  ],
  {
    cwd: packageRoot,
    env: process.env,
    stdio: "inherit",
  }
);

if (result.error) {
  console.error(`Node test runner failed to start: ${result.error.message}`);
  process.exit(result.status ?? 1);
}

process.exit(result.status ?? 0);

function findFiles(directory) {
  const entries = readdirSync(directory)
    .map((name) => join(directory, name))
    .sort();

  return entries.flatMap((entry) =>
    statSync(entry).isDirectory() ? findFiles(entry) : [entry]
  );
}
