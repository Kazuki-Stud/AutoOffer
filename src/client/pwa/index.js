import { db } from '../extension/database/database.js';
import { migrateLegacySecrets } from '../extension/database/crypto.js';
import {
    createApplication,
    deleteProfileCascade,
    deleteVacancy,
    ensureDefaultProfile,
    getOrCreateByName,
    getSetting,
    newId,
    nowIso,
    saveVacancy,
    setApplicationStatus,
    setDefaultProfile,
    setSetting,
} from '../extension/database/repository.js';
import { seedDatabase } from '../extension/database/seed.js';
import { ENUMS } from '../extension/database/validation.js';

let cachedVacancies = [];
let cachedApplications = new Map();
let cachedPlatforms = [];
let cachedProfiles = [];
let cachedJobs = [];

let isExtensionConnected = false;
let activeProfileId = null;
let editingJobId = null;
const selectedJobUrls = new Set();

function isSafeHttpUrl(raw) {
    try {
        const u = new URL(raw);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function getExtensionId() {
    return (document.getElementById('extension-id-input')?.value || localStorage.getItem('autooffer_extension_id') || '').trim();
}

function callExtension(action, payload = {}) {
    return new Promise((resolve, reject) => {
        const extId = getExtensionId();
        if (!extId || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
            return reject(new Error('Extension unavailable'));
        }
        chrome.runtime.sendMessage(extId, { action, ...payload }, (response) => {
            if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
            }
            if (!response || response.status === 'error') {
                return reject(new Error(response?.message || 'Extension returned an error'));
            }
            resolve(response.data);
        });
    });
}

function formatDate(dateVal) {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}.${d.getFullYear()}`;
}

function parseProfileLinks(rawText) {
    const urls = (rawText || '').split(/[\s,]+/).map((s) => s.trim()).filter(isSafeHttpUrl);
    return {
        github: urls.find((u) => u.includes('github.com')) || null,
        linkedin: urls.find((u) => u.includes('linkedin.com')) || null,
        website: urls.find((u) => !u.includes('github.com') && !u.includes('linkedin.com')) || null,
    };
}

function toStringArray(raw) {
    return (raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

async function calculateStorageWeight() {
    if (isExtensionConnected) {
        try {
            return await callExtension('get_storage_weight');
        } catch {}
    }
    try {
        const chunks = await Promise.all([
            db.local_vacancies.toArray(),
            db.personal_data.toArray(),
            db.resumes.toArray(),
            db.applications.toArray(),
            db.platforms_dict.toArray(),
            db.selectors.toArray(),
            db.automation_jobs.toArray(),
        ]);
        const bytes = new Blob([JSON.stringify(chunks)]).size;
        const formatted = bytes > 1048576
            ? `${(bytes / 1048576).toFixed(2)} MB`
            : `${Math.max(1, Math.round(bytes / 1024))} KB`;
        return { bytes, formatted };
    } catch {
        return { bytes: 0, formatted: '0 KB' };
    }
}

function updateMetricsView(count, weightStr) {
    const countEl = document.getElementById('pwa-storage-count-val');
    const weightEl = document.getElementById('pwa-storage-weight-val');
    if (countEl) countEl.textContent = String(count);
    if (weightEl) weightEl.textContent = weightStr;
}

function renderStats(list, weightStr = '0 KB') {
    const statsContainer = document.getElementById('dashboard-stats');
    if (!statsContainer) return;

    const total = list.length;
    const withDesc = list.filter((v) => v.status === 'complete' && v.description && v.description.length > 50).length;
    const raw = `${total} | Total Vacancies\n${withDesc} | Detailed\n${weightStr} | Storage Weight`;

    if (typeof statsContainer.render === 'function') {
        statsContainer.render(raw);
    } else {
        statsContainer.textContent = raw;
        if (typeof statsContainer.connectedCallback === 'function') {
            statsContainer.connectedCallback();
        }
    }
}

async function refreshDisplay() {
    cachedVacancies = await db.local_vacancies.orderBy('updated_at').reverse().toArray();
    const profile = await ensureDefaultProfile();
    const apps = await db.applications.where('profile_id').equals(profile.id).toArray();
    cachedApplications = new Map(apps.map((a) => [a.vacancy_id, a]));

    const weightInfo = await calculateStorageWeight();
    renderStats(cachedVacancies, weightInfo.formatted);
    renderList(cachedVacancies, profile.id);
    updateMetricsView(cachedVacancies.length, weightInfo.formatted);
}

function renderList(list, profileId) {
    const grid = document.getElementById('vacancies-grid');
    const emptyState = document.getElementById('empty-state');
    if (!grid) return;

    grid.innerHTML = '';
    if (!list.length) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    const modal = document.getElementById('vacancy-modal');

    for (const item of list) {
        const card = document.createElement('div');
        card.className = 'vacancy-item';

        const titleEl = document.createElement('div');
        titleEl.className = 'vacancy-title';
        titleEl.textContent = item.full_position_name || 'Untitled Position';

        const linkEl = document.createElement('a');
        linkEl.className = 'vacancy-link';
        linkEl.href = isSafeHttpUrl(item.url) ? item.url : '#';
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
        linkEl.innerHTML = `
            <span>Open original</span>
            <svg class="link-circle-arrow" viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.6"></circle>
                <path d="M8.5 7l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
        `;
        linkEl.addEventListener('click', (e) => e.stopPropagation());

        const footerEl = document.createElement('div');
        footerEl.className = 'vacancy-footer';

        const dateStr = formatDate(item.created_at);
        const isComplete = item.status === 'complete' && item.description && item.description.length > 50;

        const dateSpan = document.createElement('span');
        dateSpan.className = 'vacancy-date';
        dateSpan.textContent = dateStr;

        const pillSpan = document.createElement('span');
        pillSpan.className = 'ao-pill';
        pillSpan.dataset.status = isComplete ? 'complete' : 'basic';
        pillSpan.textContent = `${isComplete ? 'Complete' : 'Basic'} · ${item.sync_level || 'none'}`;

        const app = cachedApplications.get(item.id);
        const statusSelect = document.createElement('select');
        statusSelect.className = 'form-select';
        statusSelect.style.maxWidth = '130px';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = 'Not Applied';
        statusSelect.appendChild(noneOpt);
        for (const st of ENUMS.application_status) {
            const opt = document.createElement('option');
            opt.value = st;
            opt.textContent = st;
            statusSelect.appendChild(opt);
        }
        statusSelect.value = app ? app.status : '';
        statusSelect.addEventListener('click', (e) => e.stopPropagation());
        statusSelect.addEventListener('change', async (e) => {
            const chosen = e.target.value;
            if (!chosen) return;
            if (app) {
                await setApplicationStatus(app.id, chosen);
            } else {
                await createApplication({ profile_id: profileId, vacancy_id: item.id });
                if (chosen !== 'Applied') {
                    const created = await db.applications.where('[profile_id+vacancy_id]').equals([profileId, item.id]).first();
                    if (created) await setApplicationStatus(created.id, chosen);
                }
            }
            await refreshDisplay();
        });

        footerEl.append(dateSpan, pillSpan, statusSelect);
        card.append(titleEl, linkEl, footerEl);

        card.addEventListener('click', () => {
            if (!modal) return;
            let hostname = item.source_host || 'Direct';
            try {
                if (item.url) hostname = new URL(item.url).hostname;
            } catch {}
            modal.open({
                title: item.full_position_name || 'Untitled Position',
                description: item.description || '(No full description stored locally)',
                url: isSafeHttpUrl(item.url) ? item.url : '#',
                source: hostname,
            });
        });

        grid.appendChild(card);
    }
}

function setSyncStatus(text, type = 'normal') {
    const statusEl = document.getElementById('sync-status');
    const connEl = document.getElementById('pwa-conn-status-val');
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.className = `sync-status-indicator ${type}`;
    }
    if (connEl) connEl.textContent = text;
}

function updateSourceTags() {
    const label = isExtensionConnected ? 'Extension Source of Truth' : 'Standalone Local (Dexie v7)';
    for (const id of ['pwa-jobs-source-tag', 'pwa-profile-source-tag', 'pwa-settings-source-tag']) {
        const el = document.getElementById(id);
        if (el) el.textContent = label;
    }
}

async function detectExtensionStatus() {
    const banner = document.getElementById('ext-missing-banner');
    const extId = getExtensionId();
    const available = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.sendMessage);

    if (!available) {
        isExtensionConnected = false;
        if (banner) banner.style.display = 'block';
        setSyncStatus('Standalone Mode (No Extension API)', 'normal');
        updateSourceTags();
        return false;
    }
    if (!extId) {
        isExtensionConnected = false;
        if (banner) banner.style.display = 'block';
        setSyncStatus('Set Extension ID in Settings', 'normal');
        updateSourceTags();
        return false;
    }

    try {
        await callExtension('get_storage_weight');
        isExtensionConnected = true;
        if (banner) banner.style.display = 'none';
        setSyncStatus('Extension Connected', 'success');
        updateSourceTags();
        return true;
    } catch {
        isExtensionConnected = false;
        if (banner) banner.style.display = 'block';
        setSyncStatus('Extension Unreachable', 'error');
        updateSourceTags();
        return false;
    }
}

// ---- Settings (Extension canonical when connected) --------------------------
async function loadSettingsUI() {
    let settings = null;
    if (isExtensionConnected) {
        try {
            settings = await callExtension('get_settings');
            for (const [k, v] of Object.entries(settings)) {
                await setSetting(k, v).catch(() => {});
            }
        } catch {}
    }

    const serverUrl = settings ? settings.server_base_url : await getSetting('server_base_url');
    const privOnly = settings ? settings.private_use_only : await getSetting('private_use_only');
    const subMode = settings ? settings.submission_mode : await getSetting('submission_mode');

    const serverInput = document.getElementById('server-url-input');
    const privToggle = document.getElementById('private-use-only-toggle');
    const modeSelect = document.getElementById('submission-mode-select');

    if (serverInput) serverInput.value = serverUrl || 'http://localhost:8080';
    if (privToggle) privToggle.checked = Boolean(privOnly);
    if (modeSelect) modeSelect.value = subMode || 'semi_automated';
}

async function saveSingleSetting(key, value) {
    await setSetting(key, value);
    if (isExtensionConnected) {
        await callExtension('save_settings', { settings: { [key]: value } });
    }
}

// ---- Platforms --------------------------------------------------------------
async function loadPlatforms() {
    if (isExtensionConnected) {
        try {
            cachedPlatforms = await callExtension('get_platforms');
            await db.platforms_dict.bulkPut(cachedPlatforms);
            return cachedPlatforms;
        } catch {}
    }
    cachedPlatforms = await db.platforms_dict.toArray();
    return cachedPlatforms;
}

// ---- Profiles (Extension canonical when connected) --------------------------
async function loadLocalHydratedProfiles() {
    await ensureDefaultProfile();
    const profiles = await db.user_profiles.toArray();
    const out = [];
    for (const row of profiles) {
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
    return out;
}

async function saveLocalProfile(incoming) {
    const now = nowIso();
    let profileId = incoming.profile_id || null;
    if (!profileId) {
        if (incoming.create_new) {
            profileId = newId();
            await db.user_profiles.add({
                id: profileId,
                name: incoming.profile_name || 'New Profile',
                is_default: incoming.is_default ? 1 : 0,
                created_at: now,
                updated_at: now,
            });
        } else {
            const def = await ensureDefaultProfile();
            profileId = def.id;
        }
    } else {
        const exists = await db.user_profiles.get(profileId);
        if (!exists) {
            await db.user_profiles.add({
                id: profileId,
                name: incoming.profile_name || 'Profile',
                is_default: incoming.is_default ? 1 : 0,
                created_at: now,
                updated_at: now,
            });
        } else if (incoming.profile_name) {
            await db.user_profiles.update(profileId, { name: incoming.profile_name, updated_at: now });
        }
    }
    if (incoming.is_default) await setDefaultProfile(profileId);

    const { github, linkedin, website } = parseProfileLinks(incoming.links);
    const personalPayload = {
        first_name: incoming.first_name,
        last_name: incoming.last_name,
        email: incoming.email,
        phone: incoming.phone || null,
        location: incoming.location || null,
        github, linkedin, website,
        updated_at: now,
    };
    const existingPersonal = await db.personal_data.where('profile_id').equals(profileId).first();
    if (existingPersonal) {
        await db.personal_data.update(existingPersonal.id, personalPayload);
    } else {
        await db.personal_data.add({ id: newId(), profile_id: profileId, ...personalPayload, created_at: now });
    }

    const skillNames = [...new Set(toStringArray(incoming.skills))];
    const skillIds = [];
    for (const name of skillNames) skillIds.push(await getOrCreateByName('skills', name));
    const headline = incoming.headline || 'Default Resume';
    const resumeText = `${headline}\nSkills: ${skillNames.join(', ')}`;
    const existingResume = await db.resumes.where('profile_id').equals(profileId).first();
    if (existingResume) {
        await db.resumes.update(existingResume.id, { title: headline, plain_text: resumeText, skill_ids: skillIds, updated_at: now });
    } else {
        await db.resumes.add({ id: newId(), profile_id: profileId, title: headline, plain_text: resumeText, skill_ids: skillIds, created_at: now, updated_at: now });
    }

    const rolesArr = toStringArray(incoming.roles);
    const locsArr = toStringArray(incoming.locations);
    const kwArr = toStringArray(incoming.keywords);
    const existingPrefs = await db.search_preferences.where('profile_id').equals(profileId).first();
    if (rolesArr.length > 0) {
        if (existingPrefs) {
            await db.search_preferences.update(existingPrefs.id, { roles: rolesArr, locations: locsArr, keywords: kwArr, updated_at: now });
        } else {
            await db.search_preferences.add({
                id: newId(), profile_id: profileId, roles: rolesArr,
                locations: locsArr, keywords: kwArr, urls: [], platform_ids: [], page_limit: 2, updated_at: now,
            });
        }
    } else if (existingPrefs) {
        await db.search_preferences.delete(existingPrefs.id);
    }
    return profileId;
}

function populateProfileForm(p) {
    document.getElementById('pwa-prof-label').value = p?.profile_name || 'Default';
    document.getElementById('pwa-prof-default').checked = Boolean(p?.is_default);
    document.getElementById('pwa-prof-firstname').value = p?.first_name || '';
    document.getElementById('pwa-prof-lastname').value = p?.last_name || '';
    document.getElementById('pwa-prof-email').value = p?.email || '';
    document.getElementById('pwa-prof-phone').value = p?.phone || '';
    document.getElementById('pwa-prof-location').value = p?.location || '';
    document.getElementById('pwa-prof-headline').value = p?.headline || '';
    document.getElementById('pwa-prof-roles').value = p?.roles || '';
    document.getElementById('pwa-prof-locations').value = p?.locations || '';
    document.getElementById('pwa-prof-keywords').value = p?.keywords || '';
    document.getElementById('pwa-prof-links').value = p?.links || '';
    document.getElementById('pwa-prof-skills').value = p?.skills || '';
}

function renderProfileSelects() {
    const profSelect = document.getElementById('pwa-profile-select');
    const jobProfSelect = document.getElementById('pwa-job-profile');

    for (const sel of [profSelect, jobProfSelect]) {
        if (!sel) continue;
        const prev = sel.value;
        sel.innerHTML = '';
        for (const p of cachedProfiles) {
            const opt = document.createElement('option');
            opt.value = p.profile_id;
            const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
            opt.textContent = `${p.profile_name || fullName || 'Profile'}${p.is_default ? ' (Default)' : ''}`;
            sel.appendChild(opt);
        }
        if (prev && cachedProfiles.some((p) => p.profile_id === prev)) sel.value = prev;
    }

    if (activeProfileId && cachedProfiles.some((p) => p.profile_id === activeProfileId)) {
        if (profSelect) profSelect.value = activeProfileId;
    } else {
        const def = cachedProfiles.find((p) => p.is_default) || cachedProfiles[0];
        activeProfileId = def?.profile_id || null;
        if (profSelect && activeProfileId) profSelect.value = activeProfileId;
    }

    const current = cachedProfiles.find((p) => p.profile_id === activeProfileId);
    if (current) populateProfileForm(current);
}

async function loadProfilesUI() {
    if (isExtensionConnected) {
        try {
            cachedProfiles = await callExtension('get_profiles');
            renderProfileSelects();
            return;
        } catch {}
    }
    cachedProfiles = await loadLocalHydratedProfiles();
    renderProfileSelects();
}

function initProfilePage() {
    const profSelect = document.getElementById('pwa-profile-select');
    const newBtn = document.getElementById('pwa-new-profile-btn');
    const delBtn = document.getElementById('pwa-delete-profile-btn');
    const saveBtn = document.getElementById('pwa-save-profile-btn');
    const statusMsg = document.getElementById('pwa-profile-status');

    const showStatus = (text, ok = true) => {
        if (!statusMsg) return;
        statusMsg.textContent = text;
        statusMsg.style.color = ok ? '#34d399' : '#f87171';
        if (ok) setTimeout(() => { statusMsg.textContent = ''; }, 3000);
    };

    profSelect?.addEventListener('change', (e) => {
        activeProfileId = e.target.value || null;
        const found = cachedProfiles.find((p) => p.profile_id === activeProfileId);
        populateProfileForm(found || null);
    });

    newBtn?.addEventListener('click', () => {
        activeProfileId = null;
        populateProfileForm({ profile_name: 'New Profile', is_default: 0 });
        showStatus('Fill fields and click Save Profile Changes to create.', true);
    });

    delBtn?.addEventListener('click', async () => {
        if (!activeProfileId) return showStatus('Select a saved profile to delete.', false);
        if (cachedProfiles.length <= 1) return showStatus('Cannot delete the only profile.', false);
        if (!confirm('Delete this profile and its resumes?')) return;
        try {
            if (isExtensionConnected) {
                await callExtension('delete_profile', { profileId: activeProfileId });
            } else {
                await deleteProfileCascade(activeProfileId);
                await ensureDefaultProfile();
            }
            activeProfileId = null;
            await loadProfilesUI();
            showStatus('Profile deleted.', true);
        } catch (err) {
            showStatus(err.message, false);
        }
    });

    saveBtn?.addEventListener('click', async () => {
        try {
            const payload = {
                profile_id: activeProfileId,
                create_new: !activeProfileId,
                profile_name: document.getElementById('pwa-prof-label').value.trim() || 'Profile',
                is_default: document.getElementById('pwa-prof-default').checked ? 1 : 0,
                first_name: document.getElementById('pwa-prof-firstname').value.trim(),
                last_name: document.getElementById('pwa-prof-lastname').value.trim(),
                email: document.getElementById('pwa-prof-email').value.trim(),
                phone: document.getElementById('pwa-prof-phone').value.trim(),
                location: document.getElementById('pwa-prof-location').value.trim(),
                headline: document.getElementById('pwa-prof-headline').value.trim() || 'Default Resume',
                roles: document.getElementById('pwa-prof-roles').value.trim(),
                locations: document.getElementById('pwa-prof-locations').value.trim(),
                keywords: document.getElementById('pwa-prof-keywords').value.trim(),
                links: document.getElementById('pwa-prof-links').value.trim(),
                skills: document.getElementById('pwa-prof-skills').value.trim(),
            };

            if (isExtensionConnected) {
                const saved = await callExtension('save_profile', { profile: payload });
                activeProfileId = saved.profile_id;
                await saveLocalProfile({ ...payload, profile_id: saved.profile_id, create_new: false }).catch(() => {});
            } else {
                activeProfileId = await saveLocalProfile(payload);
            }

            await loadProfilesUI();
            await refreshDisplay();
            showStatus('Profile & resume saved.', true);
        } catch (err) {
            showStatus(err.message, false);
        }
    });
}

// ---- Jobs & Automation Management -------------------------------------------
function renderJobPlatformChips() {
    const picker = document.getElementById('pwa-job-platforms-picker');
    if (!picker) return;
    picker.innerHTML = '';
    for (const p of cachedPlatforms) {
        const url = p.url || `https://${p.code}`;
        const chip = document.createElement('div');
        chip.className = 'platform-chip' + (selectedJobUrls.has(url) ? ' selected' : '');
        chip.textContent = `${p.name || p.code}${p.permission_status === 'granted' ? '' : ' (Manual)'}`;
        chip.addEventListener('click', () => {
            if (selectedJobUrls.has(url)) {
                selectedJobUrls.delete(url);
                chip.classList.remove('selected');
            } else {
                selectedJobUrls.add(url);
                chip.classList.add('selected');
            }
        });
        picker.appendChild(chip);
    }
}

function renderJobsList() {
    const listEl = document.getElementById('pwa-jobs-list');
    const countEl = document.getElementById('pwa-jobs-count');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (countEl) countEl.textContent = `${cachedJobs.length} jobs`;

    if (!cachedJobs.length) {
        listEl.innerHTML = '<div class="status-msg">No saved automation jobs yet. Create one above and run it from the Extension popup.</div>';
        return;
    }

    for (const j of cachedJobs) {
        const card = document.createElement('div');
        card.className = 'job-row-card';

        const info = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = j.title || 'Untitled Job';
        const meta = document.createElement('div');
        meta.className = 'job-row-meta';
        const sites = (j.websites || '').split('\n').filter(Boolean).length;
        const extras = [
            `Sites: ${sites}`,
            `Roles: ${j.roles || '(from profile)'}`,
            j.locations ? `Locations: ${j.locations}` : null,
            j.keywords ? `Keywords: ${j.keywords}` : null,
            `Pages: ${j.limit || 2}`,
            `Fields: ${j.fields_mode || 'all'}`,
        ].filter(Boolean).join(' · ');
        meta.textContent = extras;
        info.append(title, meta);

        const actions = document.createElement('div');
        actions.className = 'job-row-actions';
        const editBtn = document.createElement('button');
        editBtn.className = 'secondary-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => {
            editingJobId = j.id;
            document.getElementById('pwa-job-form-heading').textContent = `Edit Job: ${j.title}`;
            document.getElementById('pwa-job-title').value = j.title || '';
            document.getElementById('pwa-job-roles').value = j.roles || '';
            document.getElementById('pwa-job-locations').value = j.locations || '';
            document.getElementById('pwa-job-keywords').value = j.keywords || '';
            document.getElementById('pwa-job-fields').value = j.fields_mode || 'all';
            document.getElementById('pwa-job-limit').value = j.limit || 2;
            if (j.profile_id) document.getElementById('pwa-job-profile').value = j.profile_id;
            selectedJobUrls.clear();
            (j.websites || '').split('\n').map((s) => s.trim()).filter(Boolean).forEach((u) => selectedJobUrls.add(u));
            renderJobPlatformChips();
            document.getElementById('pwa-cancel-job-btn').style.display = 'inline-block';
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'clear-button';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
            if (!confirm(`Delete job "${j.title}"?`)) return;
            if (isExtensionConnected) await callExtension('delete_job', { id: j.id });
            await db.automation_jobs.delete(j.id);
            await loadJobsUI();
        });

        actions.append(editBtn, delBtn);
        card.append(info, actions);
        listEl.appendChild(card);
    }
}

async function loadJobsUI() {
    if (isExtensionConnected) {
        try {
            cachedJobs = await callExtension('get_jobs');
            await db.automation_jobs.clear();
            if (cachedJobs.length) await db.automation_jobs.bulkPut(cachedJobs);
            renderJobPlatformChips();
            renderJobsList();
            return;
        } catch {}
    }
    cachedJobs = await db.automation_jobs.toArray();
    renderJobPlatformChips();
    renderJobsList();
}

function initJobsPage() {
    const saveBtn = document.getElementById('pwa-save-job-btn');
    const cancelBtn = document.getElementById('pwa-cancel-job-btn');
    const statusEl = document.getElementById('pwa-job-status');

    const resetForm = () => {
        editingJobId = null;
        document.getElementById('pwa-job-form-heading').textContent = 'Create Automation Job';
        document.getElementById('pwa-job-title').value = '';
        document.getElementById('pwa-job-roles').value = '';
        document.getElementById('pwa-job-locations').value = '';
        document.getElementById('pwa-job-keywords').value = '';
        document.getElementById('pwa-job-fields').value = 'all';
        document.getElementById('pwa-job-limit').value = 2;
        selectedJobUrls.clear();
        renderJobPlatformChips();
        if (cancelBtn) cancelBtn.style.display = 'none';
    };

    cancelBtn?.addEventListener('click', resetForm);

    saveBtn?.addEventListener('click', async () => {
        const websites = Array.from(selectedJobUrls).join('\n');
        const title = document.getElementById('pwa-job-title').value.trim();
        const profileId = document.getElementById('pwa-job-profile').value;
        const roles = document.getElementById('pwa-job-roles').value.trim();
        const locations = document.getElementById('pwa-job-locations').value.trim();
        const keywords = document.getElementById('pwa-job-keywords').value.trim();
        const fields_mode = document.getElementById('pwa-job-fields').value;
        const limit = Number(document.getElementById('pwa-job-limit').value);

        const selectedProfile = cachedProfiles.find((p) => p.profile_id === profileId);
        const effectiveRoles = toStringArray(roles || selectedProfile?.roles || selectedProfile?.skills || '');

        if (!websites) {
            statusEl.textContent = 'Select at least one target platform.';
            statusEl.style.color = '#f87171';
            return;
        }
        if (!effectiveRoles.length) {
            statusEl.textContent = 'Provide target roles (either here or in the selected profile).';
            statusEl.style.color = '#f87171';
            return;
        }
        if (!Number.isInteger(limit) || limit < 1) {
            statusEl.textContent = 'Page limit must be at least 1.';
            statusEl.style.color = '#f87171';
            return;
        }

        try {
            const payload = {
                id: editingJobId || newId(),
                title: title || 'Custom Job',
                websites,
                roles,
                locations,
                keywords,
                profile_id: profileId,
                fields_mode,
                limit,
                status: 'ready',
                created_at: nowIso(),
            };
            if (isExtensionConnected) {
                const saved = await callExtension('save_job', { job: payload });
                await db.automation_jobs.put(saved);
            } else {
                await db.automation_jobs.put(payload);
            }
            resetForm();
            await loadJobsUI();
            await refreshDisplay();
            statusEl.textContent = 'Job saved.';
            statusEl.style.color = '#34d399';
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
        } catch (err) {
            statusEl.textContent = err.message;
            statusEl.style.color = '#f87171';
        }
    });
}

// ---- Sync, Analytics & Backup -----------------------------------------------
async function syncFromExtension() {
    const extId = getExtensionId();
    const role = document.getElementById('sync-role-input')?.value.trim() || 'all';
    const dateRange = document.getElementById('sync-date-select')?.value || 'all';
    const fieldsMode = document.getElementById('sync-fields-select')?.value || 'all';

    if (!extId) return setSyncStatus('Specify Chrome Extension ID.', 'error');
    localStorage.setItem('autooffer_extension_id', extId);

    setSyncStatus('Connecting to extension...', 'active');
    try {
        const rows = await callExtension('get_vacancies', { role, dateRange, fieldsMode });
        for (const v of rows || []) {
            if (!isSafeHttpUrl(v.url)) continue;
            let host = null;
            try { host = new URL(v.url).hostname; } catch {}
            const hasDesc = Boolean(v.description && v.description.trim().length > 0);
            await saveVacancy({
                platform_id: v.platform_id || null,
                source_host: v.platform_id ? null : host,
                full_position_name: v.full_position_name || 'Untitled Position',
                url: v.url,
                description: hasDesc ? v.description.trim() : null,
                status: hasDesc ? 'complete' : 'new',
                skill_ids: Array.isArray(v.skill_ids) ? v.skill_ids : [],
            }, { source: v.source || 'auto' });
        }
        await detectExtensionStatus();
        await loadSettingsUI();
        await loadPlatforms();
        await loadProfilesUI();
        await loadJobsUI();
        await refreshDisplay();
        setSyncStatus(`Synchronized ${(rows || []).length} vacancies.`, 'success');
    } catch (err) {
        setSyncStatus(`Sync failed: ${err.message}`, 'error');
    }
}

async function loadHotwords() {
    const el = document.getElementById('hotwords-list');
    if (!el) return;
    const base = (await getSetting('server_base_url') || 'http://localhost:8080').replace(/\/+$/, '');
    el.textContent = 'Loading skill demand...';
    try {
        const res = await fetch(`${base}/api/skills/hotwords`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        if (!rows.length) {
            el.textContent = 'No aggregated skill hotwords yet.';
            return;
        }
        el.textContent = rows.slice(0, 12)
            .map((r) => `${r.skillName} (${r.positionName}: ${r.vacancyCount})`)
            .join(' · ');
    } catch (err) {
        el.textContent = `Could not reach backend analytics (${err.message}).`;
    }
}

async function exportLocalBackup() {
    const dump = {};
    for (const t of db.tables) {
        if (t.name === 'local_device_state') continue;
        dump[t.name] = await t.toArray();
    }
    const blob = new Blob([JSON.stringify({ exportedAt: nowIso(), schemaVersion: 7, tables: dump }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `autooffer-backup-${nowIso().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}

async function importLocalBackup(file) {
    const parsed = JSON.parse(await file.text());
    if (!parsed?.tables) throw new Error('Invalid backup format');
    await db.transaction('rw', db.tables, async () => {
        for (const [name, rows] of Object.entries(parsed.tables)) {
            if (name === 'local_device_state' || !Array.isArray(rows)) continue;
            const table = db.tables.find((t) => t.name === name);
            if (table) await table.bulkPut(rows);
        }
    });
    await loadSettingsUI();
    await loadProfilesUI();
    await loadJobsUI();
    await refreshDisplay();
    setSyncStatus('Backup imported locally.', 'success');
}

function initNavigation() {
    const navButtons = document.querySelectorAll('.pwa-nav-btn');
    navButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            navButtons.forEach((b) => b.classList.remove('active'));
            document.querySelectorAll('.pwa-view').forEach((v) => { v.style.display = 'none'; });
            btn.classList.add('active');
            const targetView = document.getElementById(btn.getAttribute('data-view'));
            if (targetView) targetView.style.display = 'flex';
        });
    });
    document.getElementById('goto-sync-btn')?.addEventListener('click', () => {
        document.getElementById('nav-btn-settings')?.click();
    });
}

function updateThemeToggleUI() {
    const currentTheme = window.AoTheme ? window.AoTheme.getTheme() : (document.documentElement.getAttribute('data-theme') || 'dark');
    document.querySelector('.theme-icon.moon-icon')?.classList.toggle('active', currentTheme === 'dark');
    document.querySelector('.theme-icon.sun-icon')?.classList.toggle('active', currentTheme !== 'dark');
}

document.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then((reg) => reg.update()).catch(() => {});
    }
    if (navigator.storage?.persist) {
        navigator.storage.persist().catch(() => {});
    }

    await seedDatabase();
    await migrateLegacySecrets();

    initNavigation();
    initProfilePage();
    initJobsPage();

    const savedExtId = localStorage.getItem('autooffer_extension_id') || '';
    const extInput = document.getElementById('extension-id-input');
    if (extInput && savedExtId) extInput.value = savedExtId;

    await detectExtensionStatus();
    await loadSettingsUI();
    await loadPlatforms();
    await loadProfilesUI();
    await loadJobsUI();
    await refreshDisplay();

    extInput?.addEventListener('change', async (e) => {
        localStorage.setItem('autooffer_extension_id', e.target.value.trim());
        await detectExtensionStatus();
        await loadSettingsUI();
        await loadPlatforms();
        await loadProfilesUI();
        await loadJobsUI();
    });

    document.getElementById('server-url-input')?.addEventListener('change', (e) =>
        saveSingleSetting('server_base_url', e.target.value.trim()).catch((err) => setSyncStatus(err.message, 'error'))
    );
    document.getElementById('private-use-only-toggle')?.addEventListener('change', (e) =>
        saveSingleSetting('private_use_only', e.target.checked).catch((err) => setSyncStatus(err.message, 'error'))
    );
    document.getElementById('submission-mode-select')?.addEventListener('change', (e) =>
        saveSingleSetting('submission_mode', e.target.value).catch((err) => setSyncStatus(err.message, 'error'))
    );

    updateThemeToggleUI();
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
        if (window.AoTheme) { window.AoTheme.toggleTheme(); updateThemeToggleUI(); }
    });
    window.addEventListener('ao-theme-changed', updateThemeToggleUI);

    document.getElementById('quick-refresh-btn')?.addEventListener('click', refreshDisplay);
    document.getElementById('load-hotwords-btn')?.addEventListener('click', loadHotwords);
    document.getElementById('export-json-btn')?.addEventListener('click', exportLocalBackup);
    document.getElementById('import-json-input')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) importLocalBackup(file).catch((err) => setSyncStatus(err.message, 'error'));
    });

    document.getElementById('clear-btn')?.addEventListener('click', async () => {
        if (isExtensionConnected) {
            try { await callExtension('clear_vacancies'); } catch {}
        }
        const rows = await db.local_vacancies.toArray();
        let skipped = 0;
        for (const r of rows) {
            try { await deleteVacancy(r.id); } catch { skipped++; }
        }
        await refreshDisplay();
        setSyncStatus(skipped ? `Cleared un-applied vacancies (${skipped} kept due to applications).` : 'All stored vacancies cleared.', 'normal');
    });

    document.getElementById('sync-btn')?.addEventListener('click', syncFromExtension);

    document.getElementById('filter-input')?.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        if (!val) return refreshDisplay();
        const filtered = cachedVacancies.filter((v) =>
            (v.full_position_name && v.full_position_name.toLowerCase().includes(val)) ||
            (v.description && v.description.toLowerCase().includes(val))
        );
        ensureDefaultProfile().then((p) => renderList(filtered, p.id));
    });
});