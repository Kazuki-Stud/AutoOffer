import { db } from '../extension/database/database.js';
import { migrateLegacySecrets } from '../extension/database/crypto.js';
import {
    createApplication,
    deleteProfileCascade,
    deleteResume,
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
let cachedAllApplications = [];
let cachedCompanies = new Map();
let cachedResumesMap = new Map();
let cachedPlatforms = [];
let cachedProfiles = [];
let cachedProfileResumes = [];
let cachedJobs = [];

let isExtensionConnected = false;
let activeProfileId = null;
let activeResumeId = null;
let pendingResumeFile = null; // { file_name, mime_type, file_data_b64, clear_file }
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

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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

function formatDateTime(dateVal) {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${d.getFullYear()} ${hh}:${mm}`;
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
    if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
    return (raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const bytes = new Uint8Array(reader.result);
            let bin = '';
            for (let i = 0; i < bytes.length; i += 8192) {
                bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
            }
            resolve(btoa(bin));
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

function base64ToBlob(b64, mimeType = 'application/octet-stream') {
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
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

async function syncApplicationsFromBridge() {
    if (isExtensionConnected) {
        try {
            const remoteApps = await callExtension('get_applications');
            if (Array.isArray(remoteApps)) {
                await db.applications.clear();
                if (remoteApps.length) await db.applications.bulkPut(remoteApps);
            }
        } catch {}
    }
}

async function refreshDisplay() {
    cachedVacancies = await db.local_vacancies.orderBy('updated_at').reverse().toArray();
    const profile = await ensureDefaultProfile();
    await syncApplicationsFromBridge();

    const [allApps, companies, allResumes] = await Promise.all([
        db.applications.toArray(),
        db.companies_dict.toArray(),
        db.resumes.toArray(),
    ]);
    cachedAllApplications = allApps.sort((a, b) => (b.applied_at || '').localeCompare(a.applied_at || ''));
    cachedCompanies = new Map(companies.map((c) => [c.id, c]));
    cachedResumesMap = new Map(allResumes.map((r) => [r.id, r]));

    const activeProfApps = cachedAllApplications.filter((a) => a.profile_id === (activeProfileId || profile.id));
    cachedApplications = new Map(activeProfApps.map((a) => [a.vacancy_id, a]));

    const weightInfo = await calculateStorageWeight();
    renderStats(cachedVacancies, weightInfo.formatted);
    renderList(cachedVacancies, activeProfileId || profile.id);
    renderApplicationsTable();
    updateMetricsView(cachedVacancies.length, weightInfo.formatted);
}

function openVacancyModal(item) {
    const modal = document.getElementById('vacancy-modal');
    if (!modal) return;
    let hostname = item.source_host || 'Direct';
    try {
        if (item.url) hostname = new URL(item.url).hostname;
    } catch {}
    modal.open({
        title: item.full_position_name || 'Untitled Vacancy',
        description: item.description || '(No full description stored locally)',
        url: isSafeHttpUrl(item.url) ? item.url : '#',
        source: hostname,
    });
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
            await upsertApplicationStatus(app, profileId, item.id, chosen);
            await refreshDisplay();
        });

        footerEl.append(dateSpan, pillSpan, statusSelect);
        card.append(titleEl, linkEl, footerEl);
        card.addEventListener('click', () => openVacancyModal(item));

        grid.appendChild(card);
    }
}

async function upsertApplicationStatus(existingApp, profileId, vacancyId, newStatus) {
    if (existingApp) {
        await setApplicationStatus(existingApp.id, newStatus);
        if (isExtensionConnected) {
            await callExtension('update_application', { id: existingApp.id, status: newStatus }).catch(() => {});
        }
    } else {
        const defaultResumeId = cachedProfileResumes[0]?.id || null;
        if (isExtensionConnected) {
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
}

// ---- US 5.3: Applications Lifecycle Table -----------------------------------
function renderApplicationsTable() {
    const tbody = document.getElementById('applications-tbody');
    const emptyEl = document.getElementById('applications-empty');
    const tableEl = document.getElementById('applications-table');
    const countBadge = document.getElementById('applications-count-badge');
    if (!tbody) return;

    const searchQ = (document.getElementById('applications-search-input')?.value || '').trim().toLowerCase();
    const statusFilter = document.getElementById('applications-status-filter')?.value || '';

    const vacancyById = new Map(cachedVacancies.map((v) => [v.id, v]));

    const joined = cachedAllApplications.map((app) => {
        const vac = vacancyById.get(app.vacancy_id) || null;
        const companyObj = vac?.company_id ? cachedCompanies.get(vac.company_id) : null;
        let hostFallback = vac?.source_host || '—';
        if (hostFallback === '—' && vac?.url) {
            try { hostFallback = new URL(vac.url).hostname.replace(/^www\./, ''); } catch {}
        }
        const companyName = companyObj?.name || hostFallback;
        const roleName = vac?.full_position_name || 'Untitled Vacancy';
        const resumeObj = app.resume_id ? cachedResumesMap.get(app.resume_id) : null;
        const resumeTitle = resumeObj?.title || '—';
        return { app, vac, companyName, roleName, resumeTitle };
    }).filter((row) => {
        if (statusFilter && row.app.status !== statusFilter) return false;
        if (!searchQ) return true;
        const hay = `${row.companyName} ${row.roleName} ${row.resumeTitle} ${row.app.notes || ''}`.toLowerCase();
        return hay.includes(searchQ);
    });

    if (countBadge) countBadge.textContent = `${joined.length} application${joined.length === 1 ? '' : 's'}`;

    tbody.innerHTML = '';
    if (!joined.length) {
        if (emptyEl) emptyEl.style.display = 'block';
        if (tableEl) tableEl.style.display = 'none';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (tableEl) tableEl.style.display = '';

    for (const { app, vac, companyName, roleName, resumeTitle } of joined) {
        const tr = document.createElement('tr');

        const tdCompany = document.createElement('td');
        tdCompany.dataset.label = 'Company';
        tdCompany.textContent = companyName;

        const tdRole = document.createElement('td');
        tdRole.dataset.label = 'Role';
        if (vac) {
            const roleBtn = document.createElement('button');
            roleBtn.type = 'button';
            roleBtn.className = 'app-role-link';
            roleBtn.textContent = roleName;
            roleBtn.addEventListener('click', () => openVacancyModal(vac));
            tdRole.appendChild(roleBtn);
        } else {
            tdRole.textContent = roleName;
        }

        const tdApplied = document.createElement('td');
        tdApplied.dataset.label = 'Applied';
        tdApplied.textContent = formatDateTime(app.applied_at);

        const tdResume = document.createElement('td');
        tdResume.dataset.label = 'Resume';
        tdResume.textContent = resumeTitle;

        const tdMatch = document.createElement('td');
        tdMatch.dataset.label = 'Match Score';
        const scorePill = document.createElement('span');
        scorePill.className = 'ao-pill';
        scorePill.dataset.status = app.match_score != null && app.match_score >= 70 ? 'complete' : 'basic';
        scorePill.textContent = app.match_score != null ? `${app.match_score}%` : '—';
        tdMatch.appendChild(scorePill);

        const tdStatus = document.createElement('td');
        tdStatus.dataset.label = 'Status';
        const sel = document.createElement('select');
        sel.className = 'form-select';
        for (const st of ENUMS.application_status) {
            const opt = document.createElement('option');
            opt.value = st;
            opt.textContent = st;
            sel.appendChild(opt);
        }
        sel.value = app.status;
        sel.addEventListener('change', async (e) => {
            await setApplicationStatus(app.id, e.target.value);
            if (isExtensionConnected) {
                await callExtension('update_application', { id: app.id, status: e.target.value }).catch(() => {});
            }
            await refreshDisplay();
        });
        tdStatus.appendChild(sel);

        const tdNotes = document.createElement('td');
        tdNotes.dataset.label = 'Notes';
        const notesInput = document.createElement('input');
        notesInput.type = 'text';
        notesInput.className = 'inline-notes-input';
        notesInput.placeholder = 'Add follow-up note...';
        notesInput.value = app.notes || '';
        notesInput.addEventListener('change', async (e) => {
            const val = e.target.value.trim() || null;
            await db.applications.update(app.id, { notes: val });
            if (isExtensionConnected) {
                await callExtension('update_application', { id: app.id, notes: val }).catch(() => {});
            }
        });
        tdNotes.appendChild(notesInput);

        tr.append(tdCompany, tdRole, tdApplied, tdResume, tdMatch, tdStatus, tdNotes);
        tbody.appendChild(tr);
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

// ---- Settings ---------------------------------------------------------------
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

// ---- Profiles ---------------------------------------------------------------
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

    if (incoming.headline !== undefined || incoming.skills !== undefined) {
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
    document.getElementById('pwa-prof-roles').value = p?.roles || '';
    document.getElementById('pwa-prof-locations').value = p?.locations || '';
    document.getElementById('pwa-prof-keywords').value = p?.keywords || '';
    document.getElementById('pwa-prof-links').value = p?.links || '';
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
            await loadResumesUI();
            return;
        } catch {}
    }
    cachedProfiles = await loadLocalHydratedProfiles();
    renderProfileSelects();
    await loadResumesUI();
}

// ---- US 5.1 & US 3.6: Multi-Resume Variants + PDF/Word Export -------------
async function loadLocalHydratedResumes(profileId) {
    const rows = await db.resumes.where('profile_id').equals(profileId).toArray();
    rows.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    const out = [];
    for (const r of rows) {
        const skillRows = r.skill_ids?.length ? await db.skills.bulkGet(r.skill_ids) : [];
        out.push({
            ...r,
            skills: skillRows.filter(Boolean).map((s) => s.name),
        });
    }
    return out;
}

async function mirrorResumesToLocalDb(profileId, remoteList) {
    await db.transaction('rw', [db.resumes, db.skills], async () => {
        const existingIds = await db.resumes.where('profile_id').equals(profileId).primaryKeys();
        const remoteIds = new Set(remoteList.map((r) => r.id));
        for (const id of existingIds) {
            if (!remoteIds.has(id)) await db.resumes.delete(id);
        }
        for (const r of remoteList) {
            const skillIds = [];
            for (const name of (r.skills || [])) {
                skillIds.push(await getOrCreateByName('skills', name));
            }
            const file_data = r.file_data_b64 ? base64ToBlob(r.file_data_b64, r.mime_type) : undefined;
            const rec = {
                id: r.id,
                profile_id: r.profile_id,
                title: r.title,
                summary: r.summary || null,
                plain_text: r.plain_text,
                skill_ids: skillIds.length ? skillIds : (r.skill_ids || []),
                file_name: r.file_name || null,
                mime_type: r.mime_type || null,
                created_at: r.created_at,
                updated_at: r.updated_at,
            };
            if (file_data) rec.file_data = file_data;
            await db.resumes.put(rec);
        }
    });
}

function populateResumeForm(r) {
    pendingResumeFile = null;
    const fileInput = document.getElementById('pwa-resume-file');
    if (fileInput) fileInput.value = '';

    document.getElementById('pwa-resume-title').value = r?.title || '';
    document.getElementById('pwa-resume-skills').value = (r?.skills || []).join(', ');
    document.getElementById('pwa-resume-summary').value = r?.summary || '';
    document.getElementById('pwa-resume-text').value = r?.plain_text || '';

    const fileInfo = document.getElementById('pwa-resume-file-info');
    const clearFileBtn = document.getElementById('pwa-resume-clear-file-btn');
    if (r?.file_name) {
        if (fileInfo) fileInfo.textContent = `Attached: ${r.file_name}`;
        if (clearFileBtn) clearFileBtn.style.display = 'inline-block';
    } else {
        if (fileInfo) fileInfo.textContent = 'No file attached';
        if (clearFileBtn) clearFileBtn.style.display = 'none';
    }
}

function renderResumesUI() {
    const listEl = document.getElementById('pwa-resumes-list');
    const selEl = document.getElementById('pwa-resume-select');
    const countEl = document.getElementById('pwa-resumes-count');
    if (!listEl || !selEl) return;

    if (countEl) countEl.textContent = `${cachedProfileResumes.length} variant${cachedProfileResumes.length === 1 ? '' : 's'}`;

    selEl.innerHTML = '';
    for (const r of cachedProfileResumes) {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.title;
        selEl.appendChild(opt);
    }

    if (activeResumeId && cachedProfileResumes.some((r) => r.id === activeResumeId)) {
        selEl.value = activeResumeId;
    } else if (cachedProfileResumes.length > 0) {
        activeResumeId = cachedProfileResumes[0].id;
        selEl.value = activeResumeId;
    } else {
        activeResumeId = null;
    }

    listEl.innerHTML = '';
    if (!cachedProfileResumes.length) {
        listEl.innerHTML = '<div class="status-msg">No resume variants yet for this profile. Fill the form below and click Save Resume Variant.</div>';
        populateResumeForm(null);
        return;
    }

    for (const r of cachedProfileResumes) {
        const card = document.createElement('div');
        card.className = 'resume-variant-card' + (r.id === activeResumeId ? ' active' : '');
        card.addEventListener('click', () => {
            activeResumeId = r.id;
            renderResumesUI();
        });

        const title = document.createElement('div');
        title.className = 'resume-variant-title';
        title.textContent = r.title;

        const meta = document.createElement('div');
        meta.className = 'resume-variant-meta';
        const parts = [
            r.skills?.length ? `${r.skills.length} skills` : '0 skills',
            r.file_name ? `File: ${r.file_name}` : null,
            `Updated ${formatDate(r.updated_at)}`,
        ].filter(Boolean);
        meta.textContent = parts.join(' · ');

        const actions = document.createElement('div');
        actions.className = 'resume-variant-actions';

        const pdfBtn = document.createElement('button');
        pdfBtn.type = 'button';
        pdfBtn.className = 'secondary-btn btn-xs';
        pdfBtn.textContent = 'Export PDF';
        pdfBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportResumeAsPdf(r);
        });

        const docBtn = document.createElement('button');
        docBtn.type = 'button';
        docBtn.className = 'secondary-btn btn-xs';
        docBtn.textContent = 'Export .doc';
        docBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportResumeAsWord(r);
        });

        actions.append(pdfBtn, docBtn);
        card.append(title, meta, actions);
        listEl.appendChild(card);
    }

    const active = cachedProfileResumes.find((r) => r.id === activeResumeId) || null;
    populateResumeForm(active);
}

async function loadResumesUI() {
    if (!activeProfileId) {
        cachedProfileResumes = [];
        renderResumesUI();
        return;
    }
    if (isExtensionConnected) {
        try {
            cachedProfileResumes = await callExtension('get_resumes', { profileId: activeProfileId });
            await mirrorResumesToLocalDb(activeProfileId, cachedProfileResumes).catch(() => {});
            renderResumesUI();
            return;
        } catch {}
    }
    cachedProfileResumes = await loadLocalHydratedResumes(activeProfileId);
    renderResumesUI();
}

function buildResumeDocumentHtml(resumeOverride = null) {
    const profile = cachedProfiles.find((p) => p.profile_id === activeProfileId) || {};
    const title = resumeOverride?.title ?? document.getElementById('pwa-resume-title').value.trim();
    const summary = resumeOverride?.summary ?? document.getElementById('pwa-resume-summary').value.trim();
    const plainText = resumeOverride?.plain_text ?? document.getElementById('pwa-resume-text').value.trim();
    const skills = resumeOverride?.skills ?? toStringArray(document.getElementById('pwa-resume-skills').value);

    const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.profile_name || 'Candidate';
    const contactLine = [profile.email, profile.phone, profile.location, profile.links].filter(Boolean).join('  |  ');
    const bodyParagraphs = (plainText || summary || '')
        .split(/\r?\n/)
        .map((line) => `<p>${escapeHtml(line) || '&nbsp;'}</p>`)
        .join('');

    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(fullName)} - ${escapeHtml(title || 'Resume')}</title>
<style>
  @page { margin: 18mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.5; margin: 0; padding: 24px; }
  h1 { font-size: 22pt; margin: 0 0 4px 0; color: #0f172a; }
  .subtitle { font-size: 13pt; font-weight: 600; color: #1d4ed8; margin-bottom: 6px; }
  .contact { font-size: 9.5pt; color: #475569; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 16px; }
  h2 { font-size: 11.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 16px 0 8px 0; }
  p { font-size: 10.5pt; margin: 0 0 6px 0; }
  .skills { font-size: 10.5pt; }
</style>
</head>
<body>
  <h1>${escapeHtml(fullName)}</h1>
  ${title ? `<div class="subtitle">${escapeHtml(title)}</div>` : ''}
  ${contactLine ? `<div class="contact">${escapeHtml(contactLine)}</div>` : ''}
  ${summary ? `<h2>Summary</h2><p>${escapeHtml(summary)}</p>` : ''}
  ${skills.length ? `<h2>Skills</h2><p class="skills">${escapeHtml(skills.join(' • '))}</p>` : ''}
  <h2>Experience & Details</h2>
  ${bodyParagraphs}
</body>
</html>`;
}

function exportResumeAsWord(resumeOverride = null) {
    const title = (resumeOverride?.title ?? document.getElementById('pwa-resume-title').value.trim()) || 'resume';
    const html = buildResumeDocumentHtml(resumeOverride);
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'resume'}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function exportResumeAsPdf(resumeOverride = null) {
    const iframe = document.getElementById('print-resume-frame');
    if (!iframe) return;
    const html = buildResumeDocumentHtml(resumeOverride);
    iframe.onload = () => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (err) {
            console.error('PDF print failed:', err);
        }
    };
    iframe.srcdoc = html;
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

    profSelect?.addEventListener('change', async (e) => {
        activeProfileId = e.target.value || null;
        activeResumeId = null;
        const found = cachedProfiles.find((p) => p.profile_id === activeProfileId);
        populateProfileForm(found || null);
        await loadResumesUI();
        await refreshDisplay();
    });

    newBtn?.addEventListener('click', () => {
        activeProfileId = null;
        activeResumeId = null;
        populateProfileForm({ profile_name: 'New Profile', is_default: 0 });
        cachedProfileResumes = [];
        renderResumesUI();
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
            activeResumeId = null;
            await loadProfilesUI();
            await refreshDisplay();
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
                roles: document.getElementById('pwa-prof-roles').value.trim(),
                locations: document.getElementById('pwa-prof-locations').value.trim(),
                keywords: document.getElementById('pwa-prof-keywords').value.trim(),
                links: document.getElementById('pwa-prof-links').value.trim(),
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
            showStatus('Profile saved.', true);
        } catch (err) {
            showStatus(err.message, false);
        }
    });

    // Resume variant controls (US 5.1 & US 3.6)
    const resumeSelect = document.getElementById('pwa-resume-select');
    const newResumeBtn = document.getElementById('pwa-new-resume-btn');
    const delResumeBtn = document.getElementById('pwa-delete-resume-btn');
    const saveResumeBtn = document.getElementById('pwa-save-resume-btn');
    const resumeFileEl = document.getElementById('pwa-resume-file');
    const clearFileBtn = document.getElementById('pwa-resume-clear-file-btn');
    const resumeStatus = document.getElementById('pwa-resume-status');

    const showResumeStatus = (text, ok = true) => {
        if (!resumeStatus) return;
        resumeStatus.textContent = text;
        resumeStatus.style.color = ok ? '#34d399' : '#f87171';
        if (ok) setTimeout(() => { resumeStatus.textContent = ''; }, 3000);
    };

    resumeSelect?.addEventListener('change', (e) => {
        activeResumeId = e.target.value || null;
        renderResumesUI();
    });

    newResumeBtn?.addEventListener('click', () => {
        if (!activeProfileId) return showResumeStatus('Save the profile first before adding resume variants.', false);
        activeResumeId = null;
        document.querySelectorAll('.resume-variant-card').forEach((c) => c.classList.remove('active'));
        populateResumeForm(null);
        showResumeStatus('Enter variant details and click Save Resume Variant.', true);
    });

    resumeFileEl?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const b64 = await fileToBase64(file);
        pendingResumeFile = {
            file_name: file.name,
            mime_type: file.type || 'application/octet-stream',
            file_data_b64: b64,
            clear_file: false,
        };
        document.getElementById('pwa-resume-file-info').textContent = `Selected: ${file.name}`;
        if (clearFileBtn) clearFileBtn.style.display = 'inline-block';
    });

    clearFileBtn?.addEventListener('click', () => {
        pendingResumeFile = { clear_file: true };
        if (resumeFileEl) resumeFileEl.value = '';
        document.getElementById('pwa-resume-file-info').textContent = 'No file attached (save to confirm removal)';
        clearFileBtn.style.display = 'none';
    });

    saveResumeBtn?.addEventListener('click', async () => {
        if (!activeProfileId) return showResumeStatus('Save the profile first.', false);
        const title = document.getElementById('pwa-resume-title').value.trim();
        if (!title) return showResumeStatus('Variant title is required.', false);

        const summary = document.getElementById('pwa-resume-summary').value.trim();
        const skillsText = document.getElementById('pwa-resume-skills').value.trim();
        const plainTextInput = document.getElementById('pwa-resume-text').value.trim();
        const plain_text = plainTextInput || [title, summary, skillsText ? `Skills: ${skillsText}` : ''].filter(Boolean).join('\n\n');

        try {
            const existing = activeResumeId ? cachedProfileResumes.find((r) => r.id === activeResumeId) : null;
            const payload = {
                id: activeResumeId || newId(),
                profile_id: activeProfileId,
                title,
                summary: summary || null,
                plain_text,
                skills: toStringArray(skillsText),
                ...(pendingResumeFile || {}),
            };

            if (isExtensionConnected) {
                const saved = await callExtension('save_resume', { resume: payload });
                activeResumeId = saved.id;
            } else {
                const now = nowIso();
                const skillIds = [];
                for (const s of payload.skills) skillIds.push(await getOrCreateByName('skills', s));

                let file_name = existing?.file_name || null;
                let mime_type = existing?.mime_type || null;
                let file_data = existing?.file_data || null;
                if (pendingResumeFile?.clear_file) {
                    file_name = null; mime_type = null; file_data = null;
                } else if (pendingResumeFile?.file_data_b64) {
                    file_name = pendingResumeFile.file_name;
                    mime_type = pendingResumeFile.mime_type;
                    file_data = base64ToBlob(pendingResumeFile.file_data_b64, mime_type);
                }

                const rec = {
                    id: payload.id,
                    profile_id: activeProfileId,
                    title,
                    summary: payload.summary,
                    plain_text,
                    skill_ids: skillIds,
                    file_name,
                    mime_type,
                    created_at: existing?.created_at || now,
                    updated_at: now,
                };
                if (file_data) rec.file_data = file_data;
                await db.resumes.put(rec);
                activeResumeId = rec.id;
            }

            pendingResumeFile = null;
            await loadResumesUI();
            await refreshDisplay();
            showResumeStatus('Resume variant saved.', true);
        } catch (err) {
            showResumeStatus(err.message, false);
        }
    });

    delResumeBtn?.addEventListener('click', async () => {
        if (!activeResumeId) return showResumeStatus('Select a saved resume variant to delete.', false);
        if (!confirm('Delete this resume variant?')) return;
        try {
            if (isExtensionConnected) {
                await callExtension('delete_resume', { resumeId: activeResumeId });
            } else {
                await deleteResume(activeResumeId);
            }
            activeResumeId = null;
            await loadResumesUI();
            await refreshDisplay();
            showResumeStatus('Resume variant deleted.', true);
        } catch (err) {
            showResumeStatus(err.message, false);
        }
    });

    document.getElementById('pwa-export-pdf-btn')?.addEventListener('click', () => exportResumeAsPdf());
    document.getElementById('pwa-export-doc-btn')?.addEventListener('click', () => exportResumeAsWord());
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

// ---- US 6.1 & US 6.2: Role-filtered Skill Hotwords + Responsive SVG Chart ---
async function populateAnalyticsPositions() {
    const selectEl = document.getElementById('hotwords-position-select');
    if (!selectEl) return;
    const base = (await getSetting('server_base_url') || 'http://localhost:8080').replace(/\/+$/, '');
    let positions = [];
    try {
        const res = await fetch(`${base}/api/dictionaries/bootstrap`);
        if (res.ok) {
            const boot = await res.json();
            if (Array.isArray(boot.positions) && boot.positions.length) {
                positions = boot.positions;
            }
        }
    } catch {}

    if (!positions.length) {
        positions = await db.positions_dict.toArray();
    }

    const prev = selectEl.value;
    selectEl.innerHTML = '<option value="">All Positions / Roles</option>';
    for (const pos of positions) {
        const opt = document.createElement('option');
        opt.value = pos.id;
        opt.textContent = pos.name;
        selectEl.appendChild(opt);
    }
    if (prev && positions.some((p) => p.id === prev)) selectEl.value = prev;
}

function renderHotwordsChart(items) {
    const chartEl = document.getElementById('hotwords-chart');
    if (!chartEl) return;
    chartEl.innerHTML = '';
    if (!items.length) return;

    const top = items.slice(0, 15);
    const maxCount = Math.max(...top.map((r) => Number(r.vacancyCount) || 0), 1);

    const rowHeight = 32;
    const labelWidth = 175;
    const valueWidth = 65;
    const chartWidth = 640;
    const barMaxWidth = chartWidth - labelWidth - valueWidth - 16;
    const svgHeight = top.length * rowHeight + 12;

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', `0 0 ${chartWidth} ${svgHeight}`);
    svg.setAttribute('class', 'hotwords-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Skill demand frequency bar chart');

    top.forEach((row, idx) => {
        const y = idx * rowHeight + 6;
        const count = Number(row.vacancyCount) || 0;
        const barW = Math.max(4, Math.round((count / maxCount) * barMaxWidth));

        const label = document.createElementNS(svgNs, 'text');
        label.setAttribute('x', '4');
        label.setAttribute('y', String(y + 17));
        label.setAttribute('fill', 'currentColor');
        label.setAttribute('font-size', '12');
        label.setAttribute('font-weight', '600');
        const fullLabel = row.positionName && !document.getElementById('hotwords-position-select')?.value
            ? `${row.skillName} (${row.positionName})`
            : row.skillName;
        label.textContent = fullLabel.length > 25 ? `${fullLabel.slice(0, 23)}…` : fullLabel;

        const titleTag = document.createElementNS(svgNs, 'title');
        titleTag.textContent = `${row.skillName}${row.positionName ? ` — ${row.positionName}` : ''}: ${count} vacancies`;
        label.appendChild(titleTag);

        const track = document.createElementNS(svgNs, 'rect');
        track.setAttribute('x', String(labelWidth));
        track.setAttribute('y', String(y + 4));
        track.setAttribute('width', String(barMaxWidth));
        track.setAttribute('height', '18');
        track.setAttribute('rx', '4');
        track.setAttribute('fill', 'rgba(148, 163, 184, 0.16)');

        const bar = document.createElementNS(svgNs, 'rect');
        bar.setAttribute('x', String(labelWidth));
        bar.setAttribute('y', String(y + 4));
        bar.setAttribute('width', String(barW));
        bar.setAttribute('height', '18');
        bar.setAttribute('rx', '4');
        bar.setAttribute('fill', 'var(--color-primary, #3b82f6)');

        const valText = document.createElementNS(svgNs, 'text');
        valText.setAttribute('x', String(labelWidth + barMaxWidth + 10));
        valText.setAttribute('y', String(y + 17));
        valText.setAttribute('fill', 'var(--text-secondary, #94a3b8)');
        valText.setAttribute('font-size', '12');
        valText.setAttribute('font-weight', '600');
        valText.textContent = String(count);

        svg.append(label, track, bar, valText);
    });

    chartEl.appendChild(svg);
}

async function loadHotwords() {
    const statusEl = document.getElementById('hotwords-status');
    const chartEl = document.getElementById('hotwords-chart');
    const posSelect = document.getElementById('hotwords-position-select');
    if (!statusEl) return;

    const base = (await getSetting('server_base_url') || 'http://localhost:8080').replace(/\/+$/, '');
    const positionId = posSelect?.value || '';
    const selectedRoleName = posSelect?.selectedOptions?.[0]?.textContent || '';
    const qs = positionId ? `?positionId=${encodeURIComponent(positionId)}` : '';

    statusEl.textContent = 'Loading skill demand...';
    if (chartEl) chartEl.innerHTML = '';

    try {
        const res = await fetch(`${base}/api/skills/hotwords${qs}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let rows = await res.json();

        // Optional fallback to ClickHouse OLAP endpoint if hotwords materialized view is empty
        if ((!Array.isArray(rows) || !rows.length)) {
            try {
                const chRes = await fetch(`${base}/api/analytics/skills-demand`);
                if (chRes.ok) {
                    const chBody = await chRes.json();
                    const data = Array.isArray(chBody?.data) ? chBody.data : [];
                    rows = data
                        .filter((d) => !positionId || d.position_name === selectedRoleName)
                        .map((d) => ({
                            positionName: d.position_name,
                            skillName: d.skill_name,
                            vacancyCount: Number(d.total_vacancies) || 0,
                        }));
                }
            } catch {}
        }

        if (!Array.isArray(rows) || !rows.length) {
            statusEl.textContent = 'No aggregated skill hotwords available for this role yet.';
            return;
        }
        statusEl.textContent = `Showing top ${Math.min(rows.length, 15)} skills${positionId ? ` for ${selectedRoleName}` : ''}:`;
        renderHotwordsChart(rows);
    } catch (err) {
        statusEl.textContent = `Could not reach backend analytics (${err.message}).`;
    }
}

// ---- Sync & Backup ----------------------------------------------------------
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
    await populateAnalyticsPositions();

    extInput?.addEventListener('change', async (e) => {
        localStorage.setItem('autooffer_extension_id', e.target.value.trim());
        await detectExtensionStatus();
        await loadSettingsUI();
        await loadPlatforms();
        await loadProfilesUI();
        await loadJobsUI();
        await refreshDisplay();
    });

    document.getElementById('server-url-input')?.addEventListener('change', (e) =>
        saveSingleSetting('server_base_url', e.target.value.trim())
            .then(populateAnalyticsPositions)
            .catch((err) => setSyncStatus(err.message, 'error'))
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
    document.getElementById('hotwords-position-select')?.addEventListener('change', loadHotwords);

    document.getElementById('applications-search-input')?.addEventListener('input', renderApplicationsTable);
    document.getElementById('applications-status-filter')?.addEventListener('change', renderApplicationsTable);

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
        renderList(filtered, activeProfileId || cachedProfiles[0]?.profile_id);
    });
});