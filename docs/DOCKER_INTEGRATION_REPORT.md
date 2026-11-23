# CIMS Docker Integration Report

**Execution date:** 2026-11-22  
**Scope:** Docker configuration, native database migrations and seeds, genuine HTTP integration, persistence, and application smoke verification.  
**Final result:** **Passed. No final check failed.** CIMS is ready for a controlled college demonstration, but this report does not claim production readiness.

## Evidence Labels

| Label | Meaning |
|---|---|
| **Passed** | The stated check completed with its expected result. |
| **Failed** | The stated check completed with an unexpected result. There were no failed final checks. |
| **Not performed** | The check was outside this live run and must not be inferred from other evidence. |
| **Mock/test-double** | The check primarily used SQLite, `mongomock`, or another test substitute. |
| **Real Docker** | The check used the running Docker PostgreSQL and MongoDB services without dependency overrides or database mocks. |

## Docker Status

**Passed - Real Docker**

- Docker Engine `29.9.3` ran through Linux Docker Desktop under WSL2.
- Docker Compose `v5.7.0` was available.
- `docker compose config --quiet` passed.
- The `compose.yaml` host mappings were safely changed to loopback-only: PostgreSQL on `127.0.0.1:5432` and MongoDB on `127.0.0.1:27017`.
- The previously absent `.env` was created from the template. A cryptographically generated application secret was written without being printed, configuration validation passed, and `git check-ignore -v .env` confirmed that the file is ignored. No secret value is recorded here.
- Application defaults and the template now use `127.0.0.1` instead of `localhost`. This resolved an Alembic connection hang caused by a localhost/IPv6 attempt while Compose was bound to IPv4.

## Container Health

**Passed - Real Docker**

| Service | Image | Server observed | Final state |
|---|---|---|---|
| PostgreSQL | `postgres:16` | `16.16` | Healthy and running |
| MongoDB | `mongo:8.0` | `8.0.38` | Healthy and running |

- Named volume `cims-demo_cims_postgres_data` is mounted for PostgreSQL.
- Named volume `cims-demo_cims_mongodb_data` is mounted for MongoDB.
- No volume was deleted during validation.
- Both containers were restarted, not recreated. They remain running at the end of this report.
- FastAPI and Streamlit application processes were stopped after verification.

## Migration Status

**Passed - Real Docker**

- The existing `scripts/init_db.py` workflow was used; no replacement migration workflow was introduced.
- Revisions `20261122_0001` and `20261122_0002` were applied to real PostgreSQL.
- The live schema contains 12 application tables, with `alembic_version` retained separately as migration bookkeeping.
- Live PostgreSQL `alembic check` reported: no new upgrade operations.

## Seed Verification

**Passed - Real Docker**

The existing relational and MongoDB seed scripts were used.

| Relational entity after initial seed | Count |
|---|---:|
| Users | 5 |
| Analyst profiles | 2 |
| Incidents | 8 |
| Assets | 5 |
| Actions | 6 |
| Audit logs | 43 |
| Incident types | 5 |
| Severity rows | 4 |
| Incident-asset links | 7 |
| Assignments | 8 |
| Threat actors | 3 |
| Incident-threat links | 3 |

- A second relational seed run skipped idempotently.
- The initial audit chain was valid across all 43 records.
- All relational orphan checks returned zero.
- An intentional invalid foreign-key insert was rejected by PostgreSQL as expected.
- MongoDB received 5 security-log documents and the intended indexes.
- A second MongoDB seed run skipped idempotently.
- MongoDB had six indexes including `_id`.
- Every MongoDB `incident_id` matched an incident in PostgreSQL.

## Backend Pytest

**Passed - Mock/test-double**

- The full existing pytest suite was rerun after the final configuration change: **60 passed, 0 failed**.
- One third-party Starlette/httpx deprecation warning was emitted.
- These tests are primarily SQLite, `mongomock`, and test-double tests. They are regression evidence, not live-Docker integration evidence.

## Real-Docker HTTP Integration

**Passed - Real Docker**

A separate genuine HTTP workflow ran through Uvicorn against Docker PostgreSQL and MongoDB. It used no dependency overrides or database mocks.

### Health And Authentication

- Dependency health reported both PostgreSQL and MongoDB as `available`.
- Valid ADMIN, ANALYST, and REPORTER logins succeeded.
- An invalid login was rejected.

### Authorization

- REPORTER requests to users, analysts, assets, assignments, audit, reports, and security logs returned `403`.
- ANALYST requests to users, analysts, audit verification, and reports returned `403`.
- ADMIN requests to representative management, audit, and report endpoints returned `200`.
- The reporter's incident detail was redacted.
- Two newly created reporter incidents were not visible to the analyst before assignment.

### Workflow And Data Integrity

- The severity-suggestion endpoint returned a valid severity class.
- The reporter created a real workflow incident and a separate unassigned RBAC probe.
- An administrator assigned the analyst.
- The workflow completed in order: `Open -> Assigned -> Under Investigation -> In Progress -> Resolved -> Closed`.
- A real action, asset association, threat-actor association, and MongoDB security-log insertion/retrieval succeeded.
- A terminal action write returned `409` as expected.
- Timely resolution produced SLA state `Completed`.
- Analyst workload incremented on assignment and returned to baseline after resolution.
- Audit verification grew from 43 to 53 records and remained valid; required action types were present.
- Dashboard incident total grew from 8 to 10.
- MongoDB security-log count grew from 5 to 6.

### Restart Persistence

- Both containers were restarted without recreation and without deleting volumes.
- Dependency health returned both services as `available` after restart.
- The closed incident, inserted MongoDB log, audit count of 53, and valid audit chain all persisted.

## Frontend And Backend Smoke

**Passed - Real Docker**

- FastAPI started on the documented port `8000`; liveness returned `200`.
- Dependency health reported both services as `available`.
- OpenAPI exposed 33 paths.
- Streamlit started on the documented port `8501`; HTTP returned `200`.
- Live API checks reported 10 dashboard incidents and a valid 53-record audit chain.
- Scoped live API lists showed 5 incidents to the analyst and 6 to the reporter.
- Streamlit AppTest was used as a UI harness while calling the real running FastAPI and live databases.
- ADMIN, ANALYST, and REPORTER each authenticated with zero AppTest exceptions or rendered errors and with visible sign-out controls.
- The role sessions displayed dashboard metrics of 6 for ADMIN, 5 for ANALYST, and 5 for REPORTER.
- AppTest is not browser automation.
- Streamlit emitted only `use_container_width` deprecation warnings and expected bare-mode `ScriptRunContext` warnings. No process `ERROR` lines were captured.
- FastAPI and Streamlit stopped cleanly, and ports `8000` and `8501` were confirmed closed afterward.

## Failures And Resolved Issues

### Failed

**Failed - final checks:** None.

### Resolved Setup Issue

**Passed after resolution - Real Docker:** The initial Alembic attempt hung because `localhost` selected an IPv6 path while Compose published PostgreSQL on IPv4. Changing the defaults/template to `127.0.0.1` resolved the connection, after which migration and all final checks passed.

### Expected Diagnostics

- The intentional invalid foreign-key probe generated the only PostgreSQL `ERROR` log entry. This was expected evidence of enforcement, not a final-check failure.
- MongoDB logs showed normal restart shutdown/start activity and no unexpected failure.
- The pytest and Streamlit warnings described above did not fail their checks.

## Unresolved Issues And Not-Performed Checks

**Not performed**

- No multiprocess concurrent PostgreSQL advisory-lock stress test was run.
- No destructive audit-tampering test was run against the retained demonstration data.
- No load/performance, penetration, backup/restore, failover, or external browser automation was run.

**Known unresolved limitations**

- MongoDB is unauthenticated for this local demonstration, but its host port is loopback-only.
- PostgreSQL authorization and a subsequent MongoDB operation do not share a distributed transaction.
- Assignment history has no active/end state or unassignment.
- The audit chain is tamper-evident rather than immutable; unanchored tail deletion and privileged recomputation remain limitations.
- Existing pagination, administration-audit coverage, token lifecycle, ML-data, and SLA-scheduling limitations remain.
- Deferred features in [`FUTURE_ENHANCEMENTS.md`](FUTURE_ENHANCEMENTS.md) remain unimplemented.

## Exact Future Launch Commands

Run from the workspace root. The retained `.env` is already configured and ignored; do not print or commit its values.

Ensure the existing database containers are running:

```powershell
docker compose up -d
docker compose ps
```

For a newly initialized or deliberately reset database only, use the existing workflows:

```powershell
& .\.venv\Scripts\python.exe scripts\init_db.py
& .\.venv\Scripts\python.exe scripts\seed_data.py
& .\.venv\Scripts\python.exe scripts\seed_mongodb.py
```

Start FastAPI in the first terminal:

```powershell
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

Start Streamlit in the second terminal:

```powershell
& .\.venv\Scripts\python.exe -m streamlit run frontend\app.py --server.address 127.0.0.1 --server.port 8501
```

Verify the running applications:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/health/live"
Invoke-RestMethod -Uri "http://127.0.0.1:8000/health/dependencies"
Invoke-WebRequest -Uri "http://127.0.0.1:8501" -UseBasicParsing
```

Stop FastAPI and Streamlit with `Ctrl+C` in their terminals. To stop databases while preserving both named volumes:

```powershell
docker compose stop
```
