import Dexie from 'dexie';

export class LocalJobDatabase extends Dexie {
    constructor() {
        super('LocalJobManagementDB');

        this.version(4).stores({
            local_device_state: 'id',
            platforms_dict: 'id, code, url, name',
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
            automation_jobs: 'id, status, created_at'
        });
    }
}

export const db = new LocalJobDatabase();