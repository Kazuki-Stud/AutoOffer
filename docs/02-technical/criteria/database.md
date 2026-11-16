# Criterion: Databases (OLTP, OLAP, NoSQL)

## Architecture Decision Record



### Context

AutoOffer automates job vacancy discovery, semantic resume matching, cover letter tailoring, and application form filling across multiple job boards (such as Indeed, ZipRecruiter, and We Work Remotely). The domain introduces three competing architectural forces:

1. **Strict Client-Side Privacy (Business Goal G2 / GDPR Art. 25 Privacy by Design):** Candidate personal data, resumes, cover letters, AI API keys, and job-board credentials must never leave the user's device or be stored on a central server.
2. **Centralized Registry & Legal Compliance (Business Goal G3 / EU Database Directive 96/9/EC & GDPR Art. 17):** Broken CSS/XPath selectors must be updated centrally without redeploying the browser extension, public vacancy URLs must be deduplicated, and full-text vacancy descriptions may only be stored on the server for platforms that have granted explicit written permission (with instant purging if permission is revoked or an Art. 17 removal request arrives).
3. **Market Skill Analytics Without OLTP Contention (Business Goal G5):** Aggregating in-demand skills ("hotwords"), salary medians, and position trends across collected vacancies must not lock or degrade transactional ingestion.

### Decision

We implemented a **polyglot persistence architecture** matching each workload to a dedicated DBMS:

1. **PostgreSQL 16.6 (Transactional OLTP):** A normalized (3NF) relational database (`autooffer` schema) managed via Liquibase migrations. It stores only non-personal/pseudonymous and public data: pseudonymous device registrations, admin accounts, whitelisted platforms, versioned selector review workflows, deduplicated/sanitized public vacancies, GDPR removal requests, and ETL watermarks/run logs.
2. **ClickHouse 24.8 (Analytical OLAP):** A columnar analytical database (`autooffer_olap`) organized into three layers (`raw_vacancies` -> `stg_vacancies` -> `dm_skill_demand` + `v_top_skills_by_position`) and populated incrementally from PostgreSQL by `VacancyEtlService`.
3. **IndexedDB via Dexie.js v7 (Client-Side NoSQL Document Store):** A local-first browser database (`LocalJobManagementDB`, 28 active object stores) shared across the Chrome Extension and PWA dashboard. It stores personal profiles, resumes, cover letters, match scores, application tracking records, and Web Crypto (`AES-GCM-256`) encrypted secrets.

### Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
| :--- | :--- | :--- | :--- |
| Single centralized PostgreSQL for user profiles, registry, and analytics | Fewer containers to operate; single SQL dialect and backup process | Violates Privacy-by-Design (stores candidate resumes and platform credentials centrally); analytical aggregations contend with OLTP writes | Rejected: breaks core privacy guarantee (G2) and mixes OLTP/OLAP workloads |
| Cloud NoSQL (e.g., MongoDB Atlas) for both client sync and server registry | Flexible JSON documents; built-in replication and cross-device sync | Moves personal data onto third-party/server infrastructure; lacks declarative 3NF relational constraints for locations and selector review states | Rejected: violates local-only personal data requirement |
| SQLite or PostgreSQL-only analytics (no ClickHouse) | Simpler Docker Compose topology; zero ETL pipeline needed | Row-oriented storage scales poorly for `ARRAY JOIN` over skills, `quantileExact`, and window rankings as vacancy volume grows | Rejected: ClickHouse provides columnar `SummingMergeTree` + `ReplacingMergeTree` isolation for OLAP |

### Consequences

* **Positive:**
  * **Structural privacy:** A server database compromise cannot expose candidate resumes, personal contacts, or job-board credentials—only pseudonymous device UUIDs, HMAC token hashes, and public board URLs/texts exist on the server.
  * **DB-enforced legal compliance:** PostgreSQL `CHECK` constraints and `BEFORE INSERT/UPDATE` triggers block full-text storage on non-whitelisted platforms (`storage_level = 'url_only'`) and automatically purge stored descriptions when platform permission is revoked.
  * **Workload isolation:** Analytical queries (`/api/analytics/skills-demand`, `/api/analytics/salary-by-country`) execute against ClickHouse without locking OLTP tables.
* **Negative:**
  * **Operational footprint:** Requires maintaining three database engines, two schema migration mechanisms (Liquibase XML/SQL + Dexie `version().stores().upgrade()`), and a scheduled incremental ETL pipeline.
  * **Browser engine limitations:** IndexedDB has no native `CHECK` constraints or SQL user roles, requiring custom validation hooks (`validation.js`) and client-side Web Crypto encryption (`crypto.js`).
* **Neutral:**
  * Deterministic seed UUIDs in `04__seed_reference.sql` and `src/client/extension/database/seed.js` must remain synchronized so client and server reference dictionaries share identical IDs.

---

## Implementation Details

### Project Structure

```text
AutoOffer/
├── docs/criteria/
│   ├── database-dictionary.md                  # Auto-generated full data dictionary (OLTP, OLAP, NoSQL)
│   ├── database-live-verification.txt          # Live psql grant audit & ClickHouse table verification
│   └── assets/diagrams/db-diagrams.md          # Multi-DBMS DFD & Mermaid ER diagrams
├── scripts/
│   └── generate_db_docs.py                     # Automated DDL/schema scraper for docs & diagrams
├── src/server/AutoOffer/
│   ├── docker-compose.yml                      # Isolated db-internal network (PostgreSQL 16 + ClickHouse 24.8 + App)
│   ├── docker/postgres/init/01-init-roles.sh   # Creates migrator & non-superuser runtime roles
│   ├── docker/clickhouse/init/01-olap-schema.sql # ClickHouse RAW -> STAGING -> DATA MART DDL
│   ├── main/resources/application.yaml         # Separate runtime datasource & Liquibase migrator credentials
│   ├── main/resources/db/
│   │   ├── changelog/db.changelog-master.xml   # Ordered Liquibase migration pipeline
│   │   ├── changelog/01__schema.sql            # 19 OLTP tables, PK/FK/CHECK constraints, 23 indexes
│   │   ├── changelog/02__logic.sql             # 10 PL/pgSQL/SQL functions, 9 triggers, 4 views, 1 matview
│   │   ├── changelog/03__roles.sql             # Least-privilege RBAC (app_read, app_write, app_admin)
│   │   ├── changelog/04__seed_reference.sql    # Deterministic reference dictionaries & initial selectors
│   │   ├── changelog/V5__etl_meta.sql          # etl_watermark & etl_runs metadata tables
│   │   └── seed/
│   │       ├── test_data.sql                   # Demo records + negative constraint test block (a)-(e)
│   │       └── audit_grants.sql                # Grant-coverage audit query across autooffer schema
│   └── main/java/AutoOffer/
│       ├── configuration/SecurityConfig.java   # BCrypt(12) PasswordEncoder & stateless auth rules
│       ├── entity/                             # JPA entities (Admin, Device) & immutable views
│       ├── service/impl/VacancyServiceImpl.java# @Transactional ingestion via upsert_vacancy()
│       ├── service/impl/DeviceAuthServiceImpl.java # HMAC-SHA-256 device token hashing & timing-safe auth
│       ├── scheduler/SkillHotwordsScheduler.java # Periodic CONCURRENTLY refresh of mv_skill_hotwords
│       └── etl/                                # ClickHouseClient, VacancyEtlService, AnalyticsController
└── src/client/
    ├── extension/database/
    │   ├── database.js                         # Dexie v5 -> v6 -> v7 schema & upgrade migrations
    │   ├── validation.js                       # Declarative field, enum, cross-field & secret-safety hooks
    │   ├── repository.js                       # Transactional CRUD, cascade deletes, selector rollback
    │   ├── crypto.js                           # Non-extractable Web Crypto AES-GCM-256 encryption
    │   └── seed.js                             # Client dictionary, selector & prompt template seeds
    └── pwa/index.js                            # PWA local storage UI, application lifecycle & JSON backup
```

### Key Implementation Decisions

| Decision | Rationale |
| :--- | :--- |
| **Server-enforced `storage_level` (`upsert_vacancy` + `trg_vacancies_storage_policy`)** | Clients cannot force `full` text storage; PostgreSQL checks `platforms_dict.permission_status = 'granted'` inside the transaction and raises `check_violation` if violated. Revoking permission triggers `purge_on_permission_revoked()` to wipe descriptions and skills. |
| **3NF single-location constraint (`vacancies_single_location`)** | `CHECK (num_nonnulls(region_id, country_id, city_id) <= 1)` eliminates transitive functional dependencies (`city -> country -> region`) in `vacancies`; `v_vacancies_full` reconstructs the full hierarchy via `COALESCE`. |
| **Least-privilege DB role hierarchy & separate migrator** | `01-init-roles.sh` and `03__roles.sql` separate `DB_MIGRATOR_USER` (Liquibase DDL owner) from non-superuser `DB_APP_USER` and enforce column-level `GRANT`s so writers cannot set `is_verified` or approve selectors (`SECURITY DEFINER` RPCs handle review transitions). |
| **Transaction & concurrency safety** | `VacancyServiceImpl` and `DeviceAuthServiceImpl` use Spring `@Transactional`; `submit_selector` uses `pg_advisory_xact_lock` for safe version numbering; `approve_selector` uses `SELECT ... FOR UPDATE`; `upsert_vacancy` uses atomic `ON CONFLICT (url) DO UPDATE`. |
| **ClickHouse 3-layer OLAP model (`raw` -> `stg` -> `dm`)** | `raw_vacancies` (`MergeTree`) stores immutable audit batches; `stg_vacancies` (`ReplacingMergeTree(updated_at)`) normalizes currencies to EUR and flags data quality (`is_quality_ok`); `dm_skill_demand` (`SummingMergeTree`) pre-aggregates monthly skill demand via `mv_stg_to_skill_demand`. |
| **Dexie v7 embedded `*skill_ids` + `validation.js` hooks** | Replacing 3 junction stores (`local_vacancy_skills`, `resume_skills`, `cover_letter_skills`) with multiEntry-indexed `*skill_ids` arrays simplifies local queries while `attachValidation()` enforces UUID, ISO-8601, URL, enum, and cross-field invariants on every write. |
| **Non-extractable Web Crypto `CryptoKey` (`crypto.js`)** | Device auth tokens, platform credentials, and AI API keys are encrypted with `AES-GCM-256` using a non-extractable key stored in `local_device_state`. `validation.js` blocks plaintext secret fields, and `exportLocalBackup()` omits `local_device_state`. |

### Code Examples

**1. PostgreSQL OLTP — Data masking & storage policy trigger (`02__logic.sql`):**
```sql
CREATE FUNCTION sanitize_description(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT regexp_replace(
             regexp_replace(
               regexp_replace(p_text,
                 '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email removed]', 'g'),
               '\+\d[\d\s().-]{6,}\d', '[phone removed]', 'g'),
             '\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}', '[phone removed]', 'g')
$$;

CREATE FUNCTION enforce_vacancy_storage_policy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
BEGIN
    IF NEW.storage_level = 'full' THEN
        SELECT permission_status INTO v_status FROM platforms_dict WHERE id = NEW.platform_id;
        IF v_status IS DISTINCT FROM 'granted' THEN
            RAISE EXCEPTION 'full-text storage not allowed: platform % has permission_status=%',
                NEW.platform_id, coalesce(v_status, 'unknown')
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
```

**2. ClickHouse OLAP — Incremental Materialized View & Analytical Window Query (`01-olap-schema.sql`):**
```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS autooffer_olap.mv_stg_to_skill_demand
TO autooffer_olap.dm_skill_demand
AS
SELECT
    toStartOfMonth(created_at)                      AS month,
    position_name,
    skill_name,
    toUInt64(1)                                     AS vacancy_count,
    coalesce(salary_eur_mid, 0.0)                   AS salary_sum_eur,
    toUInt64(if(salary_eur_mid IS NOT NULL, 1, 0))  AS salary_samples
FROM autooffer_olap.stg_vacancies
    ARRAY JOIN skills AS skill_name
WHERE is_active = 1
  AND storage_level = 'full'
  AND is_quality_ok = 1
  AND skill_name != '';

CREATE VIEW IF NOT EXISTS autooffer_olap.v_top_skills_by_position AS
SELECT
    position_name,
    skill_name,
    sum(vacancy_count)                                              AS total_vacancies,
    round(sum(salary_sum_eur) / nullIf(sum(salary_samples), 0), 2)  AS avg_salary_eur,
    dense_rank() OVER (
        PARTITION BY position_name
        ORDER BY sum(vacancy_count) DESC
    )                                                               AS skill_rank
FROM autooffer_olap.dm_skill_demand
GROUP BY position_name, skill_name;
```

**3. Client NoSQL (Dexie.js) — Transactional Cascade & Sync Policy (`repository.js` & `validation.js`):**
```javascript
export async function allowedSyncLevel(vacancy) {
  if (await getSetting('private_use_only')) return 'none';
  const platform = vacancy.platform_id ? await db.platforms_dict.get(vacancy.platform_id) : null;
  return platform?.permission_status === 'granted' ? 'full' : 'url_only';
}

export async function createApplication({ profile_id, vacancy_id, resume_id = null, cover_letter_id = null, match_score = null }) {
  return db.transaction('rw', [db.applications, db.local_vacancies, db.resumes], async () => {
    if (!(await db.local_vacancies.get(vacancy_id))) throw new Error('vacancy not found');
    if (resume_id && !(await db.resumes.get(resume_id))) throw new Error('resume not found');
    const now = nowIso();
    const record = {
      id: newId(), profile_id, vacancy_id, resume_id, cover_letter_id, match_score,
      status: 'Applied', applied_at: now, status_changed_at: now,
    };
    try {
      await db.applications.add(record);
    } catch (e) {
      if (e?.name === 'ConstraintError') throw new Error('an application for this vacancy already exists');
      throw e;
    }
    return record.id;
  });
}
```

### Diagrams

* [Multi-DBMS Architecture, OLAP Data Flow & Logical ER Diagrams](../../criteria/assets/diagrams/db-diagrams.md)
* [Complete Auto-Scraped Data Dictionary](../../criteria/database-dictionary.md)
* [Live Database Verification Output (PostgreSQL Grants & ClickHouse Tables)](../../criteria/database-live-verification.txt)

---

## Requirements Checklist

### 1. Transactional Database (PostgreSQL OLTP)

| # | Requirement | Status | Evidence/Notes |
| :--- | :--- | :--- | :--- |
| 1 | Data dictionary, integrity & transaction handling, logical schema, DDL script | ✅ | `01__schema.sql`, `docs/criteria/database-dictionary.md`, `docs/criteria/assets/diagrams/db-diagrams.md`; `@Transactional` in `VacancyServiceImpl.java` & `DeviceAuthServiceImpl.java` |
| 2 | Modern RDBMS, 3NF normalization, PK/FK/NOT NULL/UNIQUE/CHECK, meaningful types | ✅ | PostgreSQL 16.6; 21 tables; `vacancies_single_location` 3NF check; `numeric(10,2)`, `timestamptz`, `uuid`, `char(64)` |
| 3 | Reproducible deployment via SQL migrations in Git (not manual) | ✅ | Liquibase `db.changelog-master.xml` running `01__schema.sql` through `V5__etl_meta.sql` and `test_data.sql` |
| 4 | Reference seed data & test/edge-case data | ✅ | `04__seed_reference.sql` (deterministic UUIDs) + `test_data.sql` (deduplication, sanitization, and negative `check_violation` tests `(a)`–`(e)`) |
| 5 | Roles (`app_read`, `app_write`, `app_admin`), non-superuser runtime, grant audit | ✅ | `03__roles.sql` (column-level grants), `01-init-roles.sh` (`DB_APP_USER` non-superuser), `audit_grants.sql` + `database-live-verification.txt` |
| 6 | Encrypted/hashed passwords & tokens (no MD5/SHA-1/plaintext) | ✅ | `admins.password_hash` CHECK `^\$(argon2id\|2[aby])\$` + `BCryptPasswordEncoder(12)` (`SecurityConfig.java`); `devices.auth_token_hash` HMAC-SHA-256 (`DeviceAuthServiceImpl.java`) |
| 7 | Max: Multiple DBMS types in one project with justification | ✅ | PostgreSQL (OLTP) + ClickHouse (OLAP) + IndexedDB (client NoSQL), justified in ADR Context/Decision |
| 8 | Max: Versioning, justified indexes, triggers/functions, views & matviews | ✅ | Liquibase + Git; 26 indexes (partial, GIN FTS, unique active); 9 triggers, 10 functions (`upsert_vacancy`, `submit_selector`, `approve_selector`); 4 views + `mv_skill_hotwords` (`SkillHotwordsScheduler`) |
| 9 | Max: Personal data masking / anonymization | ⚠️ | `sanitize_description()` masks emails & phone numbers in SQL; statistical recruiter-name removal has `TODO (BA R-names)` in `VacancyServiceImpl.java` |

### 2. Analytical Database (ClickHouse OLAP)

| # | Requirement | Status | Evidence/Notes |
| :--- | :--- | :--- | :--- |
| 1 | Data dictionary, layer architecture, DFD, logical schema, DDL, freshness/integrity | ✅ | `01-olap-schema.sql`, `database-dictionary.md`, `db-diagrams.md`; `etl_watermark` + `etl_runs` (`V5__etl_meta.sql`) |
| 2 | Modern OLAP DBMS, facts/dimensions separation, incremental update rule | ✅ | ClickHouse 24.8; `raw_vacancies` -> `stg_vacancies` -> `dm_skill_demand`; incremental `updated_at > last_synced_at` watermark |
| 3 | Reproducible SQL structure & automated ETL pipeline in Git | ✅ | `docker/clickhouse/init/01-olap-schema.sql`, `VacancyEtlService.java` (startup + `@Scheduled` every 10 min + manual admin trigger), `ClickHouseClient.java` |
| 4 | Test sources/data proving load and aggregation | ✅ | Seeded via `test_data.sql` and verified in `database-live-verification.txt` (`raw_vacancies`: 3 rows, `stg_vacancies`: 3 rows, `dm_skill_demand`: 4 rows) |
| 5 | Analytical queries (`GROUP BY`, aggregates, window functions), reports, quality checks | ✅ | `v_top_skills_by_position` (`dense_rank()`), `AnalyticsController.java` (`quantileExact(0.5)`, `avg`), `is_quality_ok` check & `rows_rejected` counter |
| 6 | Max: Separate layers, error handling/logging/reports, partitioning, MVs, historical tracking | ⚠️ | 3 layers + semantic view; `etl_runs` logging & `EtlRunResult`; `PARTITION BY toYYYYMM`, `ReplacingMergeTree`, `SummingMergeTree`, `LowCardinality`, `mv_stg_to_skill_demand`. `raw_vacancies` keeps batch snapshots, but `dm_skill_demand` needs manual rebuild on OLTP updates (no full SCD Type 2 dimension tables) |

### 3. Non-Relational Database (IndexedDB / Dexie.js NoSQL)

| # | Requirement | Status | Evidence/Notes |
| :--- | :--- | :--- | :--- |
| 1 | Data dictionary, DBMS justification, data model & integrity explanation | ✅ | `database-dictionary.md`, `db-diagrams.md`; local-first privacy justification; `validation.js` hooks (`RULES`, `ENUMS`, `CROSS`) & `repository.js` multi-store RW transactions |
| 2 | Modern NoSQL DBMS, structured stores, required/nested fields, validation | ✅ | IndexedDB via Dexie.js v7 (28 active stores, not a raw JSON dump); schema validation on every `creating`/`updating` hook |
| 3 | Security & no plaintext passwords/tokens | ✅ | `crypto.js` (non-extractable `AES-GCM-256` `CryptoKey`), `PLAIN_SECRET_FIELDS` check in `validation.js`, `exportLocalBackup()` excludes `local_device_state` |
| 4 | Reproducible structure/migrations & sufficient test/seed data | ✅ | Dexie `version(5)` -> `version(6)` -> `version(7)` upgrades (`database.js`), `seed.js` (platforms, dicts, selectors, prompts, settings), JSON export/import (`pwa/index.js`) |
| 5 | Max: Multi-DBMS, deliberate embed vs. reference, complex/compound/multiEntry indexes | ✅ | `*skill_ids` embedded UUID arrays + multiEntry indexes replacing 3 junction stores in v7; compound indexes (`&[profile_id+vacancy_id]`, `[status+applied_at]`, `[platform_id+updated_at]`) |

* **Legend:** ✅ Fully implemented | ⚠️ Partially implemented | ❌ Not implemented

---

## Known Limitations

| Limitation | Impact | Potential Solution |
| :--- | :--- | :--- |
| **Skill persistence `TODO` in `VacancyServiceImpl.java`** | API calls to `POST /api/vacancies` do not populate `autooffer.vacancy_skills`, leaving `mv_skill_hotwords` and ClickHouse `dm_skill_demand` empty for API-ingested vacancies (only seeded test data has skills). | Upsert validated `r.skillIds()` into `vacancy_skills` inside `VacancyServiceImpl.upsertVacancy()` when `storage_level = 'full'`. |
| **Recruiter name scrubbing `TODO (BA R-names)` in `VacancyServiceImpl.java`** | PostgreSQL `sanitize_description()` strips e-mails and phone numbers via regex, but personal names in vacancy text remain unmasked. | Add statistical/NER name detection in `VacancyServiceImpl` before calling `autooffer.upsert_vacancy()`. |
| **`dm_skill_demand` (`SummingMergeTree`) double-counting on OLTP updates** | `mv_stg_to_skill_demand` fires on every insert into `stg_vacancies`. If an existing vacancy is updated in PostgreSQL and re-synced with a newer `updated_at`, `dm_skill_demand` sums its skills again until `POST /api/admin/etl/rebuild-mart` is called. | Schedule `rebuildSkillDemandMart()` periodically or switch to `CollapsingMergeTree` / delta-aware ETL reconciliation. |
| **Runtime DB user inherits `app_admin` (`01-init-roles.sh`)** | While `DB_APP_USER` (`autooffer_api`) is not a PostgreSQL superuser, granting it `app_admin` lets the main API pool access admin tables/functions without separating read/write/admin connections. | Configure separate Spring datasources or PostgreSQL `SET LOCAL ROLE` per endpoint privilege level (`app_read` / `app_write` / `app_admin`). |
| **IndexedDB lacks native DB-level user roles** | Browser IndexedDB relies on WebExtension / origin isolation rather than SQL RBAC. | Mitigated via non-extractable Web Crypto keys (`crypto.js`), strict extension CSP, and excluding `local_device_state` from JSON backups. |

---

## References

* [PostgreSQL 16 Documentation](https://www.postgresql.org/docs/16/)
* [ClickHouse MergeTree & Materialized Views](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/mergetree)
* [Dexie.js (IndexedDB Wrapper) Documentation](https://dexie.org/)
* [W3C Indexed Database API 3.0 & Web Cryptography API](https://www.w3.org/TR/IndexedDB/)
* Repository artifacts:
  * `src/server/AutoOffer/main/resources/db/changelog/db.changelog-master.xml`
  * `src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`, `02__logic.sql`, `03__roles.sql`, `04__seed_reference.sql`, `V5__etl_meta.sql`
  * `src/server/AutoOffer/docker/clickhouse/init/01-olap-schema.sql`
  * `src/server/AutoOffer/main/java/AutoOffer/etl/VacancyEtlService.java`, `ClickHouseClient.java`, `AnalyticsController.java`
  * `src/client/extension/database/database.js`, `validation.js`, `repository.js`, `crypto.js`, `seed.js`
  * `docs/criteria/database-dictionary.md`, `docs/criteria/assets/diagrams/db-diagrams.md`, `docs/criteria/database-live-verification.txt`