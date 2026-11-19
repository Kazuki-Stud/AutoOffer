import { db } from './database.js';
import { SETTING_KEYS } from './validation.js';

export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

export const DEFAULT_SETTINGS = {
  private_use_only: false,
  auto_sync_pwa_on_grab: true,
  submission_mode: 'semi_automated',
  selector_poll_interval_min: 5,
  ai_consent_given_at: null,
  ai_consent_version: null,
  server_base_url: 'http://localhost:8080',
};

export async function getSetting(key) {
  const row = await db.app_settings.get(key);
  return row ? row.value : DEFAULT_SETTINGS[key];
}

export async function setSetting(key, value) {
  if (!SETTING_KEYS.includes(key)) throw new Error(`unknown setting ${key}`);
  await db.app_settings.put({ key, value, updated_at: nowIso() });
}

export async function recordAiConsent(version = '1.0') {
  await setSetting('ai_consent_given_at', nowIso());
  await setSetting('ai_consent_version', version);
}

export async function hasAiConsent() {
  return (await getSetting('ai_consent_given_at')) !== null;
}

// ---- profiles ---------------------------------------------------------------
export async function ensureDefaultProfile() {
  return db.transaction('rw', db.user_profiles, async () => {
    const def = await db.user_profiles.where('is_default').equals(1).first();
    if (def) return def;
    const any = await db.user_profiles.toCollection().first();
    if (any) {
      await db.user_profiles.update(any.id, { is_default: 1, updated_at: nowIso() });
      return { ...any, is_default: 1 };
    }
    const ts = nowIso();
    const profile = { id: newId(), name: 'Default', is_default: 1, created_at: ts, updated_at: ts };
    await db.user_profiles.add(profile);
    return profile;
  });
}

export async function setDefaultProfile(profileId) {
  await db.transaction('rw', db.user_profiles, async () => {
    if (!(await db.user_profiles.get(profileId))) throw new Error('profile not found');
    await db.user_profiles.toCollection().modify((p) => { p.is_default = p.id === profileId ? 1 : 0; });
  });
}

export async function deleteProfileCascade(profileId) {
  const t = [
    db.user_profiles, db.personal_data, db.resumes, db.cover_letters,
    db.platform_credentials, db.search_preferences, db.applications, db.match_results,
  ];
  await db.transaction('rw', t, async () => {
    const resumeIds = await db.resumes.where('profile_id').equals(profileId).primaryKeys();
    await db.match_results.where('resume_id').anyOf(resumeIds).delete();
    await db.applications.where('profile_id').equals(profileId).delete();
    await db.cover_letters.where('profile_id').equals(profileId).delete();
    await db.resumes.where('profile_id').equals(profileId).delete();
    await db.personal_data.where('profile_id').equals(profileId).delete();
    await db.platform_credentials.where('profile_id').equals(profileId).delete();
    await db.search_preferences.where('profile_id').equals(profileId).delete();
    await db.user_profiles.delete(profileId);
  });
}

export async function deleteResume(resumeId) {
  await db.transaction('rw', [db.resumes, db.applications, db.cover_letters, db.match_results], async () => {
    await db.applications.where('resume_id').equals(resumeId).modify({ resume_id: null });
    await db.cover_letters.where('resume_id').equals(resumeId).modify({ resume_id: null });
    await db.match_results.where('resume_id').equals(resumeId).delete();
    await db.resumes.delete(resumeId);
  });
}

// ---- vacancies --------------------------------------------------------------
export async function deleteVacancy(vacancyId) {
  await db.transaction('rw', [db.local_vacancies, db.applications, db.match_results, db.cover_letters], async () => {
    if ((await db.applications.where('vacancy_id').equals(vacancyId).count()) > 0) {
      throw new Error('vacancy has an application; delete or keep the application first');
    }
    await db.match_results.where('vacancy_id').equals(vacancyId).delete();
    await db.cover_letters.where('vacancy_id').equals(vacancyId).modify({ vacancy_id: null });
    await db.local_vacancies.delete(vacancyId);
  });
}

export async function getOrCreateByName(table, name, extra = {}) {
  const trimmed = String(name).trim();
  return db.transaction('rw', db[table], async () => {
    const found = await db[table].where('name').equals(trimmed).first();
    if (found) return found.id;
    const id = newId();
    await db[table].add({ id, name: trimmed, is_verified: 0, ...extra });
    return id;
  });
}

export async function saveVacancy(data, { source = 'manual' } = {}) {
  const now = nowIso();
  return db.transaction('rw', db.local_vacancies, async () => {
    const existing = await db.local_vacancies.where('url').equals(data.url).first();
    if (existing) {
      await db.local_vacancies.update(existing.id, { ...data, sync_level: 'none', updated_at: now });
      return existing.id;
    }
    const record = {
      skill_ids: [], status: 'complete', ...data,
      id: newId(), source, sync_level: 'none', created_at: now, updated_at: now,
    };
    await db.local_vacancies.add(record);
    return record.id;
  });
}

export async function allowedSyncLevel(vacancy) {
  if (await getSetting('private_use_only')) return 'none';
  const platform = vacancy.platform_id ? await db.platforms_dict.get(vacancy.platform_id) : null;
  return platform?.permission_status === 'granted' ? 'full' : 'url_only';
}

export async function markSynced(vacancyId, level) {
  await db.local_vacancies.update(vacancyId, { sync_level: level, updated_at: nowIso() });
}

// ---- AI configurations, matching, cover letters & applications --------------
export async function getActiveAiConfiguration() {
  const active = await db.ai_configurations.where('is_active').equals(1).first();
  if (active) return active;
  const all = await db.ai_configurations.toArray();
  all.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  return all[0] || null;
}

export async function setActiveAiConfiguration(configId) {
  await db.transaction('rw', db.ai_configurations, async () => {
    if (!(await db.ai_configurations.get(configId))) throw new Error('AI configuration not found');
    const now = nowIso();
    await db.ai_configurations.toCollection().modify((cfg) => {
      cfg.is_active = cfg.id === configId ? 1 : 0;
      cfg.updated_at = now;
    });
  });
}

export async function deleteAiConfiguration(configId) {
  await db.ai_configurations.delete(configId);
}

export async function getMatchResult(vacancyId, resumeId) {
  return db.match_results.where('[vacancy_id+resume_id]').equals([vacancyId, resumeId]).first();
}

export async function saveMatchResult({ vacancy_id, resume_id, score, matched_skills, missing_skills, model = null }) {
  return db.transaction('rw', db.match_results, async () => {
    const existing = await db.match_results.where('[vacancy_id+resume_id]').equals([vacancy_id, resume_id]).first();
    const record = {
      id: existing?.id ?? newId(),
      vacancy_id, resume_id, score, matched_skills, missing_skills, model, created_at: nowIso(),
    };
    await db.match_results.put(record);
    return record.id;
  });
}

export async function getCoverLetterForVacancy(profileId, vacancyId, resumeId = null) {
  const candidates = await db.cover_letters.where('vacancy_id').equals(vacancyId).toArray();
  const byProfile = candidates.filter((c) => c.profile_id === profileId);
  if (!byProfile.length) return null;
  if (resumeId) {
    const exact = byProfile.find((c) => c.resume_id === resumeId);
    if (exact) return exact;
  }
  byProfile.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  return byProfile[0];
}

export async function saveCoverLetter({
                                        id = null,
                                        profile_id,
                                        vacancy_id = null,
                                        resume_id = null,
                                        title,
                                        plain_text,
                                        skill_ids = [],
                                      }) {
  const now = nowIso();
  return db.transaction('rw', db.cover_letters, async () => {
    const existing = id ? await db.cover_letters.get(id) : null;
    const record = {
      id: existing?.id ?? id ?? newId(),
      profile_id,
      vacancy_id: vacancy_id ?? existing?.vacancy_id ?? null,
      resume_id: resume_id ?? existing?.resume_id ?? null,
      title: String(title || existing?.title || 'Tailored Cover Letter').trim().slice(0, 150),
      plain_text: String(plain_text || '').trim(),
      skill_ids: Array.isArray(skill_ids) ? [...new Set(skill_ids)] : [],
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    await db.cover_letters.put(record);
    return record;
  });
}

export async function createApplication({ profile_id, vacancy_id, resume_id = null, cover_letter_id = null, match_score = null }) {
  return db.transaction('rw', [db.applications, db.local_vacancies, db.resumes], async () => {
    if (!(await db.local_vacancies.get(vacancy_id))) throw new Error('vacancy not found');
    if (resume_id && !(await db.resumes.get(resume_id))) throw new Error('resume not found');
    const now = nowIso();
    const record = {
      id: newId(), profile_id, vacancy_id, resume_id, cover_letter_id, match_score,
      status: 'Applied', applied_at: now, status_changed_at: now,
    };
    try {
      await db.applications.add(record);
    } catch (e) {
      if (e?.name === 'ConstraintError') throw new Error('an application for this vacancy already exists');
      throw e;
    }
    return record.id;
  });
}

export async function setApplicationStatus(id, status) {
  await db.applications.update(id, { status, status_changed_at: nowIso() });
}

// ---- selector cache with rollback (US 2.1, 2.2) -----------------------------
export async function applyRegistrySelectors(rows) {
  const now = nowIso();
  let applied = 0;
  await db.transaction('rw', db.selectors, async () => {
    for (const r of rows) {
      const existing = (await db.selectors.where('[platform_id+task_id+element_type_id]')
          .equals([r.platform_id, r.task_id, r.element_type_id]).toArray())
          .find((s) => (s.url_pattern ?? null) === (r.url_pattern ?? null));
      if (!existing) {
        await db.selectors.add({ id: newId(), source: 'registry', is_active: 1, validation_failures: 0, ...r, updated_at: now });
        applied++;
      } else if (r.version > existing.version) {
        await db.selectors.update(existing.id, {
          selector_kind: r.selector_kind, selector_string: r.selector_string, version: r.version,
          previous_selector_string: existing.selector_string, previous_version: existing.version,
          source: 'registry', is_active: 1, validation_failures: 0, updated_at: now,
        });
        applied++;
      }
    }
  });
  return applied;
}

export async function rollbackSelector(id) {
  const s = await db.selectors.get(id);
  if (!s?.previous_selector_string) return false;
  await db.selectors.update(id, {
    selector_string: s.previous_selector_string, version: s.previous_version,
    previous_selector_string: null, previous_version: null,
    validation_failures: (s.validation_failures ?? 0) + 1, updated_at: nowIso(),
  });
  return true;
}