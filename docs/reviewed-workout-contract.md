# Trusted reviewed-workout backend contract v1

This is neutral software for #5/#6, not a reviewed exercise programme, medical clearance or approval of the example fixtures. Production starts with **zero catalogue rows**. There are no seeds, credentials, provider calls, admin UI or content-curation tools in this change. No actual content/rules/reviewer sign-off has been supplied. Until independently reviewed data is separately authorised and loaded, reviewed availability remains empty/unavailable. Personal recording remains separate and explicitly unprescribed.

## Storage authority and the API

`reviewed_workout_versions` is a protected versioned catalogue. Ordinary authenticated users, including a stored app administrator, have no table read/write privileges or policy. Apply migrations transactionally so function creation and privilege revocation become visible together; the parent SQL harness does so. All helpers, trigger functions and the old internal personal-start helper deny ordinary RPC execution. Only the authenticated availability/start/save/complete RPCs are public; they derive identity from `auth.uid()`, never caller profile, owner, approval, eligibility or snapshot data. A version's UUID and `(content_id, content_version)` identify its immutable definition. Only status may change; revocation is irreversible and versions cannot be deleted. Changes to prescription, eligible contexts, source, reviewer, approval or rule version require a new version row. Pending unsigned/malformed definitions are not usable; an approved row must satisfy strict shape, known values and compatibility constraints.

- `GET /api/workouts?view=reviewed-availability`: verified user, no client eligibility input. Returns `{availability:{state,workouts}}`, with `state` one of `available`, `unavailable`, `unsupported`, `referral_required`. Results order by opaque content/version strings then UUID, not a guessed notion of semantic-version recency. No automatic selection/substitution: caller chooses one returned version UUID.
- `POST /api/workouts`: personal payload unchanged. Reviewed payload is `{id, mode:"reviewed", timezone, catalogue_version_id}`. Auth-before-body and strict validation remain. SQL atomically rechecks current approval and persisted context, copies the exact snapshot and precreates every prescribed set with stable server UUIDs and null draft values. Repeating the same authorised ID returns the original row/set collection. A different version/timezone/mode for that ID conflicts; a foreign ID is inaccessible. Reviewed requests without a version retain the historical controlled unavailable response.
- `GET /api/workouts?id=...` (or the existing bounded recent read) now includes both personal and reviewed owned rows, immutable snapshot and version reference. RLS still isolates sets and parents. Legacy NULL-mode rows are not promoted to reviewed history.
- Existing `PUT /api/workouts` and completion route now handle both managed modes. Reviewed saves use only original precreated set IDs, exercise keys, labels and slots; new slots/renames are rejected. Recorded values may differ from guidance: they record facts, not progression advice. Sparse atomic saves, numeric validation, revision conflicts and separate completion remain. Completion needs every original set present and every recorded reps/kg/RPE field filled. No duration-logging UI/API is added: a duration prescription can be preserved/displayed, but completion still follows the existing factual reps/kg/RPE contract (zero reps is a valid observed value, not a duration conversion).

All successful reads/mutations are no-store. Controlled SQL `P5501` means current reviewed unavailability; `P5502` means start identity conflict, both mapped to HTTP 409 without internal data. Existing 40001 conflicts remain historical behaviour. The installed Supabase adapter was inspected and locally tested with a synthetic fetch: admission RPC uses POST and is not automatically retried, even for synthetic HTTP 503/40001. No real PostgREST HTTP mapping or database acceptance is implied.

## Explicit, deliberately narrow eligibility contract

Contract v1 uses **exact JSONB equality** against complete, trusted owner-reviewed contexts, not JSONB containment (which would incorrectly accept equipment/restriction subsets), inferred clearance, a clinical scoring engine, demographic thresholds, wildcards or generated rules. Its narrowness is intentional: unmatched combinations return unavailable. Supporting a broader matching language later requires separate reviewed software and domain approval; no routine authoring permission is inferred.

Each eligible context has exactly these 16 fields from the authenticated persisted profile, health and equipment rows:

```text
date_of_birth, sex, unit_system, height_cm, weight_kg, waist_cm,
fitness_level, primary_goal, secondary_goal, training_days_per_week,
preferred_session_minutes, training_location, health_status,
health_restrictions, health_notes, equipment
```

Identity, display name, role and volatile update timestamps are excluded. Optional waist/secondary goal may be explicit JSON null, never missing. Required fields must have the existing profile contract's types/known values; arrays must contain known distinct values in sorted order. Onboarding must be complete, and health/equipment rows must exist. Empty/missing equipment, not-reviewed screening, malformed fields and unresolved free-text health notes are unsupported. Persisted `medical_clearance` produces referral-required and no recommendation. Other recorded limitations can match only an explicit trusted context, and exercise exclusion codes must not intersect them. Empty notes/self-report alone never produce eligibility: there must also be a trusted approved exact-context version. This is software policy admission, not clinical clearance. The existing profile bounds are reused as recording validation, not new training thresholds.

The exact matrix binds goals, birth date, equipment, availability and limitations to the approved version. An equipment superset also changes the context and requires explicit support; this avoids unreviewed inference in either direction. A later health/profile/equipment edit invalidates a previously offered selection unless its *new* complete context is explicitly supported. A menu result is not an admission token.

## Exact immutable prescription and provenance

A definition has these eight required prescription keys, no unknown keys:

```text
title, session_minutes, screening_rules, referral_rules, stop_rules,
progression_rules, measurement, exercises
```

All rule/measurement/title fields are nonempty strings (up to 2000 characters). `session_minutes` is a whole 1–120 recording-format value and cannot exceed the persisted preferred session minutes in any supported context. `exercises` is an ordered array with distinct canonical UUID exercise keys and at most 100 total prescribed sets. Every exercise has exactly:

```text
exercise_key, exercise_name, equipment, exclusions, sets, reps,
duration_seconds, load_guidance, rpe_guidance, rest_seconds, cues, stop_rules
```

Sets are whole 1–20. Names are trimmed nonempty strings of at most 200 UTF-8 bytes, compatible with the existing service label limit. Exactly one of `reps` (nonempty string) or `duration_seconds` (positive integer) is set; the other is explicit null. Rest is a nonnegative integer; duration/rest fit PostgreSQL integer storage. Equipment must be present in every exact context; exclusions must use recognised limitation codes and conflict with none. Guidance/cues/stop fields must be present and nonempty. These structural bounds do not certify content safety: qualified approval of every actual value and rule is still required.

The session freezes `catalogue_version_id`, content ID/version, source URI, reviewer name/role, approval timestamp and `approval_status_at_start`, rule version, contract version 1, weight unit kg, **the whole exact ordered prescription**, and the selected own context. No client creates this object. A log FK prevents version removal; SQL guard/constraints reject forged snapshots and version-reference changes even at the trusted insert/update seam. Existing log snapshot/timezone/start immutability remains. Approval metadata is a trusted operator assertion, not a software verification of a professional qualification.

New versions or revocation cannot rewrite old snapshots. **New starts and start replays require current approval and current eligibility, including completed-ID replays.** Revoked/changed-context replays return unavailable. History reads remain available to the owner. Existing recording save/complete/replay remains available after revocation so actual records are not erased or made impossible to finish; that grants no new prescription or reapproval. Consumers under #7/#8 must present retained snapshots as historical, not current recommendations.

## Locking and trust boundaries

Admission and availability acquire the existing foundation transaction advisory gate `(1735289203,3)` before locking/re-reading profile context or catalogue. The additive migration extends that BEFORE-statement gate to direct health/equipment and catalogue writes. Health/equipment changes also touch the profile through a private trigger; profile updates monotonically advance a protected `reviewed_context_revision`. Thus a repeatable-read snapshot cannot reuse old health/equipment: `SELECT ... FOR UPDATE` on the changed profile tuple must abort with 40001. Catalogue rows are locked before approval is checked, likewise forcing stale-snapshot revocation aborts. All helpers have empty search paths and no ordinary EXECUTE grant. Catalogue writers must use normal gated SQL; an adversarial database owner able to disable triggers/rewrite functions is outside the application-role threat model.

The global gate deliberately serialises admission/context/catalogue writes across accounts. This follows the delivered foundation's conservative lock ordering; it trades throughput for a small auditable contract. Ordinary save/complete still lock their owned log and never reacquire the context gate, so they do not invert reviewed-start order. This should be performance-reviewed before scaling; no environment tuning is part of this slice. Historical snapshot reads do not call the resolver or revalidate current catalogue approval.

## Qualification and remaining owners

Unit tests use real handlers/services with mocked auth/Supabase, plus a real installed adapter with a synthetic fetch. They are not SQL/RLS/session acceptance. The focused suite has a genuine missing-feature RED, GREEN, bounded old-blanket-rejection sabotage failure and byte-restored GREEN. SQL-only fixtures are authored in `tests/sql/reviewed-catalogue.sql` and `reviewed-orders.mjs`; parent entrypoint is `scripts/test-reviewed-sql.mjs`. They apply all seven actual migrations, use explicitly synthetic identities/content/approval, assert strict role/JSON/ownership/numeric/state boundaries, and observe real blocking orders including stale snapshots. Worker SQL execution is **NOT RUN**, without retrying the known sandbox socket refusal. `tests/integration/reviewed-workouts.test.ts` covers real local Auth/REST and route/service lifecycle with only the framework identity binding substituted; it too is NOT RUN here.

Austin #16 then #17 retain configured PG15/Supabase/Auth/REST/cookie/session/type-generation/connected execution, NOT PASS. The parent may separately run native PG18.1 SQL-only fixtures where permitted, but that is not those configured acceptance gates. #5 still needs actual content, exact domain eligibility/screening/referral/stop/progression/measurement and qualified sign-off; this software does not settle those decisions. #7 owns visual integration/display/input feedback, #8 history presentation, #9 connected assurance. New source requires Glaize's controller qualification, independent exact-candidate review and delivery. No whole #5/#6 closure, deployment or pilot-readiness claim follows from authored code or local tests.
