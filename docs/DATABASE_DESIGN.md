# CIMS Database Design

PostgreSQL is the authoritative store for users, incidents, workflow state, assets, assignments, actions, threat actors, and audit records. MongoDB has the separate, intentionally narrow role of storing security event documents.

## Relational Tables

| Table | Primary key | Important foreign keys | Purpose |
|---|---|---|---|
| `users` | `user_id` | None | Authenticated people and their ADMIN, ANALYST, or REPORTER role. |
| `analysts` | `user_id` | `user_id -> users.user_id` | One-to-one analyst profile, expertise, and current workload. |
| `incident_types` | `type_id` | None | Reusable incident classifications. |
| `severity` | `severity_id` | None | Reusable severity levels and response/resolution SLA values. |
| `incidents` | `incident_id` | `type_id`, `severity_id`, `reported_by` | Main incident record and lifecycle state. |
| `assets` | `asset_id` | None | Registered organizational assets. |
| `incident_assets` | (`incident_id`, `asset_id`) | Both key columns | Incident-to-asset many-to-many junction with impact context. |
| `incident_assignment` | `assignment_id` | `incident_id`, `analyst_id` | Assignment history between incidents and analyst profiles. |
| `actions` | `action_id` | `incident_id`, `performed_by` | Chronological investigation/remediation activities. |
| `threat_actors` | `actor_id` | None | Locally maintained actor aliases and descriptions. |
| `incident_threat_actors` | (`incident_id`, `actor_id`) | Both key columns | Incident-to-threat-actor many-to-many junction. |
| `audit_logs` | `log_id` | `incident_id`, `performed_by` | Append-oriented, SHA-256 hash-chained records of important operations. |

## Relationships

- A user reports zero or many incidents; every incident has exactly one reporter.
- A user has zero or one analyst profile. An analyst profile cannot exist without its user.
- One incident type and one severity classify many incidents.
- Incidents and assets have a many-to-many relationship through `incident_assets`.
- Analysts and incidents have a many-to-many historical relationship through `incident_assignment`.
- One incident has many actions; one user can perform many actions.
- Incidents and threat actors have a many-to-many relationship through `incident_threat_actors`.
- One incident and one user can each be referenced by many audit records.

## Constraints And Indexes

- Emails, incident type names, severity levels, asset IP addresses, threat actor aliases, and audit hashes are unique.
- Required business fields are `NOT NULL`; foreign keys prevent orphan operational records.
- SLA hours must be positive, and resolution SLA cannot be shorter than response SLA.
- Analyst workload cannot be negative. A resolution date cannot precede its report date.
- Enum checks constrain roles and lifecycle statuses. `Assigned` is included because it is required by the specified Stage 3 workflow.
- Composite primary keys prevent duplicate asset and threat-actor links.
- A given analyst can be linked to an incident only once; other analysts may subsequently be added, retaining assignment history.
- Search and join columns such as email, role, incident status/date/title, foreign keys, asset attributes, action date, and audit timestamp are indexed.
- Deleting referenced users, severities, types, analysts, assets, and threat actors is restricted where history would otherwise be lost. Incident-owned junction rows/actions use cascading deletion, while audit records restrict incident deletion.

## Normalization

The design satisfies Third Normal Form (3NF):

- **1NF:** columns contain atomic values; repeating assets, analysts, and actors are represented as rows in junction tables.
- **2NF:** junction attributes depend on their entire composite key. For example, `impact_type` describes one incident-asset pair.
- **3NF:** incident type descriptions and severity SLA values are held once in lookup tables rather than duplicated in incidents. Analyst-specific attributes are separated from user identity data.

This reduces update anomalies while preserving clear foreign-key relationships for JOIN demonstrations.

## PostgreSQL And MongoDB Link

MongoDB's `security_logs.incident_id` stores the PostgreSQL incident identifier as an application-level reference. MongoDB cannot enforce a cross-database foreign key, so the API verifies that the PostgreSQL incident exists before inserting a log. PostgreSQL remains the source of truth if a discrepancy occurs.
