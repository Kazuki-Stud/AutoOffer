import Dexie from 'dexie';
import { attachValidation } from './validation.js';
export * from './database/database.js';

const STORES_V5 = {
    local_device_state: 'id',
    platforms_dict: 'id, code, url, name, mode',
    selector_tasks_dict: 'id, code',
    selector_element_types_dict: 'id, code',
    currencies_dict: 'id, code',
    companies_dict: 'id, name, is_verified',
    positions_dict: 'id, name, is_verified',
    regions_dict: 'id, code',
    countries_dict: 'id, region_id',
    cities_dict: 'id, country_id',
    levels_dict: 'id',
    work_formats_dict: 'id',
    employment_types_dict: 'id',
    selectors: 'id, platform_id, task_id, element_type_id, url_pattern',
    skills: 'id, name, is_verified',
    local_vacancies: 'id, platform_id, position_id, company_id, region_id, country_id, city_id, currency_id, level_id, work_format_id, employment_type_id, url, synced',
    local_vacancy_skills: '[vacancy_id+skill_id], vacancy_id, skill_id',
    user_profiles: 'id, is_default',
    personal_data: 'id, profile_id',
    resumes: 'id, profile_id',
    resume_skills: '[resume_id+skill_id], resume_id, skill_id',
    cover_letters: 'id, profile_id',
    cover_letter_skills: '[cover_letter_id+skill_id], cover_letter_id, skill_id',
    platform_credentials: 'id, platform_id, profile_id',
    ai_configurations: 'id',
    prompt_templates: 'id, code',
    automation_jobs: 'id, title, status, created_at',
};

const STORES_V6 = {
    local_device_state: 'id',
    platforms_dict: 'id, &code, url, name, mode, permission_status',
    selector_tasks_dict: 'id, &code',
    selector_element_types_dict: 'id, &code',
    currencies_dict: 'id, &code',
    companies_dict: 'id, &name, is_verified',
    positions_dict: 'id, &name, is_verified',
    regions_dict: 'id, &code',
    countries_dict: 'id, region_id, &name',
    cities_dict: 'id, country_id, &[country_id+name]',
    levels_dict: 'id, &name',
    work_formats_dict: 'id, &name',
    employment_types_dict: 'id, &name',

    selectors: 'id, platform_id, task_id, element_type_id, url_pattern, version, source, is_active, [platform_id+task_id+element_type_id]',
    skills: 'id, &name, is_verified',
    local_vacancies: 'id, platform_id, source_host, position_id, company_id, region_id, country_id, city_id, currency_id, level_id, work_format_id, employment_type_id, &url, sync_level, status, source, created_at, updated_at, *skill_ids, [platform_id+updated_at]',

    user_profiles: 'id, is_default',
    personal_data: 'id, &profile_id',
    resumes: 'id, profile_id, updated_at, *skill_ids',
    cover_letters: 'id, profile_id, vacancy_id, resume_id, updated_at, *skill_ids',
    platform_credentials: 'id, platform_id, profile_id, &[profile_id+platform_id+account_identifier]',
    ai_configurations: 'id, is_active',
    prompt_templates: 'id, &code',

    applications: 'id, profile_id, vacancy_id, resume_id, cover_letter_id, status, applied_at, match_score, &[profile_id+vacancy_id], [status+applied_at]',
    match_results: 'id, vacancy_id, resume_id, score, created_at, &[vacancy_id+resume_id]',
    search_preferences: 'id, &profile_id',
    app_settings: 'key',
    automation_jobs: 'id, title, status, created_at',

    local_vacancy_skills: '[vacancy_id+skill_id], vacancy_id, skill_id',
    resume_skills: '[resume_id+skill_id], resume_id, skill_id',
    cover_letter_skills: '[cover_letter_id+skill_id], cover_letter_id, skill_id',
};

const toFlag = (v) => (v === true || v === 1 || v === '1' ? 1 : 0);
const group = (rows, ownerKey, skillKey) => {
    const m = new Map();
    for (const r of rows) {
        if (!m.has(r[ownerKey])) m.set(r[ownerKey], []);
        m.get(r[ownerKey]).push(r[skillKey]);
    }
    return m;
};

export class LocalJobDatabase extends Dexie {
    constructor() {
        super('LocalJobManagementDB');

        this.version(5).stores(STORES_V5);

        this.version(6).stores(STORES_V6).upgrade(async (tx) => {
            this.validation.enabled = false;
            try {
                const now = new Date().toISOString();

                await tx.table('platforms_dict').toCollection().modify((p) => { p.permission_status ??= 'none'; });

                await tx.table('selectors').toCollection().modify((s) => {
                    s.selector_kind ??= /^\s*(\/|\(|\.\/)/.test(s.selector_string || '') ? 'xpath' : 'css';
                    s.version ??= 1;
                    s.source ??= 'registry';
                    s.is_active = toFlag(s.is_active ?? 1);
                    s.updated_at ??= now;
                });

                for (const t of ['companies_dict', 'positions_dict', 'skills']) {
                    await tx.table(t).toCollection().modify((r) => { r.is_verified = toFlag(r.is_verified); });
                }
                await tx.table('user_profiles').toCollection().modify((r) => { r.is_default = toFlag(r.is_default); });

                const vSkills = group(await tx.table('local_vacancy_skills').toArray(), 'vacancy_id', 'skill_id');
                await tx.table('local_vacancies').toCollection().modify((v) => {
                    v.skill_ids = vSkills.get(v.id) ?? [];
                    v.sync_level ??= v.synced ? 'full' : 'none';
                    delete v.synced;
                    v.source ??= 'auto';
                    v.status ??= v.description ? 'complete' : 'new';
                    v.created_at ??= now;
                    v.updated_at ??= v.created_at;
                    if (v.city_id) { v.country_id = null; v.region_id = null; }
                    else if (v.country_id) { v.region_id = null; }
                });

                const rSkills = group(await tx.table('resume_skills').toArray(), 'resume_id', 'skill_id');
                await tx.table('resumes').toCollection().modify((r) => { r.skill_ids = rSkills.get(r.id) ?? []; });

                const cSkills = group(await tx.table('cover_letter_skills').toArray(), 'cover_letter_id', 'skill_id');
                await tx.table('cover_letters').toCollection().modify((c) => { c.skill_ids = cSkills.get(c.id) ?? []; });

                await tx.table('platform_credentials').toCollection().modify((c) => { if (c.credentials_data) c.needs_encryption = 1; });
                await tx.table('ai_configurations').toCollection().modify((a) => {
                    a.is_active = toFlag(a.is_active);
                    if (a.api_key) a.needs_encryption = 1;
                });

                await tx.table('local_device_state').clear();
            } finally {
                this.validation.enabled = true;
            }
        });

        this.version(7).stores({ local_vacancy_skills: null, resume_skills: null, cover_letter_skills: null });

        attachValidation(this);
    }
}

export const db = new LocalJobDatabase();