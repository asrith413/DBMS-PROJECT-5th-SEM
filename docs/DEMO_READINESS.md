# CIMS Live Demonstration Readiness

**Assessment date:** 2026-11-22  
**Target:** A college demonstration using Docker PostgreSQL and MongoDB, FastAPI, and Streamlit.  
**Current status:** **READY for a controlled college demonstration. Not production-ready.**

Full execution evidence is recorded in [`DOCKER_INTEGRATION_REPORT.md`](DOCKER_INTEGRATION_REPORT.md).

## Readiness Summary

| Area | Current result | Evidence |
|---|---|---|
| Python environment | **Passed** | Project virtual environment and dependencies are installed. |
| Docker Compose | **Passed - Real Docker** | Engine `29.9.3`, Compose `v5.7.0`, and `docker compose config --quiet` passed. |
| PostgreSQL | **Passed - Real Docker** | `postgres:16`, server `16.16`, healthy on loopback-only `127.0.0.1:5432`. |
| MongoDB | **Passed - Real Docker** | `mongo:8.0`, server `8.0.38`, healthy on loopback-only `127.0.0.1:27017`. |
| Alembic | **Passed - Real Docker** | Revisions `20261122_0001` and `20261122_0002` applied; live `alembic check` found no new operations. |
| Relational seed | **Passed - Real Docker** | Initial counts matched; second run skipped idempotently; 43-record seed audit chain was valid. |
| MongoDB seed | **Passed - Real Docker** | Five documents and six indexes including `_id`; second run skipped idempotently. |
| HTTP role/lifecycle/audit workflow | **Passed - Real Docker** | Genuine Uvicorn requests used live databases without dependency overrides or mocks. |
| FastAPI smoke | **Passed - Real Docker** | Liveness `200`, both dependencies available, and 33 OpenAPI paths. |
| Streamlit smoke | **Passed - Real Docker** | HTTP `200`; authenticated AppTest harness passed for all three roles against the live stack. |
| Backend pytest | **Passed - Mock/test-double** | 60 passed, 0 failed; primarily SQLite/`mongomock`, not live-Docker evidence. |

Both database containers remain healthy and running. FastAPI and Streamlit were stopped cleanly after verification, and ports `8000` and `8501` were confirmed closed.

## Verified Docker Environment

| Check | Result |
|---|---|
| Docker runtime | Linux Docker Desktop under WSL2, Engine `29.9.3` |
| Docker Compose | `v5.7.0` |
| Compose validation | `docker compose config --quiet` passed |
| PostgreSQL volume | `cims-demo_cims_postgres_data` mounted |
| MongoDB volume | `cims-demo_cims_mongodb_data` mounted |
| Restart persistence | Closed incident, MongoDB log, 53 audit records, and valid chain persisted |
| Data handling | Containers restarted, not recreated; no volumes deleted |
| Final process state | Containers running; application processes stopped |

The `.env` file was absent at the start of live setup and was created from the template with a cryptographically generated secret that was never printed. Configuration validation passed, and `git check-ignore -v .env` confirmed that `.env` is ignored. No secret or credential value is included in this document.

The initial Alembic connection hung because `localhost` attempted IPv6 while Compose exposed PostgreSQL on IPv4. Changing application defaults and the environment template to `127.0.0.1` resolved the issue; migration and every final check then passed.

## Preferred Setup: Docker Compose

The repository includes `compose.yaml` with PostgreSQL 16, MongoDB 8.0, persistent named volumes, health checks, and loopback-only host ports.

### 1. Verify Or Install Docker Desktop

Verify an existing installation:

```powershell
docker version
docker compose version
docker compose config --quiet
```

If Docker Desktop is absent, run PowerShell as an administrator:

```powershell
winget install --exact --id Docker.DockerDesktop
```

Restart Windows if requested, launch Docker Desktop, and wait for the engine to report ready before continuing.

### 2. Start The Databases

From the workspace root:

```powershell
docker compose up -d
docker compose ps
```

Do not continue until both services show `healthy`.

Verify PostgreSQL and MongoDB inside the containers:

```powershell
docker compose exec postgres pg_isready -U cims -d cims
docker compose exec postgres psql -U cims -d cims -c "SELECT current_database(), current_user, version();"
docker compose exec mongodb mongosh --quiet --eval "db.adminCommand({ ping: 1 })"
```

The supplied application defaults use `127.0.0.1:5432` and `127.0.0.1:27017`, matching the IPv4 loopback bindings in `compose.yaml`.

### 3. Stop Or Reset The Databases

Preserve data while stopping:

```powershell
docker compose stop
```

Restart existing data:

```powershell
docker compose start
```

Delete all demonstration database data only when a completely clean reset is required:

```powershell
docker compose down -v
```

`down -v` is destructive and removes both named database volumes. It was not used during live verification.

## Native Windows Fallback

Use this path only if Docker Desktop is unavailable. It was not the environment used for the final live verification.

### 1. Install PostgreSQL And MongoDB Server

Run PowerShell as an administrator:

```powershell
winget install --exact --id PostgreSQL.PostgreSQL.17
winget install --exact --id MongoDB.Server
```

Store any installer credential securely; do not add it to documentation or source control.

After installation, open a new terminal and verify:

```powershell
psql --version
mongod --version
mongosh --version
Get-Service -Name "postgresql*","MongoDB" -ErrorAction SilentlyContinue
```

If the executables are installed but absent from `PATH`, add the PostgreSQL and MongoDB `bin` directories or call the executables by full path.

### 2. Start Native Services

Run PowerShell as an administrator:

```powershell
Get-Service -Name "postgresql*" | Start-Service
Start-Service -Name "MongoDB"
```

Confirm ports:

```powershell
Test-NetConnection -ComputerName "127.0.0.1" -Port 5432 -InformationLevel Quiet
Test-NetConnection -ComputerName "127.0.0.1" -Port 27017 -InformationLevel Quiet
```

Both commands must return `True`.

### 3. Create The PostgreSQL Role And Database

Connect as the PostgreSQL superuser:

```powershell
psql -h 127.0.0.1 -U postgres -d postgres
```

Run the following after replacing the placeholder locally with a securely stored value:

```sql
CREATE ROLE cims WITH LOGIN PASSWORD '<database-password>';
CREATE DATABASE cims OWNER cims;
\q
```

Then verify the application account without recording its credential:

```powershell
psql -h 127.0.0.1 -U cims -d cims -c "SELECT current_database(), current_user;"
```

## Application Environment

The retained local `.env` is already configured and ignored. For a fresh setup, create it from the template:

```powershell
Copy-Item -LiteralPath ".env.example" -Destination ".env"
```

Replace the template's signing-secret placeholder with a cryptographically strong value using a secure local method that does not log or print the value. Keep database credentials only in `.env`. Confirm that relational and MongoDB hosts use `127.0.0.1`, not `localhost`, then validate that `.env` is ignored:

```powershell
git check-ignore -v .env
```

Required non-secret endpoint settings for the supplied local setup are:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DATABASE=cims_logs
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
BACKEND_URL=http://127.0.0.1:8000
CORS_ORIGINS=http://127.0.0.1:8501,http://localhost:8501
```

The PostgreSQL URL must use `127.0.0.1:5432` and the locally configured credential. Never commit `.env`.

## Database Initialization

Run these commands only after both database ports are reachable and `.env` is configured.

### 1. Apply Alembic Migrations

```powershell
& .\.venv\Scripts\python.exe scripts\init_db.py
```

Expected revisions:

- `20261122_0001`: initial 12-table relational schema.
- `20261122_0002`: unique audit predecessor and reverse foreign-key indexes.

Verify through the Compose container:

```powershell
docker compose exec postgres psql -U cims -d cims -c "SELECT version_num FROM alembic_version;"
docker compose exec postgres psql -U cims -d cims -c "SELECT COUNT(*) AS application_tables FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'alembic_version';"
```

Native equivalent:

```powershell
psql -h 127.0.0.1 -U cims -d cims -c "SELECT version_num FROM alembic_version;"
psql -h 127.0.0.1 -U cims -d cims -c "SELECT COUNT(*) AS application_tables FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'alembic_version';"
```

Expected results are revision `20261122_0002` and `12` application tables. These results passed on live Docker PostgreSQL, and live `alembic check` found no new operations.

### 2. Insert Relational Demonstration Data

```powershell
& .\.venv\Scripts\python.exe scripts\seed_data.py
```

On an empty database, expected output includes 5 users, 2 analysts, 8 incidents, 5 assets, 6 actions, and 43 valid audit records. The live first run matched these counts; a second run skipped idempotently.

Additional live seed counts were 5 incident types, 4 severity rows, 7 incident-asset links, 8 assignments, 3 threat actors, and 3 incident-threat links. All orphan checks returned zero, and an intentional invalid foreign-key insert was rejected.

### 3. Insert MongoDB Demonstration Logs

Run after the relational seed because MongoDB documents resolve incident IDs from PostgreSQL titles:

```powershell
& .\.venv\Scripts\python.exe scripts\seed_mongodb.py
```

Verify with Compose:

```powershell
docker compose exec mongodb mongosh --quiet cims_logs --eval "db.security_logs.countDocuments({})"
docker compose exec mongodb mongosh --quiet cims_logs --eval "db.security_logs.getIndexes()"
```

Native equivalent:

```powershell
mongosh --quiet "mongodb://127.0.0.1:27017/cims_logs" --eval "db.security_logs.countDocuments({})"
mongosh --quiet "mongodb://127.0.0.1:27017/cims_logs" --eval "db.security_logs.getIndexes()"
```

The live initial result was 5 documents and six indexes including `_id`; every MongoDB `incident_id` existed in PostgreSQL. A second seed run skipped idempotently.

## Start FastAPI And Streamlit

Use two terminals from the workspace root.

FastAPI:

```powershell
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

Streamlit:

```powershell
& .\.venv\Scripts\python.exe -m streamlit run frontend\app.py --server.address 127.0.0.1 --server.port 8501
```

Verify:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/health/live"
Invoke-RestMethod -Uri "http://127.0.0.1:8000/health/dependencies"
Invoke-WebRequest -Uri "http://127.0.0.1:8501" -UseBasicParsing
```

Do not begin the demonstration unless dependency health reports both `postgresql` and `mongodb` as `available`.

## Demo Credentials

Use the seeded account identities listed in [`README.md`](../README.md#demo-credentials). Credential values are intentionally omitted from this document and must be obtained through the authorized local demonstration handoff.

## Demonstration Workflow

This workflow passed on 2026-11-22 through genuine HTTP calls to Uvicorn with live Docker databases and no dependency overrides or mocks. Retain these steps for the college demonstration.

### 1. Verify The Dashboard

1. Open <http://127.0.0.1:8501>.
2. Sign in with the seeded ADMIN account.
3. Confirm both dependencies are available and dashboard metrics render.
4. A clean seed begins with 8 incidents; the retained verified database contains 10 after the integration workflow.
5. Open Reports and confirm status, severity, type, monthly, and workload charts render.
6. Download the CSV report and confirm it contains the visible incidents.

### 2. Verify REPORTER Isolation And Incident Creation

1. Sign out and sign in with a seeded REPORTER account.
2. Confirm only role-appropriate navigation is available.
3. Create an incident with a clear title and description.
4. Generate an ML severity suggestion, confirm it is a valid class, then manually select the final severity.
5. Record the new incident ID.
6. Confirm the reporter can view the new incident with operational relations redacted.
7. Confirm privileged users, analysts, assets, assignments, security logs, audit, and reports requests are denied.

### 3. Verify ADMIN Assignment

1. Sign in with the seeded ADMIN account.
2. Open the new incident.
3. Assign a seeded analyst as Primary Analyst.
4. Confirm status changes from `Open` to `Assigned`.
5. Confirm the analyst workload increments.

### 4. Verify ANALYST Investigation

1. Before assignment, confirm the ANALYST cannot see the reporter's unassigned incident.
2. After assignment, sign in with the assigned ANALYST account and confirm the incident is visible.
3. Advance status to `Under Investigation`.
4. Add an investigation action.
5. Associate an appropriate asset and threat actor while the incident is active.
6. Add a MongoDB security log for the incident.
7. Confirm the action, asset, threat actor, and security log appear in Incident Details.
8. Advance status to `In Progress`, then `Resolved`.
9. Confirm SLA state is `Completed` for a timely resolution and analyst workload returns to baseline.
10. Confirm a further action write is rejected with `409` after resolution.

### 5. Verify ADMIN Closure And Reports

1. Sign in with the seeded ADMIN account.
2. Advance the resolved incident to `Closed`.
3. Confirm dashboard/report counts include the incident and its final status.
4. Confirm the analyst workload remains at baseline.

### 6. Verify Audit Integrity

1. As ADMIN, open Audit Logs.
2. Run `Verify integrity`.
3. Confirm `integrity_valid` is true and the checked-record count is greater than the pre-workflow baseline.
4. Review records for incident creation, assignment, status changes, action, relational associations, resolution, and closure.

The executed workflow grew the chain from 43 to 53 records and left it valid. Do not modify an audit row in the retained demonstration database; destructive tamper testing was intentionally not performed.

## Role Verification Checklist

| Check | Expected result | Live result on 2026-11-22 |
|---|---|---|
| ADMIN login | Successful authenticated session | **Passed - Real Docker** |
| Invalid login | Rejected | **Passed - Real Docker** |
| ADMIN representative management/reports | `200` | **Passed - Real Docker** |
| ADMIN audit verification | Accessible and valid | **Passed - Real Docker**, 53 records |
| ANALYST assigned incident | Accessible | **Passed - Real Docker** |
| ANALYST unassigned incidents | Not visible before assignment | **Passed - Real Docker**, both probes hidden |
| ANALYST users/analysts/audit verify/reports | `403` | **Passed - Real Docker** |
| REPORTER own incident | Accessible with operational relations redacted | **Passed - Real Docker** |
| REPORTER users/analysts/assets/assignments/security/audit/reports | `403` | **Passed - Real Docker** |
| Full lifecycle | `Open` through `Closed` in order | **Passed - Real Docker** |
| Terminal action | `409` | **Passed - Real Docker** |
| Audit chain after operations | Valid and greater than 43 | **Passed - Real Docker**, 53 |
| Restart persistence | Workflow data and chain survive restart | **Passed - Real Docker** |

## Application Smoke Results

- FastAPI liveness returned `200`; dependency health reported both services available; OpenAPI contained 33 paths.
- Live API data showed 10 total dashboard incidents, a valid 53-record audit chain, 5 incidents visible to the analyst, and 6 visible to the reporter.
- Streamlit returned HTTP `200` on port `8501`.
- Streamlit AppTest acted as a UI harness against the real running API/databases. ADMIN, ANALYST, and REPORTER authenticated with zero exceptions or rendered errors, visible sign-out, and dashboard metrics of 6, 5, and 5 respectively.
- AppTest is not an external browser. Only deprecation and expected bare-mode context warnings were emitted; no process `ERROR` lines were captured.

## Known Limitations And Not-Performed Checks

- No multiprocess concurrent PostgreSQL advisory-lock stress test was run during this live validation.
- No destructive audit-tampering test was performed on the retained demo data.
- No load/performance, penetration, backup/restore, failover, or external browser automation was performed.
- MongoDB is unauthenticated for the local demo, but its host port is loopback-only.
- PostgreSQL authorization plus MongoDB insertion has no distributed transaction.
- The audit chain is tamper-evident, not immutable; unanchored tail deletion and privileged recomputation remain limitations.
- Assignments have no active/end state or unassignment, and historical assignment continues to define scope.
- Existing pagination, administration-audit, token lifecycle, ML-data, and SLA-scheduling limitations remain.
- Deferred features in [`FUTURE_ENHANCEMENTS.md`](FUTURE_ENHANCEMENTS.md) remain intentionally unimplemented.

## Final Readiness Status

**READY for a controlled college demonstration using the retained local Docker environment.**

The readiness decision is supported by real migrations, idempotent seeds, native constraint and consistency checks, genuine HTTP role/lifecycle verification, persistence across container restarts, application smoke checks, and an authenticated Streamlit UI harness. There were no failed final checks.

This is not production approval. Keep both services loopback-only, preserve `.env` confidentiality, verify dependency health immediately before the demonstration, and disclose the remaining limitations above.
