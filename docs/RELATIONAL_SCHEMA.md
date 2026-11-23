# Relational Schema

```text
USERS(user_id PK, name, email UQ, password_hash, role, department, created_at)
  1 ---- 0..1 ANALYSTS(user_id PK/FK, expertise, workload)
  1 ---- * INCIDENTS(reported_by FK)
  1 ---- * ACTIONS(performed_by FK)
  1 ---- * AUDIT_LOGS(performed_by FK)

INCIDENT_TYPES(type_id PK, name UQ, description)
  1 ---- * INCIDENTS(type_id FK)

SEVERITY(severity_id PK, level UQ, response_sla_hours, resolution_sla_hours)
  1 ---- * INCIDENTS(severity_id FK)

INCIDENTS(incident_id PK, title, description, type_id FK, severity_id FK,
          reported_by FK, status, reported_date, resolved_date)
  1 ---- * ACTIONS(action_id PK, incident_id FK, performed_by FK,
                  description, action_date)
  1 ---- * AUDIT_LOGS(log_id PK, incident_id FK, performed_by FK,
                     action_type, action_data, hash UQ, prev_hash, timestamp)

INCIDENTS * ---- * ASSETS(asset_id PK, name, type, ip_address UQ, department)
  via INCIDENT_ASSETS(incident_id PK/FK, asset_id PK/FK, impact_type)

INCIDENTS * ---- * ANALYSTS
  via INCIDENT_ASSIGNMENT(assignment_id PK, incident_id FK, analyst_id FK,
                          assigned_date, role)

INCIDENTS * ---- * THREAT_ACTORS(actor_id PK, alias UQ, description)
  via INCIDENT_THREAT_ACTORS(incident_id PK/FK, actor_id PK/FK)
```

The schema contains exactly the twelve requested relational tables. Security log documents are intentionally outside this diagram because they live in MongoDB.
