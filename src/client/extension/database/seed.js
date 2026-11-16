import { db } from './database.js';
import { DEFAULT_SETTINGS } from './repository.js';

const sid = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = () => new Date().toISOString();

const PLATFORMS = [
    [1, 'Indeed',           'indeed.com',         'https://www.indeed.com'],
    [2, 'ZipRecruiter',     'ziprecruiter.com',   'https://www.ziprecruiter.com'],
    [3, 'We Work Remotely', 'weworkremotely.com', 'https://weworkremotely.com'],
];
const TASKS = [
    [1, 'parse_vacancy_list', 'Parse Vacancy List'], [2, 'parse_vacancy_detail', 'Parse Vacancy Detail'],
    [3, 'search_interaction', 'Search Interaction'], [4, 'fill_application_form', 'Fill Application Form'],
];
const ELEMENTS = [
    'container:Container', 'title:Title', 'link:Link', 'search_input:Search Input', 'search_button:Search Button',
    'pagination:Pagination', 'description:Job Description', 'company:Company', 'location:Location', 'salary:Salary',
    'form_first_name:Form: first name', 'form_last_name:Form: last name', 'form_email:Form: e-mail',
    'form_phone:Form: phone', 'form_location:Form: location', 'form_website:Form: website',
    'form_github:Form: GitHub', 'form_linkedin:Form: LinkedIn', 'form_telegram:Form: Telegram',
    'form_resume_upload:Form: resume upload', 'form_cover_letter:Form: cover letter',
    'form_submit:Form: submit button', 'captcha:Captcha marker',
].map((s, i) => { const [code, name] = s.split(':'); return [i + 1, code, name.trim()]; });

const elId = (code) => sid('3', ELEMENTS.find((e) => e[1] === code)[0]);
const taskId = (code) => sid('2', TASKS.find((t) => t[1] === code)[0]);
const platId = (code) => sid('1', PLATFORMS.find((p) => p[2] === code)[0]);

const SELECTORS = [
    ['indeed.com','parse_vacancy_list','container','ul.css-pygyny.eu4oa1w0 li, .mosaic-provider-jobcards-1ppyh6m, div.job_seen_beacon'],
    ['indeed.com','parse_vacancy_list','title','.jcs-JobTitle span[title], a.jcs-JobTitle'],
    ['indeed.com','parse_vacancy_list','link','a.jcs-JobTitle'],
    ['indeed.com','search_interaction','search_input','#text-input-what'],
    ['indeed.com','search_interaction','search_button','button.yosegi-InlineWhatWhere-primaryButton'],
    ['indeed.com','parse_vacancy_list','pagination','a[data-testid="pagination-page-next"]'],
    ['indeed.com','parse_vacancy_detail','description','#jobDescriptionText'],
    ['ziprecruiter.com','parse_vacancy_list','container','article.job_result, div.job_content, [data-testid="job-card"]'],
    ['ziprecruiter.com','parse_vacancy_list','title','h2.job_title, a.job_link, [data-testid="job-title"]'],
    ['ziprecruiter.com','parse_vacancy_list','link','a.job_link, a[data-testid="job-card-title"]'],
    ['ziprecruiter.com','search_interaction','search_input','input#search-job-keyword, input[name="search"]'],
    ['ziprecruiter.com','search_interaction','search_button','button.search_form_submit, button[type="submit"]'],
    ['ziprecruiter.com','parse_vacancy_list','pagination','a.pagination_link[rel="next"], a[aria-label="Next Page"]'],
    ['ziprecruiter.com','parse_vacancy_detail','description','div.job_description, [data-testid="job-description"]'],
    ['weworkremotely.com','parse_vacancy_list','container','section.jobs article ul li:not(.view-all), li.feature'],
    ['weworkremotely.com','parse_vacancy_list','title','span.title'],
    ['weworkremotely.com','parse_vacancy_list','link','a[href*="/remote-jobs/"]'],
    ['weworkremotely.com','search_interaction','search_input','input#search'],
    ['weworkremotely.com','search_interaction','search_button','button#search-button'],
    ['weworkremotely.com','parse_vacancy_list','pagination','span.next a'],
    ['weworkremotely.com','parse_vacancy_detail','description','div#job-details, div.listing-container'],
];

const PROMPTS = [
    {
        code: 'auto_detect_selectors', name: 'Detect selectors', output_format: 'json',
        system_prompt: 'You analyse HTML of a job listing page and return CSS selectors only.',
        user_prompt_template: 'Analyze the HTML snippet below and return JSON {"container":"","title":"","link":""}.\n\n{{html}}',
    },
    {
        code: 'match_score', name: 'Resume-vacancy match', output_format: 'json',
        system_prompt: 'You compare a resume excerpt with a vacancy. Never include contact data in the answer.',
        user_prompt_template: 'Vacancy:\n{{vacancy}}\n\nResume (skills and experience only):\n{{resume}}\n\nReturn JSON {"score":0-100,"matched_skills":[],"missing_skills":[]}.',
    },
    {
        code: 'cover_letter', name: 'Tailored cover letter', output_format: 'text',
        system_prompt: 'You write a concise formal cover letter that refers to the vacancy responsibilities and the candidate achievements.',
        user_prompt_template: 'Vacancy:\n{{vacancy}}\n\nCandidate summary:\n{{resume_summary}}\n\nWrite the letter.',
    },
];

export async function seedDatabase() {
    if ((await db.platforms_dict.count()) > 0) return;
    const ts = now();
    await db.transaction('rw', db.tables, async () => {
        await db.platforms_dict.bulkAdd(PLATFORMS.map(([n, name, code, url]) =>
            ({ id: sid('1', n), name, code, url, permission_status: 'none' })));
        await db.selector_tasks_dict.bulkAdd(TASKS.map(([n, code, name]) => ({ id: sid('2', n), code, name })));
        await db.selector_element_types_dict.bulkAdd(ELEMENTS.map(([n, code, name]) => ({ id: sid('3', n), code, name })));
        await db.currencies_dict.bulkAdd([[1,'USD','US Dollar'],[2,'EUR','Euro'],[3,'GBP','British Pound'],[4,'PLN','Polish Zloty']]
            .map(([n, code, name]) => ({ id: sid('4', n), code, name })));
        await db.regions_dict.bulkAdd([[1,'AMERICA','America'],[2,'EU','EU'],[3,'CIS','CIS'],[4,'OTHER','Other']]
            .map(([n, code, name]) => ({ id: sid('5', n), code, name })));
        await db.countries_dict.bulkAdd([[1,1,'United States'],[2,2,'Lithuania'],[3,2,'Poland'],[4,2,'Germany'],[5,4,'United Kingdom']]
            .map(([n, r, name]) => ({ id: sid('6', n), region_id: sid('5', r), name })));
        await db.cities_dict.bulkAdd([[1,1,'New York'],[2,2,'Vilnius'],[3,2,'Kaunas'],[4,3,'Warsaw'],[5,4,'Berlin'],[6,5,'London']]
            .map(([n, c, name]) => ({ id: sid('7', n), country_id: sid('6', c), name })));
        await db.levels_dict.bulkAdd(['Intern','Junior','Middle','Senior','Lead'].map((name, i) => ({ id: sid('8', i + 1), name })));
        await db.work_formats_dict.bulkAdd(['Remote','Offline','Hybrid'].map((name, i) => ({ id: sid('9', i + 1), name })));
        await db.employment_types_dict.bulkAdd(['Full-time','Part-time','Contract'].map((name, i) => ({ id: sid('a', i + 1), name })));
        await db.positions_dict.bulkAdd(['Frontend Developer','Backend Developer','Full Stack Developer','Software Engineer','DevOps Engineer','QA Engineer']
            .map((name, i) => ({ id: sid('b', i + 1), name, is_verified: 1 })));

        await db.selectors.bulkAdd(SELECTORS.map(([p, t, e, selector_string], i) => ({
            id: sid('c', i + 1), platform_id: platId(p), task_id: taskId(t), element_type_id: elId(e),
            url_pattern: p, selector_kind: 'css', selector_string, version: 1, source: 'seed',
            is_active: 1, validation_failures: 0, updated_at: ts,
        })));

        await db.prompt_templates.bulkAdd(PROMPTS.map((p, i) => ({ id: sid('e', i + 1), ...p, created_at: ts, updated_at: ts })));
        await db.app_settings.bulkAdd(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value, updated_at: ts })));
    });
}