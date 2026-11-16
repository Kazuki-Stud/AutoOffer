# Criterion: Databases (OLTP, OLAP, NoSQL)

## Architecture Decision Record

### Status

* **Status:** Accepted
* **Date:** 2026-11-16

### Context

AutoOffer automates vacancy discovery, semantic resume matching, cover letter tailoring, and application form filling while guaranteeing that candidate personal data, resumes, and job-board credentials remain strictly on the user's device (GDPR Art. 25 Privacy by Design). Concurrently, the backend must distribute declarative CSS/XPath selectors, sanitize and deduplicate public vacancy postings from permission-granted boards (EU Database Directive 96/9/EC), and compute market skill-demand analytics without degrading transactional ingestion.

### Decision

We implemented a **polyglot persistence architecture** matching each workload to a dedicated DBMS:
1. **PostgreSQL 16 (OLTP):** 3NF relational registry for platforms whitelist, versioned selector moderation, sanitized/deduplicated vacancies, GDPR Art. 17 removal requests, and pseudonymous devices.
2. **ClickHouse 24.8 (OLAP):** Columnar analytical store arranged as `raw_vacancies` → `stg_vacancies` → `dm_skill_demand`, fed incrementally by `VacancyEtlService` using a PostgreSQL watermark.
3. **IndexedDB via Dexie.js (NoSQL):** Client-side transactional document store holding user profiles, resumes, cover letters, applications, match results, and AES-GCM-256 encrypted secrets.

### Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
| :--- | :--- | :--- | :--- |
| Single centralized PostgreSQL for profiles + analytics | Fewer services to deploy; single SQL dialect | Breaks Privacy-by-Design (resumes/credentials stored centrally); heavy skill aggregations contend with OLTP writes | Rejected: violates local-data privacy goal and mixes OLTP/OLAP workloads |
| Cloud NoSQL (MongoDB) for user profiles & registry | Flexible schemas; easy cross-device sync | Moves personal data to vendor servers; weaker relational enforcement for 3NF locations and selector versioning | Rejected: compromises user privacy and relational invariants |
| PostgreSQL-only analytics (no ClickHouse) | Simpler Docker topology | Row-oriented execution scales poorly for `ARRAY JOIN` over skills and quantile/window queries | Rejected: ClickHouse `SummingMergeTree` + `ReplacingMergeTree` isolate OLAP workloads |

### Consequences

* **Positive:**
  * Structural privacy: a server breach cannot expose candidate resumes, contacts, or job-board credentials.
  * DB-enforced legal compliance: triggers and `CHECK` constraints enforce `url_only` vs `full` storage and purge text on permission revocation.
  * Isolated analytical reads: `/api/analytics/*` queries hit ClickHouse without locking OLTP tables.
* **Negative:**
  * Higher operational footprint across three database engines and two migration mechanisms (Liquibase + Dexie).
  * Client IndexedDB requires custom JavaScript validation hooks and Web Crypto because the browser engine has no native `CHECK` constraints or DB RBAC.
* **Neutral:**
  * Deterministic UUIDs in `04__seed_reference.sql` and `seed.js` must remain synchronized.

---

## Implementation Details

### Project Structure

```text
AutoOffer/
├── PostgreSQL OLTP (21 tables, 4 views, 1 matviews, 10 functions, 9 triggers)
│   ├── src/server/AutoOffer/main/resources/db/changelog/01__schema.sql
│   ├── src/server/AutoOffer/main/resources/db/changelog/02__logic.sql
│   ├── src/server/AutoOffer/main/resources/db/changelog/03__roles.sql
│   ├── src/server/AutoOffer/main/resources/db/changelog/04__seed_reference.sql
│   ├── src/server/AutoOffer/main/resources/db/changelog/V5__etl_meta.sql
│   └── not found / not found
├── ClickHouse OLAP (3 tables, 1 matviews, 1 views)
│   ├── src/server/AutoOffer/docker/clickhouse/init/01-olap-schema.sql
│   ├── src/server/AutoOffer/main/java/AutoOffer/etl/VacancyEtlService.java / src/server/AutoOffer/main/java/AutoOffer/etl/ClickHouseClient.java
│   └── src/server/AutoOffer/main/java/AutoOffer/etl/AnalyticsController.java
└── IndexedDB NoSQL (Dexie v7, 28 active stores)
    ├── src/client/extension/database.js
    ├── src/client/extension/validation.js
    ├── src/client/extension/database/repository.js
    ├── src/client/extension/database/crypto.js
    └── src/client/extension/database/seed.js
```

### Key Implementation Decisions

| Decision | Rationale |
| :--- | :--- |
| Server-side `storage_level` control (`upsert_vacancy` + `trg_vacancies_storage_policy`) | Prevents clients from forcing full-text storage on non-whitelisted boards; complies with EU Database Directive 96/9/EC |
| 3NF single-location constraint (`num_nonnulls(region_id, country_id, city_id) <= 1`) | Eliminates transitive location anomalies in `vacancies`; `v_vacancies_full` derives full hierarchy |
| ClickHouse 3-layer model (`raw_vacancies` → `stg_vacancies` → `dm_skill_demand`) | Keeps immutable raw batches, normalizes salaries to EUR, and maintains pre-aggregated skill counts |
| Dexie `*skill_ids` embedded arrays vs. junction stores | Skills are always read with their owner; embedding + multiEntry indexes replace 3 junction stores |
| Non-extractable Web Crypto `CryptoKey` (`crypto.js`) | Ensures JSON exports/backups never expose plaintext credentials, AI keys, or device tokens |

### Code Examples

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
```

```sql
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

```javascript
export async function allowedSyncLevel(vacancy) {
  if (await getSetting('private_use_only')) return 'none';
  const platform = vacancy.platform_id ? await db.platforms_dict.get(vacancy.platform_id) : null;
  return platform?.permission_status === 'granted' ? 'full' : 'url_only';
}
```

### Diagrams

* [Multi-DBMS Architecture, OLAP Data Flow & ER Diagrams](assets/diagrams/db-diagrams.md)
* [Complete Auto-Scraped Data Dictionary](database-dictionary.md)

---

## Requirements Checklist

### Transactional Database (PostgreSQL OLTP)

| # | Requirement | Status | Evidence/Notes |
| :--- | :--- | :--- | :--- |
| 1 | Data dictionary, integrity description, logical schema & DDL | ✅ | `src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`, `database-dictionary.md`, `db-diagrams.md` |
| 2 | Modern RDBMS (PostgreSQL 16), 3NF normalization, PK/FK/UNIQUE/CHECK, meaningful types | ✅ | 21 tables; `vacancies_single_location`, `numeric(10,2)`, `timestamptz` |
| 3 | Reproducible SQL migrations in Git (not manual) | ⚠️ | `src/server/AutoOffer/main/resources/db/changelog/db.changelog-master.xml` (Warning: `V1__*` vs `01__*` filename mismatch) |
| 4 | Reference seed data & test/edge-case data | ⚠️ | `src/server/AutoOffer/main/resources/db/changelog/04__seed_reference.sql`, `not found` |
| 5 | Roles (`app_read`, `app_write`, `app_admin`), non-superuser app user, grant audit | ⚠️ | `src/server/AutoOffer/main/resources/db/changelog/03__roles.sql`, `not found` |
| 6 | Encrypted/hashed passwords & tokens (Argon2id/bcrypt, HMAC-SHA-256) | ✅ | `admins.password_hash` CHECK; `devices.auth_token_hash` HMAC |
| 7 | Max: Justified indexes, triggers, stored functions, views & materialized views | ✅ | 26 indexes, 9 triggers, 10 functions, 4 views, 1 matview |
| 8 | Max: Personal data masking / anonymization | ⚠️ | `sanitize_description()` removes emails/phones; name NER has `TODO (BA R-names)` |

### Analytical Database (ClickHouse OLAP)

| # | Requirement | Status | Evidence/Notes |
| :--- | :--- | :--- | :--- |
| 1 | Data dictionary, layer architecture, data flow diagram & DDL | ✅ | `src/server/AutoOffer/docker/clickhouse/init/01-olap-schema.sql`, `database-dictionary.md`, `db-diagrams.md` |
| 2 | Modern OLAP DBMS (ClickHouse 24.8), separated dimensions/facts, incremental rule | ✅ | `raw_vacancies` → `stg_vacancies` → `dm_skill_demand` + `src/server/AutoOffer/main/resources/db/changelog/V5__etl_meta.sql` |
| 3 | Reproducible ETL pipeline with incremental watermark, logging & quality checks | ✅ | `src/server/AutoOffer/main/java/AutoOffer/etl/VacancyEtlService.java` (`etl_runs`, `is_quality_ok`) |
| 4 | Analytical queries (`GROUP BY`, quantiles, window functions, `ARRAY JOIN`) | ✅ | `v_top_skills_by_position`, `src/server/AutoOffer/main/java/AutoOffer/etl/AnalyticsController.java` |
| 5 | Max: Partitioning, `ReplacingMergeTree`, `SummingMergeTree`, `LowCardinality`, MVs | ✅ | `PARTITION BY toYYYYMM(...)`, `mv_stg_to_skill_demand` |

### Non-Relational Database (IndexedDB / Dexie NoSQL)

| # | Requirement | Status | Evidence/Notes |
| :--- | :--- | :--- | :--- |
| 1 | Data dictionary, DBMS justification (local privacy) & integrity description | ✅ | `src/client/extension/database.js`, `src/client/extension/validation.js` |
| 2 | Structured stores, embed-vs-reference justification, compound/multiEntry indexes | ✅ | Dexie v7 (28 stores), `*skill_ids`, `[profile_id+vacancy_id]` |
| 3 | Security & no plaintext secrets | ✅ | `src/client/extension/database/crypto.js` (non-extractable AES-GCM-256) + `src/client/extension/validation.js` |
| 4 | Reproducible schema upgrades & seed/test documents | ✅ | Dexie version upgrades + `src/client/extension/database/seed.js` |

* **Legend:** ✅ Fully implemented | ⚠️ Partially implemented | ❌ Not implemented

---

## Known Limitations

| Limitation | Impact | Potential Solution |
| :--- | :--- | :--- |
| `ClickHouseClient.java` Jackson 3 import (`tools.jackson.databind`, detected=0) | Fails compilation on Spring Boot 3.4.3 (Jackson 2) | Switch to `com.fasterxml.jackson.databind.ObjectMapper` and handle `JsonProcessingException` |
| `mv_stg_to_skill_demand` missing `is_quality_ok = 1` / update handling (detected=0) | Rejected or updated vacancies can over-count in `dm_skill_demand` | Filter `WHERE is_quality_ok = 1` and reconcile mart or use `CollapsingMergeTree` |
| `VacancyServiceImpl.java` skill persistence TODO (detected=0) | `mv_skill_hotwords` and `dm_skill_demand` get empty skills from API calls | Insert validated `skillIds` into `vacancy_skills` when `storage_level = 'full'` |
| Statistical name scrubbing TODO (detected=1) | Emails/phones are stripped by SQL, but personal names require app-layer NER | Implement name scrubber in `VacancyServiceImpl` before calling `upsert_vacancy()` |
| Dexie `database.js` version on disk (`v7`) | v6/v7 active; optional empty string fields must be normalized to null | Convert `""` to `null` in PWA forms before Dexie writes |
| IndexedDB lacks DB-level user roles | Relies on browser same-origin isolation instead of SQL roles | Mitigated with non-extractable `CryptoKey` and strict extension CSP |

---

## References

* [PostgreSQL 16 Documentation](https://www.postgresql.org/docs/16/)
* [ClickHouse MergeTree Documentation](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/mergetree)
* [Dexie.js IndexedDB Wrapper](https://dexie.org/)
* [W3C Indexed Database API 3.0](https://www.w3.org/TR/IndexedDB/)
* Scraped workspace files: `src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`, `src/server/AutoOffer/main/resources/db/changelog/02__logic.sql`, `src/server/AutoOffer/main/resources/db/changelog/03__roles.sql`, `src/server/AutoOffer/docker/clickhouse/init/01-olap-schema.sql`, `src/client/extension/database.js`
