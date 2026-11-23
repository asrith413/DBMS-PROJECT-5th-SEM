# CIMS PostgreSQL Query Catalog

These examples use the table and column names defined by the SQLAlchemy models and the initial Alembic migration. Positional parameters such as `$1` are PostgreSQL bind parameters; their meaning is stated above each query.

Operational writes should normally go through the FastAPI service. Direct SQL can bypass role checks, lifecycle validation, workload maintenance, and audit-log creation.

## 1. Incidents With Severity And SLA Values

**Demonstrates:** `SELECT`, `INNER JOIN`, `ORDER BY`.

```sql
SELECT
    i.incident_id,
    i.title,
    i.status,
    i.reported_date,
    i.resolved_date,
    s.severity_id,
    s.level AS severity_level,
    s.response_sla_hours,
    s.resolution_sla_hours
FROM incidents AS i
JOIN severity AS s
  ON s.severity_id = i.severity_id
ORDER BY i.reported_date DESC, i.incident_id DESC;
```

## 2. Analysts Assigned To One Incident

`$1` is the incident ID.

**Demonstrates:** `SELECT`, multiple `INNER JOIN` operations, `WHERE`, `ORDER BY`.

```sql
SELECT
    ia.assignment_id,
    ia.incident_id,
    ia.analyst_id,
    u.name AS analyst_name,
    u.email AS analyst_email,
    a.expertise,
    a.workload,
    ia.role AS assignment_role,
    ia.assigned_date
FROM incident_assignment AS ia
JOIN analysts AS a
  ON a.user_id = ia.analyst_id
JOIN users AS u
  ON u.user_id = a.user_id
WHERE ia.incident_id = $1
ORDER BY ia.assigned_date, ia.assignment_id;
```

## 3. Assets Affected By One Incident

`$1` is the incident ID.

**Demonstrates:** `SELECT`, junction-table `INNER JOIN`, `WHERE`, `ORDER BY`.

```sql
SELECT
    ia.incident_id,
    a.asset_id,
    a.name AS asset_name,
    a.type AS asset_type,
    a.ip_address,
    a.department,
    ia.impact_type
FROM incident_assets AS ia
JOIN assets AS a
  ON a.asset_id = ia.asset_id
WHERE ia.incident_id = $1
ORDER BY a.name, a.asset_id;
```

## 4. Chronological Action History

`$1` is the incident ID.

**Demonstrates:** `SELECT`, `INNER JOIN`, `WHERE`, `ORDER BY`.

```sql
SELECT
    ac.action_id,
    ac.incident_id,
    ac.action_date,
    ac.description,
    ac.performed_by,
    u.name AS performed_by_name,
    u.role AS performed_by_role
FROM actions AS ac
JOIN users AS u
  ON u.user_id = ac.performed_by
WHERE ac.incident_id = $1
ORDER BY ac.action_date, ac.action_id;
```

## 5. Incident Counts By Severity

The `LEFT JOIN` retains configured severity levels that currently have zero incidents. Ordering matches the dashboard report's severity ordering.

**Demonstrates:** `SELECT`, `LEFT JOIN`, `GROUP BY`, `ORDER BY`, aggregate `COUNT`.

```sql
SELECT
    s.severity_id,
    s.level AS severity_level,
    s.response_sla_hours,
    s.resolution_sla_hours,
    COUNT(i.incident_id) AS incident_count
FROM severity AS s
LEFT JOIN incidents AS i
  ON i.severity_id = s.severity_id
GROUP BY
    s.severity_id,
    s.level,
    s.response_sla_hours,
    s.resolution_sla_hours
ORDER BY s.resolution_sla_hours DESC, s.severity_id;
```

## 6. Analyst Or Analysts With The Highest Workload

The subquery returns the maximum stored workload and the outer query returns every analyst tied at that value. `analysts.workload` is the application's maintained current-work counter, not a count calculated from all historical assignments.

**Demonstrates:** `SELECT`, `INNER JOIN`, aggregate `MAX`, subquery, `ORDER BY`.

```sql
SELECT
    a.user_id AS analyst_id,
    u.name AS analyst_name,
    u.email,
    a.expertise,
    a.workload
FROM analysts AS a
JOIN users AS u
  ON u.user_id = a.user_id
WHERE a.workload = (
    SELECT MAX(a2.workload)
    FROM analysts AS a2
)
ORDER BY u.name, a.user_id;
```

## 7. Incidents That Breached A Response Or Resolution SLA

This reproduces `calculate_sla_status()` using the SLA hours stored in `severity`:

- Response time ends at the first assignment; an unassigned incident is compared with `CURRENT_TIMESTAMP`.
- Resolution time ends at `resolved_date`; an unresolved incident is compared with `CURRENT_TIMESTAMP`.
- A breach uses strict `>` comparison, matching the service.

**Demonstrates:** `SELECT`, common table expressions, `INNER JOIN`, `LEFT JOIN`, `GROUP BY`, aggregate `MIN`, interval arithmetic, `WHERE`, `ORDER BY`.

```sql
WITH first_assignments AS (
    SELECT
        ia.incident_id,
        MIN(ia.assigned_date) AS first_assigned_date
    FROM incident_assignment AS ia
    GROUP BY ia.incident_id
),
sla_evaluation AS (
    SELECT
        i.incident_id,
        i.title,
        i.status,
        s.level AS severity_level,
        i.reported_date,
        fa.first_assigned_date,
        i.resolved_date,
        i.reported_date
            + s.response_sla_hours * INTERVAL '1 hour' AS response_deadline,
        i.reported_date
            + s.resolution_sla_hours * INTERVAL '1 hour' AS resolution_deadline,
        COALESCE(fa.first_assigned_date, CURRENT_TIMESTAMP)
            > i.reported_date
              + s.response_sla_hours * INTERVAL '1 hour' AS response_breached,
        COALESCE(i.resolved_date, CURRENT_TIMESTAMP)
            > i.reported_date
              + s.resolution_sla_hours * INTERVAL '1 hour' AS resolution_breached
    FROM incidents AS i
    JOIN severity AS s
      ON s.severity_id = i.severity_id
    LEFT JOIN first_assignments AS fa
      ON fa.incident_id = i.incident_id
)
SELECT
    incident_id,
    title,
    status,
    severity_level,
    reported_date,
    first_assigned_date,
    resolved_date,
    response_deadline,
    resolution_deadline,
    response_breached,
    resolution_breached
FROM sla_evaluation
WHERE response_breached OR resolution_breached
ORDER BY resolution_deadline, incident_id;
```

## 8. Incidents Reported By One User

`$1` is the reporter's `users.user_id`.

**Demonstrates:** `SELECT`, `INNER JOIN`, `WHERE`, `ORDER BY`.

```sql
SELECT
    i.incident_id,
    i.title,
    i.status,
    i.reported_date,
    u.user_id AS reporter_id,
    u.name AS reporter_name,
    u.email AS reporter_email
FROM incidents AS i
JOIN users AS u
  ON u.user_id = i.reported_by
WHERE u.user_id = $1
ORDER BY i.reported_date DESC, i.incident_id DESC;
```

## 9. Incidents Associated With One Threat Actor

`$1` is the threat actor's `threat_actors.actor_id`.

**Demonstrates:** `SELECT`, many-to-many junction `INNER JOIN`, `WHERE`, `ORDER BY`.

```sql
SELECT
    ta.actor_id,
    ta.alias AS threat_actor_alias,
    i.incident_id,
    i.title,
    i.status,
    i.reported_date
FROM threat_actors AS ta
JOIN incident_threat_actors AS ita
  ON ita.actor_id = ta.actor_id
JOIN incidents AS i
  ON i.incident_id = ita.incident_id
WHERE ta.actor_id = $1
ORDER BY i.reported_date DESC, i.incident_id DESC;
```

## 10. Monthly Incident Statistics

Resolved statistics use both terminal workflow states, `Resolved` and `Closed`. Average resolution time includes only rows with a `resolved_date`.

**Demonstrates:** `SELECT`, `GROUP BY`, `ORDER BY`, aggregate `COUNT` and `AVG`, PostgreSQL `FILTER`, date arithmetic.

```sql
SELECT
    DATE_TRUNC('month', i.reported_date) AS report_month,
    COUNT(*) AS total_incidents,
    COUNT(*) FILTER (
        WHERE i.status IN ('Resolved', 'Closed')
    ) AS resolved_or_closed_incidents,
    COUNT(*) FILTER (
        WHERE i.status NOT IN ('Resolved', 'Closed')
    ) AS active_incidents,
    ROUND(
        (
            AVG(
                EXTRACT(EPOCH FROM (i.resolved_date - i.reported_date)) / 3600.0
            ) FILTER (WHERE i.resolved_date IS NOT NULL)
        )::numeric,
        2
    ) AS average_resolution_hours
FROM incidents AS i
GROUP BY DATE_TRUNC('month', i.reported_date)
ORDER BY report_month;
```

## 11. INSERT, SELECT, UPDATE, DELETE, And Transaction Demonstration

This self-cleaning demonstration creates a temporary lookup row, reads and changes it, then deletes it in one atomic transaction. The final `COMMIT` leaves no demonstration row behind. Use a non-production database.

**Demonstrates:** `BEGIN`, `INSERT`, `SELECT`, `UPDATE`, `DELETE`, `RETURNING`, `COMMIT`.

```sql
BEGIN;

INSERT INTO incident_types (name, description)
VALUES (
    'Transaction Demonstration Type',
    'Temporary row used to demonstrate an atomic INSERT.'
)
RETURNING type_id, name, description;

SELECT type_id, name, description
FROM incident_types
WHERE name = 'Transaction Demonstration Type';

UPDATE incident_types
SET description = 'Temporary row changed by the UPDATE demonstration.'
WHERE name = 'Transaction Demonstration Type'
RETURNING type_id, name, description;

DELETE FROM incident_types
WHERE name = 'Transaction Demonstration Type'
RETURNING type_id, name;

COMMIT;
```

If any statement fails, PostgreSQL marks the transaction as failed; issue `ROLLBACK` instead of `COMMIT` before continuing.

## SQL Feature Index

| Required demonstration | Location |
|---|---|
| `INSERT` | Query 11 |
| `SELECT` | Queries 1-11 |
| `UPDATE` | Query 11 |
| `DELETE` | Query 11 |
| `JOIN` | Queries 1-9 |
| `GROUP BY` | Queries 5, 7, and 10 |
| `ORDER BY` | Queries 1-10 |
| Aggregate functions | Query 5 (`COUNT`), Query 6 (`MAX`), Query 7 (`MIN`), Query 10 (`COUNT`, `AVG`) |
| Transaction control | Query 11 (`BEGIN`, `COMMIT`; `ROLLBACK` on failure) |
