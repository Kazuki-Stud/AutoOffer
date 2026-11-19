import { AoTheme } from './ui.js';
import { db } from '../extension/database/database.js';
import { migrateLegacySecrets, saveAiConfiguration } from '../extension/database/crypto.js';
import {
    createApplication,
    deleteAiConfiguration,
    deleteProfileCascade,
    deleteResume,
    deleteVacancy,
    ensureDefaultProfile,
    getCoverLetterForVacancy,
    getMatchResult,
    getOrCreateByName,
    getSetting,
    hasAiConsent,
    newId,
    nowIso,
    recordAiConsent,
    saveCoverLetter,
    saveMatchResult,
    saveVacancy,
    setActiveAiConfiguration,
    setApplicationStatus,
    setDefaultProfile,
    setSetting,
} from '../extension/database/repository.js';
import { seedDatabase } from '../extension/database/seed.js';
import { ENUMS } from '../extension/database/validation.js';
import { evaluateVacancyMatch, generateCoverLetter } from '../extension/aiClient.js';

const BACKUP_EXCLUDED_TABLES = new Set([
    'local_device_state',
    'ai_configurations',
    'platform_credentials',
]);

let cachedVacancies = [];
let cachedApplications = new Map();
let cachedAllApplications = [];
let cachedCompanies = new Map();
let cachedResumesMap = new Map();
let cachedPlatforms = [];
let cachedProfiles = [];
let cachedProfileResumes = [];
let cachedJobs = [];
let cachedAiConfigs = [];

let isExtensionConnected = false;
let activeProfileId = null;
let activeResumeId = null;
let pendingResumeFile = null;
let editingJobId = null;
const selectedJobUrls = new Set();

let activeAiVacancy = null;
let activeCoverLetterId = null;
let lastLoadedLetterText = '';
let isLetterDirty = false;

function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}

function getVal(id) {
    return document.getElementById(id)?.value ?? '';
}

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
    return (getVal('extension-id-input') || localStorage.getItem('autooffer_extension_id') || '').trim();
}

function callExtension(action, payload = {}, timeoutMs = 3500) {
    return new Promise((resolve, reject) => {
        const extId = getExtensionId();
        if (!extId || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
            return reject(new Error('Extension unavailable'));
        }
        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                reject(new Error(`Extension timeout (${action})`));
            }
        }, timeoutMs);

        try {
            chrome.runtime.sendMessage(extId, { action, ...payload }, (response) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                if (!response || response.status === 'error') {
                    const err = new Error(response?.message || 'Extension returned an error');
                    if (response?.code) err.code = response.code;
                    return reject(err);
                }
                resolve(response.data);
            });
        } catch (err) {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
            }
        }
    });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
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
            db.cover_letters.toArray(),
            db.match_results.toArray(),
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
    if (!modal || typeof modal.open !== 'function') return;
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

        const metaRow = document.createElement('div');
        metaRow.className = 'vacancy-meta-row';

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

        const aiBtn = document.createElement('button');
        aiBtn.type = 'button';
        aiBtn.className = 'secondary-btn btn-xs';
        aiBtn.textContent = 'AI Match & Letter';
        aiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openAiAssistantModal(item);
        });

        metaRow.append(linkEl, aiBtn);

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
        card.append(titleEl, metaRow, footerEl);
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

function renderApplicationsTable() {
    const tbody = document.getElementById('applications-tbody');
    const emptyEl = document.getElementById('applications-empty');
    const tableEl = document.getElementById('applications-table');
    const countBadge = document.getElementById('applications-count-badge');
    if (!tbody) return;

    const searchQ = getVal('applications-search-input').trim().toLowerCase();
    const statusFilter = getVal('applications-status-filter');
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
        await callExtension('get_storage_weight', {}, 2500);
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

    setVal('server-url-input', serverUrl || 'http://localhost:8080');
    const privToggle = document.getElementById('private-use-only-toggle');
    if (privToggle) privToggle.checked = Boolean(privOnly);
    setVal('submission-mode-select', subMode || 'semi_automated');

    await loadAiConfigUI();
}

async function saveSingleSetting(key, value) {
    await setSetting(key, value);
    if (isExtensionConnected) {
        await callExtension('save_settings', { settings: { [key]: value } });
    }
}

function renderAiConfigsList() {
    const listEl = document.getElementById('ai-configs-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!cachedAiConfigs.length) {
        listEl.innerHTML = '<div class="status-msg">No saved AI provider configurations yet. Save one above or use Offline Local Similarity.</div>';
        return;
    }

    for (const cfg of cachedAiConfigs) {
        const row = document.createElement('div');
        row.className = 'ai-config-row' + (cfg.is_active ? ' active' : '');

        const info = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = `${cfg.provider_name} · ${cfg.model_name}${cfg.is_active ? ' (Active)' : ''}`;
        const meta = document.createElement('div');
        meta.className = 'job-row-meta';
        meta.textContent = `${cfg.api_endpoint || 'Offline Cosine'} · Key: ${cfg.has_api_key ? 'Encrypted locally' : 'None'}`;
        info.append(title, meta);

        const actions = document.createElement('div');
        actions.className = 'job-row-actions';

        if (!cfg.is_active) {
            const actBtn = document.createElement('button');
            actBtn.type = 'button';
            actBtn.className = 'secondary-btn btn-xs';
            actBtn.textContent = 'Activate';
            actBtn.addEventListener('click', async () => {
                if (isExtensionConnected) {
                    cachedAiConfigs = await callExtension('set_active_ai_configuration', { id: cfg.id });
                } else {
                    await setActiveAiConfiguration(cfg.id);
                    await loadAiConfigUI();
                }
                renderAiConfigsList();
            });
            actions.appendChild(actBtn);
        }

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'clear-button btn-xs';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
            if (isExtensionConnected) {
                cachedAiConfigs = await callExtension('delete_ai_configuration', { id: cfg.id });
            } else {
                await deleteAiConfiguration(cfg.id);
                await loadAiConfigUI();
            }
            renderAiConfigsList();
        });
        actions.appendChild(delBtn);

        row.append(info, actions);
        listEl.appendChild(row);
    }
}

async function loadAiConfigUI() {
    let consented = false;
    let givenAt = null;

    if (isExtensionConnected) {
        try {
            cachedAiConfigs = await callExtension('get_ai_configurations');
            const consentInfo = await callExtension('get_ai_consent');
            consented = Boolean(consentInfo?.consented);
            givenAt = consentInfo?.givenAt || null;
        } catch {}
    } else {
        const rows = await db.ai_configurations.toArray();
        rows.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        cachedAiConfigs = rows.map((c) => ({
            id: c.id,
            provider_name: c.provider_name,
            api_endpoint: c.api_endpoint || null,
            model_name: c.model_name,
            is_active: c.is_active,
            has_api_key: Boolean(c.api_key_enc),
        }));
        consented = await hasAiConsent();
        givenAt = await getSetting('ai_consent_given_at');
    }

    const consentTag = document.getElementById('ai-consent-status-tag');
    if (consentTag) {
        consentTag.textContent = consented
            ? `GDPR Opt-In: Consented (${formatDate(givenAt)})`
            : 'GDPR Opt-In: Pending';
    }
    renderAiConfigsList();
}

function requestAiConsentModal(endpointLabel) {
    return new Promise((resolve) => {
        const modal = document.getElementById('ai-consent-modal');
        const labelEl = document.getElementById('ai-consent-endpoint-label');
        const acceptBtn = document.getElementById('ai-consent-accept-btn');
        const declineBtn = document.getElementById('ai-consent-decline-btn');
        if (!modal || !acceptBtn || !declineBtn) return resolve(false);

        if (labelEl) labelEl.textContent = endpointLabel || 'Remote AI Provider';
        modal.setAttribute('open', '');

        const cleanup = (result) => {
            modal.removeAttribute('open');
            acceptBtn.removeEventListener('click', onAccept);
            declineBtn.removeEventListener('click', onDecline);
            modal.removeEventListener('click', onBackdrop);
            resolve(result);
        };
        const onAccept = async () => {
            await recordAiConsent('1.0');
            if (isExtensionConnected) {
                await callExtension('set_ai_consent', { version: '1.0' }).catch(() => {});
            }
            await loadAiConfigUI();
            cleanup(true);
        };
        const onDecline = () => cleanup(false);
        const onBackdrop = (e) => { if (e.target === modal) cleanup(false); };

        acceptBtn.addEventListener('click', onAccept);
        declineBtn.addEventListener('click', onDecline);
        modal.addEventListener('click', onBackdrop);
    });
}

function initAiSettingsHandlers() {
    const providerSel = document.getElementById('ai-provider-select');
    const endpointInput = document.getElementById('ai-endpoint-input');
    const modelInput = document.getElementById('ai-model-input');
    const apiKeyInput = document.getElementById('ai-apikey-input');
    const activeToggle = document.getElementById('ai-active-toggle');
    const saveBtn = document.getElementById('save-ai-config-btn');
    const statusEl = document.getElementById('ai-config-status');
    if (!providerSel || !saveBtn) return;

    providerSel.addEventListener('change', () => {
        const val = providerSel.value;
        if (val === 'openai') {
            if (endpointInput) { endpointInput.disabled = false; endpointInput.value = 'https://api.openai.com/v1/chat/completions'; }
            if (apiKeyInput) apiKeyInput.disabled = false;
            if (modelInput) modelInput.value = 'gpt-4o-mini';
        } else if (val === 'local') {
            if (endpointInput) { endpointInput.disabled = false; endpointInput.value = 'http://localhost:11434/v1/chat/completions'; }
            if (apiKeyInput) apiKeyInput.disabled = false;
            if (modelInput) modelInput.value = 'llama3.2';
        } else {
            if (endpointInput) { endpointInput.value = ''; endpointInput.disabled = true; }
            if (apiKeyInput) { apiKeyInput.value = ''; apiKeyInput.disabled = true; }
            if (modelInput) modelInput.value = 'local-cosine';
        }
    });

    saveBtn.addEventListener('click', async () => {
        const provider_name = providerSel.value;
        const model_name = (modelInput?.value || '').trim();
        const api_endpoint = (endpointInput?.value || '').trim() || null;
        const api_key = (apiKeyInput?.value || '').trim();
        const is_active = activeToggle?.checked ? 1 : 0;

        if (!model_name) {
            if (statusEl) { statusEl.textContent = 'Model name is required.'; statusEl.style.color = '#f87171'; }
            return;
        }
        if (provider_name !== 'local_cosine' && (!api_endpoint || !isSafeHttpUrl(api_endpoint))) {
            if (statusEl) { statusEl.textContent = 'Enter a valid http(s) AI endpoint URL.'; statusEl.style.color = '#f87171'; }
            return;
        }
        if (provider_name === 'openai' && !api_key) {
            if (statusEl) { statusEl.textContent = 'API key is required for remote OpenAI-compatible providers.'; statusEl.style.color = '#f87171'; }
            return;
        }

        try {
            if (isExtensionConnected) {
                cachedAiConfigs = await callExtension('save_ai_configuration', {
                    config: { provider_name, api_endpoint, api_key, model_name, is_active },
                });
            } else {
                const id = await saveAiConfiguration({
                    provider_name,
                    api_endpoint,
                    api_key,
                    model_name,
                    is_active,
                });
                if (is_active) await setActiveAiConfiguration(id);
                await loadAiConfigUI();
            }
            if (apiKeyInput) apiKeyInput.value = '';
            renderAiConfigsList();
            if (statusEl) {
                statusEl.textContent = 'AI configuration saved (key encrypted locally).';
                statusEl.style.color = '#34d399';
                setTimeout(() => { statusEl.textContent = ''; }, 3500);
            }
        } catch (err) {
            if (statusEl) { statusEl.textContent = err.message; statusEl.style.color = '#f87171'; }
        }
    });
}

function setMatchDisplay(match) {
    const scorePill = document.getElementById('ai-match-score-pill');
    const matchedEl = document.getElementById('ai-matched-skills');
    const missingEl = document.getElementById('ai-missing-skills');
    if (!scorePill || !matchedEl || !missingEl) return;

    if (!match) {
        scorePill.dataset.status = 'basic';
        scorePill.textContent = 'Not evaluated';
        matchedEl.innerHTML = '<span class="status-msg">—</span>';
        missingEl.innerHTML = '<span class="status-msg">—</span>';
        return;
    }

    scorePill.dataset.status = match.score >= 70 ? 'complete' : 'basic';
    scorePill.textContent = `${match.score}% Overlap`;

    matchedEl.innerHTML = '';
    if (match.matched_skills?.length) {
        for (const s of match.matched_skills) {
            const chip = document.createElement('span');
            chip.className = 'skill-chip matched';
            chip.textContent = s;
            matchedEl.appendChild(chip);
        }
    } else {
        matchedEl.innerHTML = '<span class="status-msg">None detected</span>';
    }

    missingEl.innerHTML = '';
    if (match.missing_skills?.length) {
        for (const s of match.missing_skills) {
            const chip = document.createElement('span');
            chip.className = 'skill-chip missing';
            chip.textContent = s;
            missingEl.appendChild(chip);
        }
    } else {
        missingEl.innerHTML = '<span class="status-msg">None missing</span>';
    }
}

function updateCoverLetterDirtyUI() {
    const textarea = document.getElementById('ai-letter-textarea');
    const dirtyEl = document.getElementById('ai-dirty-indicator');
    const genBtn = document.getElementById('ai-generate-letter-btn');
    if (!textarea) return;

    const current = textarea.value;
    isLetterDirty = current.trim().length > 0 && current !== lastLoadedLetterText;
    if (dirtyEl) dirtyEl.textContent = isLetterDirty ? 'Unsaved manual edits' : '';
    if (genBtn) genBtn.textContent = current.trim().length > 0 ? 'Regenerate Letter' : 'Generate Letter';
}

async function loadAiDialogStateForResume(vacancy, resumeId) {
    if (!vacancy || !resumeId) {
        setMatchDisplay(null);
        return;
    }

    let match = null;
    let draft = null;
    if (isExtensionConnected) {
        try {
            const matches = await callExtension('get_match_results', { vacancyId: vacancy.id });
            match = matches.find((m) => m.resume_id === resumeId) || null;
            if (match) await saveMatchResult(match).catch(() => {});
            const letters = await callExtension('get_cover_letters', { vacancyId: vacancy.id });
            draft = letters.find((c) => c.resume_id === resumeId) || letters[0] || null;
            if (draft) await db.cover_letters.put(draft).catch(() => {});
        } catch {}
    }
    const profId = activeProfileId || (await ensureDefaultProfile()).id;
    if (!match) match = await getMatchResult(vacancy.id, resumeId);
    if (!draft) draft = await getCoverLetterForVacancy(profId, vacancy.id, resumeId);

    setMatchDisplay(match);
    const textarea = document.getElementById('ai-letter-textarea');
    if (textarea) {
        activeCoverLetterId = draft?.id || null;
        lastLoadedLetterText = draft?.plain_text || '';
        textarea.value = lastLoadedLetterText;
        updateCoverLetterDirtyUI();
    }
}

async function openAiAssistantModal(vacancy) {
    const modal = document.getElementById('ai-assistant-modal');
    const titleEl = document.getElementById('ai-modal-title');
    const resumeSel = document.getElementById('ai-modal-resume-select');
    const statusEl = document.getElementById('ai-modal-status');
    if (!modal || !resumeSel) return;

    activeAiVacancy = vacancy;
    activeCoverLetterId = null;
    lastLoadedLetterText = '';
    isLetterDirty = false;
    if (statusEl) statusEl.textContent = '';
    if (titleEl) titleEl.textContent = `AI Match & Cover Letter: ${vacancy.full_position_name || 'Vacancy'}`;

    if (!cachedProfileResumes.length) await loadResumesUI();

    resumeSel.innerHTML = '';
    if (!cachedProfileResumes.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No resume variants — add one in Profile & Resumes';
        resumeSel.appendChild(opt);
    } else {
        for (const r of cachedProfileResumes) {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.title;
            resumeSel.appendChild(opt);
        }
        if (activeResumeId && cachedProfileResumes.some((r) => r.id === activeResumeId)) {
            resumeSel.value = activeResumeId;
        }
    }

    await loadAiDialogStateForResume(vacancy, resumeSel.value);
    modal.setAttribute('open', '');
}

async function runWithBridgeConsentRetry(fn, endpointLabel) {
    try {
        return await fn();
    } catch (err) {
        if (err.code === 'AI_CONSENT_REQUIRED' || String(err.message).includes('GDPR opt-in consent')) {
            const accepted = await requestAiConsentModal(endpointLabel);
            if (!accepted) throw new Error('AI processing cancelled (consent not granted).');
            return await fn();
        }
        throw err;
    }
}

function initAiAssistantModal() {
    const modal = document.getElementById('ai-assistant-modal');
    const closeBtn = document.getElementById('ai-modal-close-btn');
    const resumeSel = document.getElementById('ai-modal-resume-select');
    const evalBtn = document.getElementById('ai-evaluate-match-btn');
    const genBtn = document.getElementById('ai-generate-letter-btn');
    const saveBtn = document.getElementById('ai-save-letter-btn');
    const textarea = document.getElementById('ai-letter-textarea');
    const statusEl = document.getElementById('ai-modal-status');

    const closeModal = () => modal?.removeAttribute('open');
    closeBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.hasAttribute('open')) closeModal();
    });

    resumeSel?.addEventListener('change', () => {
        if (activeAiVacancy) loadAiDialogStateForResume(activeAiVacancy, resumeSel.value);
    });

    textarea?.addEventListener('input', updateCoverLetterDirtyUI);

    evalBtn?.addEventListener('click', async () => {
        const resumeId = resumeSel?.value;
        const resume = cachedProfileResumes.find((r) => r.id === resumeId);
        if (!activeAiVacancy || !resume) {
            if (statusEl) { statusEl.textContent = 'Create and select a resume variant first.'; statusEl.style.color = '#f87171'; }
            return;
        }

        const activeCfg = cachedAiConfigs.find((c) => c.is_active) || cachedAiConfigs[0];
        const endpointLabel = activeCfg?.api_endpoint || activeCfg?.provider_name || 'AI Provider';

        evalBtn.disabled = true;
        if (statusEl) { statusEl.textContent = 'Evaluating match...'; statusEl.style.color = 'var(--text-secondary)'; }
        try {
            let result;
            if (isExtensionConnected) {
                result = await runWithBridgeConsentRetry(
                    () => callExtension('ai_evaluate_match', {
                        vacancyId: activeAiVacancy.id,
                        resumeId: resume.id,
                        vacancy: activeAiVacancy,
                        resume,
                    }, 45000),
                    endpointLabel
                );
                await saveMatchResult(result).catch(() => {});
            } else {
                const personalData = await db.personal_data.where('profile_id').equals(resume.profile_id).first();
                result = await evaluateVacancyMatch(activeAiVacancy, resume, {
                    personalData,
                    requestConsentFn: () => requestAiConsentModal(endpointLabel),
                });
            }
            setMatchDisplay(result);
            if (statusEl) { statusEl.textContent = `Match evaluated (${result.score}%).`; statusEl.style.color = '#34d399'; }
        } catch (err) {
            if (statusEl) { statusEl.textContent = err.message; statusEl.style.color = '#f87171'; }
        } finally {
            evalBtn.disabled = false;
        }
    });

    genBtn?.addEventListener('click', async () => {
        const resumeId = resumeSel?.value;
        const resume = cachedProfileResumes.find((r) => r.id === resumeId);
        if (!activeAiVacancy || !resume) {
            if (statusEl) { statusEl.textContent = 'Create and select a resume variant first.'; statusEl.style.color = '#f87171'; }
            return;
        }

        if (isLetterDirty) {
            const ok = confirm('You have manually edited the cover letter. Overwrite your edits with a newly generated letter?');
            if (!ok) return;
        }

        const activeCfg = cachedAiConfigs.find((c) => c.is_active) || cachedAiConfigs[0];
        const endpointLabel = activeCfg?.api_endpoint || activeCfg?.provider_name || 'AI Provider';

        genBtn.disabled = true;
        if (statusEl) { statusEl.textContent = 'Generating tailored cover letter...'; statusEl.style.color = 'var(--text-secondary)'; }
        try {
            let draft;
            if (isExtensionConnected) {
                draft = await runWithBridgeConsentRetry(
                    () => callExtension('ai_generate_cover_letter', {
                        vacancyId: activeAiVacancy.id,
                        resumeId: resume.id,
                        existingDraftId: activeCoverLetterId,
                        vacancy: activeAiVacancy,
                        resume,
                    }, 45000),
                    endpointLabel
                );
                await db.cover_letters.put(draft).catch(() => {});
            } else {
                const personalData = await db.personal_data.where('profile_id').equals(resume.profile_id).first();
                draft = await generateCoverLetter(activeAiVacancy, resume, {
                    personalData,
                    existingDraftId: activeCoverLetterId,
                    isDirty: false,
                    requestConsentFn: () => requestAiConsentModal(endpointLabel),
                });
            }
            activeCoverLetterId = draft.id;
            lastLoadedLetterText = draft.plain_text || '';
            if (textarea) textarea.value = lastLoadedLetterText;
            updateCoverLetterDirtyUI();
            if (statusEl) { statusEl.textContent = 'Cover letter generated.'; statusEl.style.color = '#34d399'; }
        } catch (err) {
            if (statusEl) { statusEl.textContent = err.message; statusEl.style.color = '#f87171'; }
        } finally {
            genBtn.disabled = false;
        }
    });

    saveBtn?.addEventListener('click', async () => {
        const resumeId = resumeSel?.value;
        const resume = cachedProfileResumes.find((r) => r.id === resumeId);
        const text = (textarea?.value || '').trim();
        if (!activeAiVacancy || !resume || !text) {
            if (statusEl) { statusEl.textContent = 'Cover letter text and resume variant are required.'; statusEl.style.color = '#f87171'; }
            return;
        }

        try {
            const payload = {
                id: activeCoverLetterId || null,
                profile_id: resume.profile_id,
                vacancy_id: activeAiVacancy.id,
                resume_id: resume.id,
                title: `Cover Letter - ${activeAiVacancy.full_position_name || 'Application'}`.slice(0, 150),
                plain_text: text,
                skill_ids: Array.isArray(resume.skill_ids) ? resume.skill_ids : [],
            };
            let saved;
            if (isExtensionConnected) {
                saved = await callExtension('save_cover_letter', { coverLetter: payload });
                await db.cover_letters.put(saved).catch(() => {});
            } else {
                saved = await saveCoverLetter(payload);
            }
            activeCoverLetterId = saved.id;
            lastLoadedLetterText = saved.plain_text;
            updateCoverLetterDirtyUI();
            if (statusEl) { statusEl.textContent = 'Cover letter draft saved.'; statusEl.style.color = '#34d399'; }
        } catch (err) {
            if (statusEl) { statusEl.textContent = err.message; statusEl.style.color = '#f87171'; }
        }
    });
}

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
    setVal('pwa-prof-label', p?.profile_name || 'Default');
    const defBox = document.getElementById('pwa-prof-default');
    if (defBox) defBox.checked = Boolean(p?.is_default);
    setVal('pwa-prof-firstname', p?.first_name || '');
    setVal('pwa-prof-lastname', p?.last_name || '');
    setVal('pwa-prof-email', p?.email || '');
    setVal('pwa-prof-phone', p?.phone || '');
    setVal('pwa-prof-location', p?.location || '');
    setVal('pwa-prof-roles', p?.roles || '');
    setVal('pwa-prof-locations', p?.locations || '');
    setVal('pwa-prof-keywords', p?.keywords || '');
    setVal('pwa-prof-links', p?.links || '');
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

    setVal('pwa-resume-title', r?.title || '');
    setVal('pwa-resume-skills', (r?.skills || []).join(', '));
    setVal('pwa-resume-summary', r?.summary || '');
    setVal('pwa-resume-text', r?.plain_text || '');

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
    const title = resumeOverride?.title ?? getVal('pwa-resume-title').trim();
    const summary = resumeOverride?.summary ?? getVal('pwa-resume-summary').trim();
    const plainText = resumeOverride?.plain_text ?? getVal('pwa-resume-text').trim();
    const skills = resumeOverride?.skills ?? toStringArray(getVal('pwa-resume-skills'));

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
    const title = (resumeOverride?.title ?? getVal('pwa-resume-title').trim()) || 'resume';
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
                profile_name: getVal('pwa-prof-label').trim() || 'Profile',
                is_default: document.getElementById('pwa-prof-default')?.checked ? 1 : 0,
                first_name: getVal('pwa-prof-firstname').trim(),
                last_name: getVal('pwa-prof-lastname').trim(),
                email: getVal('pwa-prof-email').trim(),
                phone: getVal('pwa-prof-phone').trim(),
                location: getVal('pwa-prof-location').trim(),
                roles: getVal('pwa-prof-roles').trim(),
                locations: getVal('pwa-prof-locations').trim(),
                keywords: getVal('pwa-prof-keywords').trim(),
                links: getVal('pwa-prof-links').trim(),
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
        const infoEl = document.getElementById('pwa-resume-file-info');
        if (infoEl) infoEl.textContent = `Selected: ${file.name}`;
        if (clearFileBtn) clearFileBtn.style.display = 'inline-block';
    });

    clearFileBtn?.addEventListener('click', () => {
        pendingResumeFile = { clear_file: true };
        if (resumeFileEl) resumeFileEl.value = '';
        const infoEl = document.getElementById('pwa-resume-file-info');
        if (infoEl) infoEl.textContent = 'No file attached (save to confirm removal)';
        clearFileBtn.style.display = 'none';
    });

    saveResumeBtn?.addEventListener('click', async () => {
        if (!activeProfileId) return showResumeStatus('Save the profile first.', false);
        const title = getVal('pwa-resume-title').trim();
        if (!title) return showResumeStatus('Variant title is required.', false);

        const summary = getVal('pwa-resume-summary').trim();
        const skillsText = getVal('pwa-resume-skills').trim();
        const plainTextInput = getVal('pwa-resume-text').trim();
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
            const heading = document.getElementById('pwa-job-form-heading');
            if (heading) heading.textContent = `Edit Job: ${j.title}`;
            setVal('pwa-job-title', j.title || '');
            setVal('pwa-job-roles', j.roles || '');
            setVal('pwa-job-locations', j.locations || '');
            setVal('pwa-job-keywords', j.keywords || '');
            setVal('pwa-job-fields', j.fields_mode || 'all');
            setVal('pwa-job-limit', j.limit || 2);
            if (j.profile_id) setVal('pwa-job-profile', j.profile_id);
            selectedJobUrls.clear();
            (j.websites || '').split('\n').map((s) => s.trim()).filter(Boolean).forEach((u) => selectedJobUrls.add(u));
            renderJobPlatformChips();
            const cancelBtn = document.getElementById('pwa-cancel-job-btn');
            if (cancelBtn) cancelBtn.style.display = 'inline-block';
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
        const heading = document.getElementById('pwa-job-form-heading');
        if (heading) heading.textContent = 'Create Automation Job';
        setVal('pwa-job-title', '');
        setVal('pwa-job-roles', '');
        setVal('pwa-job-locations', '');
        setVal('pwa-job-keywords', '');
        setVal('pwa-job-fields', 'all');
        setVal('pwa-job-limit', 2);
        selectedJobUrls.clear();
        renderJobPlatformChips();
        if (cancelBtn) cancelBtn.style.display = 'none';
    };

    cancelBtn?.addEventListener('click', resetForm);

    saveBtn?.addEventListener('click', async () => {
        const websites = Array.from(selectedJobUrls).join('\n');
        const title = getVal('pwa-job-title').trim();
        const profileId = getVal('pwa-job-profile');
        const roles = getVal('pwa-job-roles').trim();
        const locations = getVal('pwa-job-locations').trim();
        const keywords = getVal('pwa-job-keywords').trim();
        const fields_mode = getVal('pwa-job-fields') || 'all';
        const limit = Number(getVal('pwa-job-limit'));

        const selectedProfile = cachedProfiles.find((p) => p.profile_id === profileId);
        const effectiveRoles = toStringArray(roles || selectedProfile?.roles || selectedProfile?.skills || '');

        if (!websites) {
            if (statusEl) { statusEl.textContent = 'Select at least one target platform.'; statusEl.style.color = '#f87171'; }
            return;
        }
        if (!effectiveRoles.length) {
            if (statusEl) { statusEl.textContent = 'Provide target roles (either here or in the selected profile).'; statusEl.style.color = '#f87171'; }
            return;
        }
        if (!Number.isInteger(limit) || limit < 1) {
            if (statusEl) { statusEl.textContent = 'Page limit must be at least 1.'; statusEl.style.color = '#f87171'; }
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
            if (statusEl) {
                statusEl.textContent = 'Job saved.';
                statusEl.style.color = '#34d399';
                setTimeout(() => { statusEl.textContent = ''; }, 3000);
            }
        } catch (err) {
            if (statusEl) { statusEl.textContent = err.message; statusEl.style.color = '#f87171'; }
        }
    });
}

async function populateAnalyticsPositions() {
    const selectEl = document.getElementById('hotwords-position-select');
    if (!selectEl) return;
    const base = (await getSetting('server_base_url') || 'http://localhost:8080').replace(/\/+$/, '');
    let positions = [];
    try {
        const res = await fetchWithTimeout(`${base}/api/dictionaries/bootstrap`, {}, 3500);
        if (res.ok) {
            const boot = await res.json();
            if (Array.isArray(boot.positions) && boot.positions.length) {
                positions = boot.positions;
            }
        }
    } catch {}

    if (!positions.length) {
        positions = await db.positions_dict.toArray().catch(() => []);
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
        const res = await fetchWithTimeout(`${base}/api/skills/hotwords${qs}`, {}, 5000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let rows = await res.json();

        if (!Array.isArray(rows) || !rows.length) {
            try {
                const chRes = await fetchWithTimeout(`${base}/api/analytics/skills-demand`, {}, 4000);
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

async function syncFromExtension() {
    const extId = getExtensionId();
    const role = getVal('sync-role-input').trim() || 'all';
    const dateRange = getVal('sync-date-select') || 'all';
    const fieldsMode = getVal('sync-fields-select') || 'all';

    if (!extId) return setSyncStatus('Specify Chrome Extension ID.', 'error');
    localStorage.setItem('autooffer_extension_id', extId);

    setSyncStatus('Connecting to extension...', 'active');
    try {
        const rows = await callExtension('get_vacancies', { role, dateRange, fieldsMode }, 10000);
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
        if (BACKUP_EXCLUDED_TABLES.has(t.name)) continue;
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
            if (BACKUP_EXCLUDED_TABLES.has(name) || !Array.isArray(rows)) continue;
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
    const currentTheme = AoTheme.getTheme();
    document.querySelector('.theme-icon.moon-icon')?.classList.toggle('active', currentTheme === 'dark');
    document.querySelector('.theme-icon.sun-icon')?.classList.toggle('active', currentTheme !== 'dark');
}

document.addEventListener('DOMContentLoaded', async () => {
    AoTheme.initTheme();
    updateThemeToggleUI();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then((reg) => reg.update()).catch(() => {});
    }
    if (navigator.storage?.persist) {
        navigator.storage.persist().catch(() => {});
    }

    // Bind ALL UI controls synchronously first so navigation, theme, and buttons are always responsive
    initNavigation();
    initProfilePage();
    initJobsPage();
    initAiSettingsHandlers();
    initAiAssistantModal();

    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
        AoTheme.toggleTheme();
        updateThemeToggleUI();
    });
    window.addEventListener('ao-theme-changed', updateThemeToggleUI);

    document.getElementById('quick-refresh-btn')?.addEventListener('click', () => refreshDisplay().catch(console.error));
    document.getElementById('load-hotwords-btn')?.addEventListener('click', () => loadHotwords().catch(console.error));
    document.getElementById('hotwords-position-select')?.addEventListener('change', () => loadHotwords().catch(console.error));
    document.getElementById('applications-search-input')?.addEventListener('input', renderApplicationsTable);
    document.getElementById('applications-status-filter')?.addEventListener('change', renderApplicationsTable);
    document.getElementById('export-json-btn')?.addEventListener('click', () => exportLocalBackup().catch(console.error));
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

    document.getElementById('sync-btn')?.addEventListener('click', () => syncFromExtension().catch(console.error));

    document.getElementById('filter-input')?.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        if (!val) return refreshDisplay().catch(console.error);
        const filtered = cachedVacancies.filter((v) =>
            (v.full_position_name && v.full_position_name.toLowerCase().includes(val)) ||
            (v.description && v.description.toLowerCase().includes(val))
        );
        renderList(filtered, activeProfileId || cachedProfiles[0]?.profile_id);
    });

    const urlExtId = new URLSearchParams(window.location.search).get('extId')?.trim();
    if (urlExtId) localStorage.setItem('autooffer_extension_id', urlExtId);

    const savedExtId = localStorage.getItem('autooffer_extension_id') || '';
    if (savedExtId) setVal('extension-id-input', savedExtId);

    document.getElementById('extension-id-input')?.addEventListener('change', async (e) => {
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

    try {
        await seedDatabase();
        await migrateLegacySecrets();
    } catch (err) {
        console.error('Database init failed:', err);
        setSyncStatus(`Local DB error: ${err.message}`, 'error');
    }

    try { await detectExtensionStatus(); } catch (err) { console.error(err); }
    try { await loadSettingsUI(); } catch (err) { console.error(err); }
    try { await loadPlatforms(); } catch (err) { console.error(err); }
    try { await loadProfilesUI(); } catch (err) { console.error(err); }
    try { await loadJobsUI(); } catch (err) { console.error(err); }
    try { await refreshDisplay(); } catch (err) { console.error(err); }

    populateAnalyticsPositions().catch(() => {});
});