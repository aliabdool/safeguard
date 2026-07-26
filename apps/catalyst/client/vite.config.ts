import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static build only — Catalyst Web Client Hosting serves the dist/ output as plain files.
// No SSR, no Node server at runtime, per Catalyst's Web Client Hosting model (see the top-level
// packaging README for the Direct Upload mechanics).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
