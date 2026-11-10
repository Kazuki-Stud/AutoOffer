import { db } from '../database.js';
import { seedDatabase } from '../database/seed.js';

const ELEMENT_TYPE_SEARCH = '77777777-7777-7777-7777-777777777777';
const PWA_DEFAULT_URL = 'http://localhost:5173';

const STORAGE_KEYS = [
    'preferred_locale',
    'automation_websites',
    'automation_roles',
    'automation_limit'
];

let pendingHostnameToConfigure = '';
let pendingUrlToConfigure = '';
let currentCustomJobs = [];

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
    const cancelJobBtn = document.getElementById('btn-cancel-job');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isHidden = editorBox.style.display === 'none';
            if (isHidden) {
                editorBox.style.display = 'block';
                toggleBtn.textContent = '- Close Form';
            } else {
                editorBox.style.display = 'none';
                toggleBtn.textContent = '+ Create Job';
            }
        });
    }

    if (cancelJobBtn) {
        cancelJobBtn.addEventListener('click', () => {
            editorBox.style.display = 'none';
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
            const websites = document.getElementById('job-form-websites').value.trim();
            const roles = document.getElementById('job-form-roles').value.trim();
            const mode = modeSelect.value;
            const fields = document.getElementById('job-form-fields').value;
            const limit = parseInt(document.getElementById('job-form-limit').value, 10) || 2;

            if (!title || !websites || !roles) {
                alert('Please specify job title, websites, and target roles.');
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

    if (jobSelect) {
        jobSelect.addEventListener('change', () => {
            const selectedId = jobSelect.value;
            if (!selectedId) {
                return;
            }
            const job = currentCustomJobs.find(j => j.id === selectedId);
            if (job) {
                applySelectedJob(job);
            }
        });
    }
}

function applySelectedJob(job) {
    const websitesArea = document.getElementById('target-websites');
    const rolesInput = document.getElementById('target-roles');
    const limitInput = document.getElementById('pagination-limit');

    if (websitesArea) {
        websitesArea.value = job.websites || '';
    }
    if (rolesInput) {
        rolesInput.value = job.roles || '';
    }
    if (limitInput) {
        limitInput.value = job.limit || 2;
    }

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
    const allSelectors = await db.selectors.where('element_type_id').equals(ELEMENT_TYPE_SEARCH).toArray();

    if (countBadge) {
        countBadge.textContent = platforms.length + ' platforms';
    }

    if (!platforms.length) {
        listEl.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">No platforms in registry.</div>';
        return;
    }

    for (const p of platforms) {
        const matchedSelector = allSelectors.find(s => s.platform_id === p.id || s.url_pattern === p.code);
        let selectorValue = '';
        if (matchedSelector) {
            selectorValue = matchedSelector.selector_string;
        }

        const row = document.createElement('div');
        row.className = 'platform-row';

        const rowHeader = document.createElement('div');
        rowHeader.className = 'platform-row-header';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'platform-row-title';
        titleSpan.textContent = p.name || p.code;

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

        modeSelect.addEventListener('change', async () => {
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
        useBtn.addEventListener('click', () => {
            const area = document.getElementById('target-websites');
            const lines = area.value.trim().split('\n').filter(Boolean);
            const target = p.url || ('https://' + p.code);
            if (!lines.includes(target)) {
                lines.push(target);
                area.value = lines.join('\n');
                chrome.storage.local.set({ automation_websites: area.value });
            }
            const tabJobs = document.getElementById('tab-btn-jobs');
            if (tabJobs) {
                tabJobs.click();
            }
        });

        const saveBtn = document.createElement('button');
        saveBtn.className = 'action-btn-sm';
        saveBtn.textContent = 'Save';

        const delBtn = document.createElement('button');
        delBtn.className = 'action-btn-sm delete-btn';
        delBtn.textContent = 'Del';
        delBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'delete_platform', platformId: p.id, hostname: p.code }, async () => {
                await renderPlatformsRegistryList();
                await updateSystemMetrics();
            });
        });

        actionsDiv.appendChild(modeSelect);
        actionsDiv.appendChild(useBtn);
        actionsDiv.appendChild(saveBtn);
        actionsDiv.appendChild(delBtn);

        rowHeader.appendChild(titleSpan);
        rowHeader.appendChild(actionsDiv);

        const inputEl = document.createElement('input');
        inputEl.className = 'platform-row-input';
        inputEl.placeholder = 'Search selector (e.g. input#q)';
        inputEl.value = selectorValue;

        saveBtn.addEventListener('click', () => {
            const newSelector = inputEl.value.trim();
            chrome.runtime.sendMessage({
                action: 'update_platform_search_selector',
                platformId: p.id,
                hostname: p.code,
                selector: newSelector
            }, async () => {
                const autoStatus = document.getElementById('automation-status');
                if (autoStatus) {
                    autoStatus.innerText = 'Updated selector for ' + p.code;
                }
                await renderPlatformsRegistryList();
                await updateSystemMetrics();
            });
        });

        row.appendChild(rowHeader);
        row.appendChild(inputEl);
        listEl.appendChild(row);
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

    bindAutoSave('target-websites', 'automation_websites');
    bindAutoSave('target-roles', 'automation_roles');
    bindAutoSave('pagination-limit', 'automation_limit');

    await loadCustomJobs();
    await renderPlatformsRegistryList();
    await loadUserProfile();
    await applyTranslations(currentLang);
    await updateVacancyCount();
    await updateSystemMetrics();
});

const addWebsiteBtn = document.getElementById('add-website-btn');
if (addWebsiteBtn) {
    addWebsiteBtn.addEventListener('click', async () => {
        const rawUrl = document.getElementById('quick-website-url').value.trim();
        const fallbackBox = document.getElementById('manual-selector-fallback');
        const autoStatus = document.getElementById('automation-status');

        if (!rawUrl) {
            if (autoStatus) {
                autoStatus.innerText = 'Please enter a URL.';
            }
            return;
        }

        let formattedInputUrl = rawUrl;
        if (!rawUrl.startsWith('http')) {
            formattedInputUrl = 'https://' + rawUrl;
        }

        let urlObj;
        try {
            urlObj = new URL(formattedInputUrl);
        } catch (e) {
            if (autoStatus) {
                autoStatus.innerText = 'Invalid URL format.';
            }
            return;
        }

        const hostname = urlObj.hostname;
        const formattedUrl = urlObj.href;

        const baseName = hostname.replace(/^www\./, '').split('.')[0];
        const platformName = baseName.charAt(0).toUpperCase() + baseName.slice(1);

        if (autoStatus) {
            autoStatus.innerText = 'Inspecting ' + hostname + '...';
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];
            let isCurrentlyOnTab = false;
            if (currentTab && currentTab.url) {
                if (currentTab.url.includes(hostname)) {
                    isCurrentlyOnTab = true;
                }
            }

            if (isCurrentlyOnTab && currentTab.id) {
                chrome.tabs.sendMessage(currentTab.id, { action: 'detect_page_selectors_for_registration' }, (res) => {
                    let detectedInput = '';
                    if (res && res.detected) {
                        detectedInput = res.detected.searchInput || '';
                    }
                    if (detectedInput) {
                        if (fallbackBox) {
                            fallbackBox.style.display = 'none';
                        }
                        savePlatformAndFinish(platformName, formattedUrl, hostname, detectedInput);
                    } else {
                        promptManualFallback(hostname, formattedUrl);
                    }
                });
            } else {
                savePlatformAndFinish(platformName, formattedUrl, hostname, '');
            }
        });
    });
}

function promptManualFallback(hostname, url) {
    pendingHostnameToConfigure = hostname;
    pendingUrlToConfigure = url;
    const fallbackBox = document.getElementById('manual-selector-fallback');
    if (fallbackBox) {
        fallbackBox.style.display = 'block';
    }
    const autoStatus = document.getElementById('automation-status');
    if (autoStatus) {
        autoStatus.innerText = 'Search field not detected for ' + hostname + '. Please enter selector manually.';
    }
}

function savePlatformAndFinish(name, url, hostname, searchSelector) {
    chrome.runtime.sendMessage({
        action: 'register_platform_data',
        platform: {
            name: name,
            url: url,
            hostname: hostname,
            searchSelector: searchSelector,
            mode: 'semi'
        }
    }, async (res) => {
        const autoStatus = document.getElementById('automation-status');
        if (res && res.success) {
            if (autoStatus) {
                autoStatus.innerText = 'Platform ' + name + ' saved.';
            }
            document.getElementById('quick-website-url').value = '';
            const fallbackBox = document.getElementById('manual-selector-fallback');
            if (fallbackBox) {
                fallbackBox.style.display = 'none';
            }

            const area = document.getElementById('target-websites');
            const lines = area.value.trim().split('\n').filter(Boolean);
            if (!lines.includes(url)) {
                lines.push(url);
                area.value = lines.join('\n');
                chrome.storage.local.set({ automation_websites: area.value });
            }
            await renderPlatformsRegistryList();
            await updateSystemMetrics();
        } else {
            if (autoStatus) {
                if (res) {
                    autoStatus.innerText = res.error;
                } else {
                    autoStatus.innerText = 'Save failed.';
                }
            }
        }
    });
}

const saveManualSelectorBtn = document.getElementById('save-manual-selector-btn');
if (saveManualSelectorBtn) {
    saveManualSelectorBtn.addEventListener('click', () => {
        const selector = document.getElementById('manual-search-selector').value.trim();
        if (!selector) {
            return;
        }

        const baseName = pendingHostnameToConfigure.replace(/^www\./, '').split('.')[0];
        const platformName = baseName.charAt(0).toUpperCase() + baseName.slice(1);

        savePlatformAndFinish(platformName, pendingUrlToConfigure, pendingHostnameToConfigure, selector);
        document.getElementById('manual-search-selector').value = '';
    });
}

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
        if (activeJob) {
            fieldsMode = activeJob.fields_mode;
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
                jobTitle: jobTitle
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

const addSiteButton = document.getElementById('add-site');
if (addSiteButton) {
    addSiteButton.addEventListener('click', async () => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];

        if (!tab) {
            return;
        }
        if (!tab.id || !tab.url) {
            return;
        }

        const autoStatus = document.getElementById('automation-status');
        const hostname = new URL(tab.url).hostname;
        document.getElementById('quick-website-url').value = tab.url;

        chrome.tabs.sendMessage(tab.id, { action: 'detect_page_selectors_for_registration' }, async (response) => {
            let detectedInput = '';
            if (response && response.detected) {
                detectedInput = response.detected.searchInput || '';
            }

            const baseName = hostname.replace(/^www\./, '').split('.')[0];
            const platformName = baseName.charAt(0).toUpperCase() + baseName.slice(1);

            if (detectedInput) {
                savePlatformAndFinish(platformName, tab.url, hostname, detectedInput);
                if (autoStatus) {
                    autoStatus.innerText = 'Auto-registered ' + hostname + ' with detected search field.';
                }
            } else {
                promptManualFallback(hostname, tab.url);
            }
        });
    });
}

const autoGuessButton = document.getElementById('auto-guess');
if (autoGuessButton) {
    autoGuessButton.addEventListener('click', async () => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];

        if (!tab) {
            return;
        }
        if (!tab.id) {
            return;
        }

        chrome.tabs.sendMessage(tab.id, { action: 'auto_guess_selectors' }, (response) => {
            const statusElement = document.getElementById('status');
            if (statusElement) {
                if (response) {
                    let messageText = response.message;
                    if (!messageText) {
                        if (response.success) {
                            messageText = 'Heuristic guess evaluated.';
                        } else {
                            messageText = 'Guess failed.';
                        }
                    }
                    statusElement.innerText = messageText;
                }
            }
        });
    });
}

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