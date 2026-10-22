// SQL-only qualification, NOT a replacement for Supabase Auth/REST/browser integration.
// Starts a disposable PostgreSQL cluster with no TCP listener or host database access.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binary = name => process.env.POSTGRES_BIN ? join(process.env.POSTGRES_BIN, name) : name;
// Do not inherit PGHOST, PGSERVICE, PGPASSWORD, PGOPTIONS, etc. from a real project.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("PG")));
const run = (name, args, input) => execFileSync(binary(name), args, {
  cwd: app, env, input, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
});
const base = process.env.TMPDIR || join(homedir(), ".cache", "primefit-sql");
mkdirSync(base, { recursive: true, mode: 0o700 });
const root = mkdtempSync(join(base, "pf-sql-"));
const data = join(root, "data");
const socket = join(root, "s");
mkdirSync(socket, { mode: 0o700 });
const log = join(root, "postgres.log");
let started = false;
let passed = false;
try {
  if (Buffer.byteLength(join(socket, ".s.PGSQL.55462")) > 100) throw new Error("SQL fixture socket path is too long. Set TMPDIR to a shorter task-owned directory.");
  console.log(run("postgres", ["--version"]).trim());
  run("initdb", ["-D", data, "--username=primefit_fixture_owner", "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--locale=C", "--no-instructions"]);
  // Paths are literals in the generated configuration, not interpolated shell commands.
  const escapedSocket = socket.replaceAll("'", "''");
  writeFileSync(join(data, "postgresql.auto.conf"), `listen_addresses = ''\nunix_socket_directories = '${escapedSocket}'\nunix_socket_permissions = 0700\nport = 55462\n`, { mode: 0o600 });
  run("pg_ctl", ["-D", data, "-l", log, "-w", "start"]);
  started = true;
  const sql = text => run("psql", ["-X", "-h", socket, "-p", "55462", "-U", "primefit_fixture_owner", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "--no-psqlrc"], text);
  // Only the documented Supabase SQL interface is modelled. No Auth or REST service is emulated.
  sql(readFileSync(join(app, "tests/sql/bootstrap.sql"), "utf8"));
  const migrations = readdirSync(join(app, "supabase/migrations")).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  if (migrations.length === 0) throw new Error("No ordered migrations found.");
  for (const name of migrations) {
    const bytes = readFileSync(join(app, "supabase/migrations", name));
    sql(bytes);
    console.log(`APPLIED ${name} sha256=${createHash("sha256").update(bytes).digest("hex")}`);
  }
  const fixture = readFileSync(join(app, "tests/sql/foundation.sql"), "utf8");
  sql(fixture);
  // A fresh SQL connection reads the real committed profile/set values under A's restricted role.
  sql(`set role authenticated;
    do $$ begin perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false); end $$;
    select fixture.ok('fresh SQL connection reopens saved profile', (select display_name='SQL fixture A' and height_cm=175 from public.profiles));
    select fixture.ok('fresh SQL connection reopens distinct sets', (select count(*)=2 and sum(reps)=15 from public.exercise_set_logs));
    reset role;
    select fixture.ok('fixture has no TCP listener', current_setting('listen_addresses')='' and inet_server_addr() is null);
  `);
  const output = sql("select json_build_object('assertions', count(*), 'names', json_agg(name order by name)) from fixture.results;\n");
  const match = output.match(/\{[^\n]+\}/);
  if (!match) throw new Error("SQL assertion receipt missing.");
  const receipt = JSON.parse(match[0]);
  const expected = [...fixture.matchAll(/fixture\.(?:ok|denied)\('([^']+)'/g)].map(match => match[1]);
  if (receipt.assertions !== expected.length + 3 || expected.some(name => !receipt.names.includes(name))) throw new Error("SQL assertion inventory mismatch.");
  console.log(JSON.stringify(receipt));
  passed = true;
} catch (error) {
  if (error?.stdout) process.stderr.write(String(error.stdout));
  if (error?.stderr) process.stderr.write(String(error.stderr));
  if (existsSync(log)) process.stderr.write(readFileSync(log, "utf8"));
  console.error(`SQL qualification failed. Disposable fixture retained at ${root}`);
  throw error;
} finally {
  // pg_ctl can time out after starting a server. A PID file still requires task-owned shutdown.
  if (started || existsSync(join(data, "postmaster.pid"))) run("pg_ctl", ["-D", data, "-w", "-m", "fast", "stop"]);
  if (passed) rmSync(root, { recursive: true });
}
console.log("PASS: ordered migrations and complete named SQL assertion inventory; task cluster stopped and removed. Supabase Auth/REST/type generation/browser acceptance NOT RUN.");
