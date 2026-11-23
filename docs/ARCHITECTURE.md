# CIMS Architecture

## System Boundary

```text
Streamlit frontend (`frontend/`)
             |
             | HTTP/JSON + bearer JWT
             v
      FastAPI application
       /       |       \
      /        |        \
PostgreSQL  MongoDB     local ML artifact
relational  security    severity suggestion
truth       logs        only
```

The system consists of the modular Streamlit frontend under `frontend/` and the FastAPI backend under `backend/app`. The frontend is an HTTP client of FastAPI and does not connect directly to PostgreSQL or MongoDB. The default frontend origin is `http://localhost:8501`, which is also the backend's default CORS origin.

## Streamlit Frontend

`frontend/app.py` is the UI entry point. It renders the sign-in flow, stores the returned access token and user profile in Streamlit session state, creates an authenticated `APIClient`, and builds sidebar navigation with `st.navigation`.

Navigation is role-aware:

- Every supported authenticated role receives Dashboard, Incident Management, and Incident Details.
- `ADMIN` also receives Analyst Management, Asset Management, Security Logs, Audit Logs, and Reports.
- `ANALYST` also receives Asset Management, Security Logs, and Audit Logs.
- `REPORTER` receives only the three shared pages. Incident creation is available to reporters and administrators, while reporter incident details are read-only.
- An unsupported role clears the frontend session. A backend `401` also clears the session and returns the user to sign-in.

The frontend is divided into these modules:

- `frontend/pages/` contains page renderers for dashboards, incident queues/details, analysts, assets, security logs, audit logs, and reports.
- `frontend/components/` contains shared styling and UI helpers for headers, metrics, charts, tables, status display, role guards, flash messages, and API error handling.
- `frontend/services/api_client.py` centralizes HTTP requests, bearer headers, timeouts, response parsing, and methods matching the implemented FastAPI routes. `BACKEND_URL` selects the API root and defaults to `http://localhost:8000`.

Role-aware navigation and page guards improve the interface, but they are not the security boundary. FastAPI independently authenticates and authorizes every protected request. The frontend imports no backend database session or database client; incident, report, audit, and security-log data all pass through the API.

## FastAPI Application Layer

`app.main` constructs one FastAPI application and includes routers for authentication, users, analysts, incidents, reference data, assets, assignments, actions, threat actors, security logs, audits, and reports. There is no global API prefix.

The application layer is responsible for:

- Pydantic request validation and response shaping.
- OAuth2 bearer-token extraction, JWT validation, and reloading the current user from PostgreSQL.
- Role and incident-scope authorization.
- Workflow rules such as ordered status transitions, assignment restrictions, workload updates, and audit creation.
- Coordinating SQLAlchemy ORM operations and MongoDB document operations.
- Computing SLA status when incidents/reports are read.

Routes are synchronous. A SQLAlchemy session is created per request and closed after the dependency finishes. CORS origins are configured through `CORS_ORIGINS`.

## PostgreSQL Boundary

PostgreSQL is the authoritative store for identity, permissions, incident workflow, reference data, assets, analyst assignments/workload, actions, threat actors, and audit records. SQLAlchemy models define twelve relational tables; Alembic revision `20261122_0001` creates the schema and its constraints/indexes.

Important relational boundaries include:

- `users` owns identity and role; `analysts` is a one-to-zero-or-one profile keyed to a user.
- `incidents` references exactly one reporter, incident type, and severity.
- `incident_assets`, `incident_assignment`, and `incident_threat_actors` represent many-to-many relationships/history.
- `actions` records human-readable investigation activity.
- `audit_logs` records selected state-changing operations in one global hash chain.

PostgreSQL foreign keys, uniqueness constraints, check constraints, and delete behavior protect relational integrity. The API adds rules that the schema alone does not express, such as role authorization and the permitted status sequence.

## MongoDB Boundary And Cross-Database Link

MongoDB stores only documents in the configured `security_logs` collection. A document contains a UUID string `log_id`, integer `incident_id`, source/event fields, optional IP addresses, timestamp, normalized severity, description, and arbitrary metadata.

`security_logs.incident_id` is an application-level reference to PostgreSQL `incidents.incident_id`. It is not a foreign key because PostgreSQL cannot enforce a relationship into MongoDB. The API handles the link as follows:

- Before inserting a security log, it loads the PostgreSQL incident and checks that the caller is an administrator or an assigned analyst.
- Before incident-filtered reads, it loads the PostgreSQL incident and applies incident visibility rules.
- MongoDB queries then filter on the integer `incident_id`.

PostgreSQL remains the source of truth if the stores disagree. Deleting or changing relational data cannot cascade to MongoDB. The seed script can insert MongoDB examples directly, so seed correctness depends on matching relational IDs. MongoDB index initialization is performed by `scripts/seed_mongodb.py`; it is not an application-startup hook.

## Transaction Boundaries

Each PostgreSQL write workflow uses the request's SQLAlchemy session. Calls to `flush()` obtain generated IDs without committing; the route commits after all related relational changes have been staged.

Examples of one PostgreSQL transaction include:

- Incident creation plus its `INCIDENT_CREATED` audit record.
- Assignment creation, analyst workload increment, possible `Open` to `Assigned` change, and the assignment audit record.
- Action creation plus its audit record.
- Incident updates, status/severity audit records, `resolved_date`, and workload decrements.
- Asset/threat-actor association changes plus their audit records.

Handled integrity failures explicitly roll back before returning `409`. An uncommitted session is also closed when the request ends. There is no distributed transaction or two-phase commit across PostgreSQL and MongoDB. The security-log create flow reads/authorizes against PostgreSQL and then writes MongoDB; a failure or concurrent relational change can therefore leave cross-store inconsistency.

## SLA Service

SLA thresholds are data, not hard-coded severity rules. `severity.response_sla_hours` and `severity.resolution_sla_hours` are added to `incidents.reported_date`.

- Response reference: the earliest assignment time, or the current UTC time while no assignment exists.
- Resolution reference: `resolved_date`, or the current UTC time while unresolved.
- A reference strictly later than its deadline is a breach.
- Overall `sla_breached` is true when either response or resolution breached.
- Remaining resolution hours are calculated against the current time and may be negative.

The service computes these values on request; it does not persist deadlines, run a scheduler, or send escalations. The admin dashboard loads incidents with severity/assignment data and counts breaches in Python using the same service.

## Severity Suggestion Model

The ML component is a local scikit-learn pipeline: TF-IDF unigram/bigram features followed by logistic regression. It trains from the bundled CSV containing all four severity labels and stores/loads a local Joblib artifact. The loaded model is cached per process; if the artifact is absent, the first prediction trains it synchronously.

The model is an academic prototype trained on a small sample. Its maximum class probability is returned as `confidence`, but it is not a production risk score or an authorization/workflow decision. The endpoint only suggests a label; the reporter or administrator must select the final `severity_id`, and prediction does not write to either database.

## Audit Hash Chain

Audit records form a single global chain ordered by `log_id`. The first record uses 64 zeroes as `prev_hash`. Each next SHA-256 hash covers the prior hash and canonical JSON containing incident ID, performer ID, action type, action data, and normalized timestamp. PostgreSQL creation takes a transaction advisory lock before selecting the latest row; unique `prev_hash` prevents two committed successors. SQLite uses a transaction-lifetime process lock only as a test fallback. Verification recomputes the chain from oldest to newest and returns the first invalid log ID.

This is tamper-evident application logic, not an immutable ledger:

- A database administrator can rewrite records and recompute the remainder of the chain.
- Hashes are not signed, keyed, or anchored in an independent system.
- No database trigger or append-only database permission prevents direct `UPDATE` or `DELETE` operations.
- Native multiprocess PostgreSQL advisory-lock behavior still requires live verification; SQLite concurrency tests do not prove PostgreSQL scheduling or isolation behavior.
- The chain is global rather than per incident, so verification depends on complete `log_id` order.
- Only operations that call `create_audit_log()` are covered. Authentication, reference-data administration, security-log insertion, and direct SQL are outside the chain.

The verification endpoint detects inconsistency; it does not repair records or prove who changed them.

## Runtime And Failure Boundaries

- `GET /health/live` proves only that the FastAPI process can answer.
- `GET /health/dependencies` checks PostgreSQL and MongoDB independently and reports failures in a `200` response body.
- PostgreSQL connection pooling uses `pool_pre_ping` with a three-second connection timeout; MongoDB uses a two-second server-selection timeout.
- FastAPI can continue serving routes that do not touch an unavailable dependency, but a route needing that dependency can fail.
- The model artifact and training CSV are local process files, not database-managed assets.
