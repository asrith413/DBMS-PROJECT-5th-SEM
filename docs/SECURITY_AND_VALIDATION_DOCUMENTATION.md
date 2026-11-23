# CIMS – Security and Validation Documentation

**Date**: November 23, 2026  
**Authors**: CIMS Engineering Team  
**Project**: Cybersecurity Incident Management System (CIMS)  
**Academic Level**: 5th Semester B.Tech / B.E. Computer Science & Engineering  

---

## 1. Introduction

The **Cybersecurity Incident Management System (CIMS)** is an operational Security Operations Center (SOC) platform where security analysts, incident responders, and organizational employees register security incidents, triage operational threats, correlate asset inventories, log diagnostic investigation actions, ingest unstructured security event telemetry, and maintain tamper-evident audit trails.

Because CIMS handles critical system accounts, authentication credentials, incident lifecycle states, sensitive threat intelligence profiles, and audit records, it implements **11 defense-in-depth security and validation mechanisms** spanning the database, API middleware, and client application layers.

---

## 2. Overview of Implementations

| No. | Feature | Group | Implementation File |
|:---:|---|---|---|
| **1** | **Password Hashing** | Authentication and access control | `backend/app/services/auth_service.py` |
| **2** | **Password Verification** | Authentication and access control | `backend/app/routers/auth.py` |
| **3** | **Authentication and RBAC** | Authentication and access control | `backend/app/dependencies.py` |
| **4** | **Admin-Only & Role-Based Route Protection** | Authentication and access control | `backend/app/routers/reports.py`, `backend/app/routers/threat_actors.py` |
| **5** | **Bearer Token Protocol & Session Isolation** | Request and browser security | `frontend-web/src/services/api.js`, `backend/app/services/auth_service.py` |
| **6** | **HTTP Security Headers & CORS Policy** | Request and browser security | `backend/app/main.py` |
| **7** | **Input & Schema Validation** | Input and registration validation | `backend/app/schemas/incidents.py`, `backend/app/schemas/security_logs.py` |
| **8** | **Registration & User Field Validation** | Input and registration validation | `backend/app/schemas/users.py`, `backend/app/routers/users.py` |
| **9** | **Duplicate Email & Unique IP Prevention** | Input and registration validation | `backend/app/models/entities.py`, `backend/app/routers/users.py` |
| **10** | **Registration Role Restriction** | Input and registration validation | `backend/app/models/entities.py`, `backend/app/routers/users.py` |
| **11** | **Database Integrity Constraints** | Database integrity | `backend/app/models/entities.py` |

---

## 3. Authentication and Access Control

Passwords are never stored in plain text, and only authenticated users possessing the necessary role authorizations can reach protected API endpoints and user interface views.

### 3.1 Password Hashing

`backend/app/services/auth_service.py`: Passwords are cryptographically hashed prior to persistent storage in the PostgreSQL `users` table. Only the salted, iterated hash is stored, so a database leak or backup exposure never reveals plain-text user passwords.

CIMS utilizes **Argon2id** (the winner of the Password Hashing Competition) configured through `pwdlib`:

```python
# backend/app/services/auth_service.py
from pwdlib import PasswordHash

# Configures recommended Argon2id parameters (m=65536, t=3, p=4)
password_hasher = PasswordHash.recommended()

def hash_password(password: str) -> str:
    return password_hasher.hash(password)
```

*Screenshot placeholder: Password hashing function in `auth_service.py` and Argon2id hash format in database table `users`.*

---

### 3.2 Password Verification

`backend/app/routers/auth.py`: When a user attempts authentication, the incoming plaintext password is verified against the securely stored hash. A mismatch immediately denies access and returns a standardized error.

```python
# backend/app/routers/auth.py
from app.services.auth_service import verify_password

user = db.scalar(select(User).where(User.email == credentials.username.strip().lower()))
if user is None or not verify_password(credentials.password, user.password_hash):
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )
```

*Screenshot placeholder: Verification logic in the `/auth/login` route and failed login notification.*

---

### 3.3 Authentication and Role-Based Access Control (RBAC)

`backend/app/dependencies.py`: The `require_roles()` dependency factory validates that the incoming JWT token belongs to an active user and verifies that their role permits the requested action.

```python
# backend/app/dependencies.py
def require_roles(*allowed_roles: Role) -> Callable[[User], User]:
    def role_dependency(current_user: CurrentUser) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this operation.",
            )
        if (
            current_user.role == Role.ANALYST
            and Role.ANALYST in allowed_roles
            and current_user.analyst_profile is None
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="An active analyst profile is required.",
            )
        return current_user

    return role_dependency
```

**Demo**: Call the Admin SOC overview dashboard endpoint (`GET /reports/dashboard`) using a `REPORTER` token. The server rejects the request with **HTTP 403 Forbidden**.

```json
{
  "detail": "You do not have permission to perform this operation."
}
```

*Screenshot placeholder: `require_roles()` dependency and the rejected reporter request in the Network tab.*

---

### 3.4 Admin-Only Route Protection

`backend/app/routers/reports.py` & `backend/app/routers/threat_actors.py`: Sensitive operational endpoints—including cross-organization metrics, analyst assignments, user provisioning, and threat actor intelligence catalogs—are restricted strictly to administrators using `AdminUser`:

```python
# backend/app/dependencies.py
AdminUser = Annotated[User, Depends(require_roles(Role.ADMIN))]
AdminOrAnalyst = Annotated[User, Depends(require_roles(Role.ADMIN, Role.ANALYST))]

# backend/app/routers/reports.py
@router.get("/dashboard", response_model=DashboardReportRead)
def get_dashboard_report(
    admin_user: AdminUser,
    db: DatabaseSession,
) -> DashboardReportRead:
    return build_dashboard_report(db)
```

Reporters and general users cannot view or modify administrative configurations.

*Screenshot placeholder: `AdminUser` annotation protecting SOC metrics routes.*

---

## 4. Request and Browser Security

### 4.1 Bearer Token Protocol & Session Storage

`frontend-web/src/services/api.js`: After successful authentication, stateless JSON Web Tokens (JWT) are stored in browser `sessionStorage` rather than `localStorage`. This limits token persistence strictly to the active browser tab session.

State-changing requests transmit the token via the `Authorization: Bearer <token>` header. If the token expires or becomes invalid, Axios response interceptors immediately wipe local session storage and dispatch an unauthorized event:

```javascript
// frontend-web/src/services/api.js
http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('cims_access_token');
      sessionStorage.removeItem('cims_current_user');
      window.dispatchEvent(new CustomEvent('cims:unauthorized'));
    }
    return Promise.reject(normalizeApiError(error));
  }
);
```

**Demo**: Send an API request without a token or with a corrupted signature. The server immediately returns **HTTP 401 Unauthorized**.

*Screenshot placeholder: Axios interceptor and automatic redirection to `/login` upon 401 response.*

---

### 4.2 HTTP Security Headers and CORS Policy

`backend/app/main.py`: Cross-Origin Resource Sharing (CORS) and browser response security policies are strictly configured to prevent clickjacking, unauthorized embedding, and cross-site data theft.

| Header / Directive | Value | Security Purpose |
|---|---|---|
| **`allow_origins`** | Explicit origins (e.g. `http://localhost:5173`, `http://localhost:8501`) | Restricts frontend origins permitted to execute cross-origin requests. |
| **`allow_credentials`** | `True` | Ensures credentialed requests are guarded against arbitrary domain origins. |
| **`X-Content-Type-Options`** | `nosniff` | Stops MIME-type sniffing attacks. |
| **`X-Frame-Options`** | `DENY` | Prevents framing and clickjacking attacks. |
| **`Cache-Control`** | `no-store, no-cache, must-revalidate` | Prevents intermediate proxies from caching sensitive security records. |

**Demo**: In Google Chrome, press `F12`, open the **Network** tab, reload the page, select any API request, and inspect **Response Headers**.

*Screenshot placeholder: CORS and HTTP security headers visible in Chrome Developer Tools.*

---

## 5. Input and Registration Validation

### 5.1 Input Validation

`backend/app/schemas/incidents.py` & `backend/app/schemas/security_logs.py`: All inbound API request bodies are parsed and validated by **Pydantic v2** models before reaching the database layer:

* **String Boundaries**: Enforces minimum and maximum lengths to prevent buffer exhaustion and malformed entries.
* **Positive Numeric Identifiers**: Ensures foreign key references (`type_id`, `severity_id`, `incident_id`) are greater than zero.
* **IP Address Format Validation**: Uses Python's native `ipaddress.ip_address` library to reject malformed octets and illegal address notations.

```python
# backend/app/schemas/security_logs.py
from ipaddress import ip_address
from pydantic import Field, field_validator

class SecurityLogCreate(RequestModel):
    incident_id: int = Field(gt=0)
    source: str = Field(min_length=2, max_length=100)
    event_type: str = Field(min_length=2, max_length=100)
    source_ip: str | None = Field(default=None, max_length=45)
    destination_ip: str | None = Field(default=None, max_length=45)
    severity: str = Field(min_length=2, max_length=20)
    description: str = Field(min_length=3, max_length=5000)

    @field_validator("source_ip", "destination_ip")
    @classmethod
    def validate_ip(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        try:
            ip_address(value)
        except ValueError as error:
            raise ValueError("Must be a valid IP address.") from error
        return value
```

**Demo**: Submit an invalid IP address such as `"999.300.1.1"` or an incident title with 1 character. The API immediately returns **HTTP 422 Unprocessable Entity**.

*Screenshot placeholder: Pydantic validation functions and rejected malformed payload response.*

---

### 5.2 Registration and User Field Validation

`backend/app/schemas/users.py`: User creation requires strict syntax validation for full names, corporate email addresses, and roles:

```python
# backend/app/schemas/users.py
class UserCreate(RequestModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: Role = Field(default=Role.REPORTER)
    department: str | None = Field(default=None, max_length=120)
```

*Screenshot placeholder: User validation schemas in `backend/app/schemas/users.py`.*

---

### 5.3 Duplicate Email and Resource Prevention

`backend/app/routers/users.py` & `backend/app/models/entities.py`: The user creation route actively checks for existing email collisions, and a database-level unique constraint prevents race-condition duplicates:

```python
# backend/app/models/entities.py
class User(Base):
    __tablename__ = "users"
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
```

If an existing email is submitted, the API catches the conflict and responds with **HTTP 409 Conflict**:

```python
# backend/app/routers/users.py
existing_user = db.scalar(select(User).where(User.email == payload.email.lower()))
if existing_user is not None:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")
```

*Screenshot placeholder: Duplicate email conflict detection and unique constraint declaration.*

---

### 5.4 Registration Role Restriction

`backend/app/models/entities.py`: The system enforces a strict enumeration of allowed roles (`ADMIN`, `ANALYST`, `REPORTER`). Users cannot assign themselves arbitrary administrative roles.

```python
# backend/app/models/entities.py
class Role(str, Enum):
    ADMIN = "ADMIN"
    ANALYST = "ANALYST"
    REPORTER = "REPORTER"

class User(Base):
    role: Mapped[Role] = mapped_column(
        SqlEnum(Role, name="role_enum", native_enum=False, create_constraint=True),
        nullable=False,
        default=Role.REPORTER,
    )
```

*Screenshot placeholder: Role enumeration definition and check constraint in SQLAlchemy model.*

---

## 6. Database Constraints

**Implementation File**: `backend/app/models/entities.py`

**Objective**: Maintain operational and referential data integrity by enforcing rules directly inside the PostgreSQL 16 database engine, ensuring that invalid records are rejected even if application logic fails or is bypassed.

| Constraint Type | Example in CIMS | What It Guarantees |
|---|---|---|
| **Unique** | `email` on `users`<br>`ip_address` on `assets`<br>`alias` on `threat_actors`<br>`(incident_id, analyst_id)` on `incident_assignment` | Prevents duplicate user accounts, IP address collisions, redundant threat actor aliases, and duplicate analyst assignments on the same incident. |
| **Foreign Key** | `type_id` on `incidents`<br>`severity_id` on `incidents`<br>`reported_by` on `incidents`<br>`performed_by` on `actions` | Enforces referential integrity. Child records always point to valid parent records in master tables. |
| **Check (SLAs)** | `response_sla_hours > 0`<br>`resolution_sla_hours >= response_sla_hours` | Prevents negative or zero SLA response intervals and ensures resolution SLA is never shorter than response SLA. |
| **Check (Workload)** | `workload >= 0` on `analysts` | Prevents active analyst case counts from ever decrementing below zero. |
| **Check (Lifecycle)** | `resolved_date IS NULL OR resolved_date >= reported_date` | Guarantees an incident cannot be marked resolved prior to its creation timestamp. |

---

### A. Unique Constraints

```python
# backend/app/models/entities.py
email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)

ip_address: Mapped[str | None] = mapped_column(String(45), unique=True)

alias: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)

__table_args__ = (
    UniqueConstraint(
        "incident_id",
        "analyst_id",
        name="uq_incident_assignment_incident_analyst_once",
    ),
)
```

---

### B. Foreign Key Constraints

```python
# backend/app/models/entities.py
type_id: Mapped[int] = mapped_column(
    ForeignKey("incident_types.type_id", ondelete="RESTRICT"),
    nullable=False,
)

severity_id: Mapped[int] = mapped_column(
    ForeignKey("severity.severity_id", ondelete="RESTRICT"),
    nullable=False,
)

reported_by: Mapped[int] = mapped_column(
    ForeignKey("users.user_id", ondelete="RESTRICT"),
    nullable=False,
)

# Child cascade deletion
incident_id: Mapped[int] = mapped_column(
    ForeignKey("incidents.incident_id", ondelete="CASCADE"),
    nullable=False,
)
```

---

### C. SLA Check Constraints

```python
# backend/app/models/entities.py
class Severity(Base):
    __tablename__ = "severity"
    __table_args__ = (
        CheckConstraint("response_sla_hours > 0", name="response_sla_positive"),
        CheckConstraint("resolution_sla_hours > 0", name="resolution_sla_positive"),
        CheckConstraint(
            "resolution_sla_hours >= response_sla_hours",
            name="resolution_not_shorter_than_response",
        ),
    )
```

---

### D. Incident Lifecycle and Workload Check Constraints

```python
# backend/app/models/entities.py
class Analyst(Base):
    __tablename__ = "analysts"
    __table_args__ = (
        CheckConstraint("workload >= 0", name="analyst_workload_nonnegative"),
    )

class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint(
            "resolved_date IS NULL OR resolved_date >= reported_date",
            name="resolved_after_reported",
        ),
    )
```

**Demonstration**: Inspect models in `backend/app/models/entities.py` and run PostgreSQL catalog queries (`\d severity`, `\d analysts`, `\d incidents`) inside Docker.

*Screenshot placeholder: Table constraint inspection in PostgreSQL CLI showing active check and foreign key constraints.*

---

## 7. Conclusion

CIMS enforces security and data integrity across all system tiers:
1. **Application & Route Level**: Role-based access control, Argon2id password hashing, and stateless JWT tokens.
2. **Browser & Network Level**: Session storage isolation, auto-logout on unauthorized events, and CORS restriction.
3. **Validation Level**: Strict Pydantic v2 schemas and RFC IP address validation.
4. **Database Level**: Declarative foreign keys, unique indexes, and mathematical check constraints in PostgreSQL 16.

Together, these 11 implementations ensure that CIMS remains resilient, tamper-evident, and compliant with enterprise database standards.

*Note: This document describes the security and validation implementations identified in the CIMS source code. Demonstrations and screenshots can be captured directly from the running web application (`http://localhost:5173`) and the Docker database containers.*
