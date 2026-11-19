import { db } from '../extension/database/database.js';
import { newId, nowIso } from '../extension/database/repository.js';
import { callExtension } from './bridge.js';
import { getVal, setVal, state, toStringArray } from './state.js';

export async function loadPlatforms() {
    if (state.isExtensionConnected) {
        try {
            state.cachedPlatforms = await callExtension('get_platforms');
            await db.platforms_dict.bulkPut(state.cachedPlatforms);
            return state.cachedPlatforms;
        } catch {}
    }
    state.cachedPlatforms = await db.platforms_dict.toArray();
    return state.cachedPlatforms;
}

export function renderJobPlatformChips() {
    const picker = document.getElementById('pwa-job-platforms-picker');
    if (!picker) return;
    picker.innerHTML = '';
    for (const p of state.cachedPlatforms) {
        const url = p.url || `https://${p.code}`;
        const chip = document.createElement('div');
        chip.className = 'platform-chip' + (state.selectedJobUrls.has(url) ? ' selected' : '');
        chip.textContent = `${p.name || p.code}${p.permission_status === 'granted' ? '' : ' (Manual)'}`;
        chip.addEventListener('click', () => {
            if (state.selectedJobUrls.has(url)) {
                state.selectedJobUrls.delete(url);
                chip.classList.remove('selected');
            } else {
                state.selectedJobUrls.add(url);
                chip.classList.add('selected');
            }
        });
        picker.appendChild(chip);
    }
}

export function renderJobsList() {
    const listEl = document.getElementById('pwa-jobs-list');
    const countEl = document.getElementById('pwa-jobs-count');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (countEl) countEl.textContent = `${state.cachedJobs.length} jobs`;

    if (!state.cachedJobs.length) {
        listEl.innerHTML = '<div class="status-msg">No saved automation jobs yet. Create one above and run it from the Extension popup.</div>';
        return;
    }

    for (const j of state.cachedJobs) {
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
            state.editingJobId = j.id;
            const heading = document.getElementById('pwa-job-form-heading');
            if (heading) heading.textContent = `Edit Job: ${j.title}`;
            setVal('pwa-job-title', j.title || '');
            setVal('pwa-job-roles', j.roles || '');
            setVal('pwa-job-locations', j.locations || '');
            setVal('pwa-job-keywords', j.keywords || '');
            setVal('pwa-job-fields', j.fields_mode || 'all');
            setVal('pwa-job-limit', j.limit || 2);
            if (j.profile_id) setVal('pwa-job-profile', j.profile_id);
            state.selectedJobUrls.clear();
            (j.websites || '').split('\n').map((s) => s.trim()).filter(Boolean).forEach((u) => state.selectedJobUrls.add(u));
            renderJobPlatformChips();
            const cancelBtn = document.getElementById('pwa-cancel-job-btn');
            if (cancelBtn) cancelBtn.style.display = 'inline-block';
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'clear-button';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
            if (!confirm(`Delete job "${j.title}"?`)) return;
            if (state.isExtensionConnected) await callExtension('delete_job', { id: j.id });
            await db.automation_jobs.delete(j.id);
            await loadJobsUI();
        });

        actions.append(editBtn, delBtn);
        card.append(info, actions);
        listEl.appendChild(card);
    }
}

export async function loadJobsUI() {
    if (state.isExtensionConnected) {
        try {
            state.cachedJobs = await callExtension('get_jobs');
            await db.automation_jobs.clear();
            if (state.cachedJobs.length) await db.automation_jobs.bulkPut(state.cachedJobs);
            renderJobPlatformChips();
            renderJobsList();
            return;
        } catch {}
    }
    state.cachedJobs = await db.automation_jobs.toArray();
    renderJobPlatformChips();
    renderJobsList();
}

export function initJobsPage({ onDataChanged } = {}) {
    const saveBtn = document.getElementById('pwa-save-job-btn');
    const cancelBtn = document.getElementById('pwa-cancel-job-btn');
    const statusEl = document.getElementById('pwa-job-status');

    const resetForm = () => {
        state.editingJobId = null;
        const heading = document.getElementById('pwa-job-form-heading');
        if (heading) heading.textContent = 'Create Automation Job';
        setVal('pwa-job-title', '');
        setVal('pwa-job-roles', '');
        setVal('pwa-job-locations', '');
        setVal('pwa-job-keywords', '');
        setVal('pwa-job-fields', 'all');
        setVal('pwa-job-limit', 2);
        state.selectedJobUrls.clear();
        renderJobPlatformChips();
        if (cancelBtn) cancelBtn.style.display = 'none';
    };

    cancelBtn?.addEventListener('click', resetForm);

    saveBtn?.addEventListener('click', async () => {
        const websites = Array.from(state.selectedJobUrls).join('\n');
        const title = getVal('pwa-job-title').trim();
        const profileId = getVal('pwa-job-profile');
        const roles = getVal('pwa-job-roles').trim();
        const locations = getVal('pwa-job-locations').trim();
        const keywords = getVal('pwa-job-keywords').trim();
        const fields_mode = getVal('pwa-job-fields') || 'all';
        const limit = Number(getVal('pwa-job-limit'));

        const selectedProfile = state.cachedProfiles.find((p) => p.profile_id === profileId);
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
                id: state.editingJobId || newId(),
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
            if (state.isExtensionConnected) {
                const saved = await callExtension('save_job', { job: payload });
                await db.automation_jobs.put(saved);
            } else {
                await db.automation_jobs.put(payload);
            }
            resetForm();
            await loadJobsUI();
            if (typeof onDataChanged === 'function') await onDataChanged();
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