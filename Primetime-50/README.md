# PrimeFit 50+

Next.js App Router and TypeScript application for safer strength, mobility, recovery and nutrition for adults 50+.

Use pnpm 11.19.0 and Node 22+ (verified with 24.19.0). Run commands in this directory.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:security
pnpm dev
```

For auth/profile development, start the isolated Supabase stack with `pnpm db:start`, then `node scripts/local-env.mjs`. Full setup, migration safety, configuration, browser tests and current blockers are in [development.md](../docs/development.md).

Use **versioned migrations**, not `supabase/schema.sql` alone. The latter is a historical baseline. Do not apply migrations to production as part of development setup.

See [Phase 1 implementation status](../docs/phase-1-implementation.md). Workout/nutrition/progress/coach panels remain sample content; the complete product loop is not implemented yet.
