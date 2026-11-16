# AutoOffer Complete Data Dictionary

_Auto-generated directly from DDL/schema files on disk (2026-11-16)._

## 1. Transactional Database (PostgreSQL OLTP)

- **Schema:** `autooffer` | **Tables:** 21 | **Views:** 4 | **Materialized Views:** 1 | **Functions:** 10 | **Triggers:** 9 | **Indexes:** 26

### `autooffer.devices` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `pseudonymous_id` | `uuid` | NO | UNIQUE | — |
| `auth_token_hash` | `char(64)` | NO | — | CHECK |
| `created_at` | `timestamptz` | NO | — | DEFAULT |
| `last_active_at` | `timestamptz` | NO | — | DEFAULT |

### `autooffer.admins` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `username` | `varchar(100)` | NO | UNIQUE | CHECK |
| `password_hash` | `text` | NO | — | CHECK |
| `is_active` | `boolean` | NO | — | DEFAULT |
| `created_at` | `timestamptz` | NO | — | DEFAULT |
| `updated_at` | `timestamptz` | NO | — | DEFAULT |

### `autooffer.platforms_dict` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `name` | `varchar(100)` | NO | UNIQUE | — |
| `code` | `varchar(50)` | NO | UNIQUE | — |
| `url` | `varchar(255)` | NO | UNIQUE | CHECK |
| `permission_status` | `varchar(10)` | NO | — | CHECK, DEFAULT |
| `permission_granted_at` | `timestamptz` | YES | — | — |
| `permission_reference` | `text` | YES | — | — |
| `proposed_by_device_id` | `uuid` | YES | FK -> `devices` | — |
| `approved_by_admin_id` | `uuid` | YES | FK -> `admins` | — |
| `created_at` | `timestamptz` | NO | — | DEFAULT |
| `updated_at` | `timestamptz` | NO | — | DEFAULT |

**Table-level constraints:**
- `CONSTRAINT platforms_granted_requires_approval CHECK ( permission_status <> 'granted' OR (permission_granted_at IS NOT NULL AND approved_by_admin_id IS NOT NULL AND permission_reference IS NOT NULL))`

### `autooffer.selector_tasks_dict` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `code` | `varchar(50)` | NO | UNIQUE | — |
| `name` | `varchar(100)` | NO | — | — |

### `autooffer.selector_element_types_dict` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `code` | `varchar(50)` | NO | UNIQUE | — |
| `name` | `varchar(100)` | NO | — | — |

### `autooffer.currencies_dict` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `code` | `char(3)` | NO | UNIQUE | CHECK |
| `name` | `varchar(50)` | NO | — | — |

### `autooffer.regions_dict` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `code` | `varchar(50)` | NO | UNIQUE | — |
| `name` | `varchar(100)` | NO | — | — |

### `autooffer.countries_dict` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `region_id` | `uuid` | NO | FK -> `regions_dict` | — |
| `name` | `varchar(100)` | NO | UNIQUE | — |

### `autooffer.cities_dict` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `country_id` | `uuid` | NO | FK -> `countries_dict` | — |
| `name` | `varchar(100)` | NO | — | — |

**Table-level constraints:**
- `UNIQUE (country_id, name)`

### `autooffer.levels_dict` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `name` | `varchar(50)` | NO | UNIQUE | — |

### `autooffer.work_formats_dict` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `name` | `varchar(50)` | NO | UNIQUE | — |

### `autooffer.employment_types_dict` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `name` | `varchar(50)` | NO | UNIQUE | — |

### `autooffer.companies_dict` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `name` | `varchar(255)` | NO | UNIQUE | CHECK |
| `website` | `text` | YES | UNIQUE | CHECK |
| `is_verified` | `boolean` | NO | — | DEFAULT |
| `created_by_device_id` | `uuid` | YES | FK -> `devices` | — |
| `updated_by_device_id` | `uuid` | YES | FK -> `devices` | — |
| `verified_by_admin_id` | `uuid` | YES | FK -> `admins` | — |
| `created_at` | `timestamptz` | NO | — | DEFAULT |
| `updated_at` | `timestamptz` | NO | — | DEFAULT |

**Table-level constraints:**
- `CONSTRAINT companies_verified_by_admin CHECK (NOT is_verified OR verified_by_admin_id IS NOT NULL)`

### `autooffer.positions_dict` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `name` | `varchar(255)` | NO | UNIQUE | CHECK |
| `is_verified` | `boolean` | NO | — | DEFAULT |
| `created_by_device_id` | `uuid` | YES | FK -> `devices` | — |
| `updated_by_device_id` | `uuid` | YES | FK -> `devices` | — |
| `verified_by_admin_id` | `uuid` | YES | FK -> `admins` | — |
| `created_at` | `timestamptz` | NO | — | DEFAULT |
| `updated_at` | `timestamptz` | NO | — | DEFAULT |

**Table-level constraints:**
- `CONSTRAINT positions_verified_by_admin CHECK (NOT is_verified OR verified_by_admin_id IS NOT NULL)`

### `autooffer.skills` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `name` | `varchar(100)` | NO | UNIQUE | CHECK |
| `is_verified` | `boolean` | NO | — | DEFAULT |
| `created_by_device_id` | `uuid` | YES | FK -> `devices` | — |
| `updated_by_device_id` | `uuid` | YES | FK -> `devices` | — |
| `verified_by_admin_id` | `uuid` | YES | FK -> `admins` | — |
| `created_at` | `timestamptz` | NO | — | DEFAULT |
| `updated_at` | `timestamptz` | NO | — | DEFAULT |

**Table-level constraints:**
- `CONSTRAINT skills_verified_by_admin CHECK (NOT is_verified OR verified_by_admin_id IS NOT NULL)`

### `autooffer.vacancies` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `platform_id` | `uuid` | NO | FK -> `platforms_dict` | — |
| `url` | `text` | NO | UNIQUE | CHECK |
| `dedup_hash` | `char(64)` | NO | UNIQUE | CHECK |
| `storage_level` | `varchar(8)` | NO | — | CHECK, DEFAULT |
| `position_id` | `uuid` | YES | FK -> `positions_dict` | — |
| `full_position_name` | `varchar(255)` | YES | — | — |
| `company_id` | `uuid` | YES | FK -> `companies_dict` | — |
| `address` | `text` | YES | — | — |
| `region_id` | `uuid` | YES | FK -> `regions_dict` | — |
| `country_id` | `uuid` | YES | FK -> `countries_dict` | — |
| `city_id` | `uuid` | YES | FK -> `cities_dict` | — |
| `salary_from` | `numeric(10,2)` | YES | — | CHECK |
| `salary_to` | `numeric(10,2)` | YES | — | CHECK |
| `currency_id` | `uuid` | YES | FK -> `currencies_dict` | — |
| `level_id` | `uuid` | YES | FK -> `levels_dict` | — |
| `work_format_id` | `uuid` | YES | FK -> `work_formats_dict` | — |
| `employment_type_id` | `uuid` | YES | FK -> `employment_types_dict` | — |
| `submission_count` | `integer` | NO | — | CHECK, DEFAULT |
| `description` | `text` | YES | — | — |
| `is_active` | `boolean` | NO | — | DEFAULT |
| `is_verified` | `boolean` | NO | — | DEFAULT |
| `created_by_device_id` | `uuid` | YES | FK -> `devices` | — |
| `updated_by_device_id` | `uuid` | YES | FK -> `devices` | — |
| `verified_by_admin_id` | `uuid` | YES | FK -> `admins` | — |
| `created_at` | `timestamptz` | NO | — | DEFAULT |
| `updated_at` | `timestamptz` | NO | — | DEFAULT |

**Table-level constraints:**
- `CONSTRAINT vacancies_single_location   CHECK (num_nonnulls(region_id, country_id, city_id) <= 1)`
- `CONSTRAINT vacancies_salary_order      CHECK (salary_from IS NULL OR salary_to IS NULL OR salary_from <= salary_to)`
- `CONSTRAINT vacancies_salary_currency   CHECK ((salary_from IS NULL AND salary_to IS NULL) OR currency_id IS NOT NULL)`
- `CONSTRAINT vacancies_verified_by_admin CHECK (NOT is_verified OR verified_by_admin_id IS NOT NULL)`
- `CONSTRAINT vacancies_storage_content   CHECK ( (storage_level = 'full' AND description IS NOT NULL AND full_position_name IS NOT NULL) OR (storage_level = 'url_only' AND description IS NULL AND full_position_name IS NULL AND address IS NULL AND salary_from IS NULL AND salary_to IS NULL) )`

### `autooffer.vacancy_skills` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `vacancy_id` | `uuid` | NO | FK -> `vacancies` | — |
| `skill_id` | `uuid` | NO | FK -> `skills` | — |

**Table-level constraints:**
- `PRIMARY KEY (vacancy_id, skill_id)`

### `autooffer.selectors` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `platform_id` | `uuid` | NO | FK -> `platforms_dict` | — |
| `task_id` | `uuid` | NO | FK -> `selector_tasks_dict` | — |
| `element_type_id` | `uuid` | NO | FK -> `selector_element_types_dict` | — |
| `url_pattern` | `varchar(255)` | YES | — | — |
| `selector_kind` | `varchar(5)` | NO | — | CHECK |
| `selector_string` | `text` | NO | — | CHECK |
| `version` | `integer` | NO | — | CHECK, DEFAULT |
| `previous_version_id` | `uuid` | YES | FK -> `selectors` | — |
| `review_status` | `varchar(8)` | NO | — | CHECK, DEFAULT |
| `is_active` | `boolean` | NO | — | DEFAULT |
| `submitted_by_device_id` | `uuid` | YES | FK -> `devices` | — |
| `reviewed_by_admin_id` | `uuid` | YES | FK -> `admins` | — |
| `reviewed_at` | `timestamptz` | YES | — | — |
| `review_comment` | `text` | YES | — | — |
| `created_at` | `timestamptz` | NO | — | DEFAULT |
| `updated_at` | `timestamptz` | NO | — | DEFAULT |

**Table-level constraints:**
- `CONSTRAINT selectors_active_only_if_approved CHECK (NOT is_active OR review_status = 'approved')`
- `CONSTRAINT selectors_review_fields CHECK ( (review_status = 'pending'  AND reviewed_by_admin_id IS NULL AND reviewed_at IS NULL) OR (review_status <> 'pending' AND reviewed_by_admin_id IS NOT NULL AND reviewed_at IS NOT NULL))`

### `autooffer.removal_requests` (`src/server/AutoOffer/main/resources/db/changelog/01__schema.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `target_url` | `text` | NO | — | CHECK |
| `note` | `text` | YES | — | — |
| `status` | `varchar(8)` | NO | — | CHECK, DEFAULT |
| `created_at` | `timestamptz` | NO | — | DEFAULT |
| `processed_at` | `timestamptz` | YES | — | — |
| `processed_by_admin_id` | `uuid` | YES | FK -> `admins` | — |

**Table-level constraints:**
- `CONSTRAINT removal_processed_fields CHECK ( (status = 'open' AND processed_at IS NULL AND processed_by_admin_id IS NULL) OR (status <> 'open' AND processed_at IS NOT NULL AND processed_by_admin_id IS NOT NULL))`

### `autooffer.etl_watermark` (`src/server/AutoOffer/main/resources/db/changelog/V5__etl_meta.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `pipeline_name` | `varchar(64)` | NO | PK | — |
| `last_synced_at` | `timestamptz` | NO | — | DEFAULT |
| `updated_at` | `timestamptz` | NO | — | DEFAULT |

### `autooffer.etl_runs` (`src/server/AutoOffer/main/resources/db/changelog/V5__etl_meta.sql`)

| Column | Type | Nullable | Keys / FK | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT |
| `pipeline_name` | `varchar(64)` | NO | — | — |
| `started_at` | `timestamptz` | NO | — | DEFAULT |
| `finished_at` | `timestamptz` | YES | — | — |
| `status` | `varchar(16)` | NO | — | CHECK |
| `rows_extracted` | `integer` | NO | — | DEFAULT |
| `rows_loaded` | `integer` | NO | — | DEFAULT |
| `rows_rejected` | `integer` | NO | — | DEFAULT |
| `error_message` | `text` | YES | — | — |

### PostgreSQL Views & Materialized Views
- `VIEW v_registry_selectors`
- `VIEW v_registry_whitelist`
- `VIEW v_selector_review_queue`
- `VIEW v_vacancies_full`
- `MATERIALIZED VIEW mv_skill_hotwords`

### PostgreSQL Functions & Triggers
- `FUNCTION set_updated_at()`
- `FUNCTION normalize_url(p_url text)`
- `FUNCTION sanitize_description(p_text text)`
- `FUNCTION enforce_vacancy_storage_policy()`
- `FUNCTION purge_on_permission_revoked()`
- `FUNCTION upsert_vacancy(`
- `FUNCTION submit_selector(`
- `FUNCTION approve_selector(p_selector_id uuid, p_admin_id uuid, p_comment text DEFAULT NULL)`
- `FUNCTION reject_selector(p_selector_id uuid, p_admin_id uuid, p_comment text DEFAULT NULL)`
- `FUNCTION refresh_skill_hotwords()`
- `TRIGGER trg_admins_updated ON admins`
- `TRIGGER trg_platforms_updated ON platforms_dict`
- `TRIGGER trg_companies_updated ON companies_dict`
- `TRIGGER trg_positions_updated ON positions_dict`
- `TRIGGER trg_skills_updated ON skills`
- `TRIGGER trg_vacancies_updated ON vacancies`
- `TRIGGER trg_selectors_updated ON selectors`
- `TRIGGER trg_vacancies_storage_policy ON vacancies`
- `TRIGGER trg_platforms_purge ON platforms_dict`

## 2. Analytical Database (ClickHouse OLAP)

- **Database:** `autooffer_olap` | **Tables:** 3 | **Materialized Views:** 1 | **Views:** 1
- **Layers:** `raw_vacancies` (RAW) → `stg_vacancies` (STAGING) → `dm_skill_demand` (DATA MART)

### `autooffer_olap.raw_vacancies` (`src/server/AutoOffer/docker/clickhouse/init/01-olap-schema.sql`)
- **Engine:** `MergeTree` | **Partition:** `toYYYYMM(loaded_at)` | **Order By:** `(loaded_at, vacancy_id)`

| Column | Type |
| :--- | :--- |
| `batch_id` | `UUID` |
| `loaded_at` | `DateTime64(3, 'UTC') DEFAULT now64(3)` |
| `vacancy_id` | `UUID` |
| `platform_code` | `String` |
| `storage_level` | `LowCardinality(String)` |
| `full_position_name` | `Nullable(String)` |
| `position_name` | `Nullable(String)` |
| `company_name` | `Nullable(String)` |
| `city_name` | `Nullable(String)` |
| `country_name` | `Nullable(String)` |
| `region_name` | `Nullable(String)` |
| `salary_from` | `Nullable(Decimal(12, 2))` |
| `salary_to` | `Nullable(Decimal(12, 2))` |
| `currency_code` | `Nullable(String)` |
| `level_name` | `Nullable(String)` |
| `work_format` | `Nullable(String)` |
| `employment_type` | `Nullable(String)` |
| `submission_count` | `UInt32` |
| `is_active` | `UInt8` |
| `is_verified` | `UInt8` |
| `skills` | `Array(String)` |
| `created_at` | `DateTime64(3, 'UTC')` |
| `updated_at` | `DateTime64(3, 'UTC')` |

### `autooffer_olap.stg_vacancies` (`src/server/AutoOffer/docker/clickhouse/init/01-olap-schema.sql`)
- **Engine:** `ReplacingMergeTree(updated_at)` | **Partition:** `toYYYYMM(created_at)` | **Order By:** `(platform_code, vacancy_id)`

| Column | Type |
| :--- | :--- |
| `vacancy_id` | `UUID` |
| `platform_code` | `LowCardinality(String)` |
| `storage_level` | `LowCardinality(String)` |
| `position_name` | `LowCardinality(String)` |
| `company_name` | `String` |
| `country_name` | `LowCardinality(String)` |
| `region_name` | `LowCardinality(String)` |
| `salary_eur_from` | `Nullable(Float64)` |
| `salary_eur_to` | `Nullable(Float64)` |
| `salary_eur_mid` | `Nullable(Float64)` |
| `level_name` | `LowCardinality(String)` |
| `work_format` | `LowCardinality(String)` |
| `employment_type` | `LowCardinality(String)` |
| `submission_count` | `UInt32` |
| `is_active` | `UInt8` |
| `is_quality_ok` | `UInt8` |
| `skills` | `Array(String)` |
| `created_at` | `DateTime64(3, 'UTC')` |
| `updated_at` | `DateTime64(3, 'UTC')` |

### `autooffer_olap.dm_skill_demand` (`src/server/AutoOffer/docker/clickhouse/init/01-olap-schema.sql`)
- **Engine:** `SummingMergeTree` | **Partition:** `toYYYYMM(month)` | **Order By:** `(month, position_name, skill_name)`

| Column | Type |
| :--- | :--- |
| `month` | `Date` |
| `position_name` | `LowCardinality(String)` |
| `skill_name` | `LowCardinality(String)` |
| `vacancy_count` | `UInt64` |
| `salary_sum_eur` | `Float64` |
| `salary_samples` | `UInt64` |

### ClickHouse Views & Materialized Views
- `MATERIALIZED VIEW autooffer_olap.mv_stg_to_skill_demand`
- `VIEW autooffer_olap.v_top_skills_by_position`

## 3. Non-Relational Database (IndexedDB via Dexie, schema v7)

- **Database:** `LocalJobManagementDB` | **Active Object Stores:** 28 | **Source:** `src/client/extension/database/database.js`

| Object Store | Primary Key | Indexes |
| :--- | :--- | :--- |
| `local_device_state` | `id` | — |
| `platforms_dict` | `id` | `&code`, `url`, `name`, `mode`, `permission_status` |
| `selector_tasks_dict` | `id` | `&code` |
| `selector_element_types_dict` | `id` | `&code` |
| `currencies_dict` | `id` | `&code` |
| `companies_dict` | `id` | `&name`, `is_verified` |
| `positions_dict` | `id` | `&name`, `is_verified` |
| `regions_dict` | `id` | `&code` |
| `countries_dict` | `id` | `region_id`, `&name` |
| `cities_dict` | `id` | `country_id`, `&[country_id+name]` |
| `levels_dict` | `id` | `&name` |
| `work_formats_dict` | `id` | `&name` |
| `employment_types_dict` | `id` | `&name` |
| `selectors` | `id` | `platform_id`, `task_id`, `element_type_id`, `url_pattern`, `version`, `source`, `is_active`, `[platform_id+task_id+element_type_id]` |
| `skills` | `id` | `&name`, `is_verified` |
| `local_vacancies` | `id` | `platform_id`, `source_host`, `position_id`, `company_id`, `region_id`, `country_id`, `city_id`, `currency_id`, `level_id`, `work_format_id`, `employment_type_id`, `&url`, `sync_level`, `status`, `source`, `created_at`, `updated_at`, `*skill_ids`, `[platform_id+updated_at]` |
| `user_profiles` | `id` | `is_default` |
| `personal_data` | `id` | `&profile_id` |
| `resumes` | `id` | `profile_id`, `updated_at`, `*skill_ids` |
| `cover_letters` | `id` | `profile_id`, `vacancy_id`, `resume_id`, `updated_at`, `*skill_ids` |
| `platform_credentials` | `id` | `platform_id`, `profile_id`, `&[profile_id+platform_id+account_identifier]` |
| `ai_configurations` | `id` | `is_active` |
| `prompt_templates` | `id` | `&code` |
| `automation_jobs` | `id` | `title`, `status`, `created_at` |
| `applications` | `id` | `profile_id`, `vacancy_id`, `resume_id`, `cover_letter_id`, `status`, `applied_at`, `match_score`, `&[profile_id+vacancy_id]`, `[status+applied_at]` |
| `match_results` | `id` | `vacancy_id`, `resume_id`, `score`, `created_at`, `&[vacancy_id+resume_id]` |
| `search_preferences` | `id` | `&profile_id` |
| `app_settings` | `key` | — |
