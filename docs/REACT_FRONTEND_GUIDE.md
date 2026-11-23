# CIMS React Frontend Guide

This document describes the modern React frontend console for the Cybersecurity Incident Management System (CIMS). The React frontend is implemented in `frontend-web/` as an independent single-page application (SPA) providing a responsive Security Operations Center (SOC) operational dashboard and management interface alongside the original Streamlit interface.

---

## 1. React Frontend Architecture

The React console follows a decoupled, client-rendered Single-Page Application (SPA) architecture that communicates with the CIMS FastAPI backend exclusively via JSON over HTTP.

```text
[ Browser / User ]
       |
       v
+-----------------------------------------------------------+
| React SPA (frontend-web/ - Port 5173 / Preview Port 4173) |
|  - React Router 7 (code-split route boundaries)           |
|  - AuthContext (JWT session state & auto-logout)          |
|  - Centralized Axios API Service (/api -> 127.0.0.1:8000) |
|  - Responsive Shell (Desktop, Laptop, Tablet, Mobile)     |
|  - Recharts 3 Data Visualizations                         |
|  - React Portal Modals & Confirm Dialogs                  |
+-----------------------------------------------------------+
       |
       | RESTful JSON API (/api/*)
       v
+-----------------------------------------------------------+
| FastAPI Backend (127.0.0.1:8000)                          |
+-----------------------------------------------------------+
      /              \
+------------+   +------------+
| PostgreSQL |   |  MongoDB   |
| (Relational|   |  (Security |
|  Store)    |   |   Logs)    |
+------------+   +------------+
```

### Core Architectural Principles

- **No Direct Database Access**: The frontend never connects directly to PostgreSQL or MongoDB; all operations are validated, authorized, and orchestrated by the FastAPI backend.
- **Client-Side Routing & Route Splitting**: React Router 7 manages navigation with lazy-loaded route components (`React.lazy` and `Suspense`), ensuring fast initial page loads and isolated chunking.
- **Role-Based Guards**: Navigation menus and route endpoints are guarded based on the authenticated user's role (`ADMIN`, `ANALYST`, `REPORTER`).
- **Resilient Error Handling**: Centralized Axios interceptors catch HTTP 401 Unauthorized errors to automatically clear credentials and redirect to login, while normalizing validation and network error messages.
- **Accessible & Responsive UI**: Responsive viewports from mobile smartphones (390x844) to 4K desktops (1920x1080) are supported with overflow-safe containment and accessible WAI-ARIA dialogs and form controls.

---

## 2. Technology Stack

| Layer / Library | Version | Purpose |
|---|---|---|
| **React** | `^18.3.1` | Core UI framework |
| **React DOM** | `^18.3.1` | DOM renderer and React Portal mounts |
| **Vite** | `^6.0.7` | Bundler, local development server, and preview server |
| **React Router DOM** | `^7.18.6` | Client-side routing, route guards, and code splitting |
| **Axios** | `^1.7.9` | HTTP client with request/response interceptors |
| **Tailwind CSS** | `^3.4.17` | Utility-first responsive dark-mode styling |
| **Lucide React** | `^0.468.0` | Accessible iconography |
| **Recharts** | `^3.11.0` | SVG chart components (Area, Bar, Pie charts) |
| **Playwright Core** | `^1.65.1` | Browser-based end-to-end integration test runner |

---

## 3. Directory Structure

```text
frontend-web/
├── index.html                   # HTML entry point with viewport meta tags
├── package.json                 # Scripts and dependencies
├── postcss.config.js            # PostCSS configuration for Tailwind CSS
├── tailwind.config.js           # Theme colors (navy, cyan, slate) and shadows
├── vite.config.js               # Dev server and /api reverse-proxy configuration
├── src/
│   ├── main.jsx                 # Application entry point, Router, ToastProvider, AuthProvider
│   ├── App.jsx                  # Route table, lazy imports, protected route wrappers
│   ├── index.css                # Tailwind directives, dark theme tokens, table-shell styles
│   ├── context/
│   │   ├── AuthContext.jsx      # Authentication state, session storage, login/logout methods
│   │   └── ToastContext.jsx     # Global toast notification queue
│   ├── services/
│   │   └── api.js               # Centralized Axios client, interceptors, typed API endpoints
│   ├── utils/
│   │   ├── constants.js         # Roles, status sets, severity lists
│   │   └── format.js            # Timestamps, SLA hours, percentages, hash shorteners
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.jsx     # Responsive layout, sidebar, top header, health status
│   │   │   └── ProtectedRoute.jsx # Authentication & role guard wrapper
│   │   ├── common/
│   │   │   ├── Badge.jsx        # Status, severity, and SLA badge pills
│   │   │   ├── Button.jsx       # Standardized button variants and loading states
│   │   │   ├── ConfirmDialog.jsx# Modal confirmation dialog for destructive actions
│   │   │   ├── FormField.jsx    # Accessible form field with label and error feedback
│   │   │   ├── Modal.jsx        # Portaled accessible dialog with Escape & backdrop dismiss
│   │   │   ├── PageHeader.jsx   # Consistent responsive page header with actions
│   │   │   ├── StatCard.jsx     # Metric summary cards with color accents
│   │   │   └── States.jsx       # Loading, Empty, and Error state components
│   │   ├── dashboard/
│   │   │   ├── DashboardCharts.jsx      # Recharts visualizations (severity, status, trends)
│   │   │   └── RecentIncidentsTable.jsx # Scrollable recent incidents table
│   │   ├── incidents/
│   │   │   ├── CreateIncidentModal.jsx  # Incident creation modal with ML severity advisory
│   │   │   ├── IncidentEvidence.jsx     # Asset and threat-actor linking controls
│   │   │   ├── IncidentOverview.jsx     # Metadata, editable title/description, status progression
│   │   │   ├── IncidentQueue.jsx        # Filterable, sortable incident table
│   │   │   ├── IncidentRecords.jsx      # Tab panels for embedded security logs & audit records
│   │   │   └── IncidentResponse.jsx     # Analyst assignments & investigation actions
│   │   ├── security/
│   │   │   ├── CreateSecurityLogModal.jsx # Telemetry log creation dialog
│   │   │   ├── SecurityLogFilters.jsx   # Filter bar for security logs
│   │   │   └── SecurityLogTable.jsx     # Security log table with IP paths and detail modal
│   │   ├── analysts/
│   │   │   ├── AnalystDialogs.jsx       # Profile provisioning & workload edit dialogs
│   │   │   └── AnalystRoster.jsx        # Analyst roster grid and stats
│   │   ├── assets/
│   │   │   ├── AssetDialogs.jsx         # Asset registration & modification dialogs
│   │   │   └── AssetInventory.jsx       # Asset inventory cards and details
│   │   ├── threats/
│   │   │   ├── ThreatActorDialogs.jsx   # Threat actor create/edit dialogs
│   │   │   └── ThreatActorDirectory.jsx # Threat actor directory cards
│   │   ├── audit/
│   │   │   ├── AuditFilters.jsx         # Audit trail filter controls
│   │   │   ├── AuditLogTable.jsx        # Audit log table and evidence detail dialog
│   │   │   └── AuditVerificationPanel.jsx# SHA-256 hash-chain verification runner
│   │   └── reports/
│   │       ├── ReportsCharts.jsx        # Reporting breakdown charts
│   │       └── SlaSummary.jsx           # SLA performance metric metrics
│   └── pages/
│       ├── LoginPage.jsx                # Secure login page with form validation
│       ├── DashboardPage.jsx            # SOC operational metrics and charts
│       ├── IncidentsPage.jsx            # Incident queue and creation
│       ├── IncidentDetailPage.jsx       # Multi-tab deep incident investigation view
│       ├── SecurityLogsPage.jsx         # MongoDB security telemetry browser
│       ├── AnalystsPage.jsx             # Administrator analyst profile management
│       ├── AssetsPage.jsx               # Affected asset inventory
│       ├── ThreatActorsPage.jsx         # Threat actor intelligence directory
│       ├── AuditPage.jsx                # Tamper-evident audit trail & hash-chain verification
│       ├── ReportsPage.jsx              # Chronological monthly metrics & CSV export
│       └── NotFoundPage.jsx             # 404 handler for invalid routes
└── tests/
    └── e2e.mjs                          # Full end-to-end browser integration test suite
```

---

## 4. Prerequisites

1. **Node.js**: Version `18.0.0` or higher (verified with Node.js `26.x`).
2. **FastAPI Backend**: Running and accessible at `http://127.0.0.1:8000`.
3. **PostgreSQL & MongoDB**: Running via Docker containers (`cims-demo-postgres-1` and `cims-demo-mongodb-1`).
4. **Browser**: Microsoft Edge, Google Chrome, or Chromium (for Playwright E2E tests).

---

## 5. Installation Instructions

Open PowerShell and navigate to the frontend directory:

```powershell
cd "E:\DBMS PROJECT 5th SEM\frontend-web"
npm install
```

---

## 6. Development Commands

To start the Vite development server with hot-module replacement and the `/api` proxy enabled:

```powershell
cd "E:\DBMS PROJECT 5th SEM\frontend-web"
npm run dev
```

The console is accessible at: **`http://localhost:5173`** (or `http://127.0.0.1:5173`).

---

## 7. Production Build Commands

To build the production-ready static assets:

```powershell
cd "E:\DBMS PROJECT 5th SEM\frontend-web"
npm run build
```

The compiled bundles and assets are output to `frontend-web/dist/`.

To preview the production build locally:

```powershell
cd "E:\DBMS PROJECT 5th SEM\frontend-web"
npm run preview
```

The preview server runs on `http://127.0.0.1:4173` (or the configured preview port).

---

## 8. API Configuration

API requests are routed through a base URL configured in `frontend-web/src/services/api.js`:

```javascript
const baseURL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
```

In development, Vite proxies all requests starting with `/api` to the backend:

```javascript
// vite.config.js
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

When building for production with a relative API path, set:
```powershell
$env:VITE_API_BASE_URL = "/api"
npm run build
```

---

## 9. Authentication Flow

1. **User Submits Credentials**: The user enters their email and password on `/login`.
2. **OAuth2 Password Grant**: The frontend sends a URL-encoded `POST /auth/login` request with `username` and `password`.
3. **JWT Storage**: Upon successful verification, the backend issues an access token and user payload. The frontend stores:
   - `cims_access_token` in `sessionStorage`
   - `cims_current_user` in `sessionStorage`
4. **Authorization Header**: All subsequent requests include `Authorization: Bearer <token>` attached automatically via Axios request interceptor.
5. **Session Validation**: On page refresh, `AuthContext` calls `GET /auth/me` to revalidate the user's active session and role claims.
6. **Automatic Logout on 401**: If an API call receives HTTP 401 Unauthorized (e.g., token expiration or tampering), the Axios response interceptor immediately cleans `sessionStorage`, dispatches the `cims:unauthorized` event, and redirects to `/login`.
7. **Manual Sign Out**: Clicking `Sign out` clears `sessionStorage` and returns the user to `/login`.

---

## 10. Role-Based Functionality

The application strictly enforces role-based interfaces matching backend permission policies:

| Feature / Area | ADMIN | ANALYST | REPORTER |
|---|---|---|---|
| **SOC Overview (Dashboard)** | Organization-wide metrics & charts | Assigned incidents metrics & charts | Reported incidents metrics & charts |
| **Incident Queue** | All organization incidents | Only assigned incidents | Only self-reported incidents |
| **Report Incident** | Yes (with ML severity suggestion) | Yes (with ML severity suggestion) | Yes (with ML severity suggestion) |
| **Case Assignment** | Full assignment creation | Read-only assignment history | Redacted |
| **Status Progression** | Full lifecycle progression | Assigned active incidents | Redacted / Read-only |
| **Investigation Actions** | Any active incident | Assigned active incidents | Redacted |
| **Evidence Linking** | Any active incident | Assigned active incidents | Redacted |
| **Security Logs** | View all & create logs | View assigned & create logs | Denied (route blocked) |
| **Analysts Roster** | Full management & workload edits | Denied (route blocked) | Denied (route blocked) |
| **Asset Inventory** | Full asset management | Assigned incident assets | Denied (route blocked) |
| **Threat Actor Directory** | Full actor management | Assigned incident actors | Denied (route blocked) |
| **Audit Trail** | Global query & hash-chain verify | Assigned-incident scoped query | Denied (route blocked) |
| **Reports & CSV Export** | Full access & export | Denied (route blocked) | Denied (route blocked) |

---

## 11. Available Pages

- **`/login`**: Sign-in page with validation and secure credential handling.
- **`/dashboard`**: Operational SOC dashboard with KPI cards, Recharts visualizations, and recent cases.
- **`/incidents`**: Incident queue with multi-attribute filtering (status, severity, type, search) and incident creation modal.
- **`/incidents/:incidentId`**: Incident investigation console featuring:
  - *Overview*: Metadata, SLA status, editable title/description, status workflow actions.
  - *Response*: Analyst assignments and investigation action timeline.
  - *Evidence*: Linked assets, linked threat actors, and linking modal.
  - *Security Logs*: Embedded MongoDB telemetry for this case.
  - *Audit*: Tamper-evident chained audit records for this case.
- **`/security-logs`**: MongoDB security telemetry viewer with filter controls and a creation dialog.
- **`/analysts`**: Provisioned analyst profiles, workloads, specializations, and availability adjustments.
- **`/assets`**: Critical infrastructure asset directory and risk levels.
- **`/threat-actors`**: Threat intelligence directory tracking adversary profiles and suspected motivations.
- **`/audit`**: Audit trail page with record filter scope and SHA-256 hash-chain verification tool.
- **`/reports`**: Executive summaries, monthly volume trends, SLA compliance rates, and CSV export.
- **`/*` (404)**: Clean route fallback page for unavailable or inaccessible endpoints.

---

## 12. Backend Integration

The React console interfaces with the FastAPI backend across 10 functional domains:

1. `/auth`: Token issuance (`/auth/login`), profile validation (`/auth/me`), registration (`/auth/register`).
2. `/health`: Liveness (`/health/liveness`) and dependency checks (`/health/dependencies`).
3. `/incidents`: Case lifecycle, status transitions, and ML severity advisory (`/incidents/suggest-severity`).
4. `/incident-types`: Standard classifications.
5. `/severities`: Severity rankings and SLA definitions.
6. `/analysts`: Profile management and workload assignments.
7. `/assets`: Hardware/software inventory and incident linking.
8. `/threat-actors`: Adversary directory and incident associations.
9. `/security-logs`: MongoDB telemetry persistence and querying.
10. `/audit`: Tamper-evident audit chain query and SHA-256 integrity verification (`/audit/verify`).
11. `/reports`: Aggregated SLA statistics, monthly incident distribution, and CSV export.

---

## 13. Testing Instructions

### Production Build & Lint/Audit

```powershell
cd "E:\DBMS PROJECT 5th SEM\frontend-web"
npm run build
npm audit
```

### End-to-End Playwright Browser Testing

The E2E test runs against the genuine FastAPI backend, real PostgreSQL, and real MongoDB databases without mocks.

To run the test suite:

```powershell
cd "E:\DBMS PROJECT 5th SEM\frontend-web"
$env:CIMS_E2E_WEB_URL = "http://127.0.0.1:5173"
$env:CIMS_E2E_API_URL = "http://127.0.0.1:5173/api"
$env:CIMS_E2E_ADMIN_EMAIL = "admin@cims.edu"
$env:CIMS_E2E_ANALYST_EMAIL = "maya.analyst@cims.edu"
$env:CIMS_E2E_REPORTER_EMAIL = "reporter@cims.edu"
$env:CIMS_E2E_PASSWORD = "CimsDemo123!"

npm run test:e2e
```

The test exercises:
- Invalid credentials, form validations, and session expiration handling.
- REPORTER workflow: creation, ML severity suggestion, sensitive evidence redaction.
- ANALYST workflow: unassigned concealment, assigned visibility, investigation action recording.
- ADMIN workflow: route coverage, assignment, status advancement, evidence association.
- MongoDB telemetry log insertion via modal dialog.
- SHA-256 hash chain verification and audit evidence inspection modal.
- Responsive layout verification across Desktop (1920x1080), Laptop (1366x768), Tablet (768x1024), and Mobile (390x844).

---

## 14. Known Limitations

- **Session Expiry Renewal**: The backend does not implement refresh tokens; token expiration requires re-authenticating through `/login`.
- **Query Limits**: Paginated queries in the frontend currently fetch up to 200 items per batch (matching backend default limits).
- **Manual Log Ingestion**: Security logs are created manually through the dialog or scripts; there is no live streaming Syslog/SIEM ingestion pipeline.
- **Browser Requirement for E2E**: Playwright tests require an installed Chromium/Edge browser on the host system.

---

## 15. Theme Management (Light & Dark Mode)

The React frontend includes a full light and dark mode design system:
- **Default SOC Cyber Theme**: Starts in Dark Mode (`#040b14` canvas, `#0a1728` panels, cyan accents).
- **Light Theme**: Polished high-contrast light theme (`#f8fafc` canvas, `#ffffff` panels, `#0f172a` text, `#e2e8f0` borders, crisp soft shadows, and light-adapted Recharts visualizations).
- **Persistent State**: The user's theme selection is stored in browser `localStorage` (`cims_theme`), persisting across navigation, authentication, and page reloads.
- **Toggle Access**:
  - **Login Page**: Available at top-right of the login screen for pre-authentication preference.
  - **Operational Console Header**: Prominently displayed in the `AppShell` header alongside system health indicators on all pages.
  - **Accessibility**: Includes accessible WAI-ARIA labels (`Switch to light mode` / `Switch to dark mode`) and animated Lucide icons (`Sun` and `Moon`).

