# CIMS - Cybersecurity Incident Management System

CIMS is an academic incident-management implementation covering the project through Stage 5. It demonstrates relational design, document storage, role-based access, ordered incident workflow, SLA calculation, tamper-evident auditing, reporting, a Streamlit console, and a small machine-learning advisory. It is not a production SOC platform.

PostgreSQL is the authoritative relational store. MongoDB stores security-log documents linked to incidents through application-validated `incident_id` values. Runtime use requires both services; SQLite and `mongomock` are test doubles only.

## Current Verification

**Live Docker verification passed on 2026-11-22.** CIMS is ready for a controlled college demonstration, not production deployment. The complete execution record is in [`docs/DOCKER_INTEGRATION_REPORT.md`](docs/DOCKER_INTEGRATION_REPORT.md).

Verified results:

- Docker Engine `29.9.3` and Docker Compose `v5.7.0`; `docker compose config --quiet` passed.
- PostgreSQL image `postgres:16`, server `16.16`, healthy on `127.0.0.1:5432`.
- MongoDB image `mongo:8.0`, server `8.0.38`, healthy on `127.0.0.1:27017`.
- Existing named PostgreSQL and MongoDB volumes were retained; no volume was deleted.
- Alembic revisions `20261122_0001` and `20261122_0002` applied to real PostgreSQL; live `alembic check` reported no new operations.
- Live relational seed matched expected counts and skipped idempotently on its second run; its 43-record audit chain was valid.
- Live MongoDB seed created 5 logs and six indexes including `_id`, then skipped idempotently.
- A genuine Uvicorn HTTP workflow against the Docker databases passed role isolation, the full incident lifecycle, cross-store operations, terminal guards, workload/SLA behavior, and audit verification without dependency overrides or mocks.
- Audit verification grew from 43 to 53 valid records, dashboard total from 8 to 10 incidents, and MongoDB logs from 5 to 6.
- Data and chain validity persisted after both containers were restarted without recreation.
- FastAPI liveness returned `200`, both dependencies were available, and OpenAPI exposed 33 paths.
- Streamlit returned HTTP `200`; AppTest authenticated ADMIN, ANALYST, and REPORTER against the real API/databases with zero errors. AppTest is a UI harness, not a browser.
- Full pytest suite: **60 passed, 0 failed**, with one third-party Starlette/httpx deprecation warning. These tests primarily use SQLite, `mongomock`, and test doubles; they are not live-Docker tests.
- No final check failed. An initial Alembic `localhost`/IPv6 hang was diagnosed and resolved by using `127.0.0.1`, matching Compose's IPv4 loopback bindings.

## Features

- Required environment-supplied JWT signing secret, password hashing, reporter registration, and `ADMIN`, `ANALYST`, and `REPORTER` authorization.
- Required JWT claims (`sub`, `role`, `iat`, `exp`) with signature and expiry verification.
- Role-scoped incident visibility and ordered `Open -> Assigned -> Under Investigation -> In Progress -> Resolved -> Closed` workflow.
- Terminal-incident write protection, with only `Resolved -> Closed` allowed after resolution.
- Analyst profiles, assignment history, and workflow-maintained workload counts.
- Configurable severity and response/resolution SLA values, explicit SLA state, and preserved historical deadlines.
- Asset inventory and threat-actor associations with restrictive linked-history deletion.
- Investigation actions and MongoDB security logs for active assigned incidents.
- A serialized global SHA-256 tamper-evident audit chain and administrator verification endpoint.
- Dashboard metrics, chronological monthly reports, analyst workload charts, and formula-safe CSV export.
- Advisory TF-IDF/logistic-regression severity suggestion with manual final selection.
- Role-aware Streamlit UI that refreshes current user state from the API.
- FastAPI liveness/dependency checks and OpenAPI/Swagger documentation.

## Architecture

```text
Streamlit frontend (frontend/)
          |
          | HTTP/JSON authenticated requests
          v
FastAPI application (backend/app/)
       /              |                 \
PostgreSQL         MongoDB          Local ML artifact
relational truth   security_logs    severity suggestion
```

The frontend never connects directly to a database. FastAPI performs validation, authorization, workflow coordination, and application-level MongoDB reference checks. Related relational writes and audit records share a PostgreSQL transaction. PostgreSQL and MongoDB do not share a distributed transaction.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for design and failure boundaries.

## Technology Stack

| Area | Technology |
|---|---|
| API | FastAPI, Uvicorn, Pydantic |
| Relational persistence | PostgreSQL, SQLAlchemy 2, Alembic, psycopg 3 |
| Document persistence | MongoDB, PyMongo |
| Authentication | PyJWT, OAuth2, pwdlib/Argon2 |
| Frontend | Streamlit, Pandas, Requests |
| ML advisory | scikit-learn, TF-IDF, logistic regression, Joblib |
| Tests | pytest, FastAPI/httpx TestClient, SQLite, mongomock |

Dependencies are defined in [`requirements.txt`](requirements.txt) and [`backend/requirements.txt`](backend/requirements.txt).

## Permissions

| Area | ADMIN | ANALYST with profile | REPORTER |
|---|---|---|---|
| Incidents | All | Assigned | Self-reported |
| Incident operational relations | Full | Full when assigned | Redacted |
| User inventory | Manage | Denied | Denied |
| Analyst profiles | Manage/list | Own profile only | Denied |
| Asset inventory/detail | Full | Assigned-incident assets | Denied |
| Assignments | Create/list all | Own and assigned-incident context | Denied |
| Actions | Any active incident | Assigned active incidents | Denied |
| Threat actors | Manage/link | Inventory and assigned-incident links | Denied |
| Security logs | Organization-wide | Assigned incident, scoped query | Denied |
| Audit logs | All and verify | Assigned incident | Denied |
| Reports | Full | Denied | Denied |

An `ANALYST` user without an analyst profile is denied analyst-only permissions until provisioning is completed. Backend authorization is authoritative even if UI state is stale or bypassed.

Mutation permissions remain route-specific. For example, only ADMIN creates assignments, while a complete assigned ANALYST may add actions and incident links only before resolution.

## Relational Schema And Migrations

The application has exactly 12 relational tables:

| # | Table | Purpose |
|---:|---|---|
| 1 | `users` | Identity, password hash, role, department. |
| 2 | `analysts` | One-to-one analyst profile, expertise, workload. |
| 3 | `incident_types` | Reusable incident classifications. |
| 4 | `severity` | Severity labels and SLA hours. |
| 5 | `incidents` | Main incident record and lifecycle state. |
| 6 | `assets` | Organizational asset inventory. |
| 7 | `incident_assets` | Incident-to-asset junction and impact. |
| 8 | `incident_assignment` | Incident-to-analyst assignment history. |
| 9 | `actions` | Investigation/remediation activity. |
| 10 | `threat_actors` | Maintained threat-actor records. |
| 11 | `incident_threat_actors` | Incident-to-threat-actor junction. |
| 12 | `audit_logs` | Hash-chained selected incident changes. |

Alembic also creates `alembic_version`, which is not an application table.

| Revision | Purpose | Live status |
|---|---|---|
| `20261122_0001` | Initial 12-table schema, constraints, defaults, and indexes. | Applied to PostgreSQL |
| `20261122_0002` | Unique audit `prev_hash` and reverse foreign-key indexes. | Applied to PostgreSQL |

Revision `20261122_0002` checks for duplicate predecessor hashes before adding the unique constraint. If an older database already contains a fork, migration stops with a repair requirement; it does not rewrite audit history.

## Prerequisites

- Python 3.11 or newer with `venv`.
- Docker Desktop with Docker Compose for the preferred reproducible setup, or native PostgreSQL/MongoDB as a fallback.
- Free local ports `5432`, `27017`, `8000`, and `8501`.

PostgreSQL and MongoDB must be running before migration, seeding, or normal use. The verified setup uses Docker Compose and publishes both databases only on IPv4 loopback.

## Preferred Docker Compose Setup

The repository includes `compose.yaml` for PostgreSQL 16 and MongoDB 8.0 with persistent named volumes, health checks, and loopback-only host ports:

```powershell
docker compose config --quiet
docker compose up -d
docker compose ps
```

Continue only when both containers report `healthy`. The verified server versions were PostgreSQL `16.16` and MongoDB `8.0.38`.

Stop while preserving data:

```powershell
docker compose stop
```

Restart retained data:

```powershell
docker compose start
```

Use `docker compose down -v` only for an intentional destructive reset. It was not used during verification, and both project named volumes remain mounted.

Exact Docker evidence, persistence results, and future launch commands are in [`docs/DOCKER_INTEGRATION_REPORT.md`](docs/DOCKER_INTEGRATION_REPORT.md). The complete demonstration checklist is in [`docs/DEMO_READINESS.md`](docs/DEMO_READINESS.md).

## Native Database Setup

Use native services only as a fallback to the verified Compose workflow.

### PostgreSQL

Install PostgreSQL from the [official downloads](https://www.postgresql.org/download/). Connect as a local administrator and create the application role/database after replacing the placeholder locally with a securely stored value:

```sql
CREATE ROLE cims WITH LOGIN PASSWORD '<database-password>';
CREATE DATABASE cims OWNER cims;
```

Store the credential only in the local ignored `.env`. URL-encode special characters when constructing the SQLAlchemy URL.

### MongoDB

Install MongoDB Community Server from the [official download](https://www.mongodb.com/try/download/community) and start the native service. No collection must be created manually; the seed initializer creates the intended `security_logs` indexes, and MongoDB creates the database/collection on first write.

The verified local Docker MongoDB is unauthenticated but loopback-only. If authentication is enabled in another environment, configure its URI only through protected environment configuration.

## Environment And Installation

Run commands from the workspace root.

### Windows PowerShell

```powershell
py -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item -LiteralPath ".env.example" -Destination ".env"
git check-ignore -v .env
```

### Portable Shell

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
git check-ignore -v .env
```

For a fresh setup, replace the template signing-secret placeholder with a cryptographically strong value using a secure local method that does not print or log it. Keep database credentials only in `.env`. The verified `.env` was created this way, passed configuration validation, and is ignored.

Application startup rejects a missing, short, placeholder-like, repetitive, or whitespace-padded signing secret. Never commit `.env` or record its credential values in documentation.

| Setting | Verified local requirement | Purpose |
|---|---|---|
| `JWT_SECRET_KEY` | Required; no default; protected in `.env` | Application signing key |
| `DATABASE_URL` | PostgreSQL URL using `127.0.0.1:5432` and local protected credentials | Relational connection |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | Document-store connection |
| `MONGODB_DATABASE` | `cims_logs` | Database containing `security_logs` |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Access-token lifetime |
| `CORS_ORIGINS` | Include `http://127.0.0.1:8501` | Allowed frontend origins |
| `BACKEND_URL` | `http://127.0.0.1:8000` | Streamlit API root |

Use `127.0.0.1`, not `localhost`, for both database hosts. The change resolves the observed IPv6 connection hang when Compose is bound to IPv4.

## Migrate, Seed, And Train

After configuring `.env` and starting PostgreSQL and MongoDB:

### Windows PowerShell

```powershell
& .\.venv\Scripts\python.exe scripts\init_db.py
& .\.venv\Scripts\python.exe scripts\seed_data.py
& .\.venv\Scripts\python.exe scripts\seed_mongodb.py
& .\.venv\Scripts\python.exe scripts\train_model.py
```

### Portable Shell

```bash
./.venv/bin/python scripts/init_db.py
./.venv/bin/python scripts/seed_data.py
./.venv/bin/python scripts/seed_mongodb.py
./.venv/bin/python scripts/train_model.py
```

`scripts/init_db.py` runs `alembic upgrade head`, applying both revisions. Direct Alembic commands are:

```powershell
Push-Location backend
& ..\.venv\Scripts\python.exe -m alembic upgrade head
& ..\.venv\Scripts\python.exe -m alembic check
Pop-Location
```

```bash
cd backend
../.venv/bin/python -m alembic upgrade head
../.venv/bin/python -m alembic check
cd ..
```

The relational seed skips a database that already contains users. On an empty database it creates 5 users, 2 analysts, 8 incidents, 5 assets, 6 actions, and 43 audit records. The live first run matched, the chain verified, and the second run skipped idempotently.

The Mongo seed skips a nonempty `security_logs` collection. It resolves five required relational incidents by title rather than assuming IDs. The live first run inserted 5 documents with intended indexes; the second run skipped idempotently.

Model training is optional. The API trains on first prediction if `backend/app/ml/severity_model.joblib` is absent; that generated file is ignored.

## Run The Application

Use separate shells after configuration, migration, and seed steps.

### Backend

```powershell
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

```bash
./.venv/bin/python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

### Frontend

```powershell
& .\.venv\Scripts\python.exe -m streamlit run frontend\app.py --server.address 127.0.0.1 --server.port 8501
```

```bash
./.venv/bin/python -m streamlit run frontend/app.py --server.address 127.0.0.1 --server.port 8501
```

| Service | URL |
|---|---|
| Streamlit UI | <http://127.0.0.1:8501> |
| FastAPI root | <http://127.0.0.1:8000> |
| Swagger UI | <http://127.0.0.1:8000/docs> |
| OpenAPI JSON | <http://127.0.0.1:8000/openapi.json> |
| Dependency health | <http://127.0.0.1:8000/health/dependencies> |

## Demo Credentials

`scripts/seed_data.py` creates the following local demonstration identities:

| Role | Email |
|---|---|
| Administrator | `admin@cims.edu` |
| Analyst | `maya.analyst@cims.edu` |
| Analyst | `noah.analyst@cims.edu` |
| Reporter | `reporter@cims.edu` |
| Reporter | `vikram.reporter@cims.edu` |

The shared local credential value is intentionally omitted from documentation. Obtain it through the authorized demonstration handoff. These identities are for the local college demonstration only.

## Live Database Verification

The following checks passed against the Docker services on 2026-11-22 and can be rerun without exposing credentials:

```powershell
docker compose exec postgres psql -U cims -d cims -c "SELECT current_database(), current_user, version();"
docker compose exec postgres psql -U cims -d cims -c "SELECT version_num FROM alembic_version;"
docker compose exec postgres psql -U cims -d cims -c "SELECT COUNT(*) AS application_tables FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'alembic_version';"
docker compose exec mongodb mongosh --quiet cims_logs --eval "db.runCommand({ ping: 1 }); db.security_logs.countDocuments({});"
Invoke-RestMethod -Uri "http://127.0.0.1:8000/health/dependencies"
```

Observed results included revision `20261122_0002`, 12 application tables, and both dependencies `available`. After the integration workflow, PostgreSQL retained 10 incidents and 53 valid audit records; MongoDB retained 6 logs. Those values persisted after container restart.

## Known Limitations

- No multiprocess concurrent PostgreSQL advisory-lock stress test was run. The 12-writer pytest regression uses same-process threads with file SQLite.
- No destructive audit-tampering test was performed against retained demonstration data.
- The audit chain is tamper-evident, not immutable. It cannot detect unanchored tail/full deletion or privileged recomputation and has no external anchor, signature, or append-only database policy.
- PostgreSQL authorization and MongoDB insertion do not share a distributed transaction.
- MongoDB is unauthenticated for the local demo, although its host port is loopback-only.
- Security logs are inserted manually through the API or seed script; there is no live SIEM ingestion.
- Assignments have no active/end state or unassignment. Historical assignments continue to define analyst access.
- User and analyst-profile provisioning takes two requests, although an incomplete `ANALYST` receives no analyst permissions.
- Audit history does not cover every system-level administration operation.
- Incident views cap a request at 200 records; audit/security-log routes cap at 1,000, and complete UI pagination is absent.
- No external browser automation, load/performance, penetration/security, backup/restore, recovery, or failover testing was performed. Streamlit AppTest is not a browser.
- Access tokens have no refresh-token or server-side revocation mechanism.
- The 32-row ML training set is an academic advisory, not a production risk model.
- SLA state is calculated on read; no scheduler sends alerts or escalations.
- Deferred features remain unimplemented.

## Directory Map

| Path | Contents |
|---|---|
| `backend/app/main.py` | FastAPI application, router registration, CORS, health routes. |
| `backend/app/models/` | SQLAlchemy base and 12-table model. |
| `backend/app/routers/` | Auth, workflow, resources, logs, audit, reports. |
| `backend/app/schemas/` | Validated request/response contracts. |
| `backend/app/services/` | Auth, permissions, lifecycle, SLA, Mongo logs, audit chain. |
| `backend/app/database/` | PostgreSQL sessions, MongoDB/index setup, relational seed. |
| `backend/alembic/` | Revisions `20261122_0001` and `20261122_0002`. |
| `backend/tests/` | Core and remediation regression suites. |
| `frontend/` | Streamlit app, pages, components, API client. |
| `scripts/` | Migration, relational/Mongo seed, and ML training commands. |
| `frontend-web/` | Modern React/Vite SOC console frontend, components, and E2E tests. |
| `docs/` | Architecture, API, schema, normalization, status, audit, deferred scope, Docker evidence, React guide. |
| `compose.yaml` | PostgreSQL and MongoDB services for the preferred local setup. |
| `.env.example` | Configuration template with an intentionally invalid signing placeholder. |

Detailed references: [`docs/REACT_FRONTEND_GUIDE.md`](docs/REACT_FRONTEND_GUIDE.md), [`docs/DOCKER_INTEGRATION_REPORT.md`](docs/DOCKER_INTEGRATION_REPORT.md), [`docs/DEMO_READINESS.md`](docs/DEMO_READINESS.md), [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md), [`docs/FINAL_AUDIT.md`](docs/FINAL_AUDIT.md), [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md), [`docs/RELATIONAL_SCHEMA.md`](docs/RELATIONAL_SCHEMA.md), and [`docs/NORMALIZATION.md`](docs/NORMALIZATION.md).

## React SOC Frontend Console

In addition to the original Streamlit frontend (`frontend/`), CIMS includes a modern, responsive Single-Page Application (SPA) located in `frontend-web/`.

### Overview

- **Stack**: React 18, Vite 6, JavaScript, Tailwind CSS, React Router 7, Axios, Lucide React, and Recharts 3.
- **Capabilities**: Role-scoped interfaces (`ADMIN`, `ANALYST`, `REPORTER`), operational SOC dashboard with Recharts visualizations, interactive incident triage and investigation workflows, MongoDB security telemetry creation and viewing, analyst workload distribution, asset and threat-actor associations, and SHA-256 tamper-evident hash-chain verification.
- **Portability & Isolation**: Runs completely independently from the original Streamlit interface without altering database schemas or backend APIs.

### Installation

```powershell
cd "E:\DBMS PROJECT 5th SEM\frontend-web"
npm install
```

### Environment Configuration

The development proxy is pre-configured in `vite.config.js` to route all `/api` requests to `http://127.0.0.1:8000`. No separate `.env` file is required for standard local execution.

For custom API base URL overrides:
```powershell
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000"
```

### Development Startup

Ensure the FastAPI backend is running on port 8000, then start the Vite development server:

```powershell
cd "E:\DBMS PROJECT 5th SEM\frontend-web"
npm run dev
```

### Production Build

```powershell
cd "E:\DBMS PROJECT 5th SEM\frontend-web"
npm run build
```

Compiled static production assets are saved to `frontend-web/dist/`. To preview the production bundle locally:

```powershell
npm run preview
```

### Access URLs

- **React Frontend**: `http://localhost:5173`
- **FastAPI Backend**: `http://127.0.0.1:8000` (API documentation: `http://127.0.0.1:8000/docs`)
- **Streamlit Frontend**: `http://localhost:8501`

For complete architectural details, permission matrices, and end-to-end testing procedures, see [`docs/REACT_FRONTEND_GUIDE.md`](docs/REACT_FRONTEND_GUIDE.md).
