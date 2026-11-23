# CIMS – Database Normalization Tables

**Project**: Cybersecurity Incident Management System (CIMS)  
**Academic Level**: 5th Semester B.Tech / B.E. Computer Science & Engineering (DBMS Evaluation)  
**Engine**: PostgreSQL 16 (Relational Source of Truth)  

---

## 1. Unnormalized Form (UNF)

In an unnormalized design, an incident report stores all associated attributes—including multiple affected assets, multiple assigned analysts, threat intelligence, and SLA parameters—within a single monolithic structure containing **repeating groups** and **non-atomic delimited strings**.

### UNNORMALIZED INCIDENT RECORD

| Incident ID | Title | Reporter Name | Reporter Dept | Category / Type | Category Description | Severity Level | Response SLA (Hrs) | Resolution SLA (Hrs) | Affected Asset IDs | Affected Asset Names & IP Addresses | Impact Types | Assigned Analyst IDs | Assigned Analyst Names & Roles | Threat Actor IDs | Threat Actor Aliases |
|:---:|---|---|---|---|---|:---:|:---:|:---:|---|---|---|---|---|---|---|
| **1** | Payroll credential phishing | Isha Rao | Finance | Phishing | Deceptive messages used to steal credentials. | High | 2 | 24 | 3 | Finance Laptop 24 (10.30.5.24) | Credentials targeted | 2 | Maya Singh (Primary Analyst) | 1 | Unknown Credential Harvester |
| **2** | Malware on finance laptop | Isha Rao | Finance | Malware | Malicious software detected on a managed endpoint. | Critical | 1 | 8 | 3, 5 | Finance Laptop 24 (10.30.5.24), Corporate LAN (10.30.0.0/16) | Endpoint compromised, Lateral pivot attempt | 2, 3 | Maya Singh (Primary Analyst), Noah Fernandes (Forensic Specialist) | 2 | Night Sparrow |
| **3** | Repeated VPN login failures | Vikram Shah | Engineering | Unauthorized Access | Access performed without valid authorization. | High | 2 | 24 | 4, 5 | Edge Firewall (10.20.0.1), Corporate LAN (10.30.0.0/16) | Target of brute-force, Ingress segment | 2 | Maya Singh (Identity Specialist) | 1, 3 | Unknown Credential Harvester, External Scanner |
| **4** | Web application SQL injection | Vikram Shah | Engineering | SQL Injection | Malicious SQL submitted through an application. | Critical | 1 | 8 | 1, 2 | Public Web Server (10.20.1.10), Customer Database (10.20.2.15) | Application targeted, Database target | 3 | Noah Fernandes (Forensic Analyst) | 2, 3 | Night Sparrow, External Scanner |

---

### Anomalies Inherent in the Unnormalized Record

1. **First Normal Form (1NF) Violation**:
   * Repeating groups and multi-valued comma-separated lists (`Affected Asset IDs`, `Assigned Analyst Names`, `Threat Actor IDs`) prevent atomic relational indexing, relational integrity, and standard SQL querying.
2. **Second Normal Form (2NF) Violation**:
   * Attributes such as `Category Description`, `Response SLA`, and `Reporter Dept` depend on individual components of the case rather than the composite relationship between incidents, assets, and threat actors.
3. **Third Normal Form (3NF) Violation**:
   * Transitive dependencies exist: $\text{Category / Type} \to \text{Category Description}$ and $\text{Severity Level} \to (\text{Response SLA}, \text{Resolution SLA})$. If an SLA policy changes, every historical incident row must be modified, causing update anomalies.

---

## 2. Normalized Relational Tables (1NF, 2NF, 3NF)

To achieve **Third Normal Form (3NF)** without data loss or spurious tuples, the unnormalized record is decomposed into **12 relational tables** with explicit Primary Keys (`PK`), Foreign Keys (`FK`), Unique Constraints (`UQ`), and Junction Tables (`PK, FK`).

---

### Table 1: INCIDENTS

*Represents the core incident entity and its lifecycle state.*

| Incident ID (PK) | Title | Description | Type ID (FK) | Severity ID (FK) | Reported By (FK) | Status | Reported Date | Resolved Date |
|:---:|---|---|:---:|:---:|:---:|:---:|---|---|
| **1** | Payroll credential phishing | Several finance employees received a fake payroll sign-in page. | 1 | 3 | 4 | Under Investigation | 2026-11-22 19:15:00+00 | *NULL* |
| **2** | Malware on finance laptop | Endpoint protection detected a trojan downloading additional payloads. | 2 | 4 | 4 | In Progress | 2026-11-22 23:15:00+00 | *NULL* |
| **3** | Repeated VPN login failures | Multiple failed logins were followed by one successful foreign login. | 5 | 3 | 5 | Assigned | 2026-11-23 00:15:00+00 | *NULL* |
| **4** | Web application SQL injection | Database error patterns and UNION payloads appeared in access logs. | 4 | 4 | 5 | Resolved | 2026-11-22 10:15:00+00 | 2026-11-22 11:15:00+00 |
| **5** | Internal port scanning | A workstation scanned privileged network segments overnight. | 3 | 2 | 5 | Open | 2026-11-23 01:15:00+00 | *NULL* |

---

### Table 2: INCIDENT_TYPES

*Lookup entity standardizing incident classifications (removes transitive dependency).*

| Type ID (PK) | Name (UQ) | Description |
|:---:|---|---|
| **1** | Phishing | Deceptive messages used to steal credentials. |
| **2** | Malware | Malicious software detected on a managed endpoint. |
| **3** | Network Intrusion | Unauthorized activity within the network. |
| **4** | SQL Injection | Malicious SQL submitted through an application. |
| **5** | Unauthorized Access | Access performed without valid authorization. |

---

### Table 3: SEVERITY

*Lookup entity defining SLA policy thresholds (removes transitive dependency).*

| Severity ID (PK) | Level (UQ) | Response SLA Hours | Resolution SLA Hours |
|:---:|---|:---:|:---:|
| **1** | Low | 24 | 120 |
| **2** | Medium | 8 | 72 |
| **3** | High | 2 | 24 |
| **4** | Critical | 1 | 8 |

---

### Table 4: ASSETS

*Catalog of organizational hardware, infrastructure, and network assets.*

| Asset ID (PK) | Name | Type | IP Address (UQ) | Department |
|:---:|---|---|---|---|
| **1** | Public Web Server | Web Server | 10.20.1.10 | Engineering |
| **2** | Customer Database | Database Server | 10.20.2.15 | Engineering |
| **3** | Finance Laptop 24 | Employee Laptop | 10.30.5.24 | Finance |
| **4** | Edge Firewall | Firewall | 10.20.0.1 | Information Security |
| **5** | Corporate LAN | Internal Network | 10.30.0.0/16 | IT Operations |

---

### Table 5: USERS

*Authenticated identities across all system roles.*

| User ID (PK) | Name | Email (UQ) | Role | Department | Created At |
|:---:|---|---|:---:|---|---|
| **1** | Aarav Mehta | admin@cims.edu | ADMIN | Information Security | 2026-11-22 11:08:00+00 |
| **2** | Maya Singh | maya.analyst@cims.edu | ANALYST | Security Operations | 2026-11-22 11:08:00+00 |
| **3** | Noah Fernandes | noah.analyst@cims.edu | ANALYST | Security Operations | 2026-11-22 11:08:00+00 |
| **4** | Isha Rao | reporter@cims.edu | REPORTER | Finance | 2026-11-22 11:08:00+00 |
| **5** | Vikram Shah | vikram.reporter@cims.edu | REPORTER | Engineering | 2026-11-22 11:08:00+00 |

---

### Table 6: ANALYSTS

*1:1 subtype extension storing analyst operational workload and specialization.*

| User ID (PK, FK) | Expertise | Workload |
|:---:|---|:---:|
| **2** | Phishing and identity security | 3 |
| **3** | Malware and network forensics | 2 |

---

### Table 7: THREAT_ACTORS

*Master threat intelligence catalog tracking external adversaries and threat groups.*

| Actor ID (PK) | Alias (UQ) | Description |
|:---:|---|---|
| **1** | Unknown Credential Harvester | Unattributed actor operating deceptive phishing pages. |
| **2** | Night Sparrow | Demonstration ransomware affiliate group. |
| **3** | External Scanner | Unattributed automated reconnaissance source. |

---

### Table 8: ACTIONS

*Chronological investigation timeline entries logged by analysts.*

| Action ID (PK) | Incident ID (FK) | Performed By (FK) | Description | Action Date |
|:---:|:---:|:---:|---|---|
| **1** | 1 | 2 | Blocked fraudulent sender domain on corporate mail exchange. | 2026-11-22 19:45:00+00 |
| **2** | 2 | 2 | Isolated finance workstation from local VLAN via switch port shutdown. | 2026-11-22 23:35:00+00 |
| **3** | 2 | 3 | Captured volatile memory for malware artifact analysis. | 2026-11-22 23:50:00+00 |
| **4** | 4 | 3 | Identified vulnerable input field on endpoint `/api/search` and deployed WAF rule. | 2026-11-22 10:45:00+00 |

---

### Table 9: AUDIT_LOGS

*Cryptographically chained (SHA-256) immutable ledger of all state mutations.*

| Log ID (PK) | Incident ID (FK) | Performed By (FK) | Action Type | Hash (UQ) | Prev Hash | Timestamp |
|:---:|:---:|:---:|:---:|---|---|---|
| **1** | 1 | 4 | INCIDENT_CREATED | `e3b0c44298fc1c14...` | `0000000000000000...` | 2026-11-22 19:15:00+00 |
| **2** | 1 | 1 | INCIDENT_ASSIGNED | `7a8b9c0d1e2f3a4b...` | `e3b0c44298fc1c14...` | 2026-11-22 19:40:00+00 |
| **3** | 1 | 2 | ACTION_ADDED | `f5e4d3c2b1a09876...` | `7a8b9c0d1e2f3a4b...` | 2026-11-22 19:45:00+00 |

---

## 3. Junction Tables (Resolving Many-to-Many Relationships)

Junction tables implement Many-to-Many ($M:N$) associations while ensuring **Second Normal Form (2NF)** compliance by eliminating partial functional dependencies.

---

### Table 10: INCIDENT_ASSETS

*Resolves $M:N$ relationship between Incidents and Assets.*

| Incident ID (PK, FK) | Asset ID (PK, FK) | Impact Type |
|:---:|:---:|---|
| **1** | 3 | Credentials targeted |
| **2** | 3 | Endpoint compromised |
| **2** | 5 | Lateral pivot attempt |
| **3** | 4 | Target of brute-force |
| **3** | 5 | Ingress segment |
| **4** | 1 | Application targeted |
| **4** | 2 | Database target |

> **2NF Analysis**: The non-prime attribute `Impact Type` describes the exact consequence of an incident on a specific asset. It depends fully on both candidate keys: $\{\text{Incident ID}, \text{Asset ID}\} \to \text{Impact Type}$. It does not depend on `Incident ID` alone nor on `Asset ID` alone. Therefore, no partial dependency exists.

---

### Table 11: INCIDENT_ASSIGNMENT

*Resolves $M:N$ relationship between Incidents and Analysts.*

| Assignment ID (PK) | Incident ID (FK) | Analyst ID (FK) | Assigned Date | Role |
|:---:|:---:|:---:|---|---|
| **1** | 1 | 2 | 2026-11-22 19:45:00+00 | Primary Analyst |
| **2** | 2 | 2 | 2026-11-22 23:35:00+00 | Primary Analyst |
| **3** | 2 | 3 | 2026-11-22 23:40:00+00 | Forensic Specialist |
| **4** | 3 | 2 | 2026-11-23 00:30:00+00 | Identity Specialist |
| **5** | 4 | 3 | 2026-11-22 10:25:00+00 | Forensic Analyst |

> **2NF Analysis**: Uses surrogate key `Assignment ID` backed by a unique constraint on `(Incident ID, Analyst ID)`. Non-prime attributes `Role` and `Assigned Date` depend fully on the assignment entity.

---

### Table 12: INCIDENT_THREAT_ACTORS

*Resolves $M:N$ relationship between Incidents and Threat Actors.*

| Incident ID (PK, FK) | Actor ID (PK, FK) |
|:---:|:---:|
| **1** | 1 |
| **2** | 2 |
| **3** | 1 |
| **3** | 3 |
| **4** | 2 |
| **4** | 3 |

> **2NF Analysis**: Composite primary key `(Incident ID, Actor ID)` has zero non-prime attributes. It is inherently in 2NF.

---

## 4. Denormalized / Joined Views (with Entity Names)

These relational queries illustrate how normalized tables combine at query time to generate comprehensive operational views without storing redundant data on disk.

---

### View 1: INCIDENT_ASSETS (with Incident and Asset Names)

*Derived via:*  
`SELECT ia.incident_id, i.title, ia.asset_id, a.name, a.ip_address, ia.impact_type FROM incident_assets ia JOIN incidents i ON ia.incident_id = i.incident_id JOIN assets a ON ia.asset_id = a.asset_id;`

| Incident ID | Incident Title | Asset ID | Asset Name | IP Address | Impact Type |
|:---:|---|:---:|---|---|---|
| **1** | Payroll credential phishing | 3 | Finance Laptop 24 | 10.30.5.24 | Credentials targeted |
| **2** | Malware on finance laptop | 3 | Finance Laptop 24 | 10.30.5.24 | Endpoint compromised |
| **2** | Malware on finance laptop | 5 | Corporate LAN | 10.30.0.0/16 | Lateral pivot attempt |
| **3** | Repeated VPN login failures | 4 | Edge Firewall | 10.20.0.1 | Target of brute-force |
| **3** | Repeated VPN login failures | 5 | Corporate LAN | 10.30.0.0/16 | Ingress segment |
| **4** | Web application SQL injection | 1 | Public Web Server | 10.20.1.10 | Application targeted |
| **4** | Web application SQL injection | 2 | Customer Database | 10.20.2.15 | Database target |

---

### View 2: INCIDENT_ASSIGNMENT (with Incident and Analyst Names)

*Derived via:*  
`SELECT ia.incident_id, i.title, ia.analyst_id, u.name, ia.role, ia.assigned_date FROM incident_assignment ia JOIN incidents i ON ia.incident_id = i.incident_id JOIN users u ON ia.analyst_id = u.user_id;`

| Incident ID | Incident Title | Analyst ID | Analyst Name | Role | Assigned Date |
|:---:|---|:---:|---|---|---|
| **1** | Payroll credential phishing | 2 | Maya Singh | Primary Analyst | 2026-11-22 19:45:00+00 |
| **2** | Malware on finance laptop | 2 | Maya Singh | Primary Analyst | 2026-11-22 23:35:00+00 |
| **2** | Malware on finance laptop | 3 | Noah Fernandes | Forensic Specialist | 2026-11-22 23:40:00+00 |
| **3** | Repeated VPN login failures | 2 | Maya Singh | Identity Specialist | 2026-11-23 00:30:00+00 |
| **4** | Web application SQL injection | 3 | Noah Fernandes | Forensic Analyst | 2026-11-22 10:25:00+00 |

---

### View 3: INCIDENT_THREAT_ACTORS (with Incident and Threat Actor Names)

*Derived via:*  
`SELECT ita.incident_id, i.title, ita.actor_id, ta.alias, ta.description FROM incident_threat_actors ita JOIN incidents i ON ita.incident_id = i.incident_id JOIN threat_actors ta ON ita.actor_id = ta.actor_id;`

| Incident ID | Incident Title | Actor ID | Threat Actor Alias | Threat Group Description |
|:---:|---|:---:|---|---|
| **1** | Payroll credential phishing | 1 | Unknown Credential Harvester | Unattributed actor operating deceptive phishing pages. |
| **2** | Malware on finance laptop | 2 | Night Sparrow | Demonstration ransomware affiliate group. |
| **3** | Repeated VPN login failures | 1 | Unknown Credential Harvester | Unattributed actor operating deceptive phishing pages. |
| **3** | Repeated VPN login failures | 3 | External Scanner | Unattributed automated reconnaissance source. |
| **4** | Web application SQL injection | 2 | Night Sparrow | Demonstration ransomware affiliate group. |
| **4** | Web application SQL injection | 3 | External Scanner | Unattributed automated reconnaissance source. |

---

## 5. Summary of Normalization Advantages

| Normalization Level | Anomaly Addressed | CIMS Technical Implementation |
|---|---|---|
| **1NF** | Repeating groups, multivalued string arrays, non-atomic fields. | Replaces delimited strings (`"10, 24"`) with dedicated atomic tuples in `INCIDENT_ASSETS`, `INCIDENT_ASSIGNMENT`, and `ACTIONS`. |
| **2NF** | Partial functional dependencies on composite candidate keys. | Separates asset attributes (`name`, `ip_address`) into `ASSETS`, leaving only the relational attribute `Impact Type` in `INCIDENT_ASSETS`. |
| **3NF** | Transitive functional dependencies ($A \to B \to C$). | Extracts incident categories into `INCIDENT_TYPES` and SLA rules into `SEVERITY`. Updating an SLA modifies exactly 1 row in `SEVERITY`. |
