import { defineStore } from 'pinia';
import { db } from '../../../extension/database/database.js';
import { migrateLegacySecrets, saveAiConfiguration } from '../../../extension/database/crypto.js';
import {
    createApplication,
    deleteAiConfiguration,
    deleteProfileCascade,
    deleteResume,
    deleteVacancy,
    ensureDefaultProfile,
    getOrCreateByName,
    getSetting,
    hasAiConsent,
    newId,
    nowIso,
    recordAiConsent,
    setActiveAiConfiguration,
    setApplicationStatus,
    setDefaultProfile,
    setSetting,
} from '../../../extension/database/repository.js';
import { seedDatabase } from '../../../extension/database/seed.js';
import { KNOWN_SKILLS } from '../models/constants.js';
import {
    calculateStorageWeight,
    callExtension,
    detectExtensionStatus,
    getExtensionId,
    mirrorVacanciesToLocalDb,
    saveSingleSetting,
    setupExtensionAutoPairing,
    syncApplicationsFromBridge,
} from '../services/bridge.js';
import { logger } from '../services/logger.js';
import { base64ToBlob, parseProfileLinks, toStringArray } from '../utils/helpers.js';

const SKILL_PATTERNS = KNOWN_SKILLS.map((name) => {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [name, new RegExp(`(?<![a-z0-9+#.])${esc}(?![a-z0-9+#.])`, 'i')];
});

export const useAppStore = defineStore('app', {
    state: () => ({
        theme: localStorage.getItem('ao_theme') === 'light' ? 'light' : 'dark',
        uiScale: Number(localStorage.getItem('ao_ui_scale')) || 100,
        extensionId: localStorage.getItem('autooffer_extension_id') || '',
        isExtensionConnected: false,
        syncStatusText: 'Ready',
        syncStatusType: 'normal',

        loading: false,
        syncInFlight: false,
        toasts: [],
        globalError: null,

        vacancies: [],
        allApplications: [],
        companiesMap: new Map(),
        platformsMap: new Map(),
        skillsMap: new Map(),
        resumesMap: new Map(),
        matchByVacancy: new Map(),

        platforms: [],
        profiles: [],
        profileResumes: [],
        jobs: [],
        aiConfigs: [],
        aiConsent: { consented: false, givenAt: null },

        activeProfileId: null,
        activeResumeId: null,
        storageWeight: { bytes: 0, formatted: '0 KB' },

        settings: {
            server_base_url: 'http://localhost:8080',
            private_use_only: false,
            auto_sync_pwa_on_grab: true,
            submission_mode: 'semi_automated',
        },

        selectedVacancyForModal: null,
        reviewApplyVacancy: null,
        consentRequest: null,
    }),

    getters: {
        sourceTagLabel: (s) =>
        s.isExtensionConnected ? 'Extension Source of Truth · Manual Sync' : 'Standalone Local · Dexie v7',
        activeProfile: (s) =>
            s.profiles.find((p) => p.profile_id === s.activeProfileId) ||
            s.profiles.find((p) => p.is_default) ||
            s.profiles[0] ||
            null,
        applicationsByVacancy(s) {
            const profId = this.activeProfile?.profile_id || s.activeProfileId;
            return new Map(
                s.allApplications.filter((a) => a.profile_id === profId).map((a) => [a.vacancy_id, a])
            );
        },
    },

    actions: {
        notify(message, type = 'info', timeoutMs = 4000) {
            const id = `${Date.now()}-${Math.random()}`;
            this.toasts.push({ id, message, type });
            if (timeoutMs > 0) {
                setTimeout(() => this.dismissToast(id), timeoutMs);
            }
        },
        dismissToast(id) {
            this.toasts = this.toasts.filter((t) => t.id !== id);
        },
        setTheme(next) {
            const clean = next === 'light' ? 'light' : 'dark';
            this.theme = clean;
            document.documentElement.setAttribute('data-theme', clean);
            localStorage.setItem('ao_theme', clean);
        },
        toggleTheme() {
            this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
        },
        setUiScale(scale) {
            const allowed = [100, 110, 120];
            const clean = allowed.includes(Number(scale)) ? Number(scale) : 100;
            this.uiScale = clean;
            document.documentElement.style.fontSize = `${clean}%`;
            localStorage.setItem('ao_ui_scale', String(clean));
        },
        resolveSourceLabel(item) {
            const plat = item.platform_id ? this.platformsMap.get(item.platform_id) : null;
            if (plat) return plat.name || plat.code;
            if (item.source_host) return item.source_host.replace(/^www\./, '');
            try {
                if (item.url) return new URL(item.url).hostname.replace(/^www\./, '');
            } catch (err) {
                logger.warn('appStore.resolveSourceLabel', 'Invalid vacancy URL', { url: item.url, error: err?.message });
            }
            return 'Direct';
        },
        resolveCompanyLabel(item) {
            const comp = item.company_id ? this.companiesMap.get(item.company_id) : null;
            return comp?.name || null;
        },
        extractVacancySkills(item) {
            const out = [];
            const seen = new Set();
            const push = (val) => {
                const clean = String(val || '').trim();
                if (!clean) return;
                const low = clean.toLowerCase();
                if (!seen.has(low)) {
                    seen.add(low);
                    out.push(clean);
                }
            };
            if (Array.isArray(item.skill_ids)) {
                for (const id of item.skill_ids) {
                    const name = this.skillsMap.get(id);
                    if (name) push(name);
                }
            }
            const hay = `${item.full_position_name || ''}\n${item.description || ''}`;
            for (const [name, re] of SKILL_PATTERNS) {
                if (re.test(hay)) push(name);
            }
            return out;
        },

        async bootstrap() {
            this.setTheme(this.theme);
            this.setUiScale(this.uiScale);
            const urlExtId = new URLSearchParams(window.location.search).get('extId')?.trim();
            if (urlExtId) {
                localStorage.setItem('autooffer_extension_id', urlExtId);
                this.extensionId = urlExtId;
            }
            this.loading = true;
            try {
                await seedDatabase();
                await migrateLegacySecrets();
                await Promise.allSettled([
                    this.loadSettings(),
                    this.loadPlatforms(),
                    this.loadProfiles(),
                    this.loadJobs(),
                    this.refreshDisplay(),
                ]);
                setupExtensionAutoPairing({
                    isConnectedFn: () => this.isExtensionConnected,
                    onPaired: async (id) => {
                        this.extensionId = id;
                        await this.runExtensionSync();
                    },
                });
                await this.runExtensionSync();
            } catch (err) {
                logger.error('appStore.bootstrap', err);
                this.globalError = err.message;
                this.notify(`Local DB error: ${err.message}`, 'error');
            } finally {
                this.loading = false;
            }
        },

        async runExtensionSync() {
            if (this.syncInFlight) return;
            this.syncInFlight = true;
            try {
                const status = await detectExtensionStatus();
                this.isExtensionConnected = status.connected;
                this.syncStatusText = status.text;
                this.syncStatusType = status.type;
                if (!status.connected) return;
                await Promise.allSettled([
                    this.loadSettings(),
                    this.loadPlatforms(),
                    this.loadProfiles(),
                    this.loadJobs(),
                ]);
                await this.syncVacanciesQuietly({ respectSetting: true });
            } finally {
                this.syncInFlight = false;
            }
        },

        async syncVacanciesQuietly({ respectSetting = true, pruneRemoved = false } = {}) {
            if (!this.isExtensionConnected || !getExtensionId()) return false;
            if (respectSetting) {
                const autoSync = await getSetting('auto_sync_pwa_on_grab').catch((err) => {
                        logger.warn('appStore.syncVacanciesQuietly', 'Could not read auto_sync_pwa_on_grab setting', err);
                        return true;
                });
                if (autoSync === false) return false;
            }
            try {
                const rows = await callExtension('get_vacancies', { role: 'all', dateRange: 'all', fieldsMode: 'all' }, 10000);
                await mirrorVacanciesToLocalDb(rows || [], { pruneRemoved });
                await this.refreshDisplay();
                this.syncStatusText = `Auto-synced ${(rows || []).length} vacancies.`;
                this.syncStatusType = 'success';
                return true;
            } catch (err) {
                logger.warn('appStore.syncVacanciesQuietly', 'Background extension sync failed', err);
                this.syncStatusText = `Sync failed: ${err.message}`;
                this.syncStatusType = 'error';
                return false;
            }
        },

        async manualSyncFromExtension({ role = 'all', dateRange = 'all', fieldsMode = 'all' } = {}) {
            const extId = (this.extensionId || getExtensionId()).trim();
            if (!extId) {
                this.notify('Specify Chrome Extension ID first.', 'warning');
                return;
            }
            localStorage.setItem('autooffer_extension_id', extId);
            this.syncStatusText = 'Connecting to extension...';
            this.syncStatusType = 'active';
            try {
                const rows = await callExtension('get_vacancies', { role, dateRange, fieldsMode }, 10000);
                await mirrorVacanciesToLocalDb(rows || [], { pruneRemoved: false });
                const status = await detectExtensionStatus();
                this.isExtensionConnected = status.connected;
                await Promise.all([this.loadSettings(), this.loadPlatforms(), this.loadProfiles(), this.loadJobs(), this.refreshDisplay()]);
                this.syncStatusText = `Synchronized ${(rows || []).length} vacancies.`;
                this.syncStatusType = 'success';
                this.notify(this.syncStatusText, 'success');
            } catch (err) {
                this.syncStatusText = `Sync failed: ${err.message}`;
                this.syncStatusType = 'error';
                this.notify(this.syncStatusText, 'error');
            }
        },

        async refreshDisplay() {
            this.vacancies = await db.local_vacancies.orderBy('updated_at').reverse().toArray();
            await ensureDefaultProfile();
            await syncApplicationsFromBridge(this.isExtensionConnected);

            const [allApps, companies, platforms, allResumes, allSkills, allMatches] = await Promise.all([
                db.applications.toArray(),
                db.companies_dict.toArray(),
                db.platforms_dict.toArray(),
                db.resumes.toArray(),
                db.skills.toArray(),
                db.match_results.toArray(),
            ]);

            this.allApplications = allApps.sort((a, b) => (b.applied_at || '').localeCompare(a.applied_at || ''));
            this.companiesMap = new Map(companies.map((c) => [c.id, c]));
            this.platformsMap = new Map(platforms.map((p) => [p.id, p]));
            this.skillsMap = new Map(allSkills.map((s) => [s.id, s.name]));
            this.resumesMap = new Map(allResumes.map((r) => [r.id, r]));

            const matchMap = new Map();
            for (const m of allMatches) {
                const prev = matchMap.get(m.vacancy_id);
                if (!prev || (m.created_at || '') > (prev.created_at || '')) matchMap.set(m.vacancy_id, m);
            }
            this.matchByVacancy = matchMap;
            this.storageWeight = await calculateStorageWeight(this.isExtensionConnected);
        },

        async upsertVacancyStatus(vacancyId, newStatus) {
            if (!newStatus) return;
            const profileId = this.activeProfile?.profile_id || (await ensureDefaultProfile()).id;
            const existing = this.applicationsByVacancy.get(vacancyId);
            if (existing) {
                await setApplicationStatus(existing.id, newStatus);
                if (this.isExtensionConnected) {
                    await callExtension('update_application', { id: existing.id, status: newStatus }).catch((err) => {
                            logger.warn('appStore.upsertVacancyStatus', 'Extension sync failed; saved locally', err);
                            this.notify('Status saved locally, but extension sync failed.', 'warning');
                    });
                }
            } else {
                const defaultResumeId = this.profileResumes[0]?.id || null;
                if (this.isExtensionConnected) {
                    const created = await callExtension('create_application', {
                        profile_id: profileId,
                        vacancy_id: vacancyId,
                        resume_id: defaultResumeId,
                        status: newStatus,
                    });
                    await db.applications.put(created);
                } else {
                    const id = await createApplication({ profile_id: profileId, vacancy_id: vacancyId, resume_id: defaultResumeId });
                    if (newStatus !== 'Applied') await setApplicationStatus(id, newStatus);
                }
            }
            await this.refreshDisplay();
        },

        async updateApplicationStatusAndNotes(appId, { status, notes } = {}) {
            if (status) await setApplicationStatus(appId, status);
            if (notes !== undefined) await db.applications.update(appId, { notes: notes || null });
            if (this.isExtensionConnected) {
                await callExtension('update_application', { id: appId, ...(status ? { status } : {}), ...(notes !== undefined ? { notes } : {}) }).catch((err) => {
                        logger.warn('appStore.updateApplicationStatusAndNotes', 'Extension sync failed; updated locally', err);
                        this.notify('Changes saved locally, but extension sync failed.', 'warning');
                });
            }
            await this.refreshDisplay();
        },

        async loadPlatforms() {
            if (this.isExtensionConnected) {
                try {
                    const remote = await callExtension('get_platforms');
                    if (Array.isArray(remote) && remote.length) {
                        await db.transaction('rw', db.platforms_dict, async () => {
                            for (const p of remote) {
                                const byCode = await db.platforms_dict.where('code').equals(p.code).first();
                                if (byCode && byCode.id !== p.id) {
                                    await db.platforms_dict.update(byCode.id, {
                                        name: p.name,
                                        url: p.url,
                                        permission_status: p.permission_status,
                                        last_checked_at: p.last_checked_at,
                                    });
                                } else {
                                    await db.platforms_dict.put(p);
                                }
                            }
                        });
                    }
            } catch (err) {
                logger.warn('appStore.loadPlatforms', 'Extension platform load failed; using local cache', err);
            }
        }
        this.platforms = await db.platforms_dict.toArray();
        },

        async loadProfiles() {
            if (this.isExtensionConnected) {
                try {
                    this.profiles = await callExtension('get_profiles');
                    this.ensureSelectedProfile();
                    await this.loadResumes();
                    return;
            } catch (err) {
                logger.warn('appStore.loadProfiles', 'Extension profile load failed; using local cache', err);
            }
        }
        await ensureDefaultProfile();
            const rows = await db.user_profiles.toArray();
            const out = [];
            for (const row of rows) {
                const pData = await db.personal_data.where('profile_id').equals(row.id).first();
                const resume = await db.resumes.where('profile_id').equals(row.id).first();
                const prefs = await db.search_preferences.where('profile_id').equals(row.id).first();
                const skillRows = resume?.skill_ids?.length ? await db.skills.bulkGet(resume.skill_ids) : [];
                out.push({
                    profile_id: row.id,
                    profile_name: row.name,
                    is_default: row.is_default,
                    first_name: pData?.first_name || '',
                    last_name: pData?.last_name || '',
                    email: pData?.email || '',
                    phone: pData?.phone || '',
                    location: pData?.location || '',
                    links: pData ? [pData.github, pData.linkedin, pData.website].filter(Boolean).join(', ') : '',
                    headline: resume?.title || '',
                    skills: skillRows.filter(Boolean).map((s) => s.name).join(', '),
                    roles: (prefs?.roles || []).join(', '),
                    locations: (prefs?.locations || []).join(', '),
                    keywords: (prefs?.keywords || []).join(', '),
                });
            }
            this.profiles = out;
            this.ensureSelectedProfile();
            await this.loadResumes();
        },

        ensureSelectedProfile() {
            if (this.activeProfileId && this.profiles.some((p) => p.profile_id === this.activeProfileId)) return;
            const def = this.profiles.find((p) => p.is_default) || this.profiles[0];
            this.activeProfileId = def?.profile_id || null;
        },

        async saveProfile(payload) {
            if (this.isExtensionConnected) {
                const saved = await callExtension('save_profile', { profile: payload });
                this.activeProfileId = saved.profile_id;
            } else {
                const now = nowIso();
                let profileId = payload.profile_id || null;
                if (!profileId) {
                    if (payload.create_new) {
                        profileId = newId();
                        await db.user_profiles.add({ id: profileId, name: payload.profile_name || 'New Profile', is_default: payload.is_default ? 1 : 0, created_at: now, updated_at: now });
                    } else {
                        profileId = (await ensureDefaultProfile()).id;
                    }
                } else {
                    await db.user_profiles.update(profileId, { name: payload.profile_name, updated_at: now });
                }
                if (payload.is_default) await setDefaultProfile(profileId);
                const { github, linkedin, website } = parseProfileLinks(payload.links);
                const personal = { first_name: payload.first_name, last_name: payload.last_name, email: payload.email, phone: payload.phone || null, location: payload.location || null, github, linkedin, website, updated_at: now };
                const existingP = await db.personal_data.where('profile_id').equals(profileId).first();
                if (existingP) await db.personal_data.update(existingP.id, personal);
                else await db.personal_data.add({ id: newId(), profile_id: profileId, ...personal, created_at: now });

                const rolesArr = toStringArray(payload.roles);
                const locsArr = toStringArray(payload.locations);
                const kwArr = toStringArray(payload.keywords);
                const existingPrefs = await db.search_preferences.where('profile_id').equals(profileId).first();
                if (rolesArr.length > 0) {
                    if (existingPrefs) await db.search_preferences.update(existingPrefs.id, { roles: rolesArr, locations: locsArr, keywords: kwArr, updated_at: now });
                    else await db.search_preferences.add({ id: newId(), profile_id: profileId, roles: rolesArr, locations: locsArr, keywords: kwArr, urls: [], platform_ids: [], page_limit: 2, updated_at: now });
                } else if (existingPrefs) {
                    await db.search_preferences.delete(existingPrefs.id);
                }
                this.activeProfileId = profileId;
            }
            await this.loadProfiles();
            await this.refreshDisplay();
        },

        async removeProfile(profileId) {
            if (this.isExtensionConnected) await callExtension('delete_profile', { profileId });
            else {
                await deleteProfileCascade(profileId);
                await ensureDefaultProfile();
            }
            this.activeProfileId = null;
            this.activeResumeId = null;
            await this.loadProfiles();
            await this.refreshDisplay();
        },

        async loadResumes() {
            if (!this.activeProfileId) {
                this.profileResumes = [];
                this.activeResumeId = null;
                return;
            }
            if (this.isExtensionConnected) {
                try {
                    const list = await callExtension('get_resumes', { profileId: this.activeProfileId });
                    this.profileResumes = list;
                    if (!this.activeResumeId || !list.some((r) => r.id === this.activeResumeId)) {
                        this.activeResumeId = list[0]?.id || null;
                    }
                    return;
                } catch (err) {
                    logger.warn('appStore.loadResumes', 'Extension resume load failed; using local cache', err);
                }
            }
            const rows = await db.resumes.where('profile_id').equals(this.activeProfileId).toArray();
            rows.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
            const out = [];
            for (const r of rows) {
                const skillRows = r.skill_ids?.length ? await db.skills.bulkGet(r.skill_ids) : [];
                out.push({ ...r, skills: skillRows.filter(Boolean).map((s) => s.name) });
            }
            this.profileResumes = out;
            if (!this.activeResumeId || !out.some((r) => r.id === this.activeResumeId)) {
                this.activeResumeId = out[0]?.id || null;
            }
        },

        async saveResume(payload, pendingFile) {
            if (this.isExtensionConnected) {
                const saved = await callExtension('save_resume', { resume: { ...payload, ...(pendingFile || {}) } });
                this.activeResumeId = saved.id;
            } else {
                const now = nowIso();
                const existing = payload.id ? await db.resumes.get(payload.id) : null;
                const skillIds = [];
                for (const s of payload.skills) skillIds.push(await getOrCreateByName('skills', s));
                let file_name = existing?.file_name || null;
                let mime_type = existing?.mime_type || null;
                let file_data = existing?.file_data || null;
                if (pendingFile?.clear_file) {
                    file_name = null; mime_type = null; file_data = null;
                } else if (pendingFile?.file_data_b64) {
                    file_name = pendingFile.file_name;
                    mime_type = pendingFile.mime_type;
                    file_data = base64ToBlob(pendingFile.file_data_b64, mime_type);
                }
                const rec = {
                    id: payload.id || newId(),
                    profile_id: this.activeProfileId,
                    title: payload.title,
                    summary: payload.summary || null,
                    plain_text: payload.plain_text,
                    skill_ids: skillIds,
                    file_name,
                    mime_type,
                    created_at: existing?.created_at || now,
                    updated_at: now,
                };
                if (file_data) rec.file_data = file_data;
                await db.resumes.put(rec);
                this.activeResumeId = rec.id;
            }
            await this.loadResumes();
            await this.refreshDisplay();
        },

        async removeResume(resumeId) {
            if (this.isExtensionConnected) await callExtension('delete_resume', { resumeId });
            else await deleteResume(resumeId);
            this.activeResumeId = null;
            await this.loadResumes();
            await this.refreshDisplay();
        },

        async loadJobs() {
            if (this.isExtensionConnected) {
                try {
                    this.jobs = await callExtension('get_jobs');
                    await db.automation_jobs.clear();
                    if (this.jobs.length) await db.automation_jobs.bulkPut(this.jobs);
                    return;
                } catch (err) {
                    logger.warn('appStore.loadJobs', 'Extension jobs load failed; using local cache', err);
                }
            }
            this.jobs = await db.automation_jobs.toArray();
        },

        async saveJob(job) {
            if (this.isExtensionConnected) {
                const saved = await callExtension('save_job', { job });
                await db.automation_jobs.put(saved);
            } else {
                await db.automation_jobs.put(job);
            }
            await this.loadJobs();
            await this.refreshDisplay();
        },

        async removeJob(id) {
            if (this.isExtensionConnected) await callExtension('delete_job', { id });
            await db.automation_jobs.delete(id);
            await this.loadJobs();
        },

        async loadSettings() {
            if (this.isExtensionConnected) {
                try {
                    const remote = await callExtension('get_settings');
                    for (const [k, v] of Object.entries(remote)) {
                        await setSetting(k, v).catch((err) => logger.warn('appStore.loadSettings', `Skipped setting ${k}`, err));
                    }
                } catch (err) {
                    logger.warn('appStore.loadSettings', 'Extension settings load failed; using local cache', err);
                }
            }
            this.settings = {
                server_base_url: (await getSetting('server_base_url')) || 'http://localhost:8080',
                private_use_only: Boolean(await getSetting('private_use_only')),
                auto_sync_pwa_on_grab: (await getSetting('auto_sync_pwa_on_grab')) !== false,
                submission_mode: (await getSetting('submission_mode')) || 'semi_automated',
            };
            await this.loadAiConfigs();
        },

        async updateSetting(key, value) {
            this.settings[key] = value;
            await saveSingleSetting(key, value, this.isExtensionConnected);
        },

        async loadAiConfigs() {
            if (this.isExtensionConnected) {
                try {
                    this.aiConfigs = await callExtension('get_ai_configurations');
                    const c = await callExtension('get_ai_consent');
                    this.aiConsent = { consented: Boolean(c?.consented), givenAt: c?.givenAt || null };
                    return;
                } catch (err) {
                    logger.warn('appStore.loadAiConfigs', 'Extension AI config load failed; using local cache', err);
                }
            }
            const rows = await db.ai_configurations.toArray();
            rows.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
            this.aiConfigs = rows.map((c) => ({
                id: c.id,
                provider_name: c.provider_name,
                api_endpoint: c.api_endpoint || null,
                model_name: c.model_name,
                is_active: c.is_active,
                has_api_key: Boolean(c.api_key_enc),
            }));
            this.aiConsent = {
                consented: await hasAiConsent(),
                givenAt: await getSetting('ai_consent_given_at'),
            };
        },

        async saveAiConfig(cfg) {
            if (this.isExtensionConnected) {
                this.aiConfigs = await callExtension('save_ai_configuration', { config: cfg });
            } else {
                const id = await saveAiConfiguration(cfg);
                if (cfg.is_active) await setActiveAiConfiguration(id);
                await this.loadAiConfigs();
            }
        },

        async activateAiConfig(id) {
            if (this.isExtensionConnected) this.aiConfigs = await callExtension('set_active_ai_configuration', { id });
            else {
                await setActiveAiConfiguration(id);
                await this.loadAiConfigs();
            }
        },

        async removeAiConfig(id) {
            if (this.isExtensionConnected) this.aiConfigs = await callExtension('delete_ai_configuration', { id });
            else {
                await deleteAiConfiguration(id);
                await this.loadAiConfigs();
            }
        },

        async clearVacancies() {
            if (this.isExtensionConnected) {
                try {
                    await callExtension('clear_vacancies');
                } catch (err) {
                    logger.warn('appStore.clearVacancies', 'Failed clearing vacancies in extension', err);
                    this.notify('Could not clear extension vacancies; clearing local PWA cache only.', 'warning');
                }
            }
            const rows = await db.local_vacancies.toArray();
            let skipped = 0;
            for (const r of rows) {
                try {
                    await deleteVacancy(r.id);
                } catch (err) {
                    logger.warn('appStore.clearVacancies', 'Kept vacancy with linked application', { id: r.id, error: err?.message });
                    skipped++;
                }
            }
            await this.refreshDisplay();
            return skipped;
        },

        requestAiConsent(endpointLabel) {
            return new Promise((resolve) => {
                this.consentRequest = { endpointLabel, resolve };
            });
        },

        async resolveAiConsent(accepted) {
            if (!this.consentRequest) return;
            const { resolve } = this.consentRequest;
            if (accepted) {
                await recordAiConsent('1.0');
                if (this.isExtensionConnected) {
                    await callExtension('set_ai_consent', { version: '1.0' }).catch((err) => {
                            logger.warn('appStore.resolveAiConsent', 'Failed syncing AI consent to extension', err);
                    });
                }
                await this.loadAiConfigs();
            }
            this.consentRequest = null;
            resolve(accepted);
        },
    },
});
