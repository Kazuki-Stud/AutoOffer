-- =====================================================================
-- V4: reference data (idempotent-safe on an empty database).
-- Fixed UUIDs are shared with the client bootstrap seed (client/src/db/seed.js)
-- so dictionary rows have the same identity on both sides.
-- =====================================================================
SET search_path TO autooffer, pg_catalog;

CREATE FUNCTION pg_temp.seed_id(p char, n int) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT (p || '0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- System administrator used only as the "reviewer of record" for seeded rows.
-- Inactive and with an unusable hash: replace through the admin tooling.
INSERT INTO admins (id, username, password_hash, is_active) VALUES
 (pg_temp.seed_id('f',1), 'system_seed', '$argon2id$v=19$m=65536,t=3,p=4$UNUSABLE$UNUSABLE', false);

INSERT INTO platforms_dict (id, name, code, url, permission_status) VALUES
 (pg_temp.seed_id('1',1), 'Indeed',           'indeed.com',        'https://www.indeed.com',        'none'),
 (pg_temp.seed_id('1',2), 'ZipRecruiter',     'ziprecruiter.com',  'https://www.ziprecruiter.com',  'none'),
 (pg_temp.seed_id('1',3), 'We Work Remotely', 'weworkremotely.com','https://weworkremotely.com',    'none');
-- All three stay 'none' until a board grants written permission (BA 2.8, R7).

INSERT INTO selector_tasks_dict (id, code, name) VALUES
 (pg_temp.seed_id('2',1), 'parse_vacancy_list',   'Parse Vacancy List'),
 (pg_temp.seed_id('2',2), 'parse_vacancy_detail', 'Parse Vacancy Detail'),
 (pg_temp.seed_id('2',3), 'search_interaction',   'Search Interaction'),
 (pg_temp.seed_id('2',4), 'fill_application_form','Fill Application Form');

INSERT INTO selector_element_types_dict (id, code, name) VALUES
 (pg_temp.seed_id('3',1),  'container',        'Container'),
 (pg_temp.seed_id('3',2),  'title',            'Title'),
 (pg_temp.seed_id('3',3),  'link',             'Link'),
 (pg_temp.seed_id('3',4),  'search_input',     'Search Input'),
 (pg_temp.seed_id('3',5),  'search_button',    'Search Button'),
 (pg_temp.seed_id('3',6),  'pagination',       'Pagination'),
 (pg_temp.seed_id('3',7),  'description',      'Job Description'),
 (pg_temp.seed_id('3',8),  'company',          'Company'),
 (pg_temp.seed_id('3',9),  'location',         'Location'),
 (pg_temp.seed_id('3',10), 'salary',           'Salary'),
 -- application-form fields mapped from the local profile (US 3.1, 3.2, 3.7)
 (pg_temp.seed_id('3',11), 'form_first_name',  'Form: first name'),
 (pg_temp.seed_id('3',12), 'form_last_name',   'Form: last name'),
 (pg_temp.seed_id('3',13), 'form_email',       'Form: e-mail'),
 (pg_temp.seed_id('3',14), 'form_phone',       'Form: phone'),
 (pg_temp.seed_id('3',15), 'form_location',    'Form: location'),
 (pg_temp.seed_id('3',16), 'form_website',     'Form: website'),
 (pg_temp.seed_id('3',17), 'form_github',      'Form: GitHub'),
 (pg_temp.seed_id('3',18), 'form_linkedin',    'Form: LinkedIn'),
 (pg_temp.seed_id('3',19), 'form_telegram',    'Form: Telegram'),
 (pg_temp.seed_id('3',20), 'form_resume_upload','Form: resume upload'),
 (pg_temp.seed_id('3',21), 'form_cover_letter','Form: cover letter'),
 (pg_temp.seed_id('3',22), 'form_submit',      'Form: submit button'),
 (pg_temp.seed_id('3',23), 'captcha',          'Captcha marker');

INSERT INTO currencies_dict (id, code, name) VALUES
 (pg_temp.seed_id('4',1), 'USD', 'US Dollar'),
 (pg_temp.seed_id('4',2), 'EUR', 'Euro'),
 (pg_temp.seed_id('4',3), 'GBP', 'British Pound'),
 (pg_temp.seed_id('4',4), 'PLN', 'Polish Zloty');

INSERT INTO regions_dict (id, code, name) VALUES
 (pg_temp.seed_id('5',1), 'AMERICA', 'America'),
 (pg_temp.seed_id('5',2), 'EU',      'EU'),
 (pg_temp.seed_id('5',3), 'CIS',     'CIS'),
 (pg_temp.seed_id('5',4), 'OTHER',   'Other');

INSERT INTO countries_dict (id, region_id, name) VALUES
 (pg_temp.seed_id('6',1), pg_temp.seed_id('5',1), 'United States'),
 (pg_temp.seed_id('6',2), pg_temp.seed_id('5',2), 'Lithuania'),
 (pg_temp.seed_id('6',3), pg_temp.seed_id('5',2), 'Poland'),
 (pg_temp.seed_id('6',4), pg_temp.seed_id('5',2), 'Germany'),
 (pg_temp.seed_id('6',5), pg_temp.seed_id('5',4), 'United Kingdom');

INSERT INTO cities_dict (id, country_id, name) VALUES
 (pg_temp.seed_id('7',1), pg_temp.seed_id('6',1), 'New York'),
 (pg_temp.seed_id('7',2), pg_temp.seed_id('6',2), 'Vilnius'),
 (pg_temp.seed_id('7',3), pg_temp.seed_id('6',2), 'Kaunas'),
 (pg_temp.seed_id('7',4), pg_temp.seed_id('6',3), 'Warsaw'),
 (pg_temp.seed_id('7',5), pg_temp.seed_id('6',4), 'Berlin'),
 (pg_temp.seed_id('7',6), pg_temp.seed_id('6',5), 'London');

INSERT INTO levels_dict (id, name) VALUES
 (pg_temp.seed_id('8',1), 'Intern'), (pg_temp.seed_id('8',2), 'Junior'), (pg_temp.seed_id('8',3), 'Middle'),
 (pg_temp.seed_id('8',4), 'Senior'), (pg_temp.seed_id('8',5), 'Lead');

INSERT INTO work_formats_dict (id, name) VALUES
 (pg_temp.seed_id('9',1), 'Remote'), (pg_temp.seed_id('9',2), 'Offline'), (pg_temp.seed_id('9',3), 'Hybrid');

INSERT INTO employment_types_dict (id, name) VALUES
 (pg_temp.seed_id('a',1), 'Full-time'), (pg_temp.seed_id('a',2), 'Part-time'), (pg_temp.seed_id('a',3), 'Contract');

INSERT INTO positions_dict (id, name, is_verified, verified_by_admin_id) VALUES
 (pg_temp.seed_id('b',1), 'Frontend Developer',   true, pg_temp.seed_id('f',1)),
 (pg_temp.seed_id('b',2), 'Backend Developer',    true, pg_temp.seed_id('f',1)),
 (pg_temp.seed_id('b',3), 'Full Stack Developer', true, pg_temp.seed_id('f',1)),
 (pg_temp.seed_id('b',4), 'Software Engineer',    true, pg_temp.seed_id('f',1)),
 (pg_temp.seed_id('b',5), 'DevOps Engineer',      true, pg_temp.seed_id('f',1)),
 (pg_temp.seed_id('b',6), 'QA Engineer',          true, pg_temp.seed_id('f',1));

-- Initial approved selector set (from the prototype). Used by the extension for
-- parsing pages; for boards without permission it applies only to pages the
-- user saves manually with "Save vacancy" (BA US 1.5).
INSERT INTO selectors (platform_id, task_id, element_type_id, url_pattern, selector_kind, selector_string,
                       version, review_status, is_active, reviewed_by_admin_id, reviewed_at, review_comment)
SELECT p.id, t.id, e.id, p.code, 'css', v.sel, 1, 'approved', true,
       pg_temp.seed_id('f',1), now(), 'initial seed'
  FROM (VALUES
    ('indeed.com','parse_vacancy_list','container',  'ul.css-pygyny.eu4oa1w0 li, .mosaic-provider-jobcards-1ppyh6m, div.job_seen_beacon'),
    ('indeed.com','parse_vacancy_list','title',      '.jcs-JobTitle span[title], a.jcs-JobTitle'),
    ('indeed.com','parse_vacancy_list','link',       'a.jcs-JobTitle'),
    ('indeed.com','search_interaction','search_input','#text-input-what'),
    ('indeed.com','search_interaction','search_button','button.yosegi-InlineWhatWhere-primaryButton'),
    ('indeed.com','parse_vacancy_list','pagination', 'a[data-testid="pagination-page-next"]'),
    ('indeed.com','parse_vacancy_detail','description','#jobDescriptionText'),
    ('ziprecruiter.com','parse_vacancy_list','container','article.job_result, div.job_content, [data-testid="job-card"]'),
    ('ziprecruiter.com','parse_vacancy_list','title',  'h2.job_title, a.job_link, [data-testid="job-title"]'),
    ('ziprecruiter.com','parse_vacancy_list','link',   'a.job_link, a[data-testid="job-card-title"]'),
    ('ziprecruiter.com','search_interaction','search_input','input#search-job-keyword, input[name="search"]'),
    ('ziprecruiter.com','search_interaction','search_button','button.search_form_submit, button[type="submit"]'),
    ('ziprecruiter.com','parse_vacancy_list','pagination','a.pagination_link[rel="next"], a[aria-label="Next Page"]'),
    ('ziprecruiter.com','parse_vacancy_detail','description','div.job_description, [data-testid="job-description"]'),
    ('weworkremotely.com','parse_vacancy_list','container','section.jobs article ul li:not(.view-all), li.feature'),
    ('weworkremotely.com','parse_vacancy_list','title', 'span.title'),
    ('weworkremotely.com','parse_vacancy_list','link',  'a[href*="/remote-jobs/"]'),
    ('weworkremotely.com','search_interaction','search_input','input#search'),
    ('weworkremotely.com','search_interaction','search_button','button#search-button'),
    ('weworkremotely.com','parse_vacancy_list','pagination','span.next a'),
    ('weworkremotely.com','parse_vacancy_detail','description','div#job-details, div.listing-container')
  ) AS v(pcode, tcode, ecode, sel)
  JOIN platforms_dict p              ON p.code = v.pcode
  JOIN selector_tasks_dict t         ON t.code = v.tcode
  JOIN selector_element_types_dict e ON e.code = v.ecode;
