# Deployment notes

The Client Demonstration environment is deployed on **Vercel**, not Cloudflare Workers, despite
the approved stack specifying Cloudflare. See `docs/implementation-plan.md` ADR-0007 for the full
reasoning: Next.js 16's `proxy.ts` (renamed from `middleware.ts`) runs only on the Node.js
runtime, and `@opennextjs/cloudflare` (as of 1.20.1) doesn't yet support that — only the older
Edge-runtime middleware style. `wrangler.jsonc` and the `cf:build`/`cf:deploy:*` scripts are left
in place for when that gap closes.
