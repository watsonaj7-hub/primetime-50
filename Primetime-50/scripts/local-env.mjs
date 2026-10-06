import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
// Read CLI-supplied LOCAL configuration without displaying key values.
export function localConfig() {
  const config = JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }));
  const url = config.API_URL;
  if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Local development requires a loopback Supabase instance.');
  return config;
}
if (process.argv[1]?.endsWith('local-env.mjs')) {
  const config = localConfig();
  const url = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';
  const content = `NEXT_PUBLIC_SUPABASE_URL=${config.API_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${config.ANON_KEY}\nNEXT_PUBLIC_APP_URL=${url}\n`;
  if (existsSync('.env.local')) {
    const existing = readFileSync('.env.local', 'utf8');
    if (!existing.includes(`NEXT_PUBLIC_SUPABASE_URL=${config.API_URL}\n`)) throw new Error('Preserving existing .env.local; configure it yourself or move it before opting into local setup.');
    console.log('Existing local environment file preserved.');
  } else {
    writeFileSync('.env.local', content, { mode: 0o600 });
    console.log('Local Supabase URL and publishable key written to ignored .env.local; no values displayed.');
  }
}
