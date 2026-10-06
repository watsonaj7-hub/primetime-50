# PrimeFit 50+

The Next.js application is in **`Primetime-50/`**. Repository-root TSX files are legacy copies and are not the runnable app.

```sh
cd Primetime-50
pnpm install --frozen-lockfile
pnpm dev
```

Account features require configured Supabase Auth/PostgreSQL and the versioned migrations. See [development setup](docs/development.md), [Phase 1 implementation and validation status](docs/phase-1-implementation.md), and [requirements](docs/requirements.md).

The existing UI is preserved. Workout, nutrition, progress and coaching panels still show labelled sample content. Phase 1 code adds auth, onboarding/profile/settings persistence, validation and ownership controls; the full database gate must pass before Phase 2.
