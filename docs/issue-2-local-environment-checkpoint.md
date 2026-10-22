# Issue #2: local environment checkpoint

Recorded 22/10/2026 (Australia/Melbourne). This is a partial qualification, not foundation acceptance or a deployment.

## Candidate and ownership

- Issue: https://github.com/watsonaj7-hub/primetime-50/issues/2
- Tested source: `fd79d84cb3c814c513796c6e226898d5a09829bc` (freshly fetched `origin/main`).
- Isolated worktree: `/home/mike/projects/primetime-50-issue-2`.
- Branch: `glaize/issue-2-local-environment`.
- App root relative to the repository: `Primetime-50/`.
- Glaize performed this local tooling/verification slice; Austin remains build lead. No application code, migrations, lockfile, instruction files or provider settings changed. The original checkout remains untouched.
- The agreed initial sequence is #2, then #3 and #4. Other backlog items are not picked up by this checkpoint.

## Reproducible commands and actual results

This host has Node `v22.23.1` and Corepack `0.34.6`. A global `pnpm` executable is not on PATH, but `corepack pnpm` selects the repository's pinned pnpm `11.19.0`. No global installation or policy relaxation was required.

From the isolated worktree:

```sh
cd Primetime-50
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:security
corepack pnpm exec supabase status
corepack pnpm db:types
corepack pnpm test:integration
```

Observed outcomes:

- Frozen install: exit 0; 467 packages added, and supply-chain verification passed for 555 lockfile entries. The historical cloud proxy failure did not reproduce here. The lockfile stayed unchanged.
- Installation printed a failed optional sharp source-build attempt (`node-addon-api` missing), despite overall exit 0. A subsequent load through Next.js's own dependency resolution succeeded with sharp `0.34.5`; the production build also passed. A top-level `require('sharp')` fails because it is not a direct application dependency. No image-optimisation request was tested, so that runtime path is not claimed qualified.
- Lint: exit 0.
- Typecheck: exit 0.
- Unit suite: exit 0, 42 tests across 3 files passed. This is characterisation of existing code, not RED/GREEN evidence for a code fix.
- Production build: exit 0; Next.js `15.5.20` generated all 21 static-page build entries.
- Built-browser-bundle security suite: exit 0; 1 test passed. This does not prove database isolation or authenticated response safety.
- Supabase status: failed with Docker API socket permission denied at `unix:///var/run/docker.sock`; the CLI reported no linked project. Docker server version/health could not be read. No privilege escalation, daemon/group changes or remote substitution was attempted.
- Database type generation: exit 1, preserving the tracked handwritten contract byte-for-byte. The contract SHA-256 remained `7464e4f76fee2800f20252035899f6f6f5c243e20890dc3ce5f670cf9ad9d711`; the lockfile SHA-256 was `5df3e4352ea2d6c12983084bcd07eda24a1749e6d0760932ad7dbac45f0f8270`. Git diff confirmed neither file changed.
- Integration suite: exit 1 at initialisation, with zero database tests executed because isolated Supabase is unavailable. This is BLOCKED, not a pass.
- Authenticated/browser suites were not run. No registration, migration, persisted profile, two-user RLS or SMTP delivery claim is made.

Local HTTP smoke, without browser automation:

```sh
corepack pnpm exec next start --hostname 127.0.0.1 --port 3312
```

Port 3312 was checked free first. HTTP requests to the task-owned server returned `/` = 200, `/api/profile` = 503 without local Supabase configuration, and `/settings` = 307 to `http://localhost:3312/login?next=%2Fsettings`. These observations are not authenticated workflow acceptance. The task-owned server was stopped after the probe; nothing was deployed or exposed as a public preview.

## Current blockers and preservation position

1. **Local stack access:** the current process cannot access Docker. An authorised, functioning isolated Docker/Supabase environment is needed before migrations, generated types and #3/#4's real auth/privacy checks can run. Do not use sudo, weaken socket permissions, change groups or substitute production to bypass this boundary.
2. **Existing data:** Austin previously reported a Vercel setup. A database binding, applied migration history, retained accounts and preservation requirements remain explicit unknowns. No hosted data, credentials or health records were inspected. Before any separately authorised production migration, Austin must establish these facts and an appropriate preservation/recovery approach. No production migration is proposed here.
3. **Publication/deployment safeguard:** GitHub status on the tested main commit shows two Vercel integrations (`Vercel – primetime-50-new` and `Vercel – primetime-50`) plus a completed `Vercel Preview Comments` check. No tracked `.github` or Vercel configuration was found. The absence of repository deployment files does not establish that branch/PR auto-deployments are disabled. Branch push and PR creation are therefore held until the relevant integration's preview behaviour is confirmed safe or a non-deploying publication route is authorised. No deployment settings were changed.

The old cloud machine's 32 GB disk limitation is historical, not the current observed blocker: this host reported 282 GB available. No local reset, destructive cleanup, image pull/start, migration, test-account creation, paid provider call, release, merge or email was performed.

## Next owner/action

Austin/Mike: provide an authorised isolated stack execution route and confirm a publication route that cannot trigger an unapproved Vercel deployment. Austin supplies non-secret existing-deployment/database/data-preservation facts. Glaize can then continue #2's database qualification before #3/#4 acceptance. These issues remain open; this checkpoint does not waive their original requirements.
