https://github.com/users/Kazuki-Stud/projects/2

https://kazuki-stud.github.io/AutoOffer/

# AutoOffer

**AutoOffer** is a privacy-first job search automation platform consisting of a Chrome Extension, a Progressive Web App (PWA) dashboard, a Spring Boot REST API, and a polyglot persistence layer (PostgreSQL, ClickHouse, Redis, and IndexedDB).

The system automates vacancy collection, resume-to-vacancy matching, cover letter tailoring, and application form filling (tested on Indeed, ZipRecruiter, and We Work Remotely) while keeping all candidate personal data, resumes, and job-board credentials strictly on the user's device (GDPR Art. 25 Privacy by Design).

---

## Key Features

* **Local-First Privacy:** Resumes, personal contacts, AI API keys, and platform credentials stay in the browser (`IndexedDB` via Dexie.js) and are encrypted at rest with a non-extractable Web Crypto `AES-GCM-256` key.
* **Centralized Selector Registry:** Versioned CSS/XPath selectors with an admin review workflow (`pending` → `approved` / `rejected`) allow fixing broken job-board parsers without redeploying the extension.
* **Policy-Enforced Public Vacancy Storage:** Server-side PostgreSQL triggers and `CHECK` constraints enforce `url_only` vs `full` text storage based on platform whitelist permission status (EU Database Directive 96/9/EC) and support GDPR Art. 17 removal requests.
* **Incremental OLAP Market Analytics:** A scheduled Spring Boot ETL pipeline streams sanitized public vacancies from PostgreSQL into a 3-layer ClickHouse warehouse (`raw_vacancies` → `stg_vacancies` → `dm_skill_demand`) for skill demand and salary analytics.
* **Distributed Caching, Observability & CI/CD:** Redis 7.4 TTL caching (`CacheConfig`), structured JSON stdout logging with `X-Request-Id` correlation (`LogstashEncoder` + Promtail + Loki), Prometheus + Grafana metrics, and GitHub Actions quality/security gates (`Checkstyle`, `>= 80%` JaCoCo coverage, Testcontainers, Trivy).

---

## Architecture & Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Browser Extension** | JavaScript (Vite), Chrome Extensions API, Dexie.js | Scrapes job boards via registry selectors, fills application forms, manages local encrypted state |
| **PWA Dashboard** | Vue 3, Pinia, Vue Router, Vite, Vitest, Playwright | Local vacancy & application lifecycle SPA, profile/resume editor, responsive UI, JSON backup export/import |
| **Backend & ETL** | Java 26, Spring Boot 4.1.2, Spring Security, JPA, Liquibase, Gradle | Layered REST API, pseudonymous device auth (HMAC-SHA-256), admin JWT auth (BCrypt), scheduled ClickHouse ETL |
| **Cache** | Redis 7.4 (`spring-boot-starter-data-redis`) | TTL-managed caching for whitelist, dictionaries, approved selectors, and skill hotwords (`48MB` LRU) |
| **OLTP Database** | PostgreSQL 16.6 (`autooffer` schema) | 3NF registry, deduplicated/sanitized public vacancies, RBAC (`app_read`, `app_write`, `app_admin`), ETL metadata |
| **OLAP Database** | ClickHouse 24.8 (`autooffer_olap`) | Columnar 3-layer analytical store (`MergeTree`, `ReplacingMergeTree`, `SummingMergeTree`, MVs & window views) |
| **Observability** | Prometheus, Alertmanager, Loki, Promtail, Grafana | `/actuator/prometheus` scraping, structured JSON log aggregation, dashboards |
| **CI/CD** | GitHub Actions, Checkstyle, JaCoCo, Testcontainers, Trivy | Automated quality gate (`>= 80%` coverage), dependency/image vulnerability scans, GHCR push & SSH Compose deploy |
| **Client NoSQL** | IndexedDB via Dexie.js (v7, 28 object stores) | Local profiles, resumes, cover letters, applications, match scores, and encrypted secrets |

---

## Repository Structure

```text
AutoOffer/
├── .github/workflows/
│   └── ci-cd.yml                  # CI/CD: ./gradlew check, Trivy scans, GHCR push, SSH deploy
├── docs/
│   ├── 01-project-overview/       # Problem statement, goals, features, scope, stakeholders
│   ├── 02-technical/
│   │   ├── backend.md             # Back-End ADR, implementation details & criteria checklist
│   │   ├── frontend.md            # Front-End Architecture ADR (Vue 3 SPA, Pinia, Router, tests)
│   │   ├── adaptive-ui.md         # Adaptive UI ADR (280px–4K responsive layout, 44px touch targets, themes)
│   │   ├── assets/screenshots/    # Auto-generated 3-device Playwright screenshots
│   │   └── criteria/database.md   # Databases Criterion ADR, implementation & checklist (OLTP, OLAP, NoSQL)
│   ├── 03-user-guide/             # User guide & FAQ
│   ├── api/
│   │   └── openapi.yaml           # OpenAPI 3.1.0 machine-readable backend contract
│   └── criteria/
│       ├── database-dictionary.md # Auto-generated data dictionary (PG, ClickHouse, Dexie)
│       ├── database-live-verification.txt # Live PostgreSQL grant audit & ClickHouse table stats
│       └── assets/diagrams/db-diagrams.md # Multi-DBMS DFD & Mermaid ER diagrams
├── scripts/
│   └── generate_db_docs.py        # DDL/schema scraper regenerating dictionary & Mermaid diagrams
└── src/
    ├── client/
    │   ├── extension/             # Chrome extension + Dexie v7 schema, validation, crypto, seed
    │   └── pwa/                   # Offline-capable Vue 3 SPA/PWA dashboard (components, pages, stores, tests, e2e)
    └── server/AutoOffer/
        ├── Dockerfile             # Multi-stage Temurin 26 JDK/JRE non-root image (low-RAM SerialGC)
        ├── docker-compose.yml     # Isolated db-internal network (Postgres + ClickHouse + Redis + App + Monitoring)
        ├── docker-compose.override.yml # Local dev port mappings (5432, 8123, 6379, 5005)
        ├── .env.example           # Environment template (no real secrets in Git)
        ├── build.gradle           # Dependencies, Checkstyle (maxWarnings=0), JaCoCo (>= 0.80)
        ├── config/checkstyle/     # checkstyle.xml rules
        ├── docker/                # Postgres roles, ClickHouse OLAP DDL, Prometheus, Alertmanager, Loki, Promtail, Grafana
        ├── main/
        │   ├── java/AutoOffer/    # Controllers, services, repositories, entities, security, ETL, exception handler
        │   └── resources/
        │       ├── application.yaml
        │       ├── logback/       # local.xml & production.xml (JSON stdout)
        │       └── db/            # Liquibase migrations (01__schema.sql .. V5__etl_meta.sql) & seed/
        └── test/
            └── java/AutoOffer/    # Unit tests & PostgresGrantsAndLiquibaseIntegrationTest (Testcontainers)
```

---

## Quick Start (Backend & Databases)

### Prerequisites
* Docker & Docker Compose
* JDK 26 (only if running `./gradlew check` directly on the host)
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
* `CH_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`

### 2. Start PostgreSQL, ClickHouse, Redis, Backend API & Monitoring
From `src/server/AutoOffer`:

```bash
docker compose up -d --build
```

What happens automatically on startup:
1. **PostgreSQL (`postgres:16.6-alpine`)** runs `docker/postgres/init/01-init-roles.sh`, creating `DB_MIGRATOR_USER` (schema owner) and non-superuser `DB_APP_USER`.
2. **ClickHouse (`clickhouse/clickhouse-server:24.8-alpine`)** runs `docker/clickhouse/init/01-olap-schema.sql`, initializing `raw_vacancies`, `stg_vacancies`, `dm_skill_demand`, `mv_stg_to_skill_demand`, and `v_top_skills_by_position`.
3. **Redis (`redis:7.4-alpine`)** starts with a `48mb` LRU cache limit for dictionary, whitelist, selector, and hotword caches.
4. **Spring Boot (`app`)** runs **Liquibase** (`db.changelog-master.xml`) using `DB_MIGRATOR_USER` to apply `01__schema.sql` through `V5__etl_meta.sql` and `db/seed/test_data.sql`, then switches to `DB_APP_USER` at runtime and executes an initial incremental ETL sync to ClickHouse.
5. **Prometheus, Alertmanager, Loki, Promtail, and Grafana** start scraping `/actuator/prometheus` and JSON stdout logs.

### 3. Verify Tests, Code Quality & Coverage Gate
Run Checkstyle (`maxWarnings = 0`), unit tests, PostgreSQL Testcontainers integration tests (requires Docker running), and the `>= 80%` JaCoCo line-coverage verification:

```bash
cd src/server/AutoOffer
./gradlew check
```

Coverage HTML report is generated at `src/server/AutoOffer/build/reports/jacoco/test/html/index.html`.

### 4. Verify Endpoints & Observability
Once `docker compose ps` shows all services healthy (replace `localhost:8080` with your deployed production URL if accessing externally):
* **API Health Check:** `GET http://localhost:8080/api/health`
* **Actuator Readiness / Prometheus:** `GET http://localhost:8080/actuator/health/readiness`, `GET http://localhost:8080/actuator/prometheus`
* **Swagger UI (local profile):** `http://localhost:8080/swagger-ui.html` (OpenAPI spec: [`docs/api/openapi.yaml`](docs/api/openapi.yaml))
* **Public Registry & Vacancies:** `GET http://localhost:8080/api/registry/whitelist`, `GET http://localhost:8080/api/vacancies`
* **OLAP Skill Demand (ClickHouse):** `GET http://localhost:8080/api/analytics/skills-demand`
* **OLAP Salary by Country (ClickHouse):** `GET http://localhost:8080/api/analytics/salary-by-country`
* **OLTP Skill Hotwords (PostgreSQL MV):** `GET http://localhost:8080/api/skills/hotwords`
* **Grafana Dashboards & Logs:** `http://localhost:3000`

### 5. Client Extension & PWA

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

## Back-End Documentation (Evaluation Artifacts)

* **Back-End Criterion Document (ADR, Diagrams, Checklist, Limitations):** [`docs/02-technical/backend.md`](docs/02-technical/backend.md)
* **OpenAPI 3.1.0 Specification:** [`docs/api/openapi.yaml`](docs/api/openapi.yaml)

| Requirement | Where Implemented |
| :--- | :--- |
| **Modern Framework & ORM** | `src/server/AutoOffer/build.gradle` (Spring Boot 4.1.2, Java 26, Spring Data JPA / Hibernate `ddl-auto: validate`), `entity/`, `repository/` |
| **Layered Architecture & SOLID** | `controller/` (+ `controller/admin/`) → `service/` + `service/impl/` (`VacancyService`, `RegistryService`, `DictionaryService`, `SelectorService`, `RemovalRequestService`, `AdminModerationService`, `DeviceAuthService`) → `repository/` & `JdbcTemplate` |
| **API Description** | `docs/api/openapi.yaml`, `configuration/OpenApiConfiguration.java`, `@Operation` / `@ApiResponse` annotations on controllers |
| **Global Error Handling** | `exception/GlobalExceptionHandler.java`, `exception/ErrorCode.java`, `exception/ErrorResponseBody.java`, `configuration/SecurityConfig.java` (JSON 401/403) |
| **Structured Logging & Correlation** | `main/resources/logback/production.xml` (`LogstashEncoder` JSON), `configuration/CorrelationIdFilter.java` (`X-Request-Id` / MDC), `etl/ClickHouseClient.java` |
| **Security & Input Validation** | `security/` (`DeviceTokenAuthFilter`, `AdminJwtFilter`, `JwtUtils`), `BCryptPasswordEncoder(12)`, `HMAC-SHA-256`, Bean Validation DTOs, `db/changelog/01__schema.sql` & `03__roles.sql` |
| **Redis Caching** | `configuration/CacheConfig.java`, `configuration/CacheNames.java`, `docker-compose.yml` (`redis:7.4-alpine`) |
| **Observability (Metrics & Logs)** | `docker/prometheus/`, `docker/loki/`, `docker/promtail/`, `docker/grafana/`, `docker/alertmanager/` |
| **Testing & Coverage (`>= 80%`)** | `src/server/AutoOffer/test/java/AutoOffer/` (5 unit test classes + `PostgresGrantsAndLiquibaseIntegrationTest` via Testcontainers), JaCoCo `0.80` check in `build.gradle` |
| **CI/CD & Production Deployment** | `.github/workflows/ci-cd.yml` (Checkstyle + tests + JaCoCo + Trivy + GHCR + SSH Compose deploy), `src/server/AutoOffer/Dockerfile`, `src/server/AutoOffer/docker-compose.yml` |

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
