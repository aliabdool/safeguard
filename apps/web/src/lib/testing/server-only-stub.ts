// Vitest alias target for the real "server-only" package (see vitest.config.ts) — the real
// package throws unconditionally unless the bundler declares the "react-server" export
// condition, which Vitest's plain Node environment doesn't. Aliasing it to this no-op lets
// server-only calculation/query-building modules (server/kpi/**, server/dashboard/**,
// server/reporting/**) be imported directly in tests instead of duplicating their logic behind a
// hand-maintained "pure" split, the same tradeoff server/permissions/pure.ts made for this exact
// reason.
export {};
