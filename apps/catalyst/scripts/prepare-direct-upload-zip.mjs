#!/usr/bin/env node
/**
 * Assembles a clean Zoho Catalyst deployment package and zips it — no node_modules, no test
 * files, no .git, no local cache, no secrets. Run `npm run build:functions` first (this script
 * does it for you if dist/functions/ doesn't exist yet).
 *
 * What ends up in the zip is deliberately scoped to what's actually deployable right now (the
 * Phase 5 backend Functions + the Data Store schema they depend on) — there is no web client yet
 * (that's Phase 14), so this is a Functions-layer preview package, not a clickable app. See the
 * generated README inside the zip for exactly what that means for testing.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync, createWriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distFunctions = join(root, "dist", "functions");
const stagingDir = join(root, "dist", "direct-upload-staging");
const zipPath = join(root, "dist", "safeguard-catalyst-phase5-direct-upload.zip");

const README_TEXT = `# SafeGuard on Zoho Catalyst — Phase 5 Direct Upload preview package

**This is a preview/testing package for management validation. It is NOT a production deployment
artifact and NOT a complete application.** No web client exists yet (that's Phase 14) — this
package lets you deploy and test the Phase 5 backend Functions directly (incident creation,
investigation start, statutory OSH-reportability determination, and the fully permission-gated
medical-notes module), via the Catalyst Console's function testing tools or a REST client
(Postman/curl), not by clicking through screens.

## What's in this zip

- \`functions/api-dashboard-summary/\` — the batch dashboard summary endpoint (bundled \`index.js\`
  + \`catalyst-config.json\`). Needs the identity/access, master-data, and KPI-snapshot tables to
  return real data; will run but return mostly empty sections without them.
- \`functions/api-incidents/\` — incident creation, investigation start, OSH-reportability
  determination, and the medical-notes module (view/add/export, each requiring its own explicit
  permission and each audit-logged whether granted or denied).
- \`data-store-schema/\` — the table definitions these Functions depend on (JSON, in the shape
  you'll enter into Data Store manually or via schema push — see "How to upload" below).
- \`catalyst.json.TEMPLATE\` — **not a real project manifest.** Documents the expected shape;
  replace it with the real \`catalyst.json\` that \`catalyst init\` generates against your actual
  Zoho Catalyst project.

## What's deliberately NOT in this zip

Source \`.ts\` files, \`node_modules\`, test files, \`.git\`, any \`.env\`/secrets, build caches. Every
function's \`index.js\` is a single bundled file (esbuild, CommonJS, Node 18 target) — it has zero
dependency on an \`npm install\` step happening after upload.

## How to upload in Zoho Catalyst (Direct Upload)

1. Log in to the [Catalyst Console](https://console.catalyst.zoho.com) and open your project (or
   create one first if this is the very first deployment).
2. **Data Store first** — go to **Data Store**, create each table listed in \`data-store-schema/\`
   (start with \`01-identity-and-access.json\` and \`02-master-data.json\`, then
   \`03-incidents.json\`) with matching column names/types/scopes. This has to happen before the
   Functions will do anything meaningful.
3. **Authentication** — enable Embedded Authentication with custom role assignment (Catalyst
   Console → Authentication). Create at least two test users: one with no medical permission
   grant (to prove denial), one with an explicit \`view_medical_notes\` \`UserPermissions\` row (to
   prove access).
4. **Functions** — go to **Functions** → **Create Function** (or the upload option for an
   existing function) → choose **Advanced I/O**, Node.js stack, and upload the corresponding
   \`functions/<name>/\` folder from this zip (or its \`index.js\` + \`catalyst-config.json\` per
   Catalyst's upload flow for that function type).
5. Repeat for both \`api-dashboard-summary\` and \`api-incidents\`.

## Required Catalyst services

- **Data Store** (tables above)
- **Authentication** (Embedded, with custom role/permission assignment)
- **Functions** (Advanced I/O, Node.js 18)

No external environment variables are required for this phase — everything reads from Data Store
and Catalyst's own Authentication context. (Later phases — notifications, in particular — will
need mail/SMS provider configuration; not needed yet.)

## Testing what's here

Since there's no client yet, "testing" at this stage means confirming the Functions behave
correctly when called directly:

- \`POST /incidents\` — create an incident (test user needs a \`UserPropertyAccess\` row for the
  target property first).
- \`POST /incidents/:id/investigation\` — start an investigation.
- \`GET /incidents/:id/medical\` — **as the user with no medical permission, expect 403.** As the
  user with an explicit \`view_medical_notes\` grant, expect the note list (empty until one is
  added).
- \`POST /incidents/:id/medical\` — requires \`edit_medical_notes\`, not \`view_medical_notes\` —
  confirms the three medical permissions are genuinely independent.
- Check the \`AuditTrail\` table after each medical-notes call — every attempt, granted or denied,
  should have written a row.

## Repository-based deployment (kept ready for later)

This same \`apps/catalyst/\` directory lives in the \`safeguard\` GitHub repository. Once
\`catalyst init\` links a real Catalyst project here, Catalyst's own GitHub Integration
(Console → DevOps → GitHub Integration) can be pointed at this repo/path so future pushes deploy
automatically — that's the intended path for controlled production releases once management signs
off on moving past Direct Upload testing. Nothing about this package blocks that; it's the same
source, just packaged differently for the two different deployment mechanisms.
`;

async function main() {
  if (!existsSync(distFunctions)) {
    console.log("dist/functions/ not found — building first...");
    execSync("node scripts/build-functions.mjs", { cwd: root, stdio: "inherit" });
  }

  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  // 1. Functions — bundled JS + catalyst-config.json only, no source .ts, no node_modules.
  cpSync(distFunctions, join(stagingDir, "functions"), { recursive: true });

  // 2. Data Store schema reference — not something Catalyst "deploys," but the tester needs it
  // to create the required tables before the functions will do anything useful.
  cpSync(join(root, "data-store-schema"), join(stagingDir, "data-store-schema"), {
    recursive: true,
  });

  // 3. catalyst.json — TEMPLATE ONLY. Catalyst assigns real project/environment IDs when you run
  // `catalyst init` against your actual Zoho org; nothing here can predict those.
  writeFileSync(
    join(stagingDir, "catalyst.json.TEMPLATE"),
    JSON.stringify(
      {
        _comment:
          "TEMPLATE — not a real Catalyst project manifest. Run `catalyst init` in this " +
          "directory against your actual Zoho Catalyst project first; that command generates " +
          "the real catalyst.json with your project's actual IDs. This file just documents the " +
          "expected shape so you know what to check after init.",
        source: { functions: "./functions", client: "./client" },
        targets: { functions: ["api-dashboard-summary", "api-incidents"] },
        ignore: { functions: ["*.test.ts", "*.ts", "node_modules"] },
      },
      null,
      2,
    ),
  );

  // 4. The ZIP's own README.
  writeFileSync(join(stagingDir, "README.md"), README_TEXT);

  // Zip the staging directory's CONTENTS (not the folder itself) so the zip root is clean.
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
