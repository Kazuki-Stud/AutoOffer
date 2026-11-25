/**
 * @typedef {'Applied' | 'Screening' | 'Interview' | 'Offered' | 'Rejected'} ApplicationStatus
 */

/**
 * Local Dexie vacancy record (snake_case storage schema).
 * @typedef {Object} VacancyRecord
 * @property {string} id
 * @property {string | null} platform_id
 * @property {string | null} source_host
 * @property {string} full_position_name
 * @property {string | null} company_id
 * @property {string | null} address
 * @property {string} url
 * @property {string | null} description
 * @property {string | null} posted_at
 * @property {'none' | 'url_only' | 'full'} sync_level
 * @property {'auto' | 'manual'} source
 * @property {'new' | 'complete' | 'error'} status
 * @property {string[]} skill_ids
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * Local application lifecycle record.
 * @typedef {Object} ApplicationRecord
 * @property {string} id
 * @property {string} profile_id
 * @property {string} vacancy_id
 * @property {string | null} resume_id
 * @property {string | null} cover_letter_id
 * @property {number | null} match_score
 * @property {ApplicationStatus} status
 * @property {string} applied_at
 * @property {string} status_changed_at
 * @property {string | null} [notes]
 */

/**
 * Hydrated candidate profile view model.
 * @typedef {Object} CandidateProfile
 * @property {string} profile_id
 * @property {string} profile_name
 * @property {0 | 1} is_default
 * @property {string} first_name
 * @property {string} last_name
 * @property {string} email
 * @property {string} phone
 * @property {string} location
 * @property {string} links
 * @property {string} roles
 * @property {string} locations
 * @property {string} keywords
 */

/**
 * Local resume variant with optional file attachment.
 * @typedef {Object} ResumeVariant
 * @property {string} id
 * @property {string} profile_id
 * @property {string} title
 * @property {string | null} summary
 * @property {string} plain_text
 * @property {string[]} skill_ids
 * @property {string[]} [skills]
 * @property {string | null} [file_name]
 * @property {string | null} [mime_type]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * Saved automation search job.
 * @typedef {Object} AutomationJob
 * @property {string} id
 * @property {string} title
 * @property {string} websites
 * @property {string} roles
 * @property {string} locations
 * @property {string} keywords
 * @property {string} profile_id
 * @property {'all' | 'minimum'} fields_mode
 * @property {number} limit
 * @property {string} status
 * @property {string} created_at
 */

/**
 * AI match evaluation result.
 * @typedef {Object} MatchResult
 * @property {string} id
 * @property {string} vacancy_id
 * @property {string} resume_id
 * @property {number} score
 * @property {string[]} matched_skills
 * @property {string[]} missing_skills
 * @property {string | null} model
 * @property {string} created_at
 */

/**
 * Sanitized AI provider configuration metadata (API key stays encrypted in Dexie).
 * @typedef {Object} AiConfigMeta
 * @property {string} id
 * @property {'openai' | 'gemini' | 'local' | 'local_cosine'} provider_name
 * @property {string | null} api_endpoint
 * @property {string} model_name
 * @property {0 | 1} is_active
 * @property {boolean} has_api_key
 */

/**
 * Spring Boot GET /api/skills/hotwords response item (camelCase DTO).
 * @typedef {Object} SkillHotwordDto
 * @property {string} positionId
 * @property {string} positionName
 * @property {string} skillId
 * @property {string} skillName
 * @property {number} vacancyCount
 */

/**
 * ClickHouse GET /api/analytics/skills-demand row (snake_case OLAP view).
 * @typedef {Object} ClickHouseSkillDemandRow
 * @property {string} position_name
 * @property {string} skill_name
 * @property {number} total_vacancies
 * @property {number | null} avg_salary_eur
 * @property {number} skill_rank
 */

/**
 * Spring Boot GlobalExceptionHandler error payload.
 * @typedef {Object} ApiErrorBody
 * @property {string} timestamp
 * @property {number} status
 * @property {string} code
 * @property {string} message
 * @property {Object.<string, string>} details
 */

export {};
