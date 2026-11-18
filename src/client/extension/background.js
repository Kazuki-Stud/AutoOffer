import { db } from './database/database.js';
import { migrateLegacySecrets } from './database/crypto.js';
import {
    deleteProfileCascade,
    deleteVacancy,
    ensureDefaultProfile,
    getOrCreateByName,
    getSetting,
    newId,
    nowIso,
    saveVacancy,
    setDefaultProfile,
    setSetting,
} from './database/repository.js';
import { seedDatabase } from './database/seed.js';
import { SETTING_KEYS } from './database/validation.js';
import { syncRegistrySelectors, syncVacancyToServer, syncWhitelist } from './apiClient.js';

const ELEMENT_TYPES = {
    CONTAINER:     '30000000-0000-4000-8000-000000000001',
    TITLE:         '30000000-0000-4000-8000-000000000002',
    LINK:          '30000000-0000-4000-8000-000000000003',
    SEARCH_INPUT:  '30000000-0000-4000-8000-000000000004',
    SEARCH_BUTTON: '30000000-0000-4000-8000-000000000005',
    PAGINATION:    '30000000-0000-4000-8000-000000000006',
    DESCRIPTION:   '30000000-0000-4000-8000-000000000007',
};
const TASK_LIST_ID = '20000000-0000-4000-8000-000000000001';

let activeAutomationSession = null;

async function bootstrap() {
    await seedDatabase();
    await migrateLegacySecrets();
    await syncWhitelist();
    await syncRegistrySelectors();
}

chrome.runtime.onInstalled.addListener(() => { bootstrap().catch(console.error); });
chrome.runtime.onStartup.addListener(() => { bootstrap().catch(console.error); });
chrome.alarms.create('autooffer_registry_sync', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'autooffer_registry_sync') {
        syncWhitelist().then(syncRegistrySelectors).catch(console.error);
    }
});

function isSafeHttpUrl(raw) {
    try {
        const u = new URL(raw);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function parseLinks(rawText) {
    const urls = (rawText || '').split(/[\s,]+/).map((s) => s.trim()).filter(isSafeHttpUrl);
    return {
        github: urls.find((u) => u.includes('github.com')) || null,
        linkedin: urls.find((u) => u.includes('linkedin.com')) || null,
        website: urls.find((u) => !u.includes('github.com') && !u.includes('linkedin.com')) || null,
    };
}

function waitForTabLoad(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (tab && tab.status === 'complete') return resolve();
            function onUpdatedListener(updatedTabId, changeInfo) {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(onUpdatedListener);
                    resolve();
                }
            }
            chrome.tabs.onUpdated.addListener(onUpdatedListener);
        });
    });
}

function waitForNavigationOrDomChange(tabId, triggerActionFn) {
    return new Promise((resolve, reject) => {
        let settled = false;
        function cleanup() {
            chrome.tabs.onUpdated.removeListener(onUpdatedListener);
            chrome.webNavigation.onCompleted.removeListener(onNavCompleted);
        }
        function finish() {
            if (!settled) { settled = true; cleanup(); resolve(); }
        }
        function onUpdatedListener(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') finish();
        }
        function onNavCompleted(details) {
            if (details.tabId === tabId && details.frameId === 0) finish();
        }
        chrome.tabs.onUpdated.addListener(onUpdatedListener);
        chrome.webNavigation.onCompleted.addListener(onNavCompleted);

        triggerActionFn().then((actionResult) => {
            if (actionResult && (actionResult.navigated || actionResult.domMutated)) finish();
        }).catch((err) => {
            const msg = err?.message || '';
            if (msg.includes('back/forward cache') || msg.includes('message channel is closed') || msg.includes('message port closed')) return;
            cleanup();
            reject(err);
        });
    });
}

async function sendTabMessage(tabId, message) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                const errMsg = chrome.runtime.lastError.message || '';
                if (errMsg.includes('back/forward cache') || errMsg.includes('message channel is closed') || errMsg.includes('message port closed')) {
                    return resolve({ navigated: true, success: true });
                }
                return reject(new Error(errMsg));
            }
            resolve(response);
        });
    });
}

async function findPlatformByHostname(hostname) {
    const cleanHost = hostname.replace(/^www\./, '').toLowerCase();
    const all = await db.platforms_dict.toArray();
    return all.find((p) => cleanHost === p.code || cleanHost.endsWith('.' + p.code)) || null;
}

async function getSelectorsForHostname(hostname) {
    const activeList = await db.selectors.where('is_active').equals(1).toArray();
    const matching = activeList.filter((item) => item.url_pattern && hostname.includes(item.url_pattern));
    const map = {
        [ELEMENT_TYPES.CONTAINER]: 'container',
        [ELEMENT_TYPES.TITLE]: 'title',
        [ELEMENT_TYPES.LINK]: 'link',
        [ELEMENT_TYPES.SEARCH_INPUT]: 'searchInput',
        [ELEMENT_TYPES.SEARCH_BUTTON]: 'searchButton',
        [ELEMENT_TYPES.PAGINATION]: 'pagination',
        [ELEMENT_TYPES.DESCRIPTION]: 'description',
    };
    const result = {};
    for (const item of matching) {
        const key = map[item.element_type_id];
        if (key && !result[key]) result[key] = item.selector_string;
    }
    return Object.keys(result).length > 0 ? result : null;
}

async function saveSpecificSelector(platformId, hostname, elementTypeId, selectorString, source = 'manual') {
    const existing = (await db.selectors.where('[platform_id+task_id+element_type_id]')
        .equals([platformId, TASK_LIST_ID, elementTypeId]).toArray())
        .find((s) => (s.url_pattern ?? null) === hostname);

    if (existing) {
        await db.selectors.update(existing.id, {
            previous_selector_string: existing.selector_string,
            previous_version: existing.version,
            selector_string: selectorString,
            version: existing.version + 1,
            source,
            is_active: 1,
            updated_at: nowIso(),
        });
    } else {
        await db.selectors.add({
            id: newId(),
            platform_id: platformId,
            task_id: TASK_LIST_ID,
            element_type_id: elementTypeId,
            url_pattern: hostname,
            selector_kind: 'css',
            selector_string: selectorString,
            version: 1,
            source,
            is_active: 1,
            validation_failures: 0,
            updated_at: nowIso(),
        });
    }
}

async function autoFixPlatformSelectors(platformId, hostname, url) {
    let tab = null;
    try {
        tab = await chrome.tabs.create({ url, active: false });
        await waitForTabLoad(tab.id);
        const guessRes = await sendTabMessage(tab.id, { action: 'auto_guess_selectors_internal' });
        if (guessRes && guessRes.success && guessRes.selectors) {
            const g = guessRes.selectors;
            const mapping = [
                [ELEMENT_TYPES.CONTAINER, g.container],
                [ELEMENT_TYPES.TITLE, g.title],
                [ELEMENT_TYPES.LINK, g.link],
                [ELEMENT_TYPES.SEARCH_INPUT, g.searchInput],
                [ELEMENT_TYPES.PAGINATION, g.pagination],
                [ELEMENT_TYPES.DESCRIPTION, g.description],
            ];
            for (const [type, val] of mapping) {
                if (val) await saveSpecificSelector(platformId, hostname, type, val, 'heuristic');
            }
            return { success: true };
        }
        return { success: false, error: 'Could not automatically determine selectors.' };
    } catch (err) {
        return { success: false, error: err.message };
    } finally {
        if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
    }
}

async function persistAndSyncVacancies(hostname, vacancies, { source = 'auto' } = {}) {
    const platform = await findPlatformByHostname(hostname);
    for (const item of vacancies) {
        const hasDesc = Boolean(item.description && item.description.trim().length > 0);
        const id = await saveVacancy({
            platform_id: platform ? platform.id : null,
            source_host: platform ? null : hostname,
            full_position_name: item.fullPositionName || 'Untitled Position',
            url: item.url,
            description: hasDesc ? item.description.trim() : null,
            status: hasDesc ? 'complete' : 'new',
        }, { source });

        const saved = await db.local_vacancies.get(id);
        if (saved) syncVacancyToServer(saved).catch(() => {});
    }
}

async function resolveWorkingSelectors(tabId, hostname) {
    const selectors = await getSelectorsForHostname(hostname);
    if (selectors?.container && selectors?.title && selectors?.link) {
        try {
            const verifyRes = await sendTabMessage(tabId, { action: 'validate_selectors', selectors });
            if (verifyRes?.isValid) return selectors;
        } catch {}
    }
    return selectors || {
        container: '[data-testid*="job" i], article, li, div[class*="job" i], div[class*="card" i]',
        title: 'h2, h3, a[class*="title" i], [class*="jobTitle" i], [data-testid*="title" i]',
        link: 'a[href*="job"], a[href*="career"], a',
    };
}

async function calculateStorageWeight() {
    let totalBytes = 0;
    for (const table of [db.local_vacancies, db.platforms_dict, db.selectors, db.personal_data, db.resumes, db.automation_jobs, db.applications]) {
        try {
            totalBytes += new Blob([JSON.stringify(await table.toArray())]).size;
        } catch {}
    }
    const formatted = totalBytes > 1048576
        ? `${(totalBytes / 1048576).toFixed(2)} MB`
        : `${Math.max(1, Math.round(totalBytes / 1024))} KB`;
    return { bytes: totalBytes, formatted };
}

const randomDelay = (minMs = 1500, maxMs = 3500) =>
    new Promise((r) => setTimeout(r, minMs + Math.random() * (maxMs - minMs)));

async function runAutomationPipeline(config) {
    const { websites, roles, paginationLimit, fieldsMode = 'all' } = config;
    await syncWhitelist();

    let tab = null;
    let tabId = null;
    try {
        tab = await chrome.tabs.create({ url: 'about:blank', active: false });
        tabId = tab.id;

        for (const targetUrl of websites) {
            if (!activeAutomationSession || activeAutomationSession.abort) break;
            const hostname = new URL(targetUrl).hostname;
            const platform = await findPlatformByHostname(hostname);

            if (!platform || platform.permission_status !== 'granted') {
                chrome.runtime.sendMessage({
                    action: 'automation_skipped_board',
                    hostname,
                    message: `Skipped ${hostname}: board has not granted automated collection permission. Use "Save vacancy" on open tabs instead.`,
                }).catch(() => {});
                continue;
            }

            await chrome.tabs.update(tabId, { url: targetUrl });
            await waitForTabLoad(tabId);
            const collected = [];

            for (const role of roles) {
                if (!activeAutomationSession || activeAutomationSession.abort) break;
                const existingSelectors = await getSelectorsForHostname(hostname);
                await waitForNavigationOrDomChange(tabId, () =>
                    sendTabMessage(tabId, { action: 'execute_search_input', role, selectors: existingSelectors || {} })
                );
                await waitForTabLoad(tabId);

                const workingSelectors = await resolveWorkingSelectors(tabId, hostname);
                let pagesProcessed = 0;
                while (pagesProcessed < paginationLimit) {
                    if (!activeAutomationSession || activeAutomationSession.abort) break;
                    const parseRes = await sendTabMessage(tabId, { action: 'extract_listing_vacancies', selectors: workingSelectors });
                    for (const v of parseRes?.vacancies || []) {
                        if (!collected.some((cv) => cv.url === v.url)) collected.push(v);
                    }
                    pagesProcessed++;
                    if (pagesProcessed >= paginationLimit) break;

                    let pageOut = null;
                    await waitForNavigationOrDomChange(tabId, async () => {
                        pageOut = await sendTabMessage(tabId, { action: 'advance_pagination', selectors: workingSelectors });
                        return pageOut;
                    });
                    await waitForTabLoad(tabId);
                    if (!pageOut?.advanced) break;
                }
            }

            if (collected.length > 0) {
                if (fieldsMode === 'all') {
                    for (const vacancy of collected) {
                        if (!activeAutomationSession || activeAutomationSession.abort) break;
                        await randomDelay(1500, 3500);
                        try {
                            await chrome.tabs.update(tabId, { url: vacancy.url });
                            await waitForTabLoad(tabId);
                            const detailRes = await sendTabMessage(tabId, { action: 'extract_detail_description' });
                            if (detailRes?.description) vacancy.description = detailRes.description;
                        } catch { vacancy.description = ''; }
                        await persistAndSyncVacancies(hostname, [vacancy], { source: 'auto' });
                    }
                } else {
                    await persistAndSyncVacancies(hostname, collected, { source: 'auto' });
                }
            }
        }

        chrome.runtime.sendMessage({ action: 'automation_completed', message: 'Automation completed successfully.' }).catch(() => {});
    } finally {
        if (tabId) chrome.tabs.remove(tabId).catch(() => {});
        activeAutomationSession = null;
    }
}

// ---- Profile & Settings helpers (shared with PWA bridge) --------------------
async function hydrateProfile(profileRow) {
    const pData = await db.personal_data.where('profile_id').equals(profileRow.id).first();
    const resume = await db.resumes.where('profile_id').equals(profileRow.id).first();
    const prefs = await db.search_preferences.where('profile_id').equals(profileRow.id).first();
    const skillRows = resume?.skill_ids?.length ? await db.skills.bulkGet(resume.skill_ids) : [];
    const links = pData ? [pData.github, pData.linkedin, pData.website].filter(Boolean).join(', ') : '';

    return {
        profile_id: profileRow.id,
        profile_name: profileRow.name,
        is_default: profileRow.is_default,
        first_name: pData?.first_name || '',
        last_name: pData?.last_name || '',
        email: pData?.email || '',
        phone: pData?.phone || '',
        location: pData?.location || '',
        github: pData?.github || null,
        linkedin: pData?.linkedin || null,
        website: pData?.website || null,
        telegram: pData?.telegram || null,
        education: pData?.education || null,
        links,
        headline: resume?.title || '',
        skills: skillRows.filter(Boolean).map((s) => s.name).join(', '),
        roles: (prefs?.roles || []).join(', '),
    };
}

async function listHydratedProfiles() {
    await ensureDefaultProfile();
    const profiles = await db.user_profiles.toArray();
    return Promise.all(profiles.map(hydrateProfile));
}

async function saveProfileRecord(incoming) {
    const now = nowIso();
    let profileId = incoming.profile_id || null;

    if (profileId) {
        const existingProf = await db.user_profiles.get(profileId);
        if (!existingProf) {
            await db.user_profiles.add({
                id: profileId,
                name: incoming.profile_name?.trim() || `${incoming.first_name || 'Profile'} ${incoming.last_name || ''}`.trim(),
                is_default: incoming.is_default ? 1 : 0,
                created_at: now,
                updated_at: now,
            });
        } else if (incoming.profile_name) {
            await db.user_profiles.update(profileId, { name: incoming.profile_name.trim(), updated_at: now });
        }
    } else if (incoming.create_new) {
        profileId = newId();
        await db.user_profiles.add({
            id: profileId,
            name: incoming.profile_name?.trim() || `${incoming.first_name || 'New'} ${incoming.last_name || 'Profile'}`.trim(),
            is_default: incoming.is_default ? 1 : 0,
            created_at: now,
            updated_at: now,
        });
    } else {
        const def = await ensureDefaultProfile();
        profileId = def.id;
        if (incoming.profile_name) {
            await db.user_profiles.update(profileId, { name: incoming.profile_name.trim(), updated_at: now });
        }
    }

    if (incoming.is_default === 1 || incoming.is_default === true) {
        await setDefaultProfile(profileId);
    }

    const parsedLinks = incoming.links !== undefined
        ? parseLinks(incoming.links)
        : {
            github: incoming.github?.trim() || null,
            linkedin: incoming.linkedin?.trim() || null,
            website: incoming.website?.trim() || null,
        };

    const cleanPersonal = {
        first_name: incoming.first_name?.trim() || '',
        last_name: incoming.last_name?.trim() || '',
        email: incoming.email?.trim() || '',
        phone: incoming.phone?.trim() || null,
        location: incoming.location?.trim() || null,
        website: parsedLinks.website,
        github: parsedLinks.github,
        linkedin: parsedLinks.linkedin,
        telegram: incoming.telegram?.trim() || null,
        education: incoming.education?.trim() || null,
        updated_at: now,
    };

    const existingPersonal = await db.personal_data.where('profile_id').equals(profileId).first();
    if (existingPersonal) {
        await db.personal_data.update(existingPersonal.id, cleanPersonal);
    } else {
        await db.personal_data.add({ id: newId(), profile_id: profileId, ...cleanPersonal, created_at: now });
    }

    if (incoming.headline !== undefined || incoming.skills !== undefined) {
        const skillNames = [...new Set((incoming.skills || '').split(',').map((s) => s.trim()).filter(Boolean))];
        const skillIds = [];
        for (const name of skillNames) {
            skillIds.push(await getOrCreateByName('skills', name));
        }
        const headline = incoming.headline?.trim() || 'Default Resume';
        const plainText = `${headline}\nSkills: ${skillNames.join(', ')}`;
        const existingResume = await db.resumes.where('profile_id').equals(profileId).first();
        if (existingResume) {
            await db.resumes.update(existingResume.id, { title: headline, plain_text: plainText, skill_ids: skillIds, updated_at: now });
        } else {
            await db.resumes.add({ id: newId(), profile_id: profileId, title: headline, plain_text: plainText, skill_ids: skillIds, created_at: now, updated_at: now });
        }
    }

    if (incoming.roles !== undefined) {
        const rolesArr = (Array.isArray(incoming.roles) ? incoming.roles : String(incoming.roles).split(','))
            .map((s) => s.trim()).filter(Boolean);
        const existingPrefs = await db.search_preferences.where('profile_id').equals(profileId).first();
        if (rolesArr.length > 0) {
            if (existingPrefs) {
                await db.search_preferences.update(existingPrefs.id, { roles: rolesArr, updated_at: now });
            } else {
                await db.search_preferences.add({
                    id: newId(), profile_id: profileId, roles: rolesArr,
                    locations: [], keywords: [], urls: [], platform_ids: [], page_limit: 2, updated_at: now,
                });
            }
        } else if (existingPrefs) {
            await db.search_preferences.delete(existingPrefs.id);
        }
    }

    const row = await db.user_profiles.get(profileId);
    return hydrateProfile(row);
}

async function readAllSettings() {
    const out = {};
    for (const k of SETTING_KEYS) {
        out[k] = await getSetting(k);
    }
    return out;
}

async function saveJobRecord(incoming) {
    const jobData = { ...incoming };
    if (!jobData.id) {
        jobData.id = newId();
        jobData.created_at = nowIso();
        jobData.status = jobData.status || 'ready';
        await db.automation_jobs.add(jobData);
    } else {
        const existing = await db.automation_jobs.get(jobData.id);
        jobData.created_at = existing?.created_at || jobData.created_at || nowIso();
        jobData.status = jobData.status || existing?.status || 'ready';
        await db.automation_jobs.put(jobData);
    }
    return jobData;
}

// ---- Internal runtime messages (popup / content) ----------------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'get_background_status') {
        Promise.all([calculateStorageWeight(), getSetting('private_use_only')])
            .then(([w, priv]) => sendResponse({
                success: true,
                isRunning: Boolean(activeAutomationSession),
                activeJobTitle: activeAutomationSession?.config?.jobTitle || null,
                storageWeight: w.formatted,
                storageBytes: w.bytes,
                privateUseOnly: Boolean(priv),
            })).catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'get_storage_weight') {
        calculateStorageWeight().then((w) => sendResponse({ success: true, weight: w.formatted, bytes: w.bytes }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'get_jobs') {
        db.automation_jobs.toArray().then((jobs) => sendResponse({ success: true, jobs }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'save_job') {
        saveJobRecord(request.job).then((job) => sendResponse({ success: true, job }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'delete_job') {
        db.automation_jobs.delete(request.id).then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'update_specific_selector') {
        saveSpecificSelector(request.platformId, request.hostname, request.elementTypeId, request.selectorString)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'auto_fix_platform_selectors') {
        autoFixPlatformSelectors(request.platformId, request.hostname, request.url)
            .then((res) => sendResponse(res))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'save_current_vacancy') {
        (async () => {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab?.id || !activeTab.url?.startsWith('http')) {
                return sendResponse({ success: false, error: 'Open a job posting page first.' });
            }
            const hostname = new URL(activeTab.url).hostname;
            const detail = await sendTabMessage(activeTab.id, { action: 'extract_detail_description' });
            await persistAndSyncVacancies(hostname, [{
                fullPositionName: request.title || activeTab.title || 'Saved Vacancy',
                url: activeTab.url,
                description: detail?.description || '',
            }], { source: 'manual' });
            sendResponse({ success: true });
        })().catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'save_scraped_vacancies') {
        persistAndSyncVacancies(request.hostname, request.vacancies || [], { source: 'manual' })
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'start_automation_workflow') {
        if (activeAutomationSession) return sendResponse({ success: false, error: 'Automation workflow already running.' }), true;
        activeAutomationSession = { abort: false, config: request.config };
        runAutomationPipeline(request.config).catch((err) => {
            activeAutomationSession = null;
            chrome.runtime.sendMessage({ action: 'automation_failed', error: err.message }).catch(() => {});
        });
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'stop_automation_workflow') {
        if (activeAutomationSession) { activeAutomationSession.abort = true; activeAutomationSession = null; }
        sendResponse({ success: true });
        return true;
    }
});

// ---- External bridge for PWA (Single Source of Truth) ----------------------
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request.action === 'get_vacancies') {
        db.local_vacancies.toArray().then((vacancies) => {
            let filtered = vacancies;
            if (request.role && request.role !== 'all') {
                const targetRole = request.role.toLowerCase();
                filtered = filtered.filter((v) => v.full_position_name?.toLowerCase().includes(targetRole));
            }
            if (request.dateRange && request.dateRange !== 'all') {
                const days = request.dateRange === 'today' ? 1 : request.dateRange === '7days' ? 7 : 30;
                const cutoff = Date.now() - days * 86400000;
                filtered = filtered.filter((v) => {
                    const t = new Date(v.created_at).getTime();
                    return !isNaN(t) && t >= cutoff;
                });
            }
            if (request.fieldsMode === 'minimum') {
                filtered = filtered.map((v) => ({
                    id: v.id,
                    full_position_name: v.full_position_name,
                    url: v.url,
                    created_at: v.created_at,
                    sync_level: v.sync_level,
                    synced: v.sync_level !== 'none',
                }));
            }
            sendResponse({ status: 'success', data: filtered });
        }).catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }

    if (request.action === 'clear_vacancies') {
        (async () => {
            const rows = await db.local_vacancies.toArray();
            let cleared = 0;
            let skipped = 0;
            for (const r of rows) {
                try { await deleteVacancy(r.id); cleared++; } catch { skipped++; }
            }
            sendResponse({ status: 'success', data: { cleared, skipped } });
        })().catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }

    if (request.action === 'get_platforms') {
        db.platforms_dict.toArray()
            .then((rows) => sendResponse({ status: 'success', data: rows }))
            .catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }

    if (request.action === 'get_settings') {
        readAllSettings()
            .then((data) => sendResponse({ status: 'success', data }))
            .catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }

    if (request.action === 'save_settings') {
        (async () => {
            for (const [k, v] of Object.entries(request.settings || {})) {
                if (SETTING_KEYS.includes(k)) await setSetting(k, v);
            }
            sendResponse({ status: 'success', data: await readAllSettings() });
        })().catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }

    if (request.action === 'get_jobs') {
        db.automation_jobs.toArray()
            .then((rows) => sendResponse({ status: 'success', data: rows }))
            .catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }

    if (request.action === 'save_job') {
        saveJobRecord(request.job)
            .then((job) => sendResponse({ status: 'success', data: job }))
            .catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }

    if (request.action === 'delete_job') {
        db.automation_jobs.delete(request.id)
            .then(() => sendResponse({ status: 'success' }))
            .catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }

    if (request.action === 'get_profiles') {
        listHydratedProfiles()
            .then((list) => sendResponse({ status: 'success', data: list }))
            .catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }

    if (request.action === 'get_profile') {
        ensureDefaultProfile()
            .then(hydrateProfile)
            .then((p) => sendResponse({ status: 'success', data: p }))
            .catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }

    if (request.action === 'save_profile') {
        saveProfileRecord(request.profile || {})
            .then((saved) => sendResponse({ status: 'success', data: saved }))
            .catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }

    if (request.action === 'delete_profile') {
        (async () => {
            const count = await db.user_profiles.count();
            if (count <= 1) throw new Error('Cannot delete the only profile.');
            await deleteProfileCascade(request.profileId);
            await ensureDefaultProfile();
            sendResponse({ status: 'success' });
        })().catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }

    if (request.action === 'get_storage_weight') {
        calculateStorageWeight()
            .then((w) => sendResponse({ status: 'success', data: w }))
            .catch((err) => sendResponse({ status: 'error', message: err.message }));
        return true;
    }
});