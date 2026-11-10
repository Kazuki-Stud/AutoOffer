import { db } from '../database.js';
import { seedDatabase } from '../database/seed.js';

const PWA_DEFAULT_URL = 'http://localhost:5173';

const STORAGE_KEYS = [
    'preferred_locale',
    'automation_websites',
    'automation_roles',
    'automation_limit'
];

let currentCustomJobs = [];
let selectedJobWebsites = new Set();
let editingJobId = null;

async function applyTranslations(lang) {
    const url = chrome.runtime.getURL('_locales/' + lang + '/messages.json');
    const response = await fetch(url);
    const messages = await response.json();

    document.querySelectorAll('[data-i18n]').forEach(node => {
        const key = node.getAttribute('data-i18n');
        if (key && messages[key]) {
            node.textContent = messages[key].message;
        }
    });
}

async function updateVacancyCount() {
    const statusElement = document.getElementById('status');
    if (!statusElement) {
        return;
    }

    try {
        const count = await db.local_vacancies.count();
        statusElement.innerText = 'Vacancies in database: ' + count;
    } catch (err) {
        if (err instanceof Error) {
            statusElement.innerText = err.message;
        }
    }
}

async function updateSystemMetrics() {
    chrome.runtime.sendMessage({ action: 'get_background_status' }, (response) => {
        if (!response) {
            return;
        }
        if (!response.success) {
            return;
        }

        const weightPill = document.getElementById('badge-weight');
        const jobPill = document.getElementById('badge-job-status');

        if (weightPill) {
            weightPill.textContent = 'Weight: ' + response.storageWeight;
        }

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
    tabLinks.forEach(btn => {
        btn.addEventListener('click', () => {
            tabLinks.forEach(b => {
                b.classList.remove('active');
            });
            document.querySelectorAll('.tab-pane').forEach(p => {
                p.style.display = 'none';
            });

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.style.display = 'flex';
            }
        });
    });
}

async function loadProfileDropdowns() {
    const profileSelect = document.getElementById('job-form-profile');
    if (!profileSelect) {
        return;
    }

    profileSelect.innerHTML = '<option value="">Default Profile</option>';
    try {
        const profiles = await db.personal_data.toArray();
        for (const p of profiles) {
            const opt = document.createElement('option');
            opt.value = p.id || p.email || 'profile';
            opt.textContent = (p.first_name || p.last_name) ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : (p.email || 'Profile');
            profileSelect.appendChild(opt);
        }
    } catch (e) {
        console.error(e);
    }
}

async function renderJobWebsitesPicker() {
    const pickerContainer = document.getElementById('job-websites-picker');
    if (!pickerContainer) {
        return;
    }

    pickerContainer.innerHTML = '';
    const platforms = await db.platforms_dict.toArray();

    for (const p of platforms) {
        const url = p.url || ('https://' + p.code);
        const iconBtn = document.createElement('div');
        iconBtn.className = 'website-icon-chip';
        if (selectedJobWebsites.has(url)) {
            iconBtn.classList.add('selected');
        }

        const iconSymbol = document.createElement('span');
        iconSymbol.className = 'website-icon-symbol';
        iconSymbol.textContent = (p.name || p.code).charAt(0).toUpperCase();

        const nameSpan = document.createElement('span');
        nameSpan.className = 'website-icon-name';
        nameSpan.textContent = p.name || p.code;

        iconBtn.appendChild(iconSymbol);
        iconBtn.appendChild(nameSpan);

        iconBtn.addEventListener('click', () => {
            if (selectedJobWebsites.has(url)) {
                selectedJobWebsites.delete(url);
                iconBtn.classList.remove('selected');
            } else {
                selectedJobWebsites.add(url);
                iconBtn.classList.add('selected');
            }
        });

        pickerContainer.appendChild(iconBtn);
    }
}

async function loadCustomJobs() {
    try {
        currentCustomJobs = await db.automation_jobs.toArray();
        const selectEl = document.getElementById('job-select');
        if (!selectEl) {
            return;
        }

        selectEl.innerHTML = '<option value="">Default Quick Run</option>';
        for (const j of currentCustomJobs) {
            const opt = document.createElement('option');
            opt.value = j.id;
            let modeSuffix = ' [Semi]';
            if (j.mode === 'autonomous') {
                modeSuffix = ' [Autonomous]';
            }
            opt.textContent = j.title + modeSuffix;
            selectEl.appendChild(opt);
        }
    } catch (e) {
        console.error(e);
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

    if (toggleBtn) {
        toggleBtn.addEventListener('click', async () => {
            const isHidden = editorBox.style.display === 'none';
            if (isHidden) {
                editingJobId = null;
                document.getElementById('editor-heading').textContent = 'New Job Configuration';
                document.getElementById('job-form-title').value = '';
                document.getElementById('job-form-roles').value = '';
                document.getElementById('job-form-limit').value = 2;
                if (saveJobBtn) saveJobBtn.style.display = 'block';
                if (updateJobBtn) updateJobBtn.style.display = 'none';

                editorBox.style.display = 'block';
                toggleBtn.textContent = '- Close Form';
                selectedJobWebsites.clear();
                await renderJobWebsitesPicker();
                await loadProfileDropdowns();
            } else {
                editorBox.style.display = 'none';
                toggleBtn.textContent = '+ Create Job';
            }
        });
    }

    if (cancelJobBtn) {
        cancelJobBtn.addEventListener('click', () => {
            editorBox.style.display = 'none';
            editingJobId = null;
            if (toggleBtn) {
                toggleBtn.textContent = '+ Create Job';
            }
        });
    }

    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            if (modeSelect.value === 'autonomous') {
                warningBox.style.display = 'block';
            } else {
                warningBox.style.display = 'none';
                confirmCheck.checked = false;
            }
        });
    }

    if (saveJobBtn) {
        saveJobBtn.addEventListener('click', async () => {
            const title = document.getElementById('job-form-title').value.trim();
            const websites = Array.from(selectedJobWebsites).join('\n');
            const roles = document.getElementById('job-form-roles').value.trim();
            const mode = modeSelect.value;
            const profileId = document.getElementById('job-form-profile').value;
            const fields = document.getElementById('job-form-fields').value;
            const limit = parseInt(document.getElementById('job-form-limit').value, 10) || 2;

            if (!title || !websites || !roles) {
                alert('Please specify job title, select at least one website, and enter target roles.');
                return;
            }

            if (mode === 'autonomous' && !confirmCheck.checked) {
                alert('Please confirm that you authorize autonomous submission without manual verification.');
                return;
            }

            const newJob = {
                id: crypto.randomUUID(),
                title: title,
                websites: websites,
                roles: roles,
                mode: mode,
                profile_id: profileId,
                fields_mode: fields,
                limit: limit,
                status: 'ready',
                created_at: new Date().toISOString()
            };

            await db.automation_jobs.add(newJob);
            await loadCustomJobs();

            editorBox.style.display = 'none';
            if (toggleBtn) {
                toggleBtn.textContent = '+ Create Job';
            }
            jobSelect.value = newJob.id;
            applySelectedJob(newJob);
        });
    }

    if (updateJobBtn) {
        updateJobBtn.addEventListener('click', async () => {
            if (!editingJobId) return;
            const title = document.getElementById('job-form-title').value.trim();
            const websites = Array.from(selectedJobWebsites).join('\n');
            const roles = document.getElementById('job-form-roles').value.trim();
            const mode = modeSelect.value;
            const profileId = document.getElementById('job-form-profile').value;
            const fields = document.getElementById('job-form-fields').value;
            const limit = parseInt(document.getElementById('job-form-limit').value, 10) || 2;

            if (!title || !websites || !roles) {
                alert('Please specify job title, select at least one website, and enter target roles.');
                return;
            }

            if (mode === 'autonomous' && !confirmCheck.checked) {
                alert('Please confirm that you authorize autonomous submission without manual verification.');
                return;
            }

            const updatedJob = {
                title: title,
                websites: websites,
                roles: roles,
                mode: mode,
                profile_id: profileId,
                fields_mode: fields,
                limit: limit
            };

            await db.automation_jobs.update(editingJobId, updatedJob);
            await loadCustomJobs();

            editorBox.style.display = 'none';
            editingJobId = null;
            if (toggleBtn) {
                toggleBtn.textContent = '+ Create Job';
            }
            jobSelect.value = updatedJob.id;
            const job = currentCustomJobs.find(j => j.id === jobSelect.value) || { ...updatedJob, id: jobSelect.value };
            applySelectedJob(job);
        });
    }

    if (jobSelect) {
        jobSelect.addEventListener('change', async () => {
            const selectedId = jobSelect.value;
            if (!selectedId) {
                document.getElementById('target-websites').value = '';
                document.getElementById('target-roles').value = '';
                document.getElementById('pagination-limit').value = 2;
                renderRunnerSummary('', '', 2);
                const autoStatus = document.getElementById('automation-status');
                if (autoStatus) {
                    autoStatus.innerText = 'Ready (Default Quick Run)';
                }
                if (editorBox.style.display === 'block') {
                    editorBox.style.display = 'none';
                    if (toggleBtn) toggleBtn.textContent = '+ Create Job';
                }
                return;
            }
            const job = currentCustomJobs.find(j => j.id === selectedId);
            if (job) {
                applySelectedJob(job);
                if (editorBox.style.display === 'block') {
                    editingJobId = job.id;
                    document.getElementById('editor-heading').textContent = 'Edit Job Template: ' + job.title;
                    document.getElementById('job-form-title').value = job.title || '';
                    document.getElementById('job-form-roles').value = job.roles || '';
                    document.getElementById('job-form-limit').value = job.limit || 2;
                    modeSelect.value = job.mode || 'semi';
                    document.getElementById('job-form-fields').value = job.fields_mode || 'all';
                    await loadProfileDropdowns();
                    if (job.profile_id) {
                        document.getElementById('job-form-profile').value = job.profile_id;
                    }
                    selectedJobWebsites.clear();
                    if (job.websites) {
                        job.websites.split('\n').map(s => s.trim()).filter(Boolean).forEach(w => selectedJobWebsites.add(w));
                    }
                    await renderJobWebsitesPicker();
                    if (saveJobBtn) saveJobBtn.style.display = 'none';
                    if (updateJobBtn) updateJobBtn.style.display = 'block';
                }
            }
        });
    }
}

async function renderRunnerSummary(websitesStr, rolesStr, limitVal) {
    const websitesDisplay = document.getElementById('runner-websites-display');
    const rolesDisplay = document.getElementById('runner-roles-display');
    const limitDisplay = document.getElementById('runner-limit-display');

    if (websitesDisplay) {
        websitesDisplay.innerHTML = '';
        const websites = websitesStr.split('\n').map(s => s.trim()).filter(Boolean);
        if (!websites.length) {
            websitesDisplay.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">No websites specified</span>';
        } else {
            const platforms = await db.platforms_dict.toArray();
            for (const url of websites) {
                const match = platforms.find(p => p.url === url || ('https://' + p.code) === url);
                const chip = document.createElement('div');
                chip.className = 'website-icon-chip selected';
                chip.style.cursor = 'default';

                const symbol = document.createElement('span');
                symbol.className = 'website-icon-symbol';
                const name = match ? (match.name || match.code) : url;
                symbol.textContent = name.charAt(0).toUpperCase();

                const nameSpan = document.createElement('span');
                nameSpan.className = 'website-icon-name';
                nameSpan.textContent = name;

                chip.appendChild(symbol);
                chip.appendChild(nameSpan);
                websitesDisplay.appendChild(chip);
            }
        }
    }

    if (rolesDisplay) {
        rolesDisplay.textContent = rolesStr || 'None';
    }

    if (limitDisplay) {
        limitDisplay.textContent = limitVal || '2';
    }
}

function applySelectedJob(job) {
    const websitesArea = document.getElementById('target-websites');
    const rolesInput = document.getElementById('target-roles');
    const limitInput = document.getElementById('pagination-limit');

    const websites = job.websites || '';
    const roles = job.roles || '';
    const limit = job.limit || 2;

    if (websitesArea) {
        websitesArea.value = websites;
    }
    if (rolesInput) {
        rolesInput.value = roles;
    }
    if (limitInput) {
        limitInput.value = limit;
    }

    renderRunnerSummary(websites, roles, limit);

    const autoStatus = document.getElementById('automation-status');
    if (autoStatus) {
        let modeLabel = 'Semi Mode';
        if (job.mode === 'autonomous') {
            modeLabel = 'Autonomous Mode';
        }
        autoStatus.innerText = 'Loaded job: ' + job.title + ' (' + modeLabel + ')';
    }
}

async function renderPlatformsRegistryList() {
    const listEl = document.getElementById('platforms-registry-list');
    const countBadge = document.getElementById('platform-count-badge');
    if (!listEl) {
        return;
    }

    listEl.innerHTML = '';
    const platforms = await db.platforms_dict.toArray();
    const allSelectors = await db.selectors.toArray();
    const elementTypes = await db.selector_element_types_dict.toArray();

    if (countBadge) {
        countBadge.textContent = platforms.length + ' platforms';
    }

    if (!platforms.length) {
        listEl.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">No platforms in registry.</div>';
        return;
    }

    for (const p of platforms) {
        const detailsEl = document.createElement('details');
        detailsEl.className = 'accordion-item';

        detailsEl.addEventListener('toggle', () => {
            const activeTabPane = detailsEl.closest('.tab-pane');
            if (activeTabPane) {
                requestAnimationFrame(() => {
                    activeTabPane.scrollTop += 1;
                    activeTabPane.scrollTop -= 1;
                });
            }
        });

        const summaryEl = document.createElement('summary');
        summaryEl.className = 'accordion-summary';

        const titleWrapper = document.createElement('div');
        titleWrapper.className = 'accordion-title-wrapper';

        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'accordion-arrow';
        arrowSpan.textContent = '▶';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'platform-row-title';
        titleSpan.textContent = p.name || p.code;

        titleWrapper.appendChild(arrowSpan);
        titleWrapper.appendChild(titleSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'platform-row-actions';

        const modeSelect = document.createElement('select');
        modeSelect.className = 'platform-mode-select';
        const optSemi = document.createElement('option');
        optSemi.value = 'semi';
        optSemi.textContent = 'Semi';
        const optAuto = document.createElement('option');
        optAuto.value = 'autonomous';
        optAuto.textContent = 'Autonomous';
        modeSelect.appendChild(optSemi);
        modeSelect.appendChild(optAuto);
        modeSelect.value = p.mode || 'semi';

        modeSelect.addEventListener('change', async (e) => {
            e.stopPropagation();
            const nextMode = modeSelect.value;
            if (nextMode === 'autonomous') {
                const confirmed = confirm('Enable full autonomous submission on ' + p.name + '? The extension will apply without manual verification.');
                if (!confirmed) {
                    modeSelect.value = 'semi';
                    return;
                }
            }
            await db.platforms_dict.update(p.id, { mode: nextMode });
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
                renderRunnerSummary(area.value, document.getElementById('target-roles').value, document.getElementById('pagination-limit').value);
            }
            const tabJobs = document.getElementById('tab-btn-jobs');
            if (tabJobs) {
                tabJobs.click();
            }
        });

        const autoFixBtn = document.createElement('button');
        autoFixBtn.className = 'action-btn-sm magic-btn';
        autoFixBtn.textContent = 'AutoFix';
        autoFixBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const autoStatus = document.getElementById('automation-status');
            if (autoStatus) {
                autoStatus.innerText = 'Running AutoFix on ' + p.code + '...';
            }
            chrome.runtime.sendMessage({
                action: 'auto_fix_platform_selectors',
                platformId: p.id,
                hostname: p.code,
                url: p.url || ('https://' + p.code)
            }, async (res) => {
                if (autoStatus) {
                    if (res && res.success) {
                        autoStatus.innerText = 'AutoFix completed successfully for ' + p.code;
                    } else {
                        autoStatus.innerText = 'AutoFix failed: ' + (res?.error || 'unknown error');
                    }
                }
                await renderPlatformsRegistryList();
                await updateSystemMetrics();
            });
        });

        actionsDiv.appendChild(modeSelect);
        actionsDiv.appendChild(useBtn);
        actionsDiv.appendChild(autoFixBtn);

        summaryEl.appendChild(titleWrapper);
        summaryEl.appendChild(actionsDiv);
        detailsEl.appendChild(summaryEl);

        const selectorsContainer = document.createElement('div');
        selectorsContainer.className = 'selectors-box accordion-content';

        const platformSelectors = allSelectors.filter(s => s.platform_id === p.id || s.url_pattern === p.code);

        for (const et of elementTypes) {
            const matched = platformSelectors.find(s => s.element_type_id === et.id);
            const selectorGroup = document.createElement('div');
            selectorGroup.className = 'form-group';

            const label = document.createElement('label');
            label.textContent = et.name + ':';

            const inputGroup = document.createElement('div');
            inputGroup.className = 'inline-input-group';

            const input = document.createElement('input');
            input.type = 'text';
            input.value = matched ? matched.selector_string : '';
            input.placeholder = 'Selector for ' + et.name;

            const saveBtn = document.createElement('button');
            saveBtn.className = 'action-btn-sm';
            saveBtn.textContent = 'Save';

            saveBtn.addEventListener('click', () => {
                const newString = input.value.trim();
                chrome.runtime.sendMessage({
                    action: 'update_specific_selector',
                    platformId: p.id,
                    hostname: p.code,
                    elementTypeId: et.id,
                    selectorString: newString
                }, (res) => {
                    const autoStatus = document.getElementById('automation-status');
                    if (autoStatus) {
                        if (res && res.success) {
                            autoStatus.innerText = 'Updated ' + et.name + ' selector for ' + p.code;
                        } else {
                            autoStatus.innerText = 'Failed to update selector.';
                        }
                    }
                    updateSystemMetrics();
                });
            });

            inputGroup.appendChild(input);
            inputGroup.appendChild(saveBtn);
            selectorGroup.appendChild(label);
            selectorGroup.appendChild(inputGroup);
            selectorsContainer.appendChild(selectorGroup);
        }

        detailsEl.appendChild(selectorsContainer);
        listEl.appendChild(detailsEl);
    }
}

async function loadUserProfile() {
    try {
        const items = await db.personal_data.toArray();
        if (!items.length) {
            return;
        }
        const profile = items[0];

        if (profile.first_name) {
            document.getElementById('prof-firstname').value = profile.first_name;
        }
        if (profile.last_name) {
            document.getElementById('prof-lastname').value = profile.last_name;
        }
        if (profile.email) {
            document.getElementById('prof-email').value = profile.email;
        }
        if (profile.phone) {
            document.getElementById('prof-phone').value = profile.phone;
        }
        if (profile.location) {
            document.getElementById('prof-location').value = profile.location;
        }
        if (profile.headline) {
            document.getElementById('prof-headline').value = profile.headline;
        }
        if (profile.links) {
            document.getElementById('prof-links').value = profile.links;
        }
        if (profile.skills) {
            document.getElementById('prof-skills').value = profile.skills;
        }
    } catch (e) {
        console.error(e);
    }
}

function initProfileManagement() {
    const saveBtn = document.getElementById('save-profile-btn');
    const statusBox = document.getElementById('profile-save-status');

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const profileData = {
                first_name: document.getElementById('prof-firstname').value.trim(),
                last_name: document.getElementById('prof-lastname').value.trim(),
                email: document.getElementById('prof-email').value.trim(),
                phone: document.getElementById('prof-phone').value.trim(),
                location: document.getElementById('prof-location').value.trim(),
                headline: document.getElementById('prof-headline').value.trim(),
                links: document.getElementById('prof-links').value.trim(),
                skills: document.getElementById('prof-skills').value.trim(),
                updated_at: new Date().toISOString()
            };

            chrome.runtime.sendMessage({ action: 'save_profile_data', profile: profileData }, (res) => {
                if (statusBox) {
                    statusBox.style.display = 'block';
                    if (res && res.success) {
                        statusBox.textContent = 'Profile saved successfully.';
                        statusBox.style.color = '#166534';
                    } else {
                        statusBox.textContent = 'Failed to save profile.';
                        statusBox.style.color = '#dc2626';
                    }
                    setTimeout(() => {
                        statusBox.style.display = 'none';
                    }, 3000);
                }
                updateSystemMetrics();
            });
        });
    }
}

function bindAutoSave(selector, storageKey, delay = 300) {
    const el = document.querySelector(selector);
    if (!el) {
        return;
    }

    chrome.storage.local.get(storageKey, (data) => {
        if (data[storageKey] !== undefined) {
            el.value = data[storageKey];
        }
    });

    let timer;
    el.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            chrome.storage.local.set({ [storageKey]: el.value });
        }, delay);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initJobManagement();
    initProfileManagement();

    if (typeof seedDatabase === 'function') {
        try {
            await seedDatabase();
        } catch (e) {}
    }

    const data = await chrome.storage.local.get(STORAGE_KEYS);
    let currentLang = 'en';
    if (data.preferred_locale) {
        currentLang = data.preferred_locale;
    }

    const langSelect = document.getElementById('lang-select');
    if (langSelect) {
        langSelect.value = currentLang;
    }

    if (data.automation_websites) {
        document.getElementById('target-websites').value = data.automation_websites;
    }
    if (data.automation_roles) {
        document.getElementById('target-roles').value = data.automation_roles;
    }
    if (data.automation_limit) {
        document.getElementById('pagination-limit').value = data.automation_limit;
    }

    renderRunnerSummary(
        document.getElementById('target-websites').value,
        document.getElementById('target-roles').value,
        document.getElementById('pagination-limit').value
    );

    bindAutoSave('target-websites', 'automation_websites');
    bindAutoSave('target-roles', 'automation_roles');
    bindAutoSave('pagination-limit', 'pagination-limit');

    await loadCustomJobs();
    await renderJobWebsitesPicker();
    await renderPlatformsRegistryList();
    await loadUserProfile();
    await applyTranslations(currentLang);
    await updateVacancyCount();
    await updateSystemMetrics();
});

const openPwaBtn = document.getElementById('open-pwa-btn');
if (openPwaBtn) {
    openPwaBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: PWA_DEFAULT_URL });
    });
}

const selectElement = document.getElementById('lang-select');
if (selectElement) {
    selectElement.addEventListener('change', async (event) => {
        const target = event.target;
        const newLang = target.value;
        await chrome.storage.local.set({ preferred_locale: newLang });
        await applyTranslations(newLang);
    });
}

const startAutomationBtn = document.getElementById('start-automation');
if (startAutomationBtn) {
    startAutomationBtn.addEventListener('click', async () => {
        const websitesText = document.getElementById('target-websites').value.trim();
        const rolesText = document.getElementById('target-roles').value.trim();
        const limit = parseInt(document.getElementById('pagination-limit').value, 10) || 1;

        const websites = websitesText.split('\n').map(s => s.trim()).filter(Boolean);
        const roles = rolesText.split(',').map(s => s.trim()).filter(Boolean);

        const autoStatus = document.getElementById('automation-status');

        if (!websites.length || !roles.length) {
            if (autoStatus) {
                autoStatus.innerText = 'Provide at least one website and role.';
            }
            return;
        }

        const selectedJobId = document.getElementById('job-select').value;
        const activeJob = currentCustomJobs.find(j => j.id === selectedJobId);

        let fieldsMode = 'all';
        let profileId = '';
        if (activeJob) {
            fieldsMode = activeJob.fields_mode;
            profileId = activeJob.profile_id;
        }

        let jobTitle = 'Quick Automation';
        if (activeJob) {
            jobTitle = activeJob.title;
        }

        await chrome.storage.local.set({
            automation_websites: websitesText,
            automation_roles: rolesText,
            automation_limit: limit
        });

        if (autoStatus) {
            autoStatus.innerText = 'Starting automation workflow...';
        }

        chrome.runtime.sendMessage({
            action: 'start_automation_workflow',
            config: {
                websites: websites,
                roles: roles,
                paginationLimit: limit,
                fieldsMode: fieldsMode,
                jobTitle: jobTitle,
                profileId: profileId
            }
        }, (res) => {
            if (res) {
                if (!res.success) {
                    if (autoStatus) {
                        autoStatus.innerText = 'Error: ' + res.error;
                    }
                }
            }
            updateSystemMetrics();
        });
    });
}

const stopAutomationBtn = document.getElementById('stop-automation');
if (stopAutomationBtn) {
    stopAutomationBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stop_automation_workflow' }, () => {
            const autoStatus = document.getElementById('automation-status');
            if (autoStatus) {
                autoStatus.innerText = 'Automation stopped.';
            }
            updateSystemMetrics();
        });
    });
}

chrome.runtime.onMessage.addListener((msg) => {
    const autoStatus = document.getElementById('automation-status');
    if (!autoStatus) {
        return;
    }

    if (msg.action === 'automation_status_update') {
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

const clearDbButton = document.getElementById('clear-db');
if (clearDbButton) {
    clearDbButton.addEventListener('click', async () => {
        try {
            await db.local_vacancies.clear();
            await updateVacancyCount();
            await updateSystemMetrics();
        } catch (err) {
            console.error(err);
        }
    });
}