-- =====================================================================
-- Test data and edge cases (NOT a migration). Run as the schema owner:
--   psql -f seed/test_data.sql
-- Demonstrates: dedup, sanitization, url_only vs full, whitelist policy,
-- selector review workflow, hot-words view, and rejected edge cases.
-- =====================================================================
SET search_path TO autooffer, pg_catalog;
BEGIN;

-- Devices (random UUIDs, token hashes are fake 64-hex values)
INSERT INTO devices (id, pseudonymous_id, auth_token_hash) VALUES
 ('d0000000-0000-4000-8000-000000000001', '0b6a5c1e-2b0f-4f0b-9d54-5f7a6c1f0001', repeat('a1', 32)),
 ('d0000000-0000-4000-8000-000000000002', '0b6a5c1e-2b0f-4f0b-9d54-5f7a6c1f0002', repeat('b2', 32));

-- A board that has granted written permission
INSERT INTO platforms_dict (id, name, code, url, permission_status, permission_granted_at,
                            permission_reference, approved_by_admin_id)
VALUES ('10000000-0000-4000-8000-0000000000ff', 'Demo Board', 'demo-board.test', 'https://demo-board.test',
        'granted', now(), 'e-mail permission 2026-11-10 (test)', 'f0000000-0000-4000-8000-000000000001');

-- 1) Full vacancy with recruiter e-mail + phone in the text -> sanitized
SELECT upsert_vacancy(
  'd0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000ff',
  'https://demo-board.test/jobs/1001',
  'Senior Java Developer', 'Enterprise Systems',
  'We use Java 21, Spring Boot, PostgreSQL and Docker. Contact: jane.doe@example.com or +370 600 12345.',
  'Gedimino pr. 1', 'b0000000-0000-4000-8000-000000000002',
  NULL, NULL, '70000000-0000-4000-8000-000000000002',        -- city = Vilnius (country/region derived)
  4000, 6000, '40000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001');

-- 2) Same posting again from another device, URL with fragment + trailing slash -> dedup, submission_count = 2
SELECT upsert_vacancy(
  'd0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-0000000000ff',
  'https://demo-board.test/jobs/1001/#apply',
  'Senior Java Developer', 'Enterprise Systems', 'Updated description with Java and Spring Boot.');

-- 3) Remote vacancy with country-level location and no salary (edge: all optional fields NULL)
SELECT upsert_vacancy(
  'd0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000ff',
  'https://demo-board.test/jobs/1002',
  'Frontend Developer', 'Pixel Studio', 'React, TypeScript, accessibility (WCAG 2.1).',
  NULL, 'b0000000-0000-4000-8000-000000000001', NULL, '60000000-0000-4000-8000-000000000003', NULL);

-- 4) Board WITHOUT permission: full text is ignored, only the URL is kept
SELECT upsert_vacancy(
  'd0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  'https://www.indeed.com/viewjob?jk=abc123',
  'Backend Developer', 'Some Corp', 'This text must NOT be stored.');

-- Skills and links for the full vacancies
INSERT INTO skills (name, created_by_device_id, updated_by_device_id) VALUES
 ('Java','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001'),
 ('Spring Boot','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001'),
 ('PostgreSQL','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001'),
 ('React','d0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000002');

INSERT INTO vacancy_skills (vacancy_id, skill_id)
SELECT v.id, s.id FROM vacancies v, skills s
 WHERE v.url = 'https://demo-board.test/jobs/1001' AND s.name IN ('Java','Spring Boot','PostgreSQL');
INSERT INTO vacancy_skills (vacancy_id, skill_id)
SELECT v.id, s.id FROM vacancies v, skills s
 WHERE v.url = 'https://demo-board.test/jobs/1002' AND s.name = 'React';

-- Selector workflow: one approved replacement, one rejected malicious proposal
SELECT submit_selector('d0000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002', 'weworkremotely.com', 'css', 'span.title, h3.new-title') AS good_id \gset
SELECT approve_selector(:'good_id', 'f0000000-0000-4000-8000-000000000001', 'tested on 3 pages');
COMMIT;

-- Rejected-by-design edge cases (each must raise an error)
DO $$
BEGIN
  -- (a) full text on a board without permission
  BEGIN
    INSERT INTO vacancies (platform_id, url, dedup_hash, storage_level, full_position_name, description)
    VALUES ('10000000-0000-4000-8000-000000000001', 'https://www.indeed.com/x', repeat('0',64), 'full', 'T', 'D');
    RAISE EXCEPTION 'TEST FAILED (a)';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK (a): full text refused for non-whitelisted board';
  END;
  -- (b) selector containing a URL / script
  BEGIN
    INSERT INTO selectors (platform_id, task_id, element_type_id, selector_kind, selector_string)
    VALUES ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',
            '30000000-0000-4000-8000-000000000002','css','javascript:alert(1)');
    RAISE EXCEPTION 'TEST FAILED (b)';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK (b): scripts rejected in selectors';
  END;
  -- (c) salary_from > salary_to
  BEGIN
    UPDATE vacancies SET salary_from = 9000, salary_to = 1000 WHERE url = 'https://demo-board.test/jobs/1001';
    RAISE EXCEPTION 'TEST FAILED (c)';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK (c): salary order enforced';
  END;
  -- (d) two location levels at once (3NF rule)
  BEGIN
    UPDATE vacancies SET city_id = '70000000-0000-4000-8000-000000000002',
                         country_id = '60000000-0000-4000-8000-000000000002'
     WHERE url = 'https://demo-board.test/jobs/1001';
    RAISE EXCEPTION 'TEST FAILED (d)';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK (d): single location reference enforced';
  END;
  -- (e) weak password hash
  BEGIN
    INSERT INTO admins (username, password_hash) VALUES ('weak_admin', '5f4dcc3b5aa765d61d8327deb882cf99');
    RAISE EXCEPTION 'TEST FAILED (e)';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK (e): MD5-style hash refused';
  END;
END $$;

SELECT refresh_skill_hotwords();
SELECT * FROM mv_skill_hotwords;                                    -- expect Java/Spring Boot/PostgreSQL for Senior..., React for Frontend
SELECT * FROM v_vacancies_full ORDER BY url;                        -- note city -> country -> region derived, e-mail/phone removed
SELECT * FROM v_registry_selectors WHERE platform_code = 'weworkremotely.com' AND element_type_code = 'title';  -- version 2 active

-- Revoking permission purges stored text (BA R7)
UPDATE platforms_dict SET permission_status = 'none' WHERE code = 'demo-board.test';
SELECT count(*) AS full_rows_after_revoke FROM vacancies WHERE storage_level = 'full';   -- expect 0
