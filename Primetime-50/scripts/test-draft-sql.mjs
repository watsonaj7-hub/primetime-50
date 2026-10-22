// Parent/operator execution only where native SQL sockets are authorised.
// SQL-only fixtures, NOT Supabase Auth/PostgREST/PG15/browser acceptance.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { runDraftOrderCases } from "../tests/sql/draft-orders.mjs";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.TMPDIR) throw new Error("Set TMPDIR to an authorised writable scratch directory.");
const binary = name => process.env.POSTGRES_BIN ? join(process.env.POSTGRES_BIN, name) : name;
// No host/service/password/role options from an existing database environment.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("PG")));
const run = (name, args, input) => execFileSync(binary(name), args, {
  cwd: app, env, input, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024
});
mkdirSync(process.env.TMPDIR, { recursive: true, mode: 0o700 });
const root = mkdtempSync(join(process.env.TMPDIR, "pf3sql-"));
const data = join(root, "data"), socket = join(root, "s"), log = join(root, "postgres.log");
mkdirSync(socket, { mode: 0o700 });
let started = false, passed = false, inspect;
try {
  if (Buffer.byteLength(join(socket, ".s.PGSQL.55462")) > 100) throw new Error("Task fixture socket path exceeds safe length.");
  console.log(run("postgres", ["--version"]).trim());
  run("initdb", ["-D", data, "--username=primefit_fixture_owner", "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--locale=C", "--no-instructions"]);
  writeFileSync(join(data, "postgresql.auto.conf"), `listen_addresses = ''\nunix_socket_directories = '${socket.replaceAll("'", "''")}'\nunix_socket_permissions = 0700\nport = 55462\n`, { mode: 0o600 });
  run("pg_ctl", ["-D", data, "-l", log, "-w", "start"]);
  started = true;
  const sql = text => run("psql", ["-X", "-h", socket, "-p", "55462", "-U", "primefit_fixture_owner", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "--no-psqlrc"], text);
  sql(readFileSync(join(app, "tests/sql/draft-bootstrap.sql"), "utf8"));
  for (const name of readdirSync(join(app, "supabase/migrations")).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
    const bytes = readFileSync(join(app, "supabase/migrations", name));
    sql(bytes);
    console.log(`APPLIED ${name} sha256=${createHash("sha256").update(bytes).digest("hex")}`);
  }
  // Model the service-role grants only in this disposable cluster. Production
  // policies/grants are NOT weakened and the test's service role bypasses RLS.
  sql("grant all on all tables in schema public to service_role; grant execute on all functions in schema public to service_role;");
  const fixture = readFileSync(join(app, "tests/sql/draft-boundary.sql"), "utf8");
  console.log(sql(fixture));
  const connect = () => postgres({ host: socket, port: 55462, username: "primefit_fixture_owner", database: "postgres", max: 1, prepare: false, connect_timeout: 5 });
  inspect = connect();
  const users = [3,4,5,6,7].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
  for (const id of users) await inspect`insert into auth.users(id) values(${id})`;
  const [row] = await inspect`select fixture.profile() as payload`;
  const orders = await runDraftOrderCases(connect, users, row.payload);
  console.log(JSON.stringify({ concurrency: orders }));
  const results = await inspect`select name from fixture.results order by name`;
  const expected = [...fixture.matchAll(/fixture\.(?:ok|denied)\('([^']+)'/g)].map(match => match[1]);
  if (results.length !== expected.length || expected.some(name => !results.some(row => row.name === name))) throw new Error("SQL assertion inventory mismatch.");
  const [transport] = await inspect`select current_setting('listen_addresses')='' and inet_server_addr() is null as isolated`;
  if (!transport.isolated) throw new Error("Task fixture must have no TCP listener.");
  console.log(JSON.stringify({ sequentialAssertions: results.length, names: results.map(row => row.name), concurrentOrders: orders.length, noTcp: true }));
  passed = true;
} catch (error) {
  if (error?.stdout) process.stderr.write(String(error.stdout));
  if (error?.stderr) process.stderr.write(String(error.stderr));
  if (existsSync(log)) process.stderr.write(readFileSync(log, "utf8"));
  console.error(`SQL fixture failed; evidence retained at ${root}`);
  throw error;
} finally {
  if (inspect) await inspect.end({ timeout: 1 });
  if (started || existsSync(join(data, "postmaster.pid"))) run("pg_ctl", ["-D", data, "-w", "-m", "fast", "stop"]);
  if (passed) rmSync(root, { recursive: true });
}
console.log("PASS: SQL-only draft boundary/order assertions; private cluster stopped and removed. Auth/PostgREST/PG15/browser NOT RUN.");
