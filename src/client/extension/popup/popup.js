import { db } from '../database/database.js';
import {
    deleteProfileCascade,
    deleteVacancy,
    ensureDefaultProfile,
    getOrCreateByName,
    newId,
    nowIso,
} from '../database/repository.js';
import { seedDatabase } from '../database/seed.js';

const PWA_DEFAULT_URL = 'http://localhost:5173';

const STORAGE_KEYS = [
    'preferred_locale',
    'automation_websites',
    'automation_limit',
    'automation_profile_id',
];

let currentCustomJobs = [];
let selectedJobWebsites = new Set();
let summarySelectedWebsites = new Set();
let editingJobId = null;

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

function formatLinks(p) {
    if (!p) return '';
    return [p.github, p.linkedin, p.website].filter(Boolean).join(', ');
}

async function getHydratedProfile(profileId = null) {
    let pData = null;
    if (profileId) {
        pData = await db.personal_data.get(profileId)
            || await db.personal_data.where('profile_id').equals(profileId).first();
    }
    if (!pData) pData = await db.personal_data.toCollection().first();
    if (!pData) return null;

    const resume = await db.resumes.where('profile_id').equals(pData.profile_id).first();
    const prefs = await db.search_preferences.where('profile_id').equals(pData.profile_id).first();
    const skillRows = resume?.skill_ids?.length ? await db.skills.bulkGet(resume.skill_ids) : [];

    return {
        ...pData,
        headline: resume?.title || '',
        skills: skillRows.filter(Boolean).map((s) => s.name).join(', '),
        roles: (prefs?.roles || []).join(', '),
        links: formatLinks(pData),
    };
}

async function saveHydratedProfile(targetId, data) {
    const now = nowIso();
    let profileId = null;
    if (targetId) {
        const existingPersonal = await db.personal_data.get(targetId);
        profileId = existingPersonal?.profile_id || null;
    }
    if (!profileId) {
        const def = await ensureDefaultProfile();
        profileId = def.id;
    }

    const { github, linkedin, website } = parseLinks(data.links);
    const personalPayload = {
        first_name: data.first_name?.trim() || 'User',
        last_name: data.last_name?.trim() || 'Candidate',
        email: data.email?.trim() || 'user@example.com',
        phone: data.phone?.trim() || null,
        location: data.location?.trim() || null,
        github,
        linkedin,
        website,
        updated_at: now,
    };

    const existing = await db.personal_data.where('profile_id').equals(profileId).first();
    if (existing) {
        await db.personal_data.update(existing.id, personalPayload);
    } else {
        await db.personal_data.add({ id: newId(), profile_id: profileId, ...personalPayload, created_at: now });
    }

    const skillNames = [...new Set((data.skills || '').split(',').map((s) => s.trim()).filter(Boolean))];
    const skillIds = [];
    for (const name of skillNames) {
        skillIds.push(await getOrCreateByName('skills', name));
    }

    const headline = data.headline?.trim() || 'Default Resume';
    const existingResume = await db.resumes.where('profile_id').equals(profileId).first();
    const plainText = `${headline}\nSkills: ${skillNames.join(', ')}`;
    if (existingResume) {
        await db.resumes.update(existingResume.id, { title: headline, plain_text: plainText, skill_ids: skillIds, updated_at: now });
    } else {
        await db.resumes.add({ id: newId(), profile_id: profileId, title: headline, plain_text: plainText, skill_ids: skillIds, created_at: now, updated_at: now });
    }

    const rolesArr = (data.roles || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (rolesArr.length > 0) {
        const existingPrefs = await db.search_preferences.where('profile_id').equals(profileId).first();
        if (existingPrefs) {
            await db.search_preferences.update(existingPrefs.id, { roles: rolesArr, updated_at: now });
        } else {
            await db.search_preferences.add({
                id: newId(), profile_id: profileId, roles: rolesArr,
                locations: [], keywords: [], urls: [], platform_ids: [], page_limit: 2, updated_at: now,
            });
        }
    }
    return profileId;
}

async function applyTranslations(lang) {
    const url = chrome.runtime.getURL('_locales/' + lang + '/messages.json');
    const response = await fetch(url);
    const messages = await response.json();
    document.querySelectorAll('[data-i18n]').forEach((node) => {
        const key = node.getAttribute('data-i18n');
        if (key && messages[key]) node.textContent = messages[key].message;
    });
}

async function updateVacancyCount() {
    const statusElement = document.getElementById('status');
    if (!statusElement) return;
    try {
        const count = await db.local_vacancies.count();
        statusElement.innerText = 'Vacancies in database: ' + count;
    } catch (err) {
        if (err instanceof Error) statusElement.innerText = err.message;
    }
}

async function updateSystemMetrics() {
    chrome.runtime.sendMessage({ action: 'get_background_status' }, (response) => {
        if (!response?.success) return;
        const weightPill = document.getElementById('badge-weight');
        const jobPill = document.getElementById('badge-job-status');
        if (weightPill) weightPill.textContent = 'Weight: ' + response.storageWeight;
        if (jobPill) {
            if (response.isRunning) {
                jobPill.textContent = 'Jobs: ' + (response.activeJobTitle || 'Running');
                jobPill.style.background = '#dcfce7';
                jobPill.style.color = '#166534';
            } else {
                jobPill.textContent = 'Jobs: Idle';
                jobPill.style.background = '#e2e8f0';
                jobPill.style.color = '#334155';
            }
        }
    });
}

function initTabs() {
    const tabLinks = document.querySelectorAll('.tab-link');
    tabLinks.forEach((btn) => {
        btn.addEventListener('click', () => {
            tabLinks.forEach((b) => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach((p) => { p.style.display = 'none'; });
            btn.classList.add('active');
            const targetPane = document.getElementById(btn.getAttribute('data-tab'));
            if (targetPane) targetPane.style.display = 'flex';
        });
    });
}

async function loadProfileDropdowns() {
    const profileSelects = [document.getElementById('job-form-profile'), document.getElementById('runner-profile-select')];
    try {
        const profiles = await db.personal_data.toArray();
        for (const selectEl of profileSelects) {
            if (!selectEl) continue;
            const currentVal = selectEl.value;
            selectEl.innerHTML = '<option value="">Default Profile</option>';
            for (const p of profiles) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = (p.first_name || p.last_name) ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : p.email;
                selectEl.appendChild(opt);
            }
            if (currentVal) selectEl.value = currentVal;
        }
    } catch (e) {
        console.error(e);
    }
}

async function renderWebsiteChips(containerId, selectedSet, onToggle = null) {
    const picker = document.getElementById(containerId);
    if (!picker) return;
    picker.innerHTML = '';
    const platforms = await db.platforms_dict.toArray();
    for (const p of platforms) {
        const url = p.url || ('https://' + p.code);
        const chip = document.createElement('div');
        chip.className = 'website-icon-chip' + (selectedSet.has(url) ? ' selected' : '');
        const sym = document.createElement('span');
        sym.className = 'website-icon-symbol';
        sym.textContent = (p.name || p.code).charAt(0).toUpperCase();
        const name = document.createElement('span');
        name.className = 'website-icon-name';
        name.textContent = `${p.name || p.code}${p.permission_status === 'granted' ? '' : ' (Manual)'}`;
        chip.append(sym, name);
        chip.addEventListener('click', () => {
            if (selectedSet.has(url)) {
                selectedSet.delete(url);
                chip.classList.remove('selected');
            } else {
                selectedSet.add(url);
                chip.classList.add('selected');
            }
            onToggle?.();
        });
        picker.appendChild(chip);
    }
}

async function loadCustomJobs() {
    try {
        currentCustomJobs = await db.automation_jobs.toArray();
        const selectEl = document.getElementById('job-select');
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">Default Quick Run</option>';
        for (const j of currentCustomJobs) {
            const opt = document.createElement('option');
            opt.value = j.id;
            opt.textContent = j.title + (j.mode === 'autonomous' ? ' [Autonomous]' : ' [Semi]');
            selectEl.appendChild(opt);
        }
        await renderJobsRegistryList();
    } catch (e) {
        console.error(e);
    }
}

async function renderJobsRegistryList() {
    const listEl = document.getElementById('jobs-registry-list');
    const countBadge = document.getElementById('jobs-count-badge');
    if (!listEl) return;

    listEl.innerHTML = '';
    const jobs = await db.automation_jobs.toArray();
    const platforms = await db.platforms_dict.toArray();
    if (countBadge) countBadge.textContent = jobs.length + ' jobs';
    if (!jobs.length) {
        listEl.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">No saved jobs.</div>';
        return;
    }

    for (const j of jobs) {
        const detailsEl = document.createElement('details');
        detailsEl.className = 'accordion-item';
        const summaryEl = document.createElement('summary');
        summaryEl.className = 'accordion-summary';

        const titleWrapper = document.createElement('div');
        titleWrapper.className = 'accordion-title-wrapper';
        titleWrapper.innerHTML = `<span class="accordion-arrow">▶</span>`;
        const titleSpan = document.createElement('span');
        titleSpan.className = 'platform-row-title';
        titleSpan.textContent = j.title || 'Untitled Job';
        titleWrapper.appendChild(titleSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'platform-row-actions';
        const saveBtn = document.createElement('button');
        saveBtn.className = 'action-btn-sm primary-action-btn';
        saveBtn.textContent = 'Save';
        saveBtn.disabled = true;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn-sm';
        deleteBtn.style.color = 'var(--danger)';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Delete job "' + j.title + '"?')) {
                await db.automation_jobs.delete(j.id);
                await loadCustomJobs();
            }
        });

        actionsDiv.append(saveBtn, deleteBtn);
        summaryEl.append(titleWrapper, actionsDiv);
        detailsEl.appendChild(summaryEl);

        const content = document.createElement('div');
        content.className = 'selectors-box accordion-content';

        const group1 = document.createElement('div');
        group1.className = 'form-group';
        const titleLabel = document.createElement('label');
        titleLabel.textContent = 'Job Title:';
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = j.title || '';
        group1.append(titleLabel, titleInput);

        const currentJobWebsites = new Set((j.websites || '').split('\n').map((s) => s.trim()).filter(Boolean));
        const groupWebsites = document.createElement('div');
        groupWebsites.className = 'form-group';
        groupWebsites.innerHTML = '<label>Target Websites:</label>';
        const pickerGrid = document.createElement('div');
        pickerGrid.className = 'websites-picker-grid';

        const group3 = document.createElement('div');
        group3.className = 'form-group';
        const limitLabel = document.createElement('label');
        limitLabel.textContent = 'Page Limit:';
        const limitInput = document.createElement('input');
        limitInput.type = 'number';
        limitInput.min = '1';
        limitInput.max = '50';
        limitInput.value = j.limit || 2;
        group3.append(limitLabel, limitInput);

        const checkChanges = () => {
            const currentW = Array.from(currentJobWebsites).sort().join('\n');
            const origW = (j.websites || '').split('\n').map((s) => s.trim()).filter(Boolean).sort().join('\n');
            saveBtn.disabled = (
                titleInput.value.trim() === (j.title || '') &&
                currentW === origW &&
                (parseInt(limitInput.value, 10) || 2) === (j.limit || 2)
            );
        };

        for (const p of platforms) {
            const url = p.url || ('https://' + p.code);
            const chip = document.createElement('div');
            chip.className = 'website-icon-chip' + (currentJobWebsites.has(url) ? ' selected' : '');
            chip.innerHTML = `<span class="website-icon-symbol">${(p.name || p.code).charAt(0).toUpperCase()}</span>`;
            const ns = document.createElement('span');
            ns.className = 'website-icon-name';
            ns.textContent = p.name || p.code;
            chip.appendChild(ns);
            chip.addEventListener('click', () => {
                if (currentJobWebsites.has(url)) { currentJobWebsites.delete(url); chip.classList.remove('selected'); }
                else { currentJobWebsites.add(url); chip.classList.add('selected'); }
                checkChanges();
            });
            pickerGrid.appendChild(chip);
        }
        groupWebsites.appendChild(pickerGrid);
        content.append(group1, groupWebsites, group3);
        detailsEl.appendChild(content);
        listEl.appendChild(detailsEl);

        titleInput.addEventListener('input', checkChanges);
        limitInput.addEventListener('input', checkChanges);
        saveBtn.addEventListener('click', async () => {
            const newTitle = titleInput.value.trim() || 'Custom Job';
            await db.automation_jobs.update(j.id, {
                title: newTitle,
                websites: Array.from(currentJobWebsites).join('\n'),
                limit: parseInt(limitInput.value, 10) || 2,
            });
            saveBtn.disabled = true;
            await loadCustomJobs();
        });
    }
}

async function renderProfilesRegistryList() {
    const listEl = document.getElementById('profiles-registry-list');
    const countBadge = document.getElementById('profiles-count-badge');
    if (!listEl) return;

    listEl.innerHTML = '';
    const profiles = await db.personal_data.toArray();
    if (countBadge) countBadge.textContent = profiles.length + ' profiles';
    if (!profiles.length) {
        listEl.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">No saved profiles.</div>';
        return;
    }

    for (const rawP of profiles) {
        const p = await getHydratedProfile(rawP.id);
        const detailsEl = document.createElement('details');
        detailsEl.className = 'accordion-item';
        const summaryEl = document.createElement('summary');
        summaryEl.className = 'accordion-summary';

        const pName = (p.first_name || p.last_name) ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : p.email;
        const titleWrapper = document.createElement('div');
        titleWrapper.className = 'accordion-title-wrapper';
        titleWrapper.innerHTML = '<span class="accordion-arrow">▶</span>';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'platform-row-title';
        titleSpan.textContent = pName;
        titleWrapper.appendChild(titleSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'platform-row-actions';
        const saveBtn = document.createElement('button');
        saveBtn.className = 'action-btn-sm primary-action-btn';
        saveBtn.textContent = 'Save';
        saveBtn.disabled = true;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn-sm';
        deleteBtn.style.color = 'var(--danger)';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Delete profile "' + pName + '"?')) {
                await deleteProfileCascade(p.profile_id);
                await renderProfilesRegistryList();
                await loadProfileDropdowns();
            }
        });
        actionsDiv.append(saveBtn, deleteBtn);
        summaryEl.append(titleWrapper, actionsDiv);
        detailsEl.appendChild(summaryEl);

        const content = document.createElement('div');
        content.className = 'selectors-box accordion-content';
        const fieldsList = [
            { key: 'first_name', label: 'First Name', type: 'text' },
            { key: 'last_name', label: 'Last Name', type: 'text' },
            { key: 'email', label: 'Email Address', type: 'email' },
            { key: 'phone', label: 'Phone Number', type: 'tel' },
            { key: 'location', label: 'Location', type: 'text' },
            { key: 'headline', label: 'Job Title', type: 'text' },
            { key: 'roles', label: 'Target Roles', type: 'text' },
            { key: 'links', label: 'Portfolio Links', type: 'textarea' },
            { key: 'skills', label: 'Skills', type: 'text' },
        ];
        const fieldEls = {};
        const checkProfileChanges = () => {
            saveBtn.disabled = fieldsList.every((f) => fieldEls[f.key].value.trim() === (p[f.key] || ''));
        };
        for (const f of fieldsList) {
            const g = document.createElement('div');
            g.className = 'form-group';
            const lbl = document.createElement('label');
            lbl.textContent = f.label + ':';
            const ctrl = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
            if (f.type !== 'textarea') ctrl.type = f.type;
            else ctrl.rows = 2;
            ctrl.value = p[f.key] || '';
            ctrl.addEventListener('input', checkProfileChanges);
            fieldEls[f.key] = ctrl;
            g.append(lbl, ctrl);
            content.appendChild(g);
        }
        detailsEl.appendChild(content);
        listEl.appendChild(detailsEl);

        saveBtn.addEventListener('click', async () => {
            const payload = Object.fromEntries(fieldsList.map((f) => [f.key, fieldEls[f.key].value.trim()]));
            await saveHydratedProfile(p.id, payload);
            saveBtn.disabled = true;
            await renderProfilesRegistryList();
            await loadProfileDropdowns();
        });
    }
}

function initJobManagement() {
    const toggleBtn = document.getElementById('btn-toggle-job-form');
    const editorBox = document.getElementById('job-editor-box');
    const jobSelect = document.getElementById('job-select');
    const modeSelect = document.getElementById('job-form-mode');
    const warningBox = document.getElementById('job-autonomous-warning');
    const confirmCheck = document.getElementById('job-confirm-autonomous');
    const saveJobBtn = document.getElementById('btn-save-job');
    const updateJobBtn = document.getElementById('btn-update-job');
    const cancelJobBtn = document.getElementById('btn-cancel-job');
    const editSummaryBtn = document.getElementById('btn-edit-summary');
    const saveSummaryBtn = document.getElementById('btn-save-summary');
    const cancelSummaryBtn = document.getElementById('btn-cancel-summary');

    toggleBtn?.addEventListener('click', async () => {
        const isHidden = editorBox.style.display === 'none';
        if (isHidden) {
            editingJobId = null;
            document.getElementById('editor-heading').textContent = 'New Job Configuration';
            document.getElementById('job-form-limit').value = 2;
            if (saveJobBtn) saveJobBtn.style.display = 'block';
            if (updateJobBtn) updateJobBtn.style.display = 'none';
            editorBox.style.display = 'block';
            toggleBtn.textContent = '- Close Form';
            selectedJobWebsites.clear();
            await renderWebsiteChips('job-websites-picker', selectedJobWebsites);
            await loadProfileDropdowns();
        } else {
            editorBox.style.display = 'none';
            toggleBtn.textContent = '+ Create Job';
        }
    });

    cancelJobBtn?.addEventListener('click', () => {
        editorBox.style.display = 'none';
        editingJobId = null;
        if (toggleBtn) toggleBtn.textContent = '+ Create Job';
    });

    editSummaryBtn?.addEventListener('click', async () => {
        editSummaryBtn.style.display = 'none';
        if (saveSummaryBtn) saveSummaryBtn.style.display = 'inline-block';
        if (cancelSummaryBtn) cancelSummaryBtn.style.display = 'inline-block';

        const websitesArea = document.getElementById('target-websites');
        summarySelectedWebsites.clear();
        websitesArea.value.split('\n').map((s) => s.trim()).filter(Boolean).forEach((w) => summarySelectedWebsites.add(w));
        await renderWebsiteChips('runner-websites-picker', summarySelectedWebsites);
        await loadProfileDropdowns();

        const p = await getHydratedProfile(document.getElementById('runner-profile-select').value);
        if (p) {
            document.getElementById('sum-prof-firstname').value = p.first_name || '';
            document.getElementById('sum-prof-lastname').value = p.last_name || '';
            document.getElementById('sum-prof-email').value = p.email || '';
            document.getElementById('sum-prof-phone').value = p.phone || '';
            document.getElementById('sum-prof-location').value = p.location || '';
            document.getElementById('sum-prof-headline').value = p.headline || '';
            document.getElementById('sum-prof-roles').value = p.roles || '';
            document.getElementById('sum-prof-links').value = p.links || '';
            document.getElementById('sum-prof-skills').value = p.skills || '';
        }

        document.getElementById('runner-websites-picker').style.display = 'flex';
        document.getElementById('runner-websites-display').style.display = 'none';
        document.getElementById('pagination-limit').style.display = 'block';
        document.getElementById('runner-limit-display').style.display = 'none';
        document.getElementById('runner-profile-select').style.display = 'block';
        document.getElementById('runner-profile-display').style.display = 'none';
        document.getElementById('runner-profile-details-container').style.display = 'block';
        document.getElementById('runner-profile-details-display').style.display = 'none';
    });

    const closeSummaryEdit = () => {
        if (editSummaryBtn) editSummaryBtn.style.display = 'inline-block';
        if (saveSummaryBtn) saveSummaryBtn.style.display = 'none';
        if (cancelSummaryBtn) cancelSummaryBtn.style.display = 'none';
        document.getElementById('runner-websites-picker').style.display = 'none';
        document.getElementById('runner-websites-display').style.display = 'flex';
        document.getElementById('pagination-limit').style.display = 'none';
        document.getElementById('runner-limit-display').style.display = 'block';
        document.getElementById('runner-profile-select').style.display = 'none';
        document.getElementById('runner-profile-display').style.display = 'block';
        document.getElementById('runner-profile-details-container').style.display = 'none';
        document.getElementById('runner-profile-details-display').style.display = 'grid';
    };

    cancelSummaryBtn?.addEventListener('click', async () => {
        closeSummaryEdit();
        const data = await chrome.storage.local.get(['automation_profile_id']);
        const profileSelect = document.getElementById('runner-profile-select');
        if (data.automation_profile_id) profileSelect.value = data.automation_profile_id;
        renderRunnerSummary(document.getElementById('target-websites').value, document.getElementById('pagination-limit').value, profileSelect.value);
    });

    saveSummaryBtn?.addEventListener('click', async () => {
        const websitesVal = Array.from(summarySelectedWebsites).join('\n');
        const limitInput = document.getElementById('pagination-limit');
        const websitesArea = document.getElementById('target-websites');
        const profileSelect = document.getElementById('runner-profile-select');

        websitesArea.value = websitesVal;
        const limitVal = parseInt(limitInput.value, 10) || 2;
        const profileIdVal = profileSelect.value;

        await saveHydratedProfile(profileIdVal || null, {
            first_name: document.getElementById('sum-prof-firstname').value,
            last_name: document.getElementById('sum-prof-lastname').value,
            email: document.getElementById('sum-prof-email').value,
            phone: document.getElementById('sum-prof-phone').value,
            location: document.getElementById('sum-prof-location').value,
            headline: document.getElementById('sum-prof-headline').value,
            roles: document.getElementById('sum-prof-roles').value,
            links: document.getElementById('sum-prof-links').value,
            skills: document.getElementById('sum-prof-skills').value,
        });

        await chrome.storage.local.set({ automation_websites: websitesVal, automation_limit: limitVal, automation_profile_id: profileIdVal });
        closeSummaryEdit();
        await renderRunnerSummary(websitesVal, limitVal, profileIdVal);
        await renderProfilesRegistryList();
        await loadProfileDropdowns();
    });

    modeSelect?.addEventListener('change', () => {
        warningBox.style.display = modeSelect.value === 'autonomous' ? 'block' : 'none';
        if (modeSelect.value !== 'autonomous') confirmCheck.checked = false;
    });

    const buildJobPayload = async () => {
        const websites = Array.from(selectedJobWebsites).join('\n');
        const mode = modeSelect.value;
        const profileId = document.getElementById('job-form-profile').value;
        const fields = document.getElementById('job-form-fields').value;
        const limit = parseInt(document.getElementById('job-form-limit').value, 10) || 2;
        if (!websites) { alert('Please select at least one website.'); return null; }
        if (mode === 'autonomous' && !confirmCheck.checked) {
            alert('Please confirm that you authorize autonomous submission without manual verification.');
            return null;
        }
        const p = await getHydratedProfile(profileId || null);
        return {
            title: p?.headline || p?.first_name || 'Custom Job',
            websites,
            roles: p?.roles || p?.skills || '',
            mode,
            profile_id: profileId,
            fields_mode: fields,
            limit,
        };
    };

    saveJobBtn?.addEventListener('click', async () => {
        const base = await buildJobPayload();
        if (!base) return;
        const newJob = { id: newId(), ...base, status: 'ready', created_at: nowIso() };
        await db.automation_jobs.add(newJob);
        await loadCustomJobs();
        editorBox.style.display = 'none';
        if (toggleBtn) toggleBtn.textContent = '+ Create Job';
        jobSelect.value = newJob.id;
        await applySelectedJob(newJob);
    });

    updateJobBtn?.addEventListener('click', async () => {
        if (!editingJobId) return;
        const updatedJob = await buildJobPayload();
        if (!updatedJob) return;
        const targetId = editingJobId;
        await db.automation_jobs.update(targetId, updatedJob);
        await loadCustomJobs();
        editorBox.style.display = 'none';
        editingJobId = null;
        if (toggleBtn) toggleBtn.textContent = '+ Create Job';
        jobSelect.value = targetId;
        const job = currentCustomJobs.find((j) => j.id === targetId) || { ...updatedJob, id: targetId };
        await applySelectedJob(job);
    });

    jobSelect?.addEventListener('change', async () => {
        const selectedId = jobSelect.value;
        if (!selectedId) {
            document.getElementById('target-websites').value = '';
            document.getElementById('pagination-limit').value = 2;
            document.getElementById('runner-profile-select').value = '';
            await renderRunnerSummary('', 2, '');
            if (editorBox.style.display === 'block') {
                editorBox.style.display = 'none';
                if (toggleBtn) toggleBtn.textContent = '+ Create Job';
            }
            return;
        }
        const job = currentCustomJobs.find((j) => j.id === selectedId);
        if (job) {
            await applySelectedJob(job);
            if (editorBox.style.display === 'block') {
                editingJobId = job.id;
                document.getElementById('editor-heading').textContent = 'Edit Job Template: ' + job.title;
                document.getElementById('job-form-limit').value = job.limit || 2;
                modeSelect.value = job.mode || 'semi';
                document.getElementById('job-form-fields').value = job.fields_mode || 'all';
                await loadProfileDropdowns();
                if (job.profile_id) document.getElementById('job-form-profile').value = job.profile_id;
                selectedJobWebsites.clear();
                (job.websites || '').split('\n').map((s) => s.trim()).filter(Boolean).forEach((w) => selectedJobWebsites.add(w));
                await renderWebsiteChips('job-websites-picker', selectedJobWebsites);
                if (saveJobBtn) saveJobBtn.style.display = 'none';
                if (updateJobBtn) updateJobBtn.style.display = 'block';
            }
        }
    });

    document.getElementById('runner-profile-select')?.addEventListener('change', async (e) => {
        const p = await getHydratedProfile(e.target.value || null);
        document.getElementById('sum-prof-firstname').value = p?.first_name || '';
        document.getElementById('sum-prof-lastname').value = p?.last_name || '';
        document.getElementById('sum-prof-email').value = p?.email || '';
        document.getElementById('sum-prof-phone').value = p?.phone || '';
        document.getElementById('sum-prof-location').value = p?.location || '';
        document.getElementById('sum-prof-headline').value = p?.headline || '';
        document.getElementById('sum-prof-roles').value = p?.roles || '';
        document.getElementById('sum-prof-links').value = p?.links || '';
        document.getElementById('sum-prof-skills').value = p?.skills || '';
    });
}

async function renderRunnerSummary(websitesStr, limitVal, profileId) {
    const websitesDisplay = document.getElementById('runner-websites-display');
    const limitDisplay = document.getElementById('runner-limit-display');
    const profileDisplay = document.getElementById('runner-profile-display');
    const profileDetailsDisplay = document.getElementById('runner-profile-details-display');

    if (websitesDisplay) {
        websitesDisplay.innerHTML = '';
        const websites = (websitesStr || '').split('\n').map((s) => s.trim()).filter(Boolean);
        if (!websites.length) {
            websitesDisplay.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">No websites specified</span>';
        } else {
            const platforms = await db.platforms_dict.toArray();
            for (const url of websites) {
                const match = platforms.find((p) => p.url === url || ('https://' + p.code) === url);
                const chip = document.createElement('div');
                chip.className = 'website-icon-chip selected';
                chip.style.cursor = 'default';
                const name = match ? (match.name || match.code) : url;
                chip.innerHTML = `<span class="website-icon-symbol">${name.charAt(0).toUpperCase()}</span>`;
                const ns = document.createElement('span');
                ns.className = 'website-icon-name';
                ns.textContent = `${name}${match?.permission_status === 'granted' ? '' : ' (Manual only)'}`;
                chip.appendChild(ns);
                websitesDisplay.appendChild(chip);
            }
        }
    }
    if (limitDisplay) limitDisplay.textContent = limitVal || '2';

    const pObj = await getHydratedProfile(profileId || null);
    if (profileDisplay) {
        profileDisplay.textContent = pObj
            ? ((pObj.first_name || pObj.last_name) ? `${pObj.first_name || ''} ${pObj.last_name || ''}`.trim() : pObj.email)
            : 'Default Profile';
    }
    // Keep hidden summary inputs populated so Start Automation always reads current roles
    const rolesEl = document.getElementById('sum-prof-roles');
    if (rolesEl && !rolesEl.value.trim() && pObj?.roles) rolesEl.value = pObj.roles;

    if (profileDetailsDisplay) {
        profileDetailsDisplay.innerHTML = '';
        const fieldsData = [
            ['First Name', pObj?.first_name], ['Last Name', pObj?.last_name], ['Email', pObj?.email],
            ['Phone', pObj?.phone], ['Location', pObj?.location], ['Job Title', pObj?.headline],
            ['Roles', pObj?.roles], ['Links', pObj?.links], ['Skills', pObj?.skills],
        ];
        for (const [label, value] of fieldsData) {
            const box = document.createElement('div');
            box.className = 'profile-field-box';
            box.innerHTML = `<div class="profile-field-label">${label}</div>`;
            const valDiv = document.createElement('div');
            valDiv.className = 'profile-field-value';
            valDiv.textContent = value || '—';
            box.appendChild(valDiv);
            profileDetailsDisplay.appendChild(box);
        }
    }
}

async function applySelectedJob(job) {
    const websitesArea = document.getElementById('target-websites');
    const limitInput = document.getElementById('pagination-limit');
    const profileSelect = document.getElementById('runner-profile-select');
    if (websitesArea) websitesArea.value = job.websites || '';
    if (limitInput) limitInput.value = job.limit || 2;
    if (profileSelect) profileSelect.value = job.profile_id || '';

    await chrome.storage.local.set({
        automation_websites: job.websites || '',
        automation_limit: job.limit || 2,
        automation_profile_id: job.profile_id || '',
    });
    await renderRunnerSummary(job.websites || '', job.limit || 2, job.profile_id || '');
}

async function renderPlatformsRegistryList() {
    const listEl = document.getElementById('platforms-registry-list');
    const countBadge = document.getElementById('platform-count-badge');
    if (!listEl) return;

    listEl.innerHTML = '';
    const platforms = await db.platforms_dict.toArray();
    const allSelectors = await db.selectors.where('is_active').equals(1).toArray();
    const elementTypes = await db.selector_element_types_dict.toArray();
    if (countBadge) countBadge.textContent = platforms.length + ' platforms';

    for (const p of platforms) {
        const detailsEl = document.createElement('details');
        detailsEl.className = 'accordion-item';
        const summaryEl = document.createElement('summary');
        summaryEl.className = 'accordion-summary';

        const titleWrapper = document.createElement('div');
        titleWrapper.className = 'accordion-title-wrapper';
        titleWrapper.innerHTML = '<span class="accordion-arrow">▶</span>';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'platform-row-title';
        titleSpan.textContent = `${p.name || p.code} [${p.permission_status || 'none'}]`;
        titleWrapper.appendChild(titleSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'platform-row-actions';
        const modeSelect = document.createElement('select');
        modeSelect.className = 'platform-mode-select';
        modeSelect.innerHTML = '<option value="semi">Semi</option><option value="autonomous">Autonomous</option>';
        modeSelect.value = p.mode || 'semi';
        modeSelect.addEventListener('change', async (e) => {
            e.stopPropagation();
            if (modeSelect.value === 'autonomous' && !confirm('Enable autonomous submission on ' + p.name + '?')) {
                modeSelect.value = 'semi';
                return;
            }
            await db.platforms_dict.update(p.id, { mode: modeSelect.value });
        });

        const useBtn = document.createElement('button');
        useBtn.className = 'action-btn-sm';
        useBtn.textContent = 'Use';
        useBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const area = document.getElementById('target-websites');
            const lines = area.value.trim().split('\n').filter(Boolean);
            const target = p.url || ('https://' + p.code);
            if (!lines.includes(target)) {
                lines.push(target);
                area.value = lines.join('\n');
                chrome.storage.local.set({ automation_websites: area.value });
                renderRunnerSummary(area.value, document.getElementById('pagination-limit').value, document.getElementById('runner-profile-select').value);
            }
            document.getElementById('tab-btn-jobs')?.click();
        });

        const autoFixBtn = document.createElement('button');
        autoFixBtn.className = 'action-btn-sm magic-btn';
        autoFixBtn.textContent = 'AutoFix';
        autoFixBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage({
                action: 'auto_fix_platform_selectors', platformId: p.id, hostname: p.code, url: p.url || ('https://' + p.code),
            }, async () => {
                await renderPlatformsRegistryList();
                await updateSystemMetrics();
            });
        });

        actionsDiv.append(modeSelect, useBtn, autoFixBtn);
        summaryEl.append(titleWrapper, actionsDiv);
        detailsEl.appendChild(summaryEl);

        const selectorsContainer = document.createElement('div');
        selectorsContainer.className = 'selectors-box accordion-content';
        const platformSelectors = allSelectors.filter((s) => s.platform_id === p.id || s.url_pattern === p.code);

        for (const et of elementTypes) {
            const matched = platformSelectors.find((s) => s.element_type_id === et.id);
            const g = document.createElement('div');
            g.className = 'form-group';
            const lbl = document.createElement('label');
            lbl.textContent = et.name + ':';
            const ig = document.createElement('div');
            ig.className = 'inline-input-group';
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = matched ? matched.selector_string : '';
            const sb = document.createElement('button');
            sb.className = 'action-btn-sm';
            sb.textContent = 'Save';
            sb.addEventListener('click', () => {
                chrome.runtime.sendMessage({
                    action: 'update_specific_selector', platformId: p.id, hostname: p.code, elementTypeId: et.id, selectorString: inp.value.trim(),
                }, () => updateSystemMetrics());
            });
            ig.append(inp, sb);
            g.append(lbl, ig);
            selectorsContainer.appendChild(g);
        }
        detailsEl.appendChild(selectorsContainer);
        listEl.appendChild(detailsEl);
    }
}

async function loadUserProfile() {
    const p = await getHydratedProfile();
    if (!p) return;
    if (p.first_name) document.getElementById('prof-firstname').value = p.first_name;
    if (p.last_name) document.getElementById('prof-lastname').value = p.last_name;
    if (p.email) document.getElementById('prof-email').value = p.email;
    if (p.phone) document.getElementById('prof-phone').value = p.phone;
    if (p.location) document.getElementById('prof-location').value = p.location;
    if (p.headline) document.getElementById('prof-headline').value = p.headline;
    if (p.roles) document.getElementById('prof-roles').value = p.roles;
    if (p.links) document.getElementById('prof-links').value = p.links;
    if (p.skills) document.getElementById('prof-skills').value = p.skills;
}

function initProfileManagement() {
    const saveBtn = document.getElementById('save-profile-btn');
    const statusBox = document.getElementById('profile-save-status');
    saveBtn?.addEventListener('click', async () => {
        try {
            await saveHydratedProfile(null, {
                first_name: document.getElementById('prof-firstname').value,
                last_name: document.getElementById('prof-lastname').value,
                email: document.getElementById('prof-email').value,
                phone: document.getElementById('prof-phone').value,
                location: document.getElementById('prof-location').value,
                headline: document.getElementById('prof-headline').value,
                roles: document.getElementById('prof-roles').value,
                links: document.getElementById('prof-links').value,
                skills: document.getElementById('prof-skills').value,
            });
            if (statusBox) {
                statusBox.style.display = 'block';
                statusBox.textContent = 'Profile saved successfully.';
                statusBox.style.color = '#166534';
                setTimeout(() => { statusBox.style.display = 'none'; }, 3000);
            }
            await renderProfilesRegistryList();
            await loadProfileDropdowns();
            await updateSystemMetrics();
        } catch (err) {
            if (statusBox) {
                statusBox.style.display = 'block';
                statusBox.textContent = err.message;
                statusBox.style.color = '#dc2626';
            }
        }
    });
}

function bindAutoSave(selector, storageKey, delay = 300) {
    const el = document.querySelector(selector);
    if (!el) return;
    chrome.storage.local.get(storageKey, (data) => {
        if (data[storageKey] !== undefined) el.value = data[storageKey];
    });
    let timer;
    el.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => chrome.storage.local.set({ [storageKey]: el.value }), delay);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initJobManagement();
    initProfileManagement();

    try { await seedDatabase(); } catch (e) { console.error(e); }

    const data = await chrome.storage.local.get(STORAGE_KEYS);
    const currentLang = data.preferred_locale || 'en';
    const langSelect = document.getElementById('lang-select');
    if (langSelect) langSelect.value = currentLang;

    if (data.automation_websites) document.getElementById('target-websites').value = data.automation_websites;
    if (data.automation_limit) document.getElementById('pagination-limit').value = data.automation_limit;
    if (data.automation_profile_id) document.getElementById('runner-profile-select').value = data.automation_profile_id;

    await loadProfileDropdowns();
    await renderRunnerSummary(
        document.getElementById('target-websites').value,
        document.getElementById('pagination-limit').value,
        document.getElementById('runner-profile-select').value
    );

    bindAutoSave('#target-websites', 'automation_websites');
    bindAutoSave('#pagination-limit', 'automation_limit');

    await loadCustomJobs();
    await renderWebsiteChips('job-websites-picker', selectedJobWebsites);
    await renderPlatformsRegistryList();
    await renderJobsRegistryList();
    await renderProfilesRegistryList();
    await loadUserProfile();
    await applyTranslations(currentLang);
    await updateVacancyCount();
    await updateSystemMetrics();
});

document.getElementById('open-pwa-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: PWA_DEFAULT_URL });
});

document.getElementById('lang-select')?.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ preferred_locale: e.target.value });
    await applyTranslations(e.target.value);
});

// Optional US 1.5 manual Save Vacancy button if present in popup.html
document.getElementById('save-current-vacancy-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'save_current_vacancy' }, async (res) => {
        const autoStatus = document.getElementById('automation-status');
        if (autoStatus) autoStatus.innerText = res?.success ? 'Saved current vacancy locally.' : (res?.error || 'Could not save vacancy.');
        await updateVacancyCount();
        await updateSystemMetrics();
    });
});

document.getElementById('start-automation')?.addEventListener('click', async () => {
    const websitesText = document.getElementById('target-websites').value.trim();
    const rolesText = document.getElementById('sum-prof-roles').value.trim();
    const limit = parseInt(document.getElementById('pagination-limit').value, 10) || 1;
    const profileId = document.getElementById('runner-profile-select').value;
    const websites = websitesText.split('\n').map((s) => s.trim()).filter(Boolean);
    const roles = rolesText.split(',').map((s) => s.trim()).filter(Boolean);
    const autoStatus = document.getElementById('automation-status');

    if (!websites.length || !roles.length) {
        if (autoStatus) autoStatus.innerText = 'Provide at least one website and target role.';
        return;
    }

    const activeJob = currentCustomJobs.find((j) => j.id === document.getElementById('job-select').value);
    await chrome.storage.local.set({ automation_websites: websitesText, automation_limit: limit, automation_profile_id: profileId });
    if (autoStatus) autoStatus.innerText = 'Starting automation workflow...';

    chrome.runtime.sendMessage({
        action: 'start_automation_workflow',
        config: {
            websites, roles, paginationLimit: limit,
            fieldsMode: activeJob?.fields_mode || 'all',
            jobTitle: activeJob?.title || 'Quick Automation',
            profileId,
        },
    }, (res) => {
        if (res && !res.success && autoStatus) autoStatus.innerText = 'Error: ' + res.error;
        updateSystemMetrics();
    });
});

document.getElementById('stop-automation')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stop_automation_workflow' }, () => {
        const autoStatus = document.getElementById('automation-status');
        if (autoStatus) autoStatus.innerText = 'Automation stopped.';
        updateSystemMetrics();
    });
});

chrome.runtime.onMessage.addListener((msg) => {
    const autoStatus = document.getElementById('automation-status');
    if (!autoStatus) return;
    if (msg.action === 'automation_status_update' || msg.action === 'automation_skipped_board') {
        autoStatus.innerText = msg.message;
        updateSystemMetrics();
    } else if (msg.action === 'automation_completed') {
        autoStatus.innerText = msg.message;
        updateVacancyCount();
        updateSystemMetrics();
    } else if (msg.action === 'automation_failed') {
        autoStatus.innerText = 'Failed: ' + msg.error;
        updateVacancyCount();
        updateSystemMetrics();
    }
});

db.local_vacancies.hook('deleting', function () {
    this.onsuccess = async function () {
        await updateVacancyCount();
        await updateSystemMetrics();
    };
});

document.getElementById('clear-db')?.addEventListener('click', async () => {
    try {
        for (const v of await db.local_vacancies.toArray()) {
            try { await deleteVacancy(v.id); } catch {}
        }
        await updateVacancyCount();
        await updateSystemMetrics();
    } catch (err) {
        console.error(err);
    }
});