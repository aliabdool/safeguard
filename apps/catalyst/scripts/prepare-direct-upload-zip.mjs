#!/usr/bin/env node
/**
 * Assembles the Package A (Functions) Direct Upload ZIP — no node_modules, no test files, no
 * .git, no local cache, no secrets. Run `npm run build:functions` first (this script does it for
 * you if dist/functions/ doesn't exist yet). Package B (the web client) is built separately by
 * scripts/prepare-client-zip.mjs — see docs/2026-07-zoho-catalyst-final-package-instructions.md
 * for why Functions and Web Client Hosting are two different Catalyst products with two different
 * upload flows, and the exact order to deploy both.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync, createWriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distFunctions = join(root, "dist", "functions");
const stagingDir = join(root, "dist", "direct-upload-staging");
const zipPath = join(root, "dist", "safeguard-catalyst-functions-direct-upload.zip");

const FUNCTION_NAMES = [
  "api-auth",
  "api-dashboard-summary",
  "api-incidents",
  "api-capa",
  "api-documents",
  "api-controls",
  "api-kpi",
  "api-assurance-map",
  "api-data-quality",
  "api-reports",
  "api-notifications",
];

const README_TEXT = `# SafeGuard on Zoho Catalyst — Package A (Functions), management test build

**This is a management test build. It is NOT a production-ready build and NOT a production
candidate.** Every module below is real and tested (202 tests passing, see the repo), but your own
Zoho project needs the Data Store tables created and content (control library, KPI catalogue)
authored before the system reflects your actual operations — see the full instructions in
\`docs/2026-07-zoho-catalyst-final-package-instructions.md\` in the repository.

This is **Package A of two** — the backend Functions. **Package B is the web client**
(\`safeguard-catalyst-client-direct-upload.zip\`, built via \`npm run package:client\`), deployed
separately through Catalyst's Web Client Hosting, a different Console section from Functions —
there is no single upload that installs both. Deploy Data Store → Authentication → Package A →
Package B, in that order; see the final-package-instructions doc for exact steps and required
post-upload configuration (the client's \`config.json\`).

## What's in this zip

Eleven bundled Functions (\`index.js\` + \`catalyst-config.json\` each, no source \`.ts\`, no
\`node_modules\`):

${FUNCTION_NAMES.map((n) => `- \`functions/${n}/\``).join("\n")}

Covering: authentication/\`GET /me\` for the client, the batch dashboard endpoint, incidents +
medical-note isolation, CAPA (owner ≠ verifier, enforced and re-checked at verification),
documents/evidence (expired evidence never silently valid), controls/critical-gap override, the
22-KPI engine, the assurance evidence map, the nine data-quality exception checks, board narrative
+ assurance pack + six raw exports (all audit-logged), and the fourteen notification triggers
(scaffolded — see README.md in the repo for what "scaffolded" means here).

Also included: \`data-store-schema/\` (all 12 schema files, in the shape you'll enter into Data
Store manually or via schema push) and \`catalyst.json.TEMPLATE\` (not a real manifest — run
\`catalyst init\` against your actual project to generate the real one).

## What's deliberately NOT in this zip

Source \`.ts\` files, \`node_modules\`, test files, \`.git\`, any \`.env\`/secrets, build caches. Every
function's \`index.js\` is a single bundled file (esbuild, CommonJS, Node 18 target) — zero
dependency on an \`npm install\` step happening after upload.

## How to upload in Zoho Catalyst (Direct Upload)

1. Log in to the [Catalyst Console](https://console.catalyst.zoho.com) and open your project.
2. **Data Store first** — create every table in \`data-store-schema/\`, files \`01\` through \`12\` in
   order, matching column names/types/scopes exactly. Nothing below will work without this.
3. **Authentication** — enable Embedded Authentication with custom role assignment. Create the
   test users named in the final-package-instructions doc's checklist (medical-permission grant
   vs. none, CAPA owner vs. verifier, etc.).
4. **Functions** — for each of the eleven functions above: Console → Functions → Create Function
   → Advanced I/O, Node.js stack → upload that function's folder (or its \`index.js\` +
   \`catalyst-config.json\`).
5. Deploy Package B (the web client) next — see its own README, or the final-package-instructions
   doc for the combined sequence.

## Required Catalyst services

Data Store, Authentication (Embedded, custom role/permission assignment), Functions (Advanced I/O,
Node.js 18). Web Client Hosting for Package B. Notifications' outbound delivery needs a mail/SMS
provider once you choose one — not required for this test build.

## Repository-based deployment (kept ready for production)

This same \`apps/catalyst/\` directory (functions and client both) lives in the \`safeguard\` GitHub
repository. Once \`catalyst init\` links a real Catalyst project, GitHub Integration (Console →
DevOps) can point at this repo/path so future pushes deploy automatically — the intended path for
controlled production releases once management signs off on moving past Direct Upload testing.
`;

async function main() {
  if (!existsSync(distFunctions)) {
    console.log("dist/functions/ not found — building first...");
    execSync("node scripts/build-functions.mjs", { cwd: root, stdio: "inherit" });
  }

  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  cpSync(distFunctions, join(stagingDir, "functions"), { recursive: true });
  cpSync(join(root, "data-store-schema"), join(stagingDir, "data-store-schema"), { recursive: true });

  writeFileSync(
    join(stagingDir, "catalyst.json.TEMPLATE"),
    JSON.stringify(
      {
        _comment:
          "TEMPLATE — not a real Catalyst project manifest. Run `catalyst init` in this " +
          "directory against your actual Zoho Catalyst project first; that command generates " +
          "the real catalyst.json with your project's actual IDs.",
        source: { functions: "./functions", client: "./client" },
        targets: { functions: FUNCTION_NAMES },
        ignore: { functions: ["*.test.ts", "*.ts", "node_modules"] },
      },
      null,
      2,
    ),
  );

  writeFileSync(join(stagingDir, "README.md"), README_TEXT);

  mkdirSync(dirname(zipPath), { recursive: true });
  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  const closed = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
  });
  archive.pipe(output);
  archive.directory(stagingDir, false);
  await archive.finalize();
  await closed;

  console.log(`\nWrote ${zipPath} (${(archive.pointer() / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
