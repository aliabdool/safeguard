# SafeGuard web client

React + TypeScript + Vite single-page app, built to static files and deployed to **Zoho Catalyst
Web Client Hosting** — a separate Console section from Functions (see the top-level packaging
README for exactly why these are two different upload flows and the order to deploy them in).

## What's here

- 21 screens: login, the 8 role-specific dashboards (Super Admin, Group H&S, Hotel GM, H&S
  Officer workbench, Department Manager, Nurse/Medical, Auditor, Board/Executive), Incident
  Register + Detail, CAPA Register + Detail, Document & Evidence Library, Controls & Frameworks,
  KPI Centre with "View calculation", Assurance Evidence Map, Data Quality Exceptions, Reports &
  Exports, and three admin screens.
- Role-aware navigation (`src/lib/nav.ts`) — a user only ever sees the dashboards and sections
  their `RoleCode`s grant, mirroring `docs/2026-07-zoho-catalyst-access-and-dashboard-model.md`.
- Medical sections are hidden behind an explicit check of `medicalPermissions` from `GET /me`
  (`api-auth`), never inferred from role — the client enforces nothing on its own; it reflects
  what the server already decided and would refuse regardless.
- Every dashboard's KPI cards, framework readiness strip, and drill-downs render "Not yet
  calculable" for a null value — the client never fabricates a number the backend didn't send.
- **Demo/offline mode**: if the backend can't be reached (no `apiBase` configured yet, or before
  you've deployed Package A), the app still renders — every screen shows a clearly-labelled
  orange banner ("Not connected... this is a structural preview only") and empty states instead
  of any invented figures. This is what lets you preview the UI shell before wiring it to a real
  Catalyst project, without ever risking a fabricated number being mistaken for real data.

## Local development

```bash
cd apps/catalyst/client
npm install
npm run dev        # http://localhost:5173, runs in demo/offline mode with no backend configured
npm run typecheck
npm run build       # outputs static files to dist/
```

## Post-deployment configuration

The client reads its backend URL and login URL at **runtime** from `public/config.json` (shipped
in the build as `/config.json`) — not baked in at build time — because Catalyst only assigns your
project's real Function URLs and Authentication login URL after you deploy. After deploying
Package A (Functions) and enabling Authentication in the Catalyst Console:

1. Find your deployed functions' base URL (Console → Functions → any function → the invoke URL;
   `apiBase` is that URL's origin plus path prefix, without the specific function name).
2. Find your project's Embedded Authentication login URL (Console → Authentication).
3. Edit `config.json` in the deployed web client (or rebuild with the values already in
   `public/config.json` before running `npm run build`) with both real values.
4. Reload the app — it will now call your real backend instead of showing the offline banner.

## Deploying (Package B)

```bash
npm run build
```
Zip the contents of `dist/` (not the `dist/` folder itself) and upload via Console → Web Client
Hosting → Deploy → Direct Upload. See the top-level packaging README for the full sequence
alongside Package A.
