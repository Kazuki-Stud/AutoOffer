-- =====================================================================
-- V3: roles and privileges (least privilege; application never superuser)
--   app_read  : read-only public API (GET vacancies, registry)
--   app_write : ingestion API (devices, vacancies, submissions)
--   app_admin : review / verification / removal API
-- Login roles are created OUTSIDE migrations (no passwords in Git):
--   CREATE ROLE app_api   LOGIN PASSWORD '...' IN ROLE app_write;
--   CREATE ROLE app_admin_api LOGIN PASSWORD '...' IN ROLE app_admin;
-- =====================================================================
SET search_path TO autooffer, pg_catalog;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_read')  THEN CREATE ROLE app_read  NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN CREATE ROLE app_write NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN CREATE ROLE app_admin NOLOGIN; END IF;
END $$;

GRANT app_read  TO app_write;
GRANT app_write TO app_admin;

REVOKE ALL ON SCHEMA autooffer FROM PUBLIC;
GRANT USAGE ON SCHEMA autooffer TO app_read, app_write, app_admin;
REVOKE ALL ON ALL TABLES    IN SCHEMA autooffer FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA autooffer FROM PUBLIC;

-- ---------------- app_read ----------------
GRANT SELECT ON
    platforms_dict, selector_tasks_dict, selector_element_types_dict, currencies_dict,
    regions_dict, countries_dict, cities_dict, levels_dict, work_formats_dict, employment_types_dict,
    companies_dict, positions_dict, skills, vacancies, vacancy_skills, selectors,
    v_registry_selectors, v_registry_whitelist, v_vacancies_full, mv_skill_hotwords
    TO app_read;
-- devices, admins, removal_requests, v_selector_review_queue are NOT readable by app_read

-- ---------------- app_write ----------------
GRANT SELECT ON devices TO app_write;                                  -- token verification
GRANT INSERT (pseudonymous_id, auth_token_hash) ON devices TO app_write;
GRANT UPDATE (auth_token_hash, last_active_at) ON devices TO app_write; -- token rotation & activity tracking

-- column-level grants: writers can never set is_verified / verified_by_admin_id
GRANT INSERT (name, website, created_by_device_id, updated_by_device_id) ON companies_dict TO app_write;
GRANT UPDATE (website, updated_by_device_id)                              ON companies_dict TO app_write;
GRANT INSERT (name, created_by_device_id, updated_by_device_id)           ON positions_dict TO app_write;
GRANT INSERT (name, created_by_device_id, updated_by_device_id)           ON skills TO app_write;

GRANT INSERT (platform_id, url, dedup_hash, storage_level, position_id, full_position_name, company_id,
              address, region_id, country_id, city_id, salary_from, salary_to, currency_id, level_id,
              work_format_id, employment_type_id, description, created_by_device_id, updated_by_device_id)
    ON vacancies TO app_write;
GRANT UPDATE (storage_level, dedup_hash, position_id, full_position_name, company_id, address,
              region_id, country_id, city_id, salary_from, salary_to, currency_id, level_id,
              work_format_id, employment_type_id, description, submission_count, is_active,
              updated_by_device_id)
    ON vacancies TO app_write;
GRANT INSERT, DELETE ON vacancy_skills TO app_write;
GRANT INSERT (target_url, note) ON removal_requests TO app_write;

GRANT EXECUTE ON FUNCTION normalize_url(text), sanitize_description(text) TO app_write;
GRANT EXECUTE ON FUNCTION upsert_vacancy(uuid, uuid, text, text, text, text, text, uuid, uuid, uuid, uuid,
                                         numeric, numeric, uuid, uuid, uuid, uuid) TO app_write;
GRANT EXECUTE ON FUNCTION submit_selector(uuid, uuid, uuid, uuid, varchar, varchar, text) TO app_write;

-- ---------------- app_admin ----------------
GRANT SELECT ON admins, removal_requests, v_selector_review_queue TO app_admin;
GRANT UPDATE (password_hash, is_active) ON admins TO app_admin;
GRANT INSERT, UPDATE ON platforms_dict TO app_admin;
GRANT UPDATE (is_verified, verified_by_admin_id) ON companies_dict, positions_dict, skills, vacancies TO app_admin;
GRANT UPDATE (status, processed_at, processed_by_admin_id) ON removal_requests TO app_admin;
GRANT DELETE ON vacancies TO app_admin;                                 -- Art. 17 removals
GRANT EXECUTE ON FUNCTION approve_selector(uuid, uuid, text), reject_selector(uuid, uuid, text),
                          refresh_skill_hotwords() TO app_admin;