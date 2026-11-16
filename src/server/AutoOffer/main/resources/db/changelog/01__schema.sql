-- =====================================================================
-- AutoOffer server registry  |  PostgreSQL 14+
-- V1: tables, keys, constraints, indexes
-- Server holds ONLY public/non-personal data (BA: G2, KPI 2, NFR 3).
-- No resumes, profiles or credentials. Devices are pseudonymous.
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS autooffer;
SET search_path TO autooffer, pg_catalog;

-- ---------------------------------------------------------------------
-- Identity (pseudonymous devices, administrators)
-- ---------------------------------------------------------------------
CREATE TABLE devices (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- random UUID generated on the client (US 7.1); NOT derived from hardware/browser
    pseudonymous_id  uuid        NOT NULL UNIQUE,
    -- HMAC-SHA-256(server_pepper, random 256-bit token); the token itself is never stored
    auth_token_hash  char(64)    NOT NULL CHECK (auth_token_hash ~ '^[0-9a-f]{64}$'),
    created_at       timestamptz NOT NULL DEFAULT now(),
    last_active_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admins (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username       varchar(100) NOT NULL UNIQUE CHECK (length(btrim(username)) >= 3),
    -- only modern adaptive hashes accepted: Argon2id or bcrypt ($2a/$2b/$2y)
    password_hash  text         NOT NULL CHECK (password_hash ~ '^\$(argon2id|2[aby])\$'),
    is_active      boolean      NOT NULL DEFAULT true,   -- admins are deactivated, never deleted
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Reference dictionaries
-- ---------------------------------------------------------------------
CREATE TABLE platforms_dict (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                   varchar(100) NOT NULL UNIQUE,
    code                   varchar(50)  NOT NULL UNIQUE,            -- host, e.g. indeed.com
    url                    varchar(255) NOT NULL UNIQUE CHECK (url ~ '^https?://'),
    -- BA 2.8 / US 1.1 / US 2.4: whitelist with permission status
    permission_status      varchar(10)  NOT NULL DEFAULT 'none'
                           CHECK (permission_status IN ('none','pending','granted')),
    permission_granted_at  timestamptz,
    permission_reference   text,                                    -- pointer to the written permission
    proposed_by_device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
    approved_by_admin_id   uuid REFERENCES admins(id)  ON DELETE RESTRICT,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT platforms_granted_requires_approval CHECK (
        permission_status <> 'granted'
        OR (permission_granted_at IS NOT NULL
            AND approved_by_admin_id IS NOT NULL
            AND permission_reference IS NOT NULL))
);

CREATE TABLE selector_tasks_dict (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code  varchar(50)  NOT NULL UNIQUE,
    name  varchar(100) NOT NULL
);

CREATE TABLE selector_element_types_dict (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code  varchar(50)  NOT NULL UNIQUE,
    name  varchar(100) NOT NULL
);

CREATE TABLE currencies_dict (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code  char(3)     NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{3}$'),
    name  varchar(50) NOT NULL
);

CREATE TABLE regions_dict (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code  varchar(50)  NOT NULL UNIQUE,
    name  varchar(100) NOT NULL
);

CREATE TABLE countries_dict (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id  uuid         NOT NULL REFERENCES regions_dict(id) ON DELETE RESTRICT,
    name       varchar(100) NOT NULL UNIQUE
);

CREATE TABLE cities_dict (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    country_id  uuid         NOT NULL REFERENCES countries_dict(id) ON DELETE RESTRICT,
    name        varchar(100) NOT NULL,
    UNIQUE (country_id, name)
);

CREATE TABLE levels_dict (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name  varchar(50) NOT NULL UNIQUE
);

CREATE TABLE work_formats_dict (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name  varchar(50) NOT NULL UNIQUE
);

CREATE TABLE employment_types_dict (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name  varchar(50) NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------
-- Community-extensible dictionaries (verified by an administrator)
-- ---------------------------------------------------------------------
CREATE TABLE companies_dict (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  varchar(255) NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
    website               text UNIQUE CHECK (website IS NULL OR website ~ '^https?://'),
    is_verified           boolean      NOT NULL DEFAULT false,
    created_by_device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
    updated_by_device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
    verified_by_admin_id  uuid REFERENCES admins(id)  ON DELETE RESTRICT,
    created_at            timestamptz  NOT NULL DEFAULT now(),
    updated_at            timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT companies_verified_by_admin CHECK (NOT is_verified OR verified_by_admin_id IS NOT NULL)
);

CREATE TABLE positions_dict (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  varchar(255) NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
    is_verified           boolean      NOT NULL DEFAULT false,
    created_by_device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
    updated_by_device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
    verified_by_admin_id  uuid REFERENCES admins(id)  ON DELETE RESTRICT,
    created_at            timestamptz  NOT NULL DEFAULT now(),
    updated_at            timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT positions_verified_by_admin CHECK (NOT is_verified OR verified_by_admin_id IS NOT NULL)
);

CREATE TABLE skills (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  varchar(100) NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
    is_verified           boolean      NOT NULL DEFAULT false,
    created_by_device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
    updated_by_device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
    verified_by_admin_id  uuid REFERENCES admins(id)  ON DELETE RESTRICT,
    created_at            timestamptz  NOT NULL DEFAULT now(),
    updated_at            timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT skills_verified_by_admin CHECK (NOT is_verified OR verified_by_admin_id IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- Vacancies (public data only)
--   storage_level = 'full'     -> full sanitized text, board has granted permission
--   storage_level = 'url_only' -> only the public URL (BA 2.8, EU database right)
-- Location is 3NF: AT MOST ONE of region/country/city is stored;
-- the other levels are derived through dictionaries (see v_vacancies_full).
-- ---------------------------------------------------------------------
CREATE TABLE vacancies (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id           uuid NOT NULL REFERENCES platforms_dict(id) ON DELETE RESTRICT,
    url                   text NOT NULL UNIQUE CHECK (url ~ '^https?://' AND length(url) <= 2048),
    -- sha256(lower(platform_code | company | normalized_url)) hex, BA US 1.3
    dedup_hash            char(64) NOT NULL UNIQUE CHECK (dedup_hash ~ '^[0-9a-f]{64}$'),
    storage_level         varchar(8) NOT NULL DEFAULT 'url_only'
                          CHECK (storage_level IN ('url_only','full')),
    position_id           uuid REFERENCES positions_dict(id) ON DELETE SET NULL,
    full_position_name    varchar(255),
    company_id            uuid REFERENCES companies_dict(id) ON DELETE SET NULL,
    address               text,
    region_id             uuid REFERENCES regions_dict(id)   ON DELETE SET NULL,
    country_id            uuid REFERENCES countries_dict(id) ON DELETE SET NULL,
    city_id               uuid REFERENCES cities_dict(id)    ON DELETE SET NULL,
    salary_from           numeric(10,2) CHECK (salary_from >= 0),
    salary_to             numeric(10,2) CHECK (salary_to >= 0),
    currency_id           uuid REFERENCES currencies_dict(id) ON DELETE RESTRICT,
    level_id              uuid REFERENCES levels_dict(id)          ON DELETE SET NULL,
    work_format_id        uuid REFERENCES work_formats_dict(id)    ON DELETE SET NULL,
    employment_type_id    uuid REFERENCES employment_types_dict(id) ON DELETE SET NULL,
    submission_count      integer NOT NULL DEFAULT 1 CHECK (submission_count >= 1),
    description           text,
    is_active             boolean NOT NULL DEFAULT true,
    is_verified           boolean NOT NULL DEFAULT false,
    created_by_device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
    updated_by_device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
    verified_by_admin_id  uuid REFERENCES admins(id)  ON DELETE RESTRICT,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT vacancies_single_location   CHECK (num_nonnulls(region_id, country_id, city_id) <= 1),
    CONSTRAINT vacancies_salary_order      CHECK (salary_from IS NULL OR salary_to IS NULL OR salary_from <= salary_to),
    CONSTRAINT vacancies_salary_currency   CHECK ((salary_from IS NULL AND salary_to IS NULL) OR currency_id IS NOT NULL),
    CONSTRAINT vacancies_verified_by_admin CHECK (NOT is_verified OR verified_by_admin_id IS NOT NULL),
    CONSTRAINT vacancies_storage_content   CHECK (
        (storage_level = 'full' AND description IS NOT NULL AND full_position_name IS NOT NULL)
        OR
        (storage_level = 'url_only' AND description IS NULL AND full_position_name IS NULL
            AND address IS NULL AND salary_from IS NULL AND salary_to IS NULL)
    )
);

CREATE TABLE vacancy_skills (
    vacancy_id  uuid NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
    skill_id    uuid NOT NULL REFERENCES skills(id)    ON DELETE CASCADE,
    PRIMARY KEY (vacancy_id, skill_id)
);

-- ---------------------------------------------------------------------
-- Selector registry with review workflow (US 2.1, 2.2, 2.4, R4)
-- A "version" is one row. Only approved + active rows are served.
-- ---------------------------------------------------------------------
CREATE TABLE selectors (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id             uuid NOT NULL REFERENCES platforms_dict(id)             ON DELETE CASCADE,
    task_id                 uuid NOT NULL REFERENCES selector_tasks_dict(id)        ON DELETE RESTRICT,
    element_type_id         uuid NOT NULL REFERENCES selector_element_types_dict(id) ON DELETE RESTRICT,
    url_pattern             varchar(255),
    selector_kind           varchar(5) NOT NULL CHECK (selector_kind IN ('css','xpath')),
    -- declarative data only: no scripts, no URLs (BA: schema check in US 2.4)
    selector_string         text NOT NULL CHECK (
                                length(selector_string) BETWEEN 1 AND 2000
                                AND selector_string !~* '(javascript:|<\s*script|https?://|data:)'),
    version                 integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    previous_version_id     uuid REFERENCES selectors(id) ON DELETE SET NULL,
    review_status           varchar(8) NOT NULL DEFAULT 'pending'
                            CHECK (review_status IN ('pending','approved','rejected')),
    is_active               boolean NOT NULL DEFAULT false,
    submitted_by_device_id  uuid REFERENCES devices(id) ON DELETE SET NULL,
    reviewed_by_admin_id    uuid REFERENCES admins(id)  ON DELETE RESTRICT,
    reviewed_at             timestamptz,
    review_comment          text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT selectors_active_only_if_approved CHECK (NOT is_active OR review_status = 'approved'),
    CONSTRAINT selectors_review_fields CHECK (
        (review_status = 'pending'  AND reviewed_by_admin_id IS NULL AND reviewed_at IS NULL)
        OR
        (review_status <> 'pending' AND reviewed_by_admin_id IS NOT NULL AND reviewed_at IS NOT NULL))
);

-- ---------------------------------------------------------------------
-- GDPR Art. 17 removal requests (BA 2.8): no personal data about the requester
-- ---------------------------------------------------------------------
CREATE TABLE removal_requests (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_url            text NOT NULL CHECK (target_url ~ '^https?://'),
    note                  text,
    status                varchar(8) NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','rejected')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    processed_at          timestamptz,
    processed_by_admin_id uuid REFERENCES admins(id) ON DELETE RESTRICT,
    CONSTRAINT removal_processed_fields CHECK (
        (status = 'open' AND processed_at IS NULL AND processed_by_admin_id IS NULL)
        OR (status <> 'open' AND processed_at IS NOT NULL AND processed_by_admin_id IS NOT NULL))
);

-- ---------------------------------------------------------------------
-- Indexes (each justified by a query pattern)
-- ---------------------------------------------------------------------
-- FK lookups / dictionary filters on the vacancy list
CREATE INDEX ix_vacancies_platform     ON vacancies (platform_id);
CREATE INDEX ix_vacancies_company      ON vacancies (company_id);
CREATE INDEX ix_vacancies_position     ON vacancies (position_id);
CREATE INDEX ix_vacancies_region       ON vacancies (region_id);
CREATE INDEX ix_vacancies_country      ON vacancies (country_id);
CREATE INDEX ix_vacancies_city         ON vacancies (city_id);
CREATE INDEX ix_vacancies_currency     ON vacancies (currency_id);
CREATE INDEX ix_vacancies_level        ON vacancies (level_id);
CREATE INDEX ix_vacancies_work_format  ON vacancies (work_format_id);
CREATE INDEX ix_vacancies_employment   ON vacancies (employment_type_id);
-- incremental sync per board ("changed since X")
CREATE INDEX ix_vacancies_platform_upd ON vacancies (platform_id, updated_at);
-- typical API query: active full-text vacancies, newest first
CREATE INDEX ix_vacancies_active_recent ON vacancies (updated_at DESC)
    WHERE is_active AND storage_level = 'full';
-- text search over title + description
CREATE INDEX ix_vacancies_fts ON vacancies USING gin
    (to_tsvector('simple', coalesce(full_position_name,'') || ' ' || coalesce(description,'')));
CREATE INDEX ix_vacancy_skills_skill   ON vacancy_skills (skill_id);

-- registry
CREATE INDEX ix_selectors_platform     ON selectors (platform_id);
CREATE INDEX ix_selectors_task         ON selectors (task_id);
CREATE INDEX ix_selectors_element      ON selectors (element_type_id);
CREATE UNIQUE INDEX ux_selectors_version ON selectors
    (platform_id, task_id, element_type_id, (COALESCE(url_pattern,'')), version);
CREATE UNIQUE INDEX ux_selectors_one_active ON selectors
    (platform_id, task_id, element_type_id, (COALESCE(url_pattern,''))) WHERE is_active;
CREATE INDEX ix_selectors_review_queue ON selectors (created_at) WHERE review_status = 'pending';
-- what clients poll (US 2.1 / NFR 2): changes since a timestamp
CREATE INDEX ix_selectors_active_upd   ON selectors (updated_at) WHERE is_active;

CREATE INDEX ix_platforms_permission   ON platforms_dict (permission_status);
CREATE INDEX ix_removal_open           ON removal_requests (created_at) WHERE status = 'open';

-- ---------------------------------------------------------------------
-- Data dictionary (readable from pg_description)
-- ---------------------------------------------------------------------
COMMENT ON TABLE devices        IS 'Pseudonymous clients. No personal data; identifier is random, token stored only as HMAC.';
COMMENT ON TABLE admins         IS 'Registry reviewers (selector sets, whitelist, verification). Argon2id/bcrypt hashes only.';
COMMENT ON TABLE platforms_dict IS 'Job boards and whitelist state. permission_status=granted allows full-text storage and automated collection.';
COMMENT ON TABLE vacancies      IS 'Public vacancy records. url_only rows keep only the URL; full rows hold sanitized text of permitted boards.';
COMMENT ON TABLE selectors      IS 'Declarative CSS/XPath rules with review workflow; one approved active row per key.';
COMMENT ON TABLE removal_requests IS 'Art. 17 GDPR removal-on-request queue (no requester data stored).';
COMMENT ON COLUMN vacancies.dedup_hash    IS 'sha256 hex of lower(platform_code|company|normalized_url).';
COMMENT ON COLUMN vacancies.storage_level IS 'full | url_only. Enforced by CHECK and by trigger vs platforms_dict.permission_status.';
COMMENT ON COLUMN vacancies.region_id     IS 'At most one of region_id/country_id/city_id is set (3NF); others derived via dictionaries.';
COMMENT ON COLUMN selectors.selector_string IS 'CSS or XPath only. CHECK rejects scripts and URLs.';
COMMENT ON COLUMN devices.auth_token_hash IS 'HMAC-SHA-256 hex of the bearer token.';
