https://github.com/users/Kazuki-Stud/projects/2

https://kazuki-stud.github.io/AutoOffer/

# AutoOffer

**AutoOffer** is a privacy-first job search automation platform consisting of a Chrome Extension, a Progressive Web App (PWA) dashboard, a Spring Boot REST API, and a polyglot persistence layer (PostgreSQL, ClickHouse, and IndexedDB).

The system automates vacancy collection, resume-to-vacancy matching, cover letter tailoring, and application form filling (tested on Indeed, ZipRecruiter, and We Work Remotely) while keeping all candidate personal data, resumes, and job-board credentials strictly on the user's device (GDPR Art. 25 Privacy by Design).

---

## Key Features

* **Local-First Privacy:** Resumes, personal contacts, AI API keys, and platform credentials stay in the browser (`IndexedDB` via Dexie.js) and are encrypted at rest with a non-extractable Web Crypto `AES-GCM-256` key.
* **Centralized Selector Registry:** Versioned CSS/XPath selectors with an admin review workflow (`pending` → `approved` / `rejected`) allow fixing broken job-board parsers without redeploying the extension.
* **Policy-Enforced Public Vacancy Storage:** Server-side PostgreSQL triggers and `CHECK` constraints enforce `url_only` vs `full` text storage based on platform whitelist permission status (EU Database Directive 96/9/EC) and support GDPR Art. 17 removal requests.
* **Incremental OLAP Market Analytics:** A scheduled Spring Boot ETL pipeline streams sanitized public vacancies from PostgreSQL into a 3-layer ClickHouse warehouse (`raw_vacancies` → `stg_vacancies` → `dm_skill_demand`) for skill demand and salary analytics.

---

## Architecture & Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Browser Extension** | JavaScript (Vite), Chrome Extensions API, Dexie.js | Scrapes job boards via registry selectors, fills application forms, manages local encrypted state |
| **PWA Dashboard** | Vue 3, Pinia, Vue Router, Vite, Vitest, Playwright | Local vacancy & application lifecycle SPA, profile/resume editor, responsive UI, JSON backup export/import |
| **Backend & ETL** | Java, Spring Boot, Spring Security, Liquibase, Gradle | Registry API, pseudonymous device auth (HMAC-SHA-256), admin JWT auth (BCrypt), scheduled ClickHouse ETL |
| **OLTP Database** | PostgreSQL 16.6 (`autooffer` schema) | 3NF registry, deduplicated/sanitized public vacancies, RBAC (`app_read`, `app_write`, `app_admin`), ETL metadata |
| **OLAP Database** | ClickHouse 24.8 (`autooffer_olap`) | Columnar 3-layer analytical store (`MergeTree`, `ReplacingMergeTree`, `SummingMergeTree`, MVs & window views) |
| **Client NoSQL** | IndexedDB via Dexie.js (v7, 28 object stores) | Local profiles, resumes, cover letters, applications, match scores, and encrypted secrets |

---

## Repository Structure

```text
AutoOffer/
├── docs/
│   ├── 01-project-overview/       # Problem statement, goals, features, scope, stakeholders
│   ├── 02-technical/
│   │   ├── frontend.md            # Front-End Architecture ADR (Vue 3 SPA, Pinia, Router, tests)
│   │   ├── adaptive-ui.md         # Adaptive UI ADR (280px–4K responsive layout, 44px touch targets, themes)
│   │   ├── assets/screenshots/    # Auto-generated 3-device Playwright screenshots
│   │   ├── criteria/database.md   # Databases Criterion ADR, implementation & checklist (OLTP, OLAP, NoSQL)
│   │   └── ...                    # Deployment, tech stack & other technical criteria
│   ├── 03-user-guide/             # User guide & FAQ
│   └── criteria/
│       ├── database-dictionary.md # Auto-generated data dictionary (PG, ClickHouse, Dexie)
│       ├── database-live-verification.txt # Live PostgreSQL grant audit & ClickHouse table stats
│       └── assets/diagrams/db-diagrams.md # Multi-DBMS DFD & Mermaid ER diagrams
├── scripts/
│   └── generate_db_docs.py        # DDL/schema scraper regenerating dictionary & Mermaid diagrams
├── src/
│   ├── client/
│   │   ├── extension/             # Chrome extension + Dexie v7 schema, validation, crypto, seed
│   │   └── pwa/                   # Offline-capable Vue 3 SPA/PWA dashboard (components, pages, stores, tests, e2e)
│   └── server/AutoOffer/
│       ├── docker-compose.yml     # Isolated db-internal network (Postgres + ClickHouse + Spring Boot)
│       ├── docker-compose.override.yml # Local dev port mappings (5432, 8123, 5005)
│       ├── .env.example           # Environment template (no real secrets in Git)
│       ├── docker/
│       │   ├── postgres/init/     # Non-superuser runtime & migrator role initialization
│       │   └── clickhouse/init/   # OLAP database, tables, MV & analytical view DDL
│       └── main/
│           ├── java/AutoOffer/    # Controllers, services, security, entities, ETL & schedulers
│           └── resources/
│               ├── application.yaml
│               └── db/
│                   ├── changelog/ # Liquibase migrations (01__schema.sql .. V5__etl_meta.sql)
│                   └── seed/      # test_data.sql (edge-case checks) & audit_grants.sql
└── README.md
```

---

## Quick Start (Backend & Databases)

### Prerequisites
* Docker & Docker Compose
* Node.js & npm (optional, for building the client extension and PWA)

### 1. Configure Environment Variables
Secrets and passwords are never committed to Git. Create a local `.env` file from the template:

```bash
cd src/server/AutoOffer
cp .env.example .env
```

Edit `src/server/AutoOffer/.env` and set strong values for:
* `DB_SUPERUSER_PASSWORD`, `DB_MIGRATOR_PASSWORD`, `DB_APP_PASSWORD`
* `JWT_SECRET`, `DEVICE_TOKEN_PEPPER` (at least 32 characters each)
* `CH_PASSWORD`

### 2. Start PostgreSQL, ClickHouse, and Backend API
From `src/server/AutoOffer`:

```bash
docker compose up -d --build
```

What happens automatically on startup:
1. **PostgreSQL (`postgres:16.6-alpine`)** runs `docker/postgres/init/01-init-roles.sh`, creating `DB_MIGRATOR_USER` (schema owner) and non-superuser `DB_APP_USER`.
2. **ClickHouse (`clickhouse/clickhouse-server:24.8-alpine`)** runs `docker/clickhouse/init/01-olap-schema.sql`, initializing `raw_vacancies`, `stg_vacancies`, `dm_skill_demand`, `mv_stg_to_skill_demand`, and `v_top_skills_by_position`.
3. **Spring Boot (`app`)** runs **Liquibase** (`db.changelog-master.xml`) using `DB_MIGRATOR_USER` to apply `01__schema.sql` through `V5__etl_meta.sql` and `db/seed/test_data.sql`, then switches to `DB_APP_USER` at runtime and executes an initial incremental ETL sync to ClickHouse.

### 3. Verify Endpoints & Analytics
Once `docker compose ps` shows all services healthy:
* **Health Check:** `GET http://localhost:8080/actuator/health`
* **Swagger UI (local profile):** `http://localhost:8080/swagger-ui.html`
* **OLAP Skill Demand (ClickHouse):** `GET http://localhost:8080/api/analytics/skills-demand`
* **OLAP Salary by Country (ClickHouse):** `GET http://localhost:8080/api/analytics/salary-by-country`
* **OLTP Skill Hotwords (PostgreSQL MV):** `GET http://localhost:8080/api/skills/hotwords`

### 4. Client Extension & PWA

#### PWA Dashboard (Vue 3 + Vite)
```bash
cd src/client/pwa
npm install
npm run dev        # http://localhost:5173/AutoOffer/
```

Run linter, unit/integration tests, production build, and Playwright E2E tests:
```bash
cd src/client/pwa
npm run lint
npm test
npm run build
npm run test:e2e
```


#### Browser Extension (Manifest V3)
```bash
cd src/client/extension
npm install
npm run build      # outputs unpacked build to src/client/extension/dist
```

---

## Front-End & Adaptive UI Documentation (Evaluation Artifacts)

* **Front-End Architecture Criterion (ADR, Diagrams, Checklist):** [`docs/02-technical/frontend.md`](docs/02-technical/frontend.md)
    * SPA Entry & Router: `src/client/pwa/src/main.js`, `src/client/pwa/src/App.vue`, `src/client/pwa/src/router/index.js`
    * Pinia Store, Models & Services: `src/client/pwa/src/stores/appStore.js`, `src/client/pwa/src/models/types.js`, `src/client/pwa/src/services/`
    * Components & Pages: `src/client/pwa/src/components/`, `src/client/pwa/src/pages/`
    * Unit, Integration & E2E Tests: `src/client/pwa/tests/pwa.spec.js`, `src/client/pwa/tests/integration.spec.js`, `src/client/pwa/e2e/pwa.spec.js`
* **Adaptive UI Criterion (ADR, Breakpoints, Touch & Contrast Checklist):** [`docs/02-technical/adaptive-ui.md`](docs/02-technical/adaptive-ui.md)
    * Responsive CSS, Dark/Light Tokens & `44px` Touch Targets: `src/client/pwa/src/styles/main.css`
    * Device Detection & Display Controls: `src/client/pwa/src/composables/useDeviceInfo.js`, `src/client/pwa/src/pages/SettingsPage.vue`
    * Generated 3-Device Screenshots: `docs/02-technical/assets/screenshots/`

---

## Database Documentation (Evaluation Artifacts)

* **Primary Criterion Document (ADR, Checklist, Limitations):** [`docs/02-technical/criteria/database.md`](docs/02-technical/criteria/database.md)
* **Complete Data Dictionary (OLTP, OLAP, NoSQL):** [`docs/criteria/database-dictionary.md`](docs/criteria/database-dictionary.md)
* **Logical Schemas, ER Diagrams & OLAP Data Flow:** [`docs/criteria/assets/diagrams/db-diagrams.md`](docs/criteria/assets/diagrams/db-diagrams.md)
* **Live Verification Log (Grants Audit & ClickHouse Row Counts):** [`docs/criteria/database-live-verification.txt`](docs/criteria/database-live-verification.txt)
* **Problem Statement & Privacy Goals:** [`docs/01-project-overview/problem-and-goals.md`](docs/01-project-overview/problem-and-goals.md)

To regenerate the scraped data dictionary and Mermaid diagrams from the SQL/JS files on disk:

```bash
python scripts/generate_db_docs.py
```

---

## Security & Privacy Notes

* Real `.env` files containing passwords, JWT secrets, or HMAC peppers are excluded from version control; only `.env.example` with placeholder values is tracked.
* Admin passwords require Argon2id or BCrypt (`$2a$` / `$2b$` / `$2y$`) enforced by a PostgreSQL `CHECK` constraint; device bearer tokens are stored exclusively as `HMAC-SHA-256` hashes.
* Client secrets (platform credentials, AI API keys, and device tokens) are encrypted in IndexedDB via Web Crypto (`AES-GCM-256`) using a non-extractable `CryptoKey` and are excluded from JSON backups.
