-- =====================================================================
-- V2: business logic in the database (functions, triggers, views, matview)
-- =====================================================================
SET search_path TO autooffer, pg_catalog;

-- ---------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE TRIGGER trg_admins_updated    BEFORE UPDATE ON admins        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_platforms_updated BEFORE UPDATE ON platforms_dict FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies_dict FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_positions_updated BEFORE UPDATE ON positions_dict FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_skills_updated    BEFORE UPDATE ON skills        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vacancies_updated BEFORE UPDATE ON vacancies     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_selectors_updated BEFORE UPDATE ON selectors     FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Normalization and sanitization helpers
-- ---------------------------------------------------------------------
-- NOTE: query parameters are significant on some boards (e.g. Indeed ?jk=...),
-- so only the fragment and a trailing slash are removed here. Board-specific
-- canonicalization belongs in the client before sending.
CREATE FUNCTION normalize_url(p_url text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT rtrim(regexp_replace(btrim(p_url), '#.*$', ''), '/')
$$;

-- Data masking / anonymization for recruiter personal data (BA US 1.3, 2.8).
-- E-mails and phone numbers are removed here. Personal NAMES are detected
-- statistically in the application layer before this call (BA: residual risk R-names).
CREATE FUNCTION sanitize_description(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT regexp_replace(
             regexp_replace(
               regexp_replace(p_text,
                 '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email removed]', 'g'),
               '\+\d[\d\s().-]{6,}\d', '[phone removed]', 'g'),
             '\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}', '[phone removed]', 'g')
$$;

-- ---------------------------------------------------------------------
-- Policy trigger: full text only for boards with granted permission
-- ---------------------------------------------------------------------
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

CREATE TRIGGER trg_vacancies_storage_policy
    BEFORE INSERT OR UPDATE OF storage_level, platform_id ON vacancies
    FOR EACH ROW EXECUTE FUNCTION enforce_vacancy_storage_policy();

-- When a permission is withdrawn, purge stored text of that board (BA R7, 2.8)
CREATE FUNCTION purge_on_permission_revoked() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.permission_status = 'granted' AND NEW.permission_status <> 'granted' THEN
        DELETE FROM vacancy_skills
         WHERE vacancy_id IN (SELECT id FROM vacancies WHERE platform_id = NEW.id);
        UPDATE vacancies
           SET storage_level = 'url_only',
               description = NULL, full_position_name = NULL, address = NULL,
               salary_from = NULL, salary_to = NULL,
               is_verified = false, verified_by_admin_id = NULL
         WHERE platform_id = NEW.id AND storage_level = 'full';
        NEW.permission_granted_at := NULL;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_platforms_purge
    BEFORE UPDATE OF permission_status ON platforms_dict
    FOR EACH ROW EXECUTE FUNCTION purge_on_permission_revoked();

-- ---------------------------------------------------------------------
-- Ingestion: sanitize + deduplicate + store, one transaction (US 1.3)
-- The SERVER decides the storage level; a client cannot force 'full'.
-- ---------------------------------------------------------------------
CREATE FUNCTION upsert_vacancy(
    p_device_id          uuid,
    p_platform_id        uuid,
    p_url                text,
    p_full_position_name text DEFAULT NULL,
    p_company_name       text DEFAULT NULL,
    p_description        text DEFAULT NULL,
    p_address            text DEFAULT NULL,
    p_position_id        uuid DEFAULT NULL,
    p_region_id          uuid DEFAULT NULL,
    p_country_id         uuid DEFAULT NULL,
    p_city_id            uuid DEFAULT NULL,
    p_salary_from        numeric DEFAULT NULL,
    p_salary_to          numeric DEFAULT NULL,
    p_currency_id        uuid DEFAULT NULL,
    p_level_id           uuid DEFAULT NULL,
    p_work_format_id     uuid DEFAULT NULL,
    p_employment_type_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_code     text;
    v_status   text;
    v_url      text := normalize_url(p_url);
    v_full     boolean;
    v_company  uuid;
    v_cname    text := nullif(btrim(p_company_name), '');
    v_hash     text;
    v_id       uuid;
BEGIN
    SELECT code, permission_status INTO v_code, v_status
      FROM platforms_dict WHERE id = p_platform_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'unknown platform %', p_platform_id USING ERRCODE = 'foreign_key_violation';
    END IF;

    v_full := (v_status = 'granted' AND p_description IS NOT NULL AND p_full_position_name IS NOT NULL);

    IF v_full AND v_cname IS NOT NULL THEN
        SELECT id INTO v_company FROM companies_dict WHERE name = v_cname;
        IF NOT FOUND THEN
            INSERT INTO companies_dict (name, created_by_device_id, updated_by_device_id)
            VALUES (v_cname, p_device_id, p_device_id)
            ON CONFLICT (name) DO NOTHING
            RETURNING id INTO v_company;
            IF v_company IS NULL THEN
                SELECT id INTO v_company FROM companies_dict WHERE name = v_cname;
            END IF;
        END IF;
    END IF;

    v_hash := encode(sha256(convert_to(
                 lower(v_code || '|' || CASE WHEN v_full THEN coalesce(v_cname, '') ELSE '' END || '|' || v_url),
                 'UTF8')), 'hex');

    INSERT INTO vacancies (
        platform_id, url, dedup_hash, storage_level,
        position_id, full_position_name, company_id, address,
        region_id, country_id, city_id,
        salary_from, salary_to, currency_id,
        level_id, work_format_id, employment_type_id, description,
        created_by_device_id, updated_by_device_id)
    VALUES (
        p_platform_id, v_url, v_hash, CASE WHEN v_full THEN 'full' ELSE 'url_only' END,
        CASE WHEN v_full THEN p_position_id END,
        CASE WHEN v_full THEN btrim(p_full_position_name) END,
        v_company,
        CASE WHEN v_full THEN p_address END,
        CASE WHEN v_full THEN p_region_id END,
        CASE WHEN v_full THEN p_country_id END,
        CASE WHEN v_full THEN p_city_id END,
        CASE WHEN v_full THEN p_salary_from END,
        CASE WHEN v_full THEN p_salary_to END,
        CASE WHEN v_full THEN p_currency_id END,
        CASE WHEN v_full THEN p_level_id END,
        CASE WHEN v_full THEN p_work_format_id END,
        CASE WHEN v_full THEN p_employment_type_id END,
        CASE WHEN v_full THEN sanitize_description(p_description) END,
        p_device_id, p_device_id)
    ON CONFLICT (url) DO UPDATE SET
        submission_count     = vacancies.submission_count + 1,
        updated_by_device_id = EXCLUDED.updated_by_device_id,
        is_active            = true,
        -- Content only moves forward: a URL-only resubmission never erases stored text,
        -- and optional fields missing from a newer submission keep their stored value.
        dedup_hash           = CASE WHEN EXCLUDED.storage_level = 'full' AND vacancies.storage_level = 'url_only'
                                    THEN EXCLUDED.dedup_hash ELSE vacancies.dedup_hash END,
        storage_level        = CASE WHEN EXCLUDED.storage_level = 'full' THEN 'full' ELSE vacancies.storage_level END,
        full_position_name   = CASE WHEN EXCLUDED.storage_level = 'full' THEN EXCLUDED.full_position_name ELSE vacancies.full_position_name END,
        description          = CASE WHEN EXCLUDED.storage_level = 'full' THEN EXCLUDED.description        ELSE vacancies.description END,
        position_id          = CASE WHEN EXCLUDED.storage_level = 'full' THEN COALESCE(EXCLUDED.position_id, vacancies.position_id) ELSE vacancies.position_id END,
        company_id           = CASE WHEN EXCLUDED.storage_level = 'full' THEN COALESCE(EXCLUDED.company_id, vacancies.company_id)   ELSE vacancies.company_id END,
        address              = CASE WHEN EXCLUDED.storage_level = 'full' THEN COALESCE(EXCLUDED.address, vacancies.address)         ELSE vacancies.address END,
        level_id             = CASE WHEN EXCLUDED.storage_level = 'full' THEN COALESCE(EXCLUDED.level_id, vacancies.level_id)       ELSE vacancies.level_id END,
        work_format_id       = CASE WHEN EXCLUDED.storage_level = 'full' THEN COALESCE(EXCLUDED.work_format_id, vacancies.work_format_id) ELSE vacancies.work_format_id END,
        employment_type_id   = CASE WHEN EXCLUDED.storage_level = 'full' THEN COALESCE(EXCLUDED.employment_type_id, vacancies.employment_type_id) ELSE vacancies.employment_type_id END,
        -- location (3 columns) and salary (3 columns) move as a unit to keep their CHECKs valid
        region_id            = CASE WHEN EXCLUDED.storage_level = 'full' AND num_nonnulls(EXCLUDED.region_id, EXCLUDED.country_id, EXCLUDED.city_id) > 0
                                    THEN EXCLUDED.region_id  ELSE vacancies.region_id END,
        country_id           = CASE WHEN EXCLUDED.storage_level = 'full' AND num_nonnulls(EXCLUDED.region_id, EXCLUDED.country_id, EXCLUDED.city_id) > 0
                                    THEN EXCLUDED.country_id ELSE vacancies.country_id END,
        city_id              = CASE WHEN EXCLUDED.storage_level = 'full' AND num_nonnulls(EXCLUDED.region_id, EXCLUDED.country_id, EXCLUDED.city_id) > 0
                                    THEN EXCLUDED.city_id    ELSE vacancies.city_id END,
        salary_from          = CASE WHEN EXCLUDED.storage_level = 'full' AND num_nonnulls(EXCLUDED.salary_from, EXCLUDED.salary_to) > 0
                                    THEN EXCLUDED.salary_from ELSE vacancies.salary_from END,
        salary_to            = CASE WHEN EXCLUDED.storage_level = 'full' AND num_nonnulls(EXCLUDED.salary_from, EXCLUDED.salary_to) > 0
                                    THEN EXCLUDED.salary_to   ELSE vacancies.salary_to END,
        currency_id          = CASE WHEN EXCLUDED.storage_level = 'full' AND num_nonnulls(EXCLUDED.salary_from, EXCLUDED.salary_to) > 0
                                    THEN EXCLUDED.currency_id ELSE vacancies.currency_id END
    RETURNING id INTO v_id;

    RETURN v_id;
END $$;

-- ---------------------------------------------------------------------
-- Selector review workflow (US 2.4). SECURITY DEFINER so that writers can
-- only submit PENDING rows and only admins can approve/reject.
-- ---------------------------------------------------------------------
CREATE FUNCTION submit_selector(
    p_device_id        uuid,
    p_platform_id      uuid,
    p_task_id          uuid,
    p_element_type_id  uuid,
    p_url_pattern      varchar,
    p_kind             varchar,
    p_selector_string  text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = autooffer, pg_catalog AS $$
DECLARE
    v_prev uuid;
    v_next integer;
    v_id   uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(
        p_platform_id::text || p_task_id::text || p_element_type_id::text || coalesce(p_url_pattern, ''), 0));

    SELECT id INTO v_prev FROM selectors
     WHERE platform_id = p_platform_id AND task_id = p_task_id AND element_type_id = p_element_type_id
       AND url_pattern IS NOT DISTINCT FROM p_url_pattern AND is_active;

    SELECT coalesce(max(version), 0) + 1 INTO v_next FROM selectors
     WHERE platform_id = p_platform_id AND task_id = p_task_id AND element_type_id = p_element_type_id
       AND url_pattern IS NOT DISTINCT FROM p_url_pattern;

    INSERT INTO selectors (platform_id, task_id, element_type_id, url_pattern, selector_kind,
                           selector_string, version, previous_version_id, submitted_by_device_id)
    VALUES (p_platform_id, p_task_id, p_element_type_id, p_url_pattern, p_kind,
            p_selector_string, v_next, v_prev, p_device_id)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

CREATE FUNCTION approve_selector(p_selector_id uuid, p_admin_id uuid, p_comment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = autooffer, pg_catalog AS $$
DECLARE
    s      selectors%ROWTYPE;
    v_prev uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM admins WHERE id = p_admin_id AND is_active) THEN
        RAISE EXCEPTION 'admin % is not active', p_admin_id USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO s FROM selectors WHERE id = p_selector_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'selector % not found', p_selector_id USING ERRCODE = 'no_data_found';
    END IF;
    IF s.review_status <> 'pending' THEN
        RAISE EXCEPTION 'selector % is not pending (status=%)', p_selector_id, s.review_status
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE selectors SET is_active = false
     WHERE platform_id = s.platform_id AND task_id = s.task_id AND element_type_id = s.element_type_id
       AND url_pattern IS NOT DISTINCT FROM s.url_pattern AND is_active
    RETURNING id INTO v_prev;

    UPDATE selectors
       SET review_status = 'approved', is_active = true,
           reviewed_by_admin_id = p_admin_id, reviewed_at = now(),
           review_comment = p_comment,
           previous_version_id = coalesce(v_prev, previous_version_id)
     WHERE id = p_selector_id;
END $$;

CREATE FUNCTION reject_selector(p_selector_id uuid, p_admin_id uuid, p_comment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = autooffer, pg_catalog AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM admins WHERE id = p_admin_id AND is_active) THEN
        RAISE EXCEPTION 'admin % is not active', p_admin_id USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE selectors
       SET review_status = 'rejected', is_active = false,
           reviewed_by_admin_id = p_admin_id, reviewed_at = now(), review_comment = p_comment
     WHERE id = p_selector_id AND review_status = 'pending';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'selector % not found or not pending', p_selector_id
            USING ERRCODE = 'no_data_found';
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------
-- What the extension is served (US 2.1): approved + active only
CREATE VIEW v_registry_selectors AS
SELECT s.id, p.code AS platform_code, t.code AS task_code, e.code AS element_type_code,
       s.url_pattern, s.selector_kind, s.selector_string, s.version, s.updated_at
  FROM selectors s
  JOIN platforms_dict p              ON p.id = s.platform_id
  JOIN selector_tasks_dict t         ON t.id = s.task_id
  JOIN selector_element_types_dict e ON e.id = s.element_type_id
 WHERE s.is_active AND s.review_status = 'approved';

-- Whitelist answered to the extension before any automated collection (US 1.1)
CREATE VIEW v_registry_whitelist AS
SELECT code AS platform_code, name, url, permission_status, updated_at
  FROM platforms_dict;

-- Admin review queue with diff against the active version (US 2.4)
CREATE VIEW v_selector_review_queue AS
SELECT n.id, p.code AS platform_code, t.code AS task_code, e.code AS element_type_code,
       n.url_pattern, n.selector_kind, n.version,
       a.selector_string AS active_selector_string,
       n.selector_string AS proposed_selector_string,
       n.submitted_by_device_id, n.created_at
  FROM selectors n
  JOIN platforms_dict p              ON p.id = n.platform_id
  JOIN selector_tasks_dict t         ON t.id = n.task_id
  JOIN selector_element_types_dict e ON e.id = n.element_type_id
  LEFT JOIN selectors a ON a.platform_id = n.platform_id AND a.task_id = n.task_id
                       AND a.element_type_id = n.element_type_id
                       AND a.url_pattern IS NOT DISTINCT FROM n.url_pattern AND a.is_active
 WHERE n.review_status = 'pending';

-- Fully resolved vacancy (region/country/city derived, keeps the table in 3NF)
CREATE VIEW v_vacancies_full AS
SELECT v.id, v.url, v.storage_level, p.code AS platform_code,
       v.full_position_name, pos.name AS position_name, c.name AS company_name,
       ci.name AS city_name,
       co.name AS country_name,
       r.name  AS region_name,
       v.salary_from, v.salary_to, cu.code AS currency_code,
       l.name AS level_name, wf.name AS work_format, et.name AS employment_type,
       v.description, v.submission_count, v.is_active, v.is_verified,
       v.created_at, v.updated_at
  FROM vacancies v
  JOIN platforms_dict p ON p.id = v.platform_id
  LEFT JOIN positions_dict pos       ON pos.id = v.position_id
  LEFT JOIN companies_dict c         ON c.id  = v.company_id
  LEFT JOIN cities_dict ci           ON ci.id = v.city_id
  LEFT JOIN countries_dict co        ON co.id = COALESCE(v.country_id, ci.country_id)
  LEFT JOIN regions_dict r           ON r.id  = COALESCE(v.region_id, co.region_id)
  LEFT JOIN currencies_dict cu       ON cu.id = v.currency_id
  LEFT JOIN levels_dict l            ON l.id  = v.level_id
  LEFT JOIN work_formats_dict wf     ON wf.id = v.work_format_id
  LEFT JOIN employment_types_dict et ON et.id = v.employment_type_id;

-- Skill hot words per position (G5, E6): materialized because it aggregates the whole table
CREATE MATERIALIZED VIEW mv_skill_hotwords AS
SELECT v.position_id, vs.skill_id, count(*)::integer AS vacancy_count
  FROM vacancies v
  JOIN vacancy_skills vs ON vs.vacancy_id = v.id
 WHERE v.is_active AND v.storage_level = 'full' AND v.position_id IS NOT NULL
 GROUP BY v.position_id, vs.skill_id;

CREATE UNIQUE INDEX ux_mv_skill_hotwords ON mv_skill_hotwords (position_id, skill_id);
CREATE INDEX ix_mv_skill_hotwords_count  ON mv_skill_hotwords (position_id, vacancy_count DESC);

CREATE FUNCTION refresh_skill_hotwords() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = autooffer, pg_catalog AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_skill_hotwords;
END $$;
