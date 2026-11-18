import { db } from '../database/database.js';
import { deleteVacancy, ensureDefaultProfile } from '../database/repository.js';
import { seedDatabase } from '../database/seed.js';

const PWA_DEFAULT_URL = 'https://kazuki-stud.github.io/AutoOffer/';

const STORAGE_KEYS = [
    'preferred_locale',
    'automation_websites',
    'automation_limit',
    'automation_profile_id',
    'automation_job_id',
];

let currentCustomJobs = [];

async function getHydratedProfile(profileId = null) {
    let profileRow = profileId ? await db.user_profiles.get(profileId) : null;
    if (!profileRow) profileRow = await ensureDefaultProfile();

    const pData = await db.personal_data.where('profile_id').equals(profileRow.id).first();
    const resume = await db.resumes.where('profile_id').equals(profileRow.id).first();
    const prefs = await db.search_preferences.where('profile_id').equals(profileRow.id).first();
    const skillRows = resume?.skill_ids?.length ? await db.skills.bulkGet(resume.skill_ids) : [];

    return {
        profile_id: profileRow.id,
        profile_name: profileRow.name,
        first_name: pData?.first_name || '',
        last_name: pData?.last_name || '',
        email: pData?.email || '',
        headline: resume?.title || '',
        skills: skillRows.filter(Boolean).map((s) => s.name).join(', '),
        roles: (prefs?.roles || []).join(', '),
        locations: (prefs?.locations || []).join(', '),
        keywords: (prefs?.keywords || []).join(', '),
    };
}

async function applyTranslations(lang) {
    try {
        const url = chrome.runtime.getURL('_locales/' + lang + '/messages.json');
        const response = await fetch(url);
        const messages = await response.json();
        document.querySelectorAll('[data-i18n]').forEach((node) => {
            const key = node.getAttribute('data-i18n');
            if (key && messages[key]) node.textContent = messages[key].message;
        });
    } catch {}
}

function showInlineFeedback(elId, text, isError = false) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text;
    el.className = isError ? 'inline-feedback error' : 'inline-feedback';
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.display = 'none'; }, 3200);
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
        if (chrome.runtime.lastError || !response?.success) return;
        const weightPill = document.getElementById('badge-weight');
        const jobPill = document.getElementById('badge-job-status');
        const privPill = document.getElementById('badge-private-mode');
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
        if (privPill) {
            privPill.textContent = response.privateUseOnly ? 'Private: ON' : 'Private: OFF';
            privPill.style.background = response.privateUseOnly ? '#dcfce7' : '#e2e8f0';
            privPill.style.color = response.privateUseOnly ? '#166534' : '#334155';
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

async function loadProfileDropdown(preferredId = null) {
    const selectEl = document.getElementById('runner-profile-select');
    if (!selectEl) return;
    const def = await ensureDefaultProfile();
    const profiles = await db.user_profiles.toArray();
    const targetId = preferredId || selectEl.value;
    selectEl.innerHTML = '';
    for (const prof of profiles) {
        const pData = await db.personal_data.where('profile_id').equals(prof.id).first();
        const opt = document.createElement('option');
        opt.value = prof.id;
        const fullName = pData ? `${pData.first_name || ''} ${pData.last_name || ''}`.trim() : '';
        opt.textContent = fullName || prof.name || 'Default Profile';
        selectEl.appendChild(opt);
    }
    if (targetId && profiles.some((p) => p.id === targetId)) {
        selectEl.value = targetId;
    } else if (def?.id) {
        selectEl.value = def.id;
    }
}

async function loadCustomJobs() {
    currentCustomJobs = await db.automation_jobs.toArray();
    const selectEl = document.getElementById('job-select');
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Quick Run (Saved Selection)</option>';
    for (const j of currentCustomJobs) {
        const opt = document.createElement('option');
        opt.value = j.id;
        opt.textContent = j.title || 'Untitled Job';
        selectEl.appendChild(opt);
    }
}

async function renderRunnerSummary(websitesStr, profileId) {
    const websitesDisplay = document.getElementById('runner-websites-display');
    const profileDisplay = document.getElementById('runner-profile-display');
    const rolesDisplay = document.getElementById('runner-roles-display');

    if (websitesDisplay) {
        websitesDisplay.innerHTML = '';
        const websites = (websitesStr || '').split('\n').map((s) => s.trim()).filter(Boolean);
        if (!websites.length) {
            websitesDisplay.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">No websites selected — add from Platforms tab or select a Job</span>';
        } else {
            const platforms = await db.platforms_dict.toArray();
            for (const url of websites) {
                const match = platforms.find((p) => p.url === url || ('https://' + p.code) === url);
                const chip = document.createElement('div');
                chip.className = 'website-icon-chip';
                const name = match ? (match.name || match.code) : url;

                const sym = document.createElement('span');
                sym.className = 'website-icon-symbol';
                sym.textContent = name.charAt(0).toUpperCase();

                const ns = document.createElement('span');
                ns.textContent = `${name}${match?.permission_status === 'granted' ? '' : ' (Manual)'}`;

                const rmBtn = document.createElement('button');
                rmBtn.type = 'button';
                rmBtn.className = 'chip-remove-btn';
                rmBtn.title = 'Remove website';
                rmBtn.textContent = '×';
                rmBtn.addEventListener('click', async () => {
                    const area = document.getElementById('target-websites');
                    const next = websites.filter((u) => u !== url).join('\n');
                    area.value = next;
                    document.getElementById('job-select').value = '';
                    await chrome.storage.local.set({ automation_websites: next, automation_job_id: '' });
                    await renderRunnerSummary(next, document.getElementById('runner-profile-select').value);
                });

                chip.append(sym, ns, rmBtn);
                websitesDisplay.appendChild(chip);
            }
        }
    }

    const pObj = await getHydratedProfile(profileId || null);
    if (profileDisplay) {
        const fullName = `${pObj.first_name} ${pObj.last_name}`.trim();
        profileDisplay.textContent = fullName || pObj.profile_name || 'Default Profile';
    }
    if (rolesDisplay) {
        const activeJob = currentCustomJobs.find((j) => j.id === document.getElementById('job-select')?.value);
        const rolesVal = activeJob?.roles || pObj.roles || pObj.skills || '';
        const locVal = activeJob?.locations || pObj.locations || '';
        const kwVal = activeJob?.keywords || pObj.keywords || '';
        const parts = [];
        if (rolesVal) parts.push(`Roles: ${rolesVal}`);
        if (locVal) parts.push(`Locations: ${locVal}`);
        if (kwVal) parts.push(`Keywords: ${kwVal}`);
        rolesDisplay.textContent = parts.length ? parts.join(' | ') : 'Not configured (set in Dashboard)';
    }
}

async function applySelectedJob(job) {
    const websitesArea = document.getElementById('target-websites');
    const limitInput = document.getElementById('pagination-limit');
    const profileSelect = document.getElementById('runner-profile-select');
    if (websitesArea) websitesArea.value = job.websites || '';
    if (limitInput) limitInput.value = job.limit || 2;
    if (profileSelect && job.profile_id) {
        const hasOption = Array.from(profileSelect.options).some((o) => o.value === job.profile_id);
        if (hasOption) profileSelect.value = job.profile_id;
    }

    await chrome.storage.local.set({
        automation_job_id: job.id || '',
        automation_websites: job.websites || '',
        automation_limit: job.limit || 2,
        automation_profile_id: profileSelect?.value || '',
    });
    await renderRunnerSummary(job.websites || '', profileSelect?.value || '');
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

        const useBtn = document.createElement('button');
        useBtn.type = 'button';
        useBtn.className = 'action-btn-sm';
        useBtn.textContent = 'Use';
        useBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const area = document.getElementById('target-websites');
            const lines = area.value.trim().split('\n').filter(Boolean);
            const target = p.url || ('https://' + p.code);
            if (!lines.includes(target)) {
                lines.push(target);
                area.value = lines.join('\n');
                await chrome.storage.local.set({ automation_websites: area.value });
                await renderRunnerSummary(area.value, document.getElementById('runner-profile-select').value);
            }
            document.getElementById('tab-btn-jobs')?.click();
        });

        const autoFixBtn = document.createElement('button');
        autoFixBtn.type = 'button';
        autoFixBtn.className = 'action-btn-sm';
        autoFixBtn.textContent = 'AutoFix';
        autoFixBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            autoFixBtn.disabled = true;
            autoFixBtn.textContent = '...';
            chrome.runtime.sendMessage({
                action: 'auto_fix_platform_selectors', platformId: p.id, hostname: p.code, url: p.url || ('https://' + p.code),
            }, async (res) => {
                autoFixBtn.disabled = false;
                autoFixBtn.textContent = 'AutoFix';
                if (res?.success) {
                    showInlineFeedback('platforms-feedback', `Discovered selectors for ${p.name || p.code}.`);
                    await renderPlatformsRegistryList();
                    await updateSystemMetrics();
                } else {
                    showInlineFeedback('platforms-feedback', res?.error || 'AutoFix failed.', true);
                }
            });
        });

        const shareBtn = document.createElement('button');
        shareBtn.type = 'button';
        shareBtn.className = 'action-btn-sm';
        shareBtn.textContent = 'Share';
        shareBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            shareBtn.disabled = true;
            shareBtn.textContent = '...';
            chrome.runtime.sendMessage({ action: 'share_platform_selectors', platformId: p.id }, (res) => {
                shareBtn.disabled = false;
                if (res?.success) {
                    shareBtn.textContent = `Sent (${res.submittedCount})`;
                    showInlineFeedback('platforms-feedback', `Submitted ${res.submittedCount} selector(s) for review.`);
                    setTimeout(() => { shareBtn.textContent = 'Share'; }, 2500);
                } else {
                    shareBtn.textContent = 'Share';
                    showInlineFeedback('platforms-feedback', res?.error || 'Could not submit selectors.', true);
                }
            });
        });

        actionsDiv.append(useBtn, autoFixBtn, shareBtn);
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
            sb.type = 'button';
            sb.className = 'action-btn-sm';
            sb.textContent = 'Save';
            sb.addEventListener('click', () => {
                sb.disabled = true;
                chrome.runtime.sendMessage({
                    action: 'update_specific_selector',
                    platformId: p.id,
                    hostname: p.code,
                    elementTypeId: et.id,
                    selectorString: inp.value.trim(),
                }, (res) => {
                    sb.disabled = false;
                    if (res?.success) {
                        showInlineFeedback('platforms-feedback', `Saved ${et.name} for ${p.code}.`);
                        updateSystemMetrics();
                    } else {
                        showInlineFeedback('platforms-feedback', res?.error || 'Failed to save selector.', true);
                    }
                });
            });
            ig.append(inp, sb);
            g.append(lbl, ig);
            selectorsContainer.appendChild(g);
        }
        detailsEl.appendChild(selectorsContainer);
        listEl.appendChild(detailsEl);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    try { await seedDatabase(); } catch (e) { console.error(e); }

    const extIdInput = document.getElementById('extension-id-display');
    if (extIdInput && chrome?.runtime?.id) {
        extIdInput.value = chrome.runtime.id;
    }

    const data = await chrome.storage.local.get(STORAGE_KEYS);
    const currentLang = data.preferred_locale || 'en';
    const langSelect = document.getElementById('lang-select');
    if (langSelect) langSelect.value = currentLang;

    await loadProfileDropdown(data.automation_profile_id || null);
    await loadCustomJobs();

    const jobSelect = document.getElementById('job-select');
    if (data.automation_job_id && currentCustomJobs.some((j) => j.id === data.automation_job_id)) {
        jobSelect.value = data.automation_job_id;
    }
    if (data.automation_websites) document.getElementById('target-websites').value = data.automation_websites;
    if (data.automation_limit) document.getElementById('pagination-limit').value = data.automation_limit;

    await renderRunnerSummary(
        document.getElementById('target-websites').value,
        document.getElementById('runner-profile-select').value
    );
    await renderPlatformsRegistryList();
    await applyTranslations(currentLang);
    await updateVacancyCount();
    await updateSystemMetrics();

    jobSelect?.addEventListener('change', async () => {
        const job = currentCustomJobs.find((j) => j.id === jobSelect.value);
        if (job) {
            await applySelectedJob(job);
        } else {
            await chrome.storage.local.set({ automation_job_id: '' });
            await renderRunnerSummary(
                document.getElementById('target-websites').value,
                document.getElementById('runner-profile-select').value
            );
        }
    });

    document.getElementById('runner-profile-select')?.addEventListener('change', async (e) => {
        await chrome.storage.local.set({ automation_profile_id: e.target.value });
        await renderRunnerSummary(document.getElementById('target-websites').value, e.target.value);
    });

    document.getElementById('pagination-limit')?.addEventListener('change', (e) => {
        const val = Number(e.target.value);
        if (Number.isInteger(val) && val >= 1) {
            chrome.storage.local.set({ automation_limit: val });
        }
    });
});

function openDashboard() {
    const extId = chrome?.runtime?.id;
    const targetUrl = extId ? `${PWA_DEFAULT_URL}?extId=${encodeURIComponent(extId)}` : PWA_DEFAULT_URL;
    chrome.tabs.create({ url: targetUrl });
}

document.getElementById('open-pwa-btn')?.addEventListener('click', openDashboard);
document.getElementById('open-pwa-runner-btn')?.addEventListener('click', openDashboard);

document.getElementById('copy-ext-id-btn')?.addEventListener('click', async () => {
    const val = document.getElementById('extension-id-display')?.value;
    if (!val) return;
    await navigator.clipboard.writeText(val);
    const btn = document.getElementById('copy-ext-id-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
});

document.getElementById('lang-select')?.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ preferred_locale: e.target.value });
    await applyTranslations(e.target.value);
});

document.getElementById('save-current-vacancy-btn')?.addEventListener('click', () => {
    const btn = document.getElementById('save-current-vacancy-btn');
    const autoStatus = document.getElementById('automation-status');
    btn.disabled = true;
    if (autoStatus) autoStatus.innerText = 'Saving current vacancy...';
    chrome.runtime.sendMessage({ action: 'save_current_vacancy' }, async (res) => {
        btn.disabled = false;
        if (autoStatus) {
            autoStatus.innerText = res?.success
                ? 'Saved current vacancy locally.'
                : (res?.error || 'Could not save vacancy.');
        }
        await updateVacancyCount();
        await updateSystemMetrics();
    });
});

document.getElementById('start-automation')?.addEventListener('click', async () => {
    const websitesText = document.getElementById('target-websites').value.trim();
    const rawLimit = document.getElementById('pagination-limit').value;
    const limit = Number(rawLimit);
    const profileId = document.getElementById('runner-profile-select').value;
    const activeJob = currentCustomJobs.find((j) => j.id === document.getElementById('job-select').value);

    const pObj = await getHydratedProfile(profileId || null);
    const rolesText = (activeJob?.roles || pObj.roles || pObj.skills || '').trim();
    const locationsText = (activeJob?.locations || pObj.locations || '').trim();
    const keywordsText = (activeJob?.keywords || pObj.keywords || '').trim();

    const websites = websitesText.split('\n').map((s) => s.trim()).filter(Boolean);
    const roles = rolesText.split(',').map((s) => s.trim()).filter(Boolean);
    const locations = locationsText.split(',').map((s) => s.trim()).filter(Boolean);
    const keywords = keywordsText.split(',').map((s) => s.trim()).filter(Boolean);
    const autoStatus = document.getElementById('automation-status');

    if (!websites.length) {
        if (autoStatus) autoStatus.innerText = 'Error: Select at least one website first.';
        return;
    }
    if (!roles.length) {
        if (autoStatus) autoStatus.innerText = 'Error: Role list is empty. Set target roles in Dashboard.';
        return;
    }
    if (!Number.isInteger(limit) || limit < 1) {
        if (autoStatus) autoStatus.innerText = 'Error: Page limit must be at least 1.';
        return;
    }

    await chrome.storage.local.set({ automation_websites: websitesText, automation_limit: limit, automation_profile_id: profileId });
    if (autoStatus) autoStatus.innerText = 'Starting automation workflow...';

    chrome.runtime.sendMessage({
        action: 'start_automation_workflow',
        config: {
            websites,
            roles,
            locations,
            keywords,
            paginationLimit: limit,
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
        let cleared = 0;
        let skipped = 0;
        for (const v of await db.local_vacancies.toArray()) {
            try {
                await deleteVacancy(v.id);
                cleared++;
            } catch {
                skipped++;
            }
        }
        await updateVacancyCount();
        await updateSystemMetrics();
        showInlineFeedback(
            'clear-db-feedback',
            skipped
                ? `Cleared ${cleared} vacancies (${skipped} kept because they have linked applications).`
                : `Cleared ${cleared} vacancies.`,
            false
        );
    } catch (err) {
        console.error(err);
        showInlineFeedback('clear-db-feedback', err.message, true);
    }
});