// Parent-only where native sockets are independently authorised. NEVER run through a denied route.
// Real migrations and synthetic SQL identities, NOT Supabase Auth/REST/PG15/browser acceptance.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { runReviewedOrderCases } from '../tests/sql/reviewed-orders.mjs';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.TMPDIR)throw new Error('Set an authorised task-owned scratch TMPDIR');
const binary=name=>process.env.POSTGRES_BIN?join(process.env.POSTGRES_BIN,name):name;
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')));
const run=(name,args,input)=>execFileSync(binary(name),args,{cwd:app,env,input,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
mkdirSync(process.env.TMPDIR,{recursive:true,mode:0o700});
const root=mkdtempSync(join(process.env.TMPDIR,'pf6review-')),data=join(root,'d'),socket=join(root,'s'),log=join(root,'postgres.log');
mkdirSync(socket,{mode:0o700});let started=false,passed=false,observer;
try {
  if(Buffer.byteLength(join(socket,'.s.PGSQL.55463'))>100)throw new Error('Task socket path too long');
  console.log(run('postgres',['--version']).trim());
  run('initdb',['-D',data,'--username=primefit_fixture_owner','--auth-local=trust','--auth-host=reject','--encoding=UTF8','--locale=C','--no-instructions']);
  writeFileSync(join(data,'postgresql.auto.conf'),`listen_addresses = ''\nunix_socket_directories = '${socket.replaceAll("'","''")}'\nunix_socket_permissions = 0700\nport = 55463\n`,{mode:0o600});
  run('pg_ctl',['-D',data,'-l',log,'-w','start']);started=true;
  const sql=text=>run('psql',['-X','-h',socket,'-p','55463','-U','primefit_fixture_owner','-d','postgres','-v','ON_ERROR_STOP=1','--no-psqlrc'],text);
  sql(readFileSync(join(app,'tests/sql/draft-bootstrap.sql'),'utf8'));
  const migrations=readdirSync(join(app,'supabase/migrations')).filter(n=>/^\d+_.+\.sql$/.test(n)).sort();
  if(migrations.length!==7)throw new Error('Expected exactly seven current candidate migrations');
  for(const name of migrations){const bytes=readFileSync(join(app,'supabase/migrations',name));sql('begin;\n'+bytes.toString('utf8')+'\ncommit;\n');console.log(`APPLIED ${name} sha256=${createHash('sha256').update(bytes).digest('hex')}`);}
  const fixture=readFileSync(join(app,'tests/sql/reviewed-catalogue.sql'),'utf8');sql(fixture);
  const connect=()=>postgres({host:socket,port:55463,username:'primefit_fixture_owner',database:'postgres',max:1,prepare:false,connect_timeout:5});
  observer=connect();const names=await runReviewedOrderCases(connect);
  const rows=await observer`select name from fixture.results order by name`;
  const expected=[...fixture.matchAll(/fixture\.(?:ok|denied)\('([^']+)'/g)].map(m=>m[1]);
  if(rows.length!==expected.length || expected.some(n=>!rows.some(r=>r.name===n)))throw new Error('Named SQL assertion inventory mismatch');
  const [isolation]=await observer`select current_setting('listen_addresses')='' and inet_server_addr() is null as isolated`;
  if(!isolation.isolated)throw new Error('Disposable cluster must not have a TCP listener');
  console.log(JSON.stringify({sequentialAssertions:rows.length,names:rows.map(r=>r.name),concurrentOrders:names,sqlOnly:true}));passed=true;
}catch(error){
  if(error?.stdout)process.stderr.write(String(error.stdout));if(error?.stderr)process.stderr.write(String(error.stderr));if(existsSync(log))process.stderr.write(readFileSync(log,'utf8'));
  console.error(`SQL fixture failed; retained at ${root}`);throw error;
}finally{
  if(observer)await observer.end({timeout:1});
  if(started||existsSync(join(data,'postmaster.pid')))run('pg_ctl',['-D',data,'-w','-m','fast','stop']);
  if(passed)rmSync(root,{recursive:true});
}
console.log('PASS SQL-only reviewed catalogue; owned task cluster stopped/removed. Configured Supabase/PG15/REST/browser NOT RUN.');
