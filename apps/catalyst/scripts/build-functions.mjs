#!/usr/bin/env node
/**
 * Bundles each deployable Catalyst Function (functions/<name>/index.ts, excluding the `shared/`
 * directory which is source-only, imported by the others) into a single self-contained CommonJS
 * index.js under dist/functions/<name>/, alongside its catalyst-config.json. Bundling everything
 * (including zcatalyst-sdk-node and express) into one file means the deployed function has zero
 * runtime dependency on an `npm install` step happening on Catalyst's side after upload — safest
 * default for a Direct Upload flow we can't interactively debug if it goes wrong.
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const functionsDir = join(root, "functions");
const outDir = join(root, "dist", "functions");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const functionNames = readdirSync(functionsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== "shared")
  .map((e) => e.name);

if (functionNames.length === 0) {
  console.error("No deployable functions found under functions/ (excluding shared/).");
  process.exit(1);
}

for (const name of functionNames) {
  const entry = join(functionsDir, name, "index.ts");
  const config = join(functionsDir, name, "catalyst-config.json");
  if (!existsSync(entry)) {
    console.log(`Skipping ${name}: no index.ts (not a deployable function).`);
    continue;
  }
  if (!existsSync(config)) {
    console.error(`Skipping ${name}: no catalyst-config.json — every deployable function needs one.`);
    continue;
  }

  const outFile = join(outDir, name, "index.js");
  await esbuild.build({
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    logLevel: "info",
  });
  copyFileSync(config, join(outDir, name, "catalyst-config.json"));
  console.log(`Built ${name} -> dist/functions/${name}/`);
}

console.log(`\nDone. ${functionNames.length} function(s) bundled to dist/functions/.`);
