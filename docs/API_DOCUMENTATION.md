# CIMS API Documentation

The application exposes a FastAPI API with no global URL prefix. FastAPI also serves its generated interactive schema at `/docs`. Unless a route is marked public, send `Authorization: Bearer <access_token>`.

## Authentication

- `POST /auth/register` accepts JSON and always creates a `REPORTER`; public registration cannot choose a role.
- `POST /auth/login` accepts `application/x-www-form-urlencoded`, using the email address in the OAuth2 `username` field and the password in `password`.
- A successful login returns `access_token`, `token_type: "bearer"`, and the current user.
- JWTs contain required `sub`, `role`, `iat`, and `exp` claims. HS256 and a 60-minute lifetime are the defaults, but `JWT_SECRET_KEY` has no default and must be a strong environment value. Authorization uses the user and current role reloaded from PostgreSQL, not the role claim alone.
- Passwords are processed by `pwdlib`'s recommended password hasher and are stored only as `password_hash` values.
- There are no refresh-token, logout/revocation, password-reset, MFA, or SSO endpoints.

## Permission Model

Roles are `ADMIN`, `ANALYST`, and `REPORTER`.

| Rule | Effective access |
|---|---|
| Authenticated | Any valid current user. |
| Administrator | Unrestricted incident visibility, user/reference-data administration, assignment creation, reports, and full audit verification. |
| Reporter incident visibility | Incidents whose `reported_by` equals the current user's ID. |
| Analyst incident visibility | Incidents linked to the analyst through `incident_assignment`. |
| Incident modification by analyst | The analyst must be assigned. Analysts can change only incident `status`; they can also add actions and manage asset/threat-actor links for assigned incidents. |
| Hidden incident rule | General incident-access checks return `404 Incident not found` rather than revealing that an inaccessible incident exists. |

The only valid manual status sequence is `Open -> Assigned -> Under Investigation -> In Progress -> Resolved -> Closed`. Creating the first assignment changes `Open` to `Assigned`. Entering `Resolved` sets `resolved_date` and decrements the workload of every assigned analyst. A resolved incident may only transition to closed; other terminal writes return `409`.

## System

| Method and path | Access | Success and behavior |
|---|---|---|
| `GET /` | Public | `200`; returns application name, `running` status, and `/docs` location. |
| `GET /health/live` | Public | `200`; returns `{"status":"ok"}` without checking databases. |
| `GET /health/dependencies` | Public | Always `200`; reports PostgreSQL and MongoDB separately as `available` or `unavailable: <ExceptionType>`. |

## Authentication Routes

| Method and path | Access | Input | Key results |
|---|---|---|---|
| `POST /auth/register` | Public | JSON: `name`, `email`, `password`, optional `department` | `201` user; `409` duplicate email; `422` validation error. |
| `POST /auth/login` | Public | Form: `username` (email), `password` | `200` token and user; `401` incorrect credentials. |
| `GET /auth/me` | Authenticated | None | `200` current user; `401` invalid, expired, missing, or deleted-user token. |

## User Routes

All `/users` routes require `ADMIN`.

| Method and path | Input | Key results |
|---|---|---|
| `GET /users` | None | `200`; users ordered by name. |
| `POST /users` | `name`, `email`, `password`, `role`, optional `department` | `201`; `409` email/create conflict. |
| `GET /users/{user_id}` | Path ID | `200`; `404` user not found. |
| `PATCH /users/{user_id}` | One or more of `name`, `email`, `role`, `department`, `password` | `200`; `404`; `409` duplicate email or attempt to change the role of a user that still has an analyst profile. |
| `DELETE /users/{user_id}` | Path ID | `200` message; `404`; `409` self-deletion or referenced incident history. |

## Analyst Routes

| Method and path | Access | Input | Key results |
|---|---|---|---|
| `GET /analysts` | `ADMIN` | None | `200`; analysts ordered by workload then user ID. |
| `POST /analysts` | `ADMIN` | `user_id`, `expertise` | `201`; `404` user; `409` user is not `ANALYST` or profile exists. Workload starts at zero. |
| `GET /analysts/{analyst_id}` | `ADMIN` or that analyst | Path ID | `200`; `403` another user's profile; `404` profile not found. |
| `PATCH /analysts/{analyst_id}` | `ADMIN` | `expertise` | `200`; `404` profile not found. |
| `DELETE /analysts/{analyst_id}` | `ADMIN` | Path ID | `200` message; `404`; `409` assignment history or relational conflict. |

## Incident Routes

Incident responses include reporter, type, severity, and a computed SLA object with `Active`, `Completed`, or `Breached` state. The detail route additionally includes assignments, assets, actions, and threat actors for ADMIN and assigned ANALYST users; those operational collections are redacted for REPORTER users.

| Method and path | Access | Input | Key results |
|---|---|---|---|
| `POST /incidents` | `ADMIN` or `REPORTER` | `title`, `description`, `type_id`, `severity_id` | `201`; reporter is always the current user and status is `Open`; `403` analyst; `422` missing type/severity or invalid body. |
| `GET /incidents` | Authenticated, role-scoped | Optional `status`, `severity_id`, `type_id`, `search`, `offset` (default 0), `limit` (default 100, max 200) | `200`; newest first. Search covers title and description with escaped wildcard characters. |
| `POST /incidents/suggest-severity` | Authenticated | `title`, `description`, `incident_type` | `200` suggestion, confidence, and academic-prototype disclaimer; no incident is changed. |
| `GET /incidents/{incident_id}` | Incident visibility | Path ID | `200` detailed incident; `404` missing or inaccessible. |
| `PATCH /incidents/{incident_id}` | `ADMIN` or assigned `ANALYST` | One or more of `title`, `description`, `type_id`, `severity_id`, `status` | `200`; analysts may submit only `status`; resolved incidents may only close and closed incidents reject writes; `403`, `404`, `409`, or `422`. |
| `DELETE /incidents/{incident_id}` | `ADMIN` | Path ID | `200` message; `403`, `404`, or `409` when audit/related history prevents deletion. Incident creation normally creates audit history immediately. |

## Incident Type Routes

There is no single-item `GET` route for incident types.

| Method and path | Access | Input | Key results |
|---|---|---|---|
| `GET /incident-types` | Authenticated | None | `200`; ordered by name. |
| `POST /incident-types` | `ADMIN` | `name`, `description` | `201`; `409` duplicate name. |
| `PATCH /incident-types/{type_id}` | `ADMIN` | Optional `name`, `description` | `200`; `404`; `409` duplicate name. |
| `DELETE /incident-types/{type_id}` | `ADMIN` | Path ID | `200` message; `404`; `409` type is in use. |

## Severity Routes

There is no single-item `GET` route for severity. SLA hours must be positive and resolution SLA must be at least the response SLA.

| Method and path | Access | Input | Key results |
|---|---|---|---|
| `GET /severity` | Authenticated | None | `200`; ordered by `resolution_sla_hours`. |
| `POST /severity` | `ADMIN` | `level`, `response_sla_hours`, `resolution_sla_hours` | `201`; `409` duplicate/conflict; `422` invalid SLA values. |
| `PATCH /severity/{severity_id}` | `ADMIN` | Optional level and SLA fields | `200`; `404`; `409` when SLA hours are already referenced or data conflicts; `422` invalid SLA relationship. |
| `DELETE /severity/{severity_id}` | `ADMIN` | Path ID | `200` message; `404`; `409` level is in use. |

## Asset Routes

| Method and path | Access | Input | Key results |
|---|---|---|---|
| `GET /assets` | `ADMIN` or profiled `ANALYST` | None | `200`; ADMIN sees all assets and ANALYST sees assets linked to assigned incidents. REPORTER receives `403`. |
| `POST /assets` | `ADMIN` or `ANALYST` | `name`, `type`, optional `ip_address`, `department` | `201`; create validates an IP address/CIDR; `409` duplicate IP. |
| `GET /assets/{asset_id}` | `ADMIN` or relevant `ANALYST` | Path ID | `200`; inaccessible assets are concealed with `404`. |
| `GET /assets/{asset_id}/incidents` | `ADMIN` or relevant `ANALYST` | Path ID | `200`; affected incident summaries visible to the caller, including impact type; `404` asset. |
| `PATCH /assets/{asset_id}` | `ADMIN` or relevant `ANALYST` | Optional asset fields | `200`; `404`; `409` duplicate IP. |
| `POST /assets/{asset_id}/incidents/{incident_id}` | `ADMIN` or assigned `ANALYST` | `impact_type` | `201` association; `404` incident/asset; `409` duplicate link. |
| `DELETE /assets/{asset_id}/incidents/{incident_id}` | `ADMIN` or assigned `ANALYST` | Path IDs | `200` message; `404` incident/link. |
| `DELETE /assets/{asset_id}` | `ADMIN` | Path ID | `200` message; `404`; `409` linked history. |

## Assignment Routes

There is no reassignment or assignment-deletion endpoint.

| Method and path | Access | Input | Key results |
|---|---|---|---|
| `POST /assignments` | `ADMIN` | `incident_id`, `analyst_id`, optional `role` | `201`; increments workload and may set status to `Assigned`; `404`; `409` terminal incident, duplicate assignment, or write conflict. |
| `GET /assignments` | `ADMIN` or profiled `ANALYST` | None | `200`; ADMIN sees all and ANALYST sees own assignments; newest first. |
| `GET /assignments/incident/{incident_id}` | `ADMIN` or assigned `ANALYST` | Path ID | `200`; chronological list; `404` missing or inaccessible incident. |

## Action Routes

| Method and path | Access | Input | Key results |
|---|---|---|---|
| `POST /actions/incident/{incident_id}` | `ADMIN` or assigned `ANALYST` | `description` | `201`; creates an action and audit record in one PostgreSQL commit; `404` inaccessible incident; `409` terminal incident. |
| `GET /actions/incident/{incident_id}` | `ADMIN` or assigned `ANALYST` | Path ID | `200`; chronological list; `404` missing or inaccessible incident. |

## Threat Actor Routes

There is no single-item `GET` route for threat actors.

| Method and path | Access | Input | Key results |
|---|---|---|---|
| `GET /threat-actors` | `ADMIN` or profiled `ANALYST` | None | `200`; ordered by alias. |
| `POST /threat-actors` | `ADMIN` | `alias`, `description` | `201`; `409` duplicate alias. |
| `PATCH /threat-actors/{actor_id}` | `ADMIN` | Optional `alias`, `description` | `200`; `404`; `409` duplicate alias. |
| `POST /threat-actors/{actor_id}/incidents/{incident_id}` | `ADMIN` or assigned `ANALYST` | Path IDs | `201` message; `404`; `409` duplicate link. |
| `DELETE /threat-actors/{actor_id}/incidents/{incident_id}` | `ADMIN` or assigned `ANALYST` | Path IDs | `200` message; `404` incident/link. |
| `DELETE /threat-actors/{actor_id}` | `ADMIN` | Path ID | `200` message; `404`; `409` linked history. |

## Security Log Routes

Security-log documents live in MongoDB, but incident existence and access are checked in PostgreSQL.

| Method and path | Access | Input | Key results |
|---|---|---|---|
| `POST /security-logs` | `ADMIN` or assigned `ANALYST` | `incident_id`, `source`, `event_type`, optional IPs/timestamp, `severity`, `description`, optional `metadata` | `201`; severity is normalized to Low/Medium/High/Critical; `404` inaccessible incident; `409` terminal incident; or `422`. |
| `GET /security-logs` | `ADMIN`, or assigned `ANALYST` with `incident_id` | Optional `incident_id`, `source`, `severity`, `event_type`, `search`, `limit` (default 200, max 1000) | `200`; newest first. Reporter gets `403`; analyst without `incident_id` gets `422`; missing/inaccessible incident gets `404`. |
| `GET /security-logs/incident/{incident_id}` | `ADMIN` or assigned `ANALYST` | Path ID | `200`; newest first; reporter gets `403`; missing/inaccessible incident gets `404`. |

`search` performs a case-insensitive literal substring match across description, source, event type, source IP, and destination IP. The other string filters are case-insensitive exact matches.

## Audit Routes

| Method and path | Access | Input | Key results |
|---|---|---|---|
| `GET /audit` | `ADMIN`, or assigned `ANALYST` when filtering by incident | Optional `incident_id`, `limit` (default 200, max 1000) | `200`; newest log IDs first. Only admin may omit `incident_id`; a reporter gets `403` for no filter or an owned incident, while an inaccessible incident is concealed with `404`. |
| `GET /audit/verify` | `ADMIN` | None | `200`; returns `integrity_valid`, `records_checked`, and `first_invalid_log_id`. |

## Report Routes

Both routes require `ADMIN`.

| Method and path | Input | Key results |
|---|---|---|
| `GET /reports/dashboard` | None | `200`; totals, open/resolved/critical/SLA-breach counts, analyst count, grouped counts, monthly trends, and stored analyst workloads. |
| `GET /reports/incidents.csv` | None | `200 text/csv`; attachment `cims_incidents.csv` with incident ID, title, status, severity, type, reporter, reported date, and resolved date. |

## Status And Error Conventions

- `200 OK` is used for reads, patches, and successful deletes; deletes return a JSON `message`, not `204`.
- `201 Created` is used for registration and all create/associate routes.
- `401 Unauthorized` indicates missing, invalid, or expired bearer credentials, or bad login credentials. Authentication failures include `WWW-Authenticate: Bearer`.
- `403 Forbidden` indicates an authenticated role or assignment that is not allowed to perform the operation.
- `404 Not Found` covers missing resources and deliberately concealed inaccessible incidents.
- `409 Conflict` covers uniqueness/foreign-key conflicts, protected history, duplicate links/assignments, terminal assignment attempts, and invalid status transitions.
- `422 Unprocessable Entity` covers Pydantic/path/query validation, invalid referenced incident type or severity, invalid SLA relationships, and the analyst security-log query requirement.
- FastAPI errors use `{"detail": ...}`. Validation errors use FastAPI's structured detail list.
