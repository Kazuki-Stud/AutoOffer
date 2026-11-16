// ---------------------------------------------------------------------------
// Schema validation for the local store (IndexedDB has no constraints of its own).
// Mirrors the server CHECK rules and the BA acceptance criteria.
// validateRecord() is pure so it can be unit-tested without a browser.
// ---------------------------------------------------------------------------
const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE   = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE   = /^https?:\/\//i;
// same rule as the server CHECK: selectors are declarative data, never scripts or URLs
const UNSAFE_SELECTOR_RE = /(javascript:|<\s*script|https?:\/\/|data:)/i;

export const ENUMS = {
  permission_status: ['none', 'pending', 'granted'],
  selector_kind:     ['css', 'xpath'],
  selector_source:   ['registry', 'heuristic', 'seed', 'manual'],
  sync_level:        ['none', 'url_only', 'full'],        // what has actually been sent to the server
  vacancy_source:    ['auto', 'manual'],                  // background collection vs "Save vacancy" button
  vacancy_status:    ['new', 'complete', 'error'],
  application_status:['Applied', 'Screening', 'Interview', 'Offered', 'Rejected'],   // US 5.3
  submission_mode:   ['manual', 'semi_automated'],
};

// field spec helpers ---------------------------------------------------------
const uuid  = (req = false) => ({ t: 'uuid', req });
const str   = (max, req = false, min = 0) => ({ t: 'str', max, min, req });
const text  = (req = false) => ({ t: 'text', req });
const iso   = (req = false) => ({ t: 'iso', req });
const flag  = (req = false) => ({ t: 'flag', req });         // 0 | 1  (booleans cannot be indexed in IndexedDB)
const int   = (min, max, req = false) => ({ t: 'int', min, max, req });
const num   = (min, req = false) => ({ t: 'num', min, req });
const url   = (req = false) => ({ t: 'url', req });
const email = (req = false) => ({ t: 'email', req });
const oneOf = (values, req = false) => ({ t: 'enum', values, req });
const uuids = (req = false) => ({ t: 'uuids', req });
const strs  = (minLen = 0, req = false) => ({ t: 'strs', minLen, req });
const blob  = () => ({ t: 'blob' });
const enc   = (req = false) => ({ t: 'enc', req });

const idName = { id: uuid(true), name: str(100, true, 1) };

export const RULES = {
  local_device_state: {
    id: str(20, true), pseudonymous_id: uuid(true), auth_token_enc: enc(), last_synced_at: iso(),
  },
  platforms_dict: {
    id: uuid(true), name: str(100, true, 1), code: str(50, true, 1), url: url(true),
    permission_status: oneOf(ENUMS.permission_status, true), last_checked_at: iso(), mode: str(20),
  },
  selector_tasks_dict:         { id: uuid(true), code: str(50, true, 1), name: str(100, true, 1) },
  selector_element_types_dict: { id: uuid(true), code: str(50, true, 1), name: str(100, true, 1) },
  currencies_dict:             { id: uuid(true), code: { t: 'regex', re: /^[A-Z]{3}$/, req: true }, name: str(50, true, 1) },
  companies_dict:  { id: uuid(true), name: str(255, true, 1), website: url(), is_verified: flag(true) },
  positions_dict:  { id: uuid(true), name: str(255, true, 1), is_verified: flag(true) },
  skills:          { id: uuid(true), name: str(100, true, 1), is_verified: flag(true) },
  regions_dict:    { id: uuid(true), code: str(50, true, 1), name: str(100, true, 1) },
  countries_dict:  { id: uuid(true), region_id: uuid(true), name: str(100, true, 1) },
  cities_dict:     { id: uuid(true), country_id: uuid(true), name: str(100, true, 1) },
  levels_dict: idName, work_formats_dict: idName, employment_types_dict: idName,

  selectors: {
    id: uuid(true), platform_id: uuid(true), task_id: uuid(true), element_type_id: uuid(true),
    url_pattern: str(255), selector_kind: oneOf(ENUMS.selector_kind, true),
    selector_string: str(2000, true, 1), version: int(1, undefined, true),
    source: oneOf(ENUMS.selector_source, true), is_active: flag(true), updated_at: iso(true),
    previous_selector_string: str(2000), previous_version: int(1), validation_failures: int(0),
  },

  local_vacancies: {
    id: uuid(true), platform_id: uuid(), source_host: str(255),
    position_id: uuid(), full_position_name: str(255, true, 1), company_id: uuid(), address: text(),
    region_id: uuid(), country_id: uuid(), city_id: uuid(),
    salary_from: num(0), salary_to: num(0), currency_id: uuid(),
    level_id: uuid(), work_format_id: uuid(), employment_type_id: uuid(),
    url: url(true), description: text(true),
    sync_level: oneOf(ENUMS.sync_level, true), source: oneOf(ENUMS.vacancy_source, true),
    status: oneOf(ENUMS.vacancy_status, true), skill_ids: uuids(true),
    created_at: iso(true), updated_at: iso(true),
  },

  user_profiles: { id: uuid(true), name: str(100, true, 1), is_default: flag(true), created_at: iso(true), updated_at: iso(true) },
  personal_data: {
    id: uuid(true), profile_id: uuid(true), first_name: str(100, true, 1), last_name: str(100, true, 1),
    email: email(true), phone: str(50), location: str(255), website: url(), github: url(), linkedin: url(),
    telegram: str(255), education: text(), created_at: iso(true), updated_at: iso(true),
  },
  resumes: {
    id: uuid(true), profile_id: uuid(true), title: str(150, true, 1), plain_text: text(true),
    file_name: str(255), mime_type: str(100), file_data: blob(), summary: text(),
    skill_ids: uuids(true), created_at: iso(true), updated_at: iso(true),
  },
  cover_letters: {
    id: uuid(true), profile_id: uuid(true), vacancy_id: uuid(), resume_id: uuid(),
    title: str(150, true, 1), plain_text: text(true), file_name: str(255), mime_type: str(100), file_data: blob(),
    skill_ids: uuids(true), created_at: iso(true), updated_at: iso(true),
  },
  platform_credentials: {
    id: uuid(true), platform_id: uuid(true), profile_id: uuid(true),
    account_identifier: str(255, true, 1), credentials_enc: enc(), updated_at: iso(true),
  },
  ai_configurations: {
    id: uuid(true), provider_name: str(100, true, 1), api_endpoint: url(), api_key_enc: enc(),
    model_name: str(100, true, 1), is_active: flag(true), created_at: iso(true), updated_at: iso(true),
  },
  prompt_templates: {
    id: uuid(true), code: str(50, true, 1), name: str(100, true, 1), system_prompt: text(true),
    user_prompt_template: text(true), output_format: str(50, true, 1), created_at: iso(true), updated_at: iso(true),
  },

  applications: {
    id: uuid(true), profile_id: uuid(true), vacancy_id: uuid(true), resume_id: uuid(), cover_letter_id: uuid(),
    match_score: int(0, 100), status: oneOf(ENUMS.application_status, true),
    applied_at: iso(true), status_changed_at: iso(true), notes: text(),
  },
  match_results: {
    id: uuid(true), vacancy_id: uuid(true), resume_id: uuid(true), score: int(0, 100, true),
    matched_skills: strs(0, true), missing_skills: strs(0, true), model: str(100), created_at: iso(true),
  },
  search_preferences: {
    id: uuid(true), profile_id: uuid(true),
    roles: strs(1, true),                                  // US 1.4: an empty role list is rejected
    locations: strs(0), keywords: strs(0), urls: strs(0), platform_ids: uuids(),
    page_limit: int(1, 1000, true),                        // US 1.4: page limit below 1 is rejected
    updated_at: iso(true),
  },
  app_settings: { key: str(100, true, 1), updated_at: iso() },
  automation_jobs: { id: uuid(), title: str(255), status: str(50), created_at: iso() },
};

// Secrets must never be stored in clear text. Legacy plain fields are tolerated ONLY while
// needs_encryption === 1 (set by the v6 upgrade, cleared by migrateLegacySecrets()).
const PLAIN_SECRET_FIELDS = {
  platform_credentials: ['credentials_data'],
  ai_configurations: ['api_key'],
  local_device_state: ['auth_token', 'device_fingerprint'],
};

const SETTING_RULES = {
  private_use_only:           (v) => typeof v === 'boolean',
  submission_mode:            (v) => ENUMS.submission_mode.includes(v),
  selector_poll_interval_min: (v) => Number.isInteger(v) && v >= 1 && v <= 60,   // KPI 3: propagation <= 10 min
  ai_consent_given_at:        (v) => v === null || ISO_RE.test(v),
  ai_consent_version:         (v) => v === null || (typeof v === 'string' && v.length <= 20),
};
export const SETTING_KEYS = Object.keys(SETTING_RULES);

function checkField(name, spec, v) {
  if (v === undefined || v === null) return spec.req ? `${name} is required` : null;
  switch (spec.t) {
    case 'uuid':  return typeof v === 'string' && UUID_RE.test(v) ? null : `${name} must be a UUID`;
    case 'str':   return typeof v === 'string' && v.length >= (spec.min || 0) && v.length <= spec.max ? null : `${name} must be a string of ${spec.min || 0}..${spec.max} chars`;
    case 'text':  return typeof v === 'string' && v.length > 0 ? null : `${name} must be non-empty text`;
    case 'iso':   return typeof v === 'string' && ISO_RE.test(v) ? null : `${name} must be an ISO-8601 timestamp`;
    case 'flag':  return v === 0 || v === 1 ? null : `${name} must be 0 or 1 (booleans cannot be indexed)`;
    case 'int':   return Number.isInteger(v) && (spec.min === undefined || v >= spec.min) && (spec.max === undefined || v <= spec.max) ? null : `${name} must be an integer in range`;
    case 'num':   return typeof v === 'number' && Number.isFinite(v) && (spec.min === undefined || v >= spec.min) ? null : `${name} must be a number >= ${spec.min}`;
    case 'url':   return typeof v === 'string' && URL_RE.test(v) && v.length <= 2048 ? null : `${name} must be an http(s) URL`;
    case 'email': return typeof v === 'string' && EMAIL_RE.test(v) && v.length <= 255 ? null : `${name} must be an e-mail address`;
    case 'enum':  return spec.values.includes(v) ? null : `${name} must be one of ${spec.values.join('|')}`;
    case 'regex': return typeof v === 'string' && spec.re.test(v) ? null : `${name} has an invalid format`;
    case 'uuids': return Array.isArray(v) && v.every((x) => typeof x === 'string' && UUID_RE.test(x)) && new Set(v).size === v.length ? null : `${name} must be an array of unique UUIDs`;
    case 'strs':  return Array.isArray(v) && v.length >= spec.minLen && v.every((x) => typeof x === 'string' && x.trim().length > 0) ? null : `${name} must be an array of at least ${spec.minLen} non-empty strings`;
    case 'blob':  return (typeof Blob !== 'undefined' && v instanceof Blob) || v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? null : `${name} must be binary data`;
    case 'enc':   return v && typeof v === 'object' && v.v === 1 && v.iv && v.data ? null : `${name} must be an AES-GCM envelope {v,iv,data}`;
    default:      return null;
  }
}

// Cross-field rules (the local equivalent of the server CHECK constraints)
const CROSS = {
  local_vacancies(o, errs) {
    if (!o.platform_id && !o.source_host) errs.push('platform_id or source_host is required (vacancies from any website can be saved)');
    const locations = [o.region_id, o.country_id, o.city_id].filter((x) => x != null).length;
    if (locations > 1) errs.push('at most one of region_id/country_id/city_id may be set (derive the others from dictionaries)');
    if (o.salary_from != null && o.salary_to != null && o.salary_from > o.salary_to) errs.push('salary_from must be <= salary_to');
    if ((o.salary_from != null || o.salary_to != null) && !o.currency_id) errs.push('currency_id is required when a salary is given');
  },
  selectors(o, errs) {
    if (typeof o.selector_string === 'string' && UNSAFE_SELECTOR_RE.test(o.selector_string)) errs.push('selector_string must not contain scripts or URLs');
  },
  ai_configurations(o, errs) {
    if (!o.api_key_enc && o.needs_encryption !== 1) errs.push('api_key_enc is required');
  },
  platform_credentials(o, errs) {
    if (!o.credentials_enc && o.needs_encryption !== 1) errs.push('credentials_enc is required');
  },
  applications(o, errs) {
    if (o.status_changed_at && o.applied_at && o.status_changed_at < o.applied_at) errs.push('status_changed_at must not precede applied_at');
  },
  app_settings(o, errs) {
    if (!SETTING_RULES[o.key]) errs.push(`unknown setting "${o.key}"`);
    else if (!SETTING_RULES[o.key](o.value)) errs.push(`invalid value for setting "${o.key}"`);
  },
};

/** @returns {string[]} list of problems; empty = valid */
export function validateRecord(table, obj) {
  const rules = RULES[table];
  if (!rules) return [];
  const errs = [];
  for (const [name, spec] of Object.entries(rules)) {
    const e = checkField(name, spec, obj[name]);
    if (e) errs.push(e);
  }
  for (const f of PLAIN_SECRET_FIELDS[table] || []) {
    if (obj[f] !== undefined && obj[f] !== null && obj.needs_encryption !== 1) errs.push(`${f} must not be stored in clear text`);
  }
  CROSS[table]?.(obj, errs);
  return errs;
}

export class ValidationError extends Error {
  constructor(table, problems) {
    super(`[${table}] ${problems.join('; ')}`);
    this.name = 'ValidationError';
    this.table = table;
    this.problems = problems;
  }
}

/** Hooks run inside the Dexie transaction; throwing aborts the write. */
export function attachValidation(db) {
  db.validation = { enabled: true };           // paused only while a schema upgrade rewrites legacy rows
  for (const table of Object.keys(RULES)) {
    db.table(table).hook('creating', function (primKey, obj) {
      if (!db.validation.enabled) return;
      const problems = validateRecord(table, obj);
      if (problems.length) throw new ValidationError(table, problems);
    });
    db.table(table).hook('updating', function (mods, primKey, obj) {
      if (!db.validation.enabled) return;
      const merged = { ...obj };
      for (const [k, v] of Object.entries(mods)) if (!k.includes('.')) merged[k] = v;
      const problems = validateRecord(table, merged);
      if (problems.length) throw new ValidationError(table, problems);
    });
  }
}
