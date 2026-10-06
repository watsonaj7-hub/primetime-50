import { execFileSync } from 'node:child_process';
import { writeFileSync, renameSync, rmSync } from 'node:fs';

// Preserve the checked-in contract if the local stack or generation fails.
const target = 'lib/db/database.types.ts';
const temporary = `${target}.${process.pid}.tmp`;
try {
  const types = execFileSync('pnpm', ['exec', 'supabase', 'gen', 'types', 'typescript', '--local'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024
  });
  if (!types.includes('export type Database')) throw new Error('Invalid generated contract.');
  writeFileSync(temporary, types);
  renameSync(temporary, target);
  console.log('Local database type contract updated. Run pnpm typecheck.');
} catch {
  rmSync(temporary, { force: true });
  console.error('Local type generation failed; the existing contract was preserved. Check the isolated Supabase stack.');
  process.exitCode = 1;
}
