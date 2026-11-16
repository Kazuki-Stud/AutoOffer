CREATE DATABASE IF NOT EXISTS autooffer_olap;

CREATE TABLE IF NOT EXISTS autooffer_olap.raw_vacancies
(
    batch_id           UUID,
    loaded_at          DateTime64(3, 'UTC') DEFAULT now64(3),
    vacancy_id         UUID,
    platform_code      String,
    storage_level      LowCardinality(String),
    full_position_name Nullable(String),
    position_name      Nullable(String),
    company_name       Nullable(String),
    city_name          Nullable(String),
    country_name       Nullable(String),
    region_name        Nullable(String),
    salary_from        Nullable(Decimal(12, 2)),
    salary_to          Nullable(Decimal(12, 2)),
    currency_code      Nullable(String),
    level_name         Nullable(String),
    work_format        Nullable(String),
    employment_type    Nullable(String),
    submission_count   UInt32,
    is_active          UInt8,
    is_verified        UInt8,
    skills             Array(String),
    created_at         DateTime64(3, 'UTC'),
    updated_at         DateTime64(3, 'UTC')
    )
    ENGINE = MergeTree
    PARTITION BY toYYYYMM(loaded_at)
    ORDER BY (loaded_at, vacancy_id);

CREATE TABLE IF NOT EXISTS autooffer_olap.stg_vacancies
(
    vacancy_id         UUID,
    platform_code      LowCardinality(String),
    storage_level      LowCardinality(String),
    position_name      LowCardinality(String),
    company_name       String,
    country_name       LowCardinality(String),
    region_name        LowCardinality(String),
    salary_eur_from    Nullable(Float64),
    salary_eur_to      Nullable(Float64),
    salary_eur_mid     Nullable(Float64),
    level_name         LowCardinality(String),
    work_format        LowCardinality(String),
    employment_type    LowCardinality(String),
    submission_count   UInt32,
    is_active          UInt8,
    is_quality_ok      UInt8,
    skills             Array(String),
    created_at         DateTime64(3, 'UTC'),
    updated_at         DateTime64(3, 'UTC')
    )
    ENGINE = ReplacingMergeTree(updated_at)
    PARTITION BY toYYYYMM(created_at)
    ORDER BY (platform_code, vacancy_id);

CREATE TABLE IF NOT EXISTS autooffer_olap.dm_skill_demand
(
    month          Date,
    position_name  LowCardinality(String),
    skill_name     LowCardinality(String),
    vacancy_count  UInt64,
    salary_sum_eur Float64,
    salary_samples UInt64
    )
    ENGINE = SummingMergeTree
    PARTITION BY toYYYYMM(month)
    ORDER BY (month, position_name, skill_name);

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