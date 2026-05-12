import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const LOADERS = new Map([
  [".ts", "ts"],
  [".tsx", "tsx"],
]);

export async function load(url, context, defaultLoad) {
  const loader = loaderForUrl(url);
  if (!loader) {
    return defaultLoad(url, context, defaultLoad);
  }

  const source = await readFile(fileURLToPath(url), "utf8");
  const result = await esbuild.transform(source, {
    format: "esm",
    jsx: "automatic",
    loader,
    sourcemap: "inline",
    target: "es2022",
  });

  return {
    format: "module",
    shortCircuit: true,
    source: result.code,
  };
}

function loaderForUrl(url) {
  for (const [extension, loader] of LOADERS.entries()) {
    if (url.endsWith(extension)) return loader;
  }

  return null;
}
