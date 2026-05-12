import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const helperDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(helperDirectory, "..", "..");

export async function importBundledModule(entryPoint, {
  loader = {},
  jsx = "automatic",
  packages = "external",
} = {}) {
  const entryPath = entryPoint instanceof URL ? fileURLToPath(entryPoint) : entryPoint;
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    format: "esm",
    platform: "node",
    packages,
    write: false,
    jsx,
    loader: {
      ".js": "jsx",
      ".jsx": "jsx",
      ".ts": "ts",
      ".tsx": "tsx",
      ".scss": "empty",
      ...loader,
    },
  });
  const source = result.outputFiles?.[0]?.text;
  if (!source) {
    throw new Error(`Unable to bundle test module: ${entryPath}`);
  }

  const directory = await mkdtemp(join(packageRoot, ".tmp-esbuild-module-"));
  const modulePath = join(directory, "module.mjs");
  await writeFile(modulePath, source, "utf8");

  try {
    return await import(pathToFileURL(modulePath).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
