# Database Normalization (1NF, 2NF, 3NF)

**Project**: Cybersecurity Incident Management System (CIMS)  
**Academic Level**: 5th Semester B.Tech / B.E. Computer Science & Engineering (DBMS Evaluation)  
**Database**: PostgreSQL 16 (Authoritative Relational Store)  

> [!NOTE]
> For the complete tabular layout with sample data records, junction tables, and joined SQL views matching evaluation sheets, refer to [NORMALIZATION_TABLES.md](file:///e:/DBMS%20PROJECT%205th%20SEM/docs/NORMALIZATION_TABLES.md) and [DBMS_ANALYSIS.md](file:///e:/DBMS%20PROJECT%205th%20SEM/docs/DBMS_ANALYSIS.md).

---

## 1. First Normal Form (1NF)

### Academic Definition
A relation is in **First Normal Form (1NF)** if:
1. Every attribute contains only **atomic** (indivisible) values.
2. There are **no repeating groups** or multivalued arrays stored within a single row.
3. Each record is uniquely identified by a Primary Key.

### Application in CIMS
In unnormalized systems, an incident record frequently stores comma-separated strings for affected assets, assigned analysts, or IP addresses (e.g. `affected_assets: "10, 24"`, `analysts: "Maya, Noah"`).

**How CIMS Satisfies 1NF**:
- Delimited text strings are completely eliminated.
- Every asset relationship is stored as an individual row in `incident_assets`.
- Every analyst assignment is stored as an individual row in `incident_assignment`.
- Every investigative step is stored as a discrete tuple in `actions`.
- In `assets`, `ip_address` stores exactly one IPv4 or IPv6 string, backed by an RFC-compliant regex validator and unique index.

---

## 2. Second Normal Form (2NF)

### Academic Definition
A relation is in **Second Normal Form (2NF)** if:
1. It is in First Normal Form (1NF).
2. It has **no partial functional dependencies**—every non-prime attribute is fully functionally dependent on the *entire* candidate key.

*Note*: In tables with a single-column primary key, partial dependencies cannot exist. 2NF specifically governs tables with **composite candidate keys**.

### Application in CIMS (Junction Tables)
- **`incident_assets`**:
  - Composite Key: `(incident_id, asset_id)`
  - Non-Key Attribute: `impact_type` (e.g., `"Credentials targeted"`, `"Endpoint compromised"`)
  - Dependency: $\{ \text{incident\_id}, \text{asset\_id} \} \to \text{impact\_type}$. `impact_type` describes how that specific asset was affected during that specific incident; it does not depend on `asset_id` alone or `incident_id` alone.
- **`incident_threat_actors`**:
  - Composite Key: `(incident_id, actor_id)`
  - Non-Key Attributes: *None* (all attributes are part of the primary key).
- **`incident_assignment`**:
  - Surrogate Key `assignment_id` with a database-enforced unique constraint on `(incident_id, analyst_id)`. Non-key attributes `role` and `assigned_date` depend fully on the assignment.

---

## 3. Third Normal Form (3NF)

### Academic Definition
A relation is in **Third Normal Form (3NF)** if:
1. It is in Second Normal Form (2NF).
2. There are **no transitive functional dependencies**—no non-prime attribute is functionally dependent on another non-prime attribute ($X \to Y$ and $Y \to Z$).

### Application in CIMS (Lookup & Identity Separation)
Non-key attributes describe *only* their table's primary key:

1. **Incident Classifications (`incident_types`)**:
   - `type_id \to (\text{name}, \text{description})` is isolated in `incident_types`.
   - `incidents.type_id` references `incident_types.type_id` via foreign key with `ON DELETE RESTRICT`.
   - Prevents update anomalies if a category description changes.
2. **Severity and SLA Policies (`severity`)**:
   - `severity_id \to (\text{level}, \text{response\_sla\_hours}, \text{resolution\_sla\_hours})` is isolated in `severity`.
   - Prevents inconsistent SLA definitions across incidents.
3. **Analyst Workload Separation (`users` vs. `analysts`)**:
   - `users` stores core identity, authentication hashes, and roles.
   - `analysts` stores SOC-specific operational fields (`expertise`, `workload`) in a 1:1 relationship with `ON DELETE CASCADE`.
   - Prevents nullable operational columns for general employees or administrators.
4. **Asset Inventory (`assets`)**:
   - Asset metadata (`name`, `type`, `department`, `ip_address`) belongs exclusively to `assets`, rather than being duplicated inside incident or junction tables.

---

## 4. Anomaly Elimination Summary

| Anomaly Type | Unnormalized Risk | CIMS 3NF Protection |
|---|---|---|
| **Insertion Anomaly** | Cannot create a new incident type or severity SLA policy without first creating an incident. | `incident_types` and `severity` exist independently; new categories can be added anytime. |
| **Update Anomaly** | Changing an asset's IP or an analyst's name requires updating hundreds of incident rows. | Updated in exactly 1 row in `assets` or `users`; all relational views reflect the change immediately. |
| **Deletion Anomaly** | Deleting an incident permanently erases the associated asset record or threat actor intelligence. | `ON DELETE RESTRICT` on master tables protects organizational assets and threat intelligence catalogs. |
