// Real SQL-only concurrency fixtures. Never imported by the application; no connection until called.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
export async function runReviewedOrderCases(connect) {
  const first=connect(), second=connect(), observer=connect();
  const user='62000000-0000-4000-8000-000000000001';
  const names=[];
  const start=(db,version,id)=>db.unsafe('select public.start_workout_record($1::jsonb) as record',[{id,mode:'reviewed',timezone:'UTC',catalogue_version_id:version}]);
  const result=p=>p.then(value=>({ok:true,value}),error=>({ok:false,code:error.code}));
  async function actor(db,role='authenticated',isolation='read committed') {
    await db.unsafe('reset role');
    await db`select set_config('request.jwt.claim.sub',${user},false)`;
    await db.unsafe(`set role ${role}`); // role is a closed test-owned literal, not user input.
    await db.unsafe(`begin isolation level ${isolation}`);
    await db.unsafe("set local statement_timeout='10s'");
  }
  async function blocked(waiter,holder) {
    for(let n=0;n<200;n++) {
      const [row]=await observer`select ${holder}::int=any(pg_blocking_pids(${waiter}::int)) as blocked`;
      if(row.blocked)return; await delay(20);
    }
    throw new Error('Required blocking order was not observed');
  }
  async function version(id,label) { await observer`select fixture.add_version(${id}::uuid,${label})`; }
  async function noRecord(id) {const [row]=await observer`select count(*)::int as n from public.workout_logs where id=${id}`;assert.equal(row.n,0);}
  async function restoreProfile() { await observer`select set_config('request.jwt.claim.sub',${user},false)`;await observer.unsafe('select public.save_foundation_profile(fixture.profile())'); }
  try {
    const [a]=await first`select pg_backend_pid() as pid`,[b]=await second`select pg_backend_pid() as pid`;
    const v1='63000000-0000-4000-8000-000000000001',r1='63000000-0000-4000-8000-000000000011';
    await version(v1,'CONCURRENT_REVOKE_FIRST');
    await actor(first,'primefit_fixture_owner'); await first`update public.reviewed_workout_versions set status='revoked' where id=${v1}`;
    await actor(second); let pending=result(start(second,v1,r1)); await blocked(b.pid,a.pid);
    await first.unsafe('commit'); assert.deepEqual(await pending,{ok:false,code:'P5501'}); await second.unsafe('rollback');await noRecord(r1);
    names.push('revocation-first blocks admission then denies without a record');

    const v2='63000000-0000-4000-8000-000000000002',r2='63000000-0000-4000-8000-000000000012';
    await version(v2,'CONCURRENT_CONTEXT_FIRST');
    await actor(first); await first`delete from public.user_equipment where user_id=${user} and equipment_type='bodyweight'`;
    await actor(second);pending=result(start(second,v2,r2));await blocked(b.pid,a.pid);
    await first.unsafe('commit');assert.deepEqual(await pending,{ok:false,code:'P5501'});await second.unsafe('rollback');await noRecord(r2);await restoreProfile();
    names.push('equipment-first fence blocks admission then rejects stale compatibility');

    const v3='63000000-0000-4000-8000-000000000003',r3='63000000-0000-4000-8000-000000000013';
    await version(v3,'CONCURRENT_START_FIRST');
    await actor(first);const [created]=await start(first,v3,r3);assert.equal(created.record.prescription_snapshot.content_version,'CONCURRENT_START_FIRST');
    await actor(second,'primefit_fixture_owner');pending=result(second`update public.reviewed_workout_versions set status='revoked' where id=${v3}`);await blocked(b.pid,a.pid);
    await first.unsafe('commit');assert.equal((await pending).ok,true);await second.unsafe('commit');
    const [stored]=await observer`select prescription_snapshot from public.workout_logs where id=${r3}`;assert.deepEqual(stored.prescription_snapshot,created.record.prescription_snapshot);
    await actor(first);assert.deepEqual(await result(start(first,v3,r3)),{ok:false,code:'P5501'});await first.unsafe('rollback');
    names.push('start-first commits one immutable snapshot before revocation and replay is denied');

    const v4='63000000-0000-4000-8000-000000000004',r4='63000000-0000-4000-8000-000000000014';
    await version(v4,'STALE_CONTEXT_SNAPSHOT');
    await actor(second,'authenticated','repeatable read');await second`select reviewed_context_revision from public.profiles where user_id=${user}`;
    await actor(first);await first`update public.health_profiles set status='not_reviewed' where user_id=${user}`;await first.unsafe('commit');
    assert.deepEqual(await result(start(second,v4,r4)),{ok:false,code:'40001'});await second.unsafe('rollback');await noRecord(r4);await restoreProfile();
    names.push('stale repeatable-read context cannot bypass the updated profile fence');

    const v5='63000000-0000-4000-8000-000000000005',r5='63000000-0000-4000-8000-000000000015';
    await version(v5,'STALE_CATALOGUE_SNAPSHOT');
    await actor(second,'primefit_fixture_owner','repeatable read');await second`select status from public.reviewed_workout_versions where id=${v5}`;await second.unsafe('set role authenticated');
    await actor(first,'primefit_fixture_owner');await first`update public.reviewed_workout_versions set status='revoked' where id=${v5}`;await first.unsafe('commit');
    assert.deepEqual(await result(start(second,v5,r5)),{ok:false,code:'40001'});await second.unsafe('rollback');await noRecord(r5);
    names.push('stale repeatable-read catalogue cannot admit a revoked version');

    const v6='63000000-0000-4000-8000-000000000006',r6='63000000-0000-4000-8000-000000000016';
    await version(v6,'CONCURRENT_START_REPLAY');
    await actor(first);const [one]=await start(first,v6,r6);
    await actor(second);pending=result(start(second,v6,r6));await blocked(b.pid,a.pid);await first.unsafe('commit');
    const replay=await pending;assert.equal(replay.ok,true);assert.deepEqual(replay.value[0].record,one.record);await second.unsafe('commit');
    const [sets]=await observer`select count(*)::int as n from public.exercise_set_logs where workout_log_id=${r6}`;assert.equal(sets.n,2);
    names.push('concurrent same-ID starts return one row and one prescribed set collection');

    await actor(first); await first.unsafe('select public.save_workout_record($1::jsonb)',[{id:r6,expected_revision:0,sets:(await first`select fixture.sets(${r6}::uuid) as sets`)[0].sets}]);await first.unsafe('commit');
    await actor(first);const [completed]=await first.unsafe('select public.complete_workout_record($1::jsonb) as record',[{id:r6,expected_revision:1}]);
    await actor(second);pending=result(second.unsafe('select public.complete_workout_record($1::jsonb) as record',[{id:r6,expected_revision:1}]));await blocked(b.pid,a.pid);await first.unsafe('commit');
    const done=await pending;assert.equal(done.ok,true);assert.deepEqual(done.value[0].record,completed.record);assert.ok(completed.record.completed_at);await second.unsafe('commit');
    names.push('concurrent reviewed completion retains one timestamp and stored result');
    return names;
  } finally {
    await Promise.allSettled([first.unsafe('rollback'),second.unsafe('rollback')]);
    await Promise.all([first.end({timeout:1}),second.end({timeout:1}),observer.end({timeout:1})]);
  }
}
