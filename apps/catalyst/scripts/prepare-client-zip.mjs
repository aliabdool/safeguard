#!/usr/bin/env node
/**
 * Builds the web client (Vite static build) and zips it as Package B — the Web Client Hosting
 * deployment artifact. Separate from prepare-direct-upload-zip.mjs (Package A, Functions) because
 * Catalyst Functions and Web Client Hosting are two different Console products with two different
 * upload flows — see the top-level packaging doc for why.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync, createWriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const clientDir = join(root, "client");
const clientDist = join(clientDir, "dist");
const zipPath = join(root, "dist", "safeguard-catalyst-client-direct-upload.zip");

async function main() {
  if (!existsSync(join(clientDir, "node_modules"))) {
    console.log("client/node_modules not found — running npm install first...");
    execSync("npm install", { cwd: clientDir, stdio: "inherit" });
  }

  console.log("Building the web client (tsc --noEmit && vite build)...");
  execSync("npm run build", { cwd: clientDir, stdio: "inherit" });

  if (!existsSync(clientDist)) {
    console.error("client/dist not found after build — aborting.");
    process.exit(1);
  }

  mkdirSync(dirname(zipPath), { recursive: true });
  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  const closed = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
  });
  archive.pipe(output);
  // Zip the CONTENTS of dist/ (not the dist/ folder itself) — Web Client Hosting expects
  // index.html at the zip root.
  archive.directory(clientDist, false);
  await archive.finalize();
  await closed;

  console.log(`\nWrote ${zipPath} (${(archive.pointer() / 1024).toFixed(0)} KB)`);
  console.log("Contains the built static site only — no node_modules, no .ts source, no secrets.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
