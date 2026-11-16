import { db } from '../extension/database/database.js';
import { migrateLegacySecrets } from '../extension/database/crypto.js';
import {
    createApplication,
    deleteVacancy,
    ensureDefaultProfile,
    getOrCreateByName,
    getSetting,
    newId,
    nowIso,
    saveVacancy,
    setApplicationStatus,
    setSetting,
} from '../extension/database/repository.js';
import { seedDatabase } from '../extension/database/seed.js';
import { ENUMS } from '../extension/database/validation.js';

let cachedVacancies = [];
let cachedApplications = new Map();

function isSafeHttpUrl(raw) {
    try {
        const u = new URL(raw);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
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

async function calculateStorageWeight() {
    try {
        const chunks = await Promise.all([
            db.local_vacancies.toArray(),
            db.personal_data.toArray(),
            db.resumes.toArray(),
            db.applications.toArray(),
            db.platforms_dict.toArray(),
            db.selectors.toArray(),
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

        // US 5.3: Application lifecycle status control
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

async function detectExtensionStatus() {
    const banner = document.getElementById('ext-missing-banner');
    const extId = document.getElementById('extension-id-input')?.value.trim();
    const available = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.sendMessage);

    if (!available) {
        if (banner) banner.style.display = 'block';
        setSyncStatus('Standalone Mode (No Extension API)', 'normal');
        return;
    }
    if (!extId) {
        if (banner) banner.style.display = 'block';
        setSyncStatus('Set Extension ID in Settings', 'normal');
        return;
    }
    chrome.runtime.sendMessage(extId, { action: 'get_storage_weight' }, (res) => {
        if (chrome.runtime.lastError || !res) {
            if (banner) banner.style.display = 'block';
            setSyncStatus('Extension Unreachable', 'error');
        } else {
            if (banner) banner.style.display = 'none';
            setSyncStatus('Extension Connected', 'success');
        }
    });
}

async function syncFromExtension() {
    const extId = document.getElementById('extension-id-input')?.value.trim();
    const role = document.getElementById('sync-role-input')?.value.trim() || 'all';
    const dateRange = document.getElementById('sync-date-select')?.value || 'all';
    const fieldsMode = document.getElementById('sync-fields-select')?.value || 'all';

    if (!extId) return setSyncStatus('Specify Chrome Extension ID.', 'error');
    localStorage.setItem('autooffer_extension_id', extId);

    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        return setSyncStatus('Chrome extension API not available in this context.', 'error');
    }

    setSyncStatus('Connecting to extension...', 'active');
    chrome.runtime.sendMessage(extId, { action: 'get_vacancies', role, dateRange, fieldsMode }, async (response) => {
        if (chrome.runtime.lastError) {
            return setSyncStatus(`Sync failed: ${chrome.runtime.lastError.message}`, 'error');
        }
        if (response?.status === 'success' && Array.isArray(response.data)) {
            for (const v of response.data) {
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
            await refreshDisplay();
            setSyncStatus(`Synchronized ${response.data.length} vacancies.`, 'success');
        } else {
            setSyncStatus(response?.message || 'No response from extension.', 'error');
        }
    });
}

function parseProfileLinks(rawText) {
    const urls = (rawText || '').split(/[\s,]+/).map((s) => s.trim()).filter(isSafeHttpUrl);
    return {
        github: urls.find((u) => u.includes('github.com')) || null,
        linkedin: urls.find((u) => u.includes('linkedin.com')) || null,
        website: urls.find((u) => !u.includes('github.com') && !u.includes('linkedin.com')) || null,
    };
}

async function loadProfileUI() {
    const profile = await ensureDefaultProfile();
    const pData = await db.personal_data.where('profile_id').equals(profile.id).first();
    const resume = await db.resumes.where('profile_id').equals(profile.id).first();

    if (pData) {
        if (pData.first_name) document.getElementById('pwa-prof-firstname').value = pData.first_name;
        if (pData.last_name) document.getElementById('pwa-prof-lastname').value = pData.last_name;
        if (pData.email) document.getElementById('pwa-prof-email').value = pData.email;
        if (pData.phone) document.getElementById('pwa-prof-phone').value = pData.phone;
        if (pData.location) document.getElementById('pwa-prof-location').value = pData.location;
        const links = [pData.github, pData.linkedin, pData.website].filter(Boolean).join(', ');
        if (links) document.getElementById('pwa-prof-links').value = links;
    }
    if (resume) {
        document.getElementById('pwa-prof-headline').value = resume.title || '';
        const skillRows = resume.skill_ids?.length ? await db.skills.bulkGet(resume.skill_ids) : [];
        document.getElementById('pwa-prof-skills').value = skillRows.filter(Boolean).map((s) => s.name).join(', ');
    }
}

function initProfilePage() {
    const saveBtn = document.getElementById('pwa-save-profile-btn');
    const statusMsg = document.getElementById('pwa-profile-status');

    saveBtn?.addEventListener('click', async () => {
        try {
            const profile = await ensureDefaultProfile();
            const first_name = document.getElementById('pwa-prof-firstname').value.trim();
            const last_name = document.getElementById('pwa-prof-lastname').value.trim();
            const email = document.getElementById('pwa-prof-email').value.trim();
            const phone = document.getElementById('pwa-prof-phone').value.trim() || null;
            const location = document.getElementById('pwa-prof-location').value.trim() || null;
            const headline = document.getElementById('pwa-prof-headline').value.trim() || 'Default Resume';
            const linksRaw = document.getElementById('pwa-prof-links').value;
            const skillsRaw = document.getElementById('pwa-prof-skills').value;
            const { github, linkedin, website } = parseProfileLinks(linksRaw);

            const now = nowIso();
            const personalPayload = {
                first_name, last_name, email, phone, location, github, linkedin, website, updated_at: now,
            };

            const existingPersonal = await db.personal_data.where('profile_id').equals(profile.id).first();
            if (existingPersonal) {
                await db.personal_data.update(existingPersonal.id, personalPayload);
            } else {
                await db.personal_data.add({ id: newId(), profile_id: profile.id, ...personalPayload, created_at: now });
            }

            // Save skills & resume variant in Dexie v7
            const skillNames = [...new Set(skillsRaw.split(',').map((s) => s.trim()).filter(Boolean))];
            const skillIds = [];
            for (const name of skillNames) {
                skillIds.push(await getOrCreateByName('skills', name));
            }
            const existingResume = await db.resumes.where('profile_id').equals(profile.id).first();
            const resumeText = `${headline}\nSkills: ${skillNames.join(', ')}`;
            if (existingResume) {
                await db.resumes.update(existingResume.id, {
                    title: headline, plain_text: resumeText, skill_ids: skillIds, updated_at: now,
                });
            } else {
                await db.resumes.add({
                    id: newId(), profile_id: profile.id, title: headline,
                    plain_text: resumeText, skill_ids: skillIds, created_at: now, updated_at: now,
                });
            }

            const extId = document.getElementById('extension-id-input')?.value.trim();
            if (extId && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                chrome.runtime.sendMessage(extId, { action: 'save_profile', profile: personalPayload }, () => {});
            }

            if (statusMsg) {
                statusMsg.textContent = 'Profile & resume saved locally (validated).';
                statusMsg.style.color = '#34d399';
                setTimeout(() => { statusMsg.textContent = ''; }, 3000);
            }
            await refreshDisplay();
        } catch (err) {
            if (statusMsg) {
                statusMsg.textContent = err.message;
                statusMsg.style.color = '#f87171';
            }
        }
    });
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
        if (t.name === 'local_device_state') continue; // never export device crypto key/token
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
    await loadProfileUI();
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

    const savedExtId = localStorage.getItem('autooffer_extension_id') || '';
    const extInput = document.getElementById('extension-id-input');
    if (extInput && savedExtId) extInput.value = savedExtId;

    const serverInput = document.getElementById('server-url-input');
    if (serverInput) {
        serverInput.value = (await getSetting('server_base_url')) || 'http://localhost:8080';
        serverInput.addEventListener('change', (e) => setSetting('server_base_url', e.target.value.trim()).catch(console.error));
    }

    const privToggle = document.getElementById('private-use-only-toggle');
    if (privToggle) {
        privToggle.checked = Boolean(await getSetting('private_use_only'));
        privToggle.addEventListener('change', (e) => setSetting('private_use_only', e.target.checked).catch(console.error));
    }

    updateThemeToggleUI();
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
        if (window.AoTheme) { window.AoTheme.toggleTheme(); updateThemeToggleUI(); }
    });
    window.addEventListener('ao-theme-changed', updateThemeToggleUI);

    await loadProfileUI();
    await refreshDisplay();
    await detectExtensionStatus();

    document.getElementById('quick-refresh-btn')?.addEventListener('click', refreshDisplay);
    document.getElementById('load-hotwords-btn')?.addEventListener('click', loadHotwords);
    document.getElementById('export-json-btn')?.addEventListener('click', exportLocalBackup);
    document.getElementById('import-json-input')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) importLocalBackup(file).catch((err) => setSyncStatus(err.message, 'error'));
    });

    document.getElementById('clear-btn')?.addEventListener('click', async () => {
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