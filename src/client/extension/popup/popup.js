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
    if (!statusElement) return;

    try {
        const count = await db.local_vacancies.count();
        statusElement.innerText = 'Vacancies in database: ' + count;
    } catch (err) {
        if (err instanceof Error) {
            statusElement.innerText = err.message;
        }
    }
}

async function renderPlatformsRegistryList() {
    const listEl = document.getElementById('platforms-registry-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    const platforms = await db.platforms_dict.toArray();
    const allSelectors = await db.selectors.where('element_type_id').equals(ELEMENT_TYPE_SEARCH).toArray();

    if (!platforms.length) {
        listEl.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">No platforms in registry.</div>';
        return;
    }

    for (const p of platforms) {
        const matchedSelector = allSelectors.find(s => s.platform_id === p.id || s.url_pattern === p.code);
        const selectorValue = matchedSelector ? matchedSelector.selector_string : '';

        const row = document.createElement('div');
        row.className = 'platform-row';

        const rowHeader = document.createElement('div');
        rowHeader.className = 'platform-row-header';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'platform-row-title';
        titleSpan.textContent = `${p.name || p.code} (${p.code})`;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'platform-row-actions';

        const useBtn = document.createElement('button');
        useBtn.className = 'action-btn-sm';
        useBtn.textContent = 'Use';
        useBtn.addEventListener('click', () => {
            const area = document.getElementById('target-websites');
            const lines = area.value.trim().split('\n').filter(Boolean);
            const target = p.url || `https://${p.code}`;
            if (!lines.includes(target)) {
                lines.push(target);
                area.value = lines.join('\n');
                chrome.storage.local.set({ automation_websites: area.value });
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
            });
        });

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
                if (autoStatus) autoStatus.innerText = `Updated selector for ${p.code}`;
                await renderPlatformsRegistryList();
            });
        });

        row.appendChild(rowHeader);
        row.appendChild(inputEl);
        listEl.appendChild(row);
    }
}

function bindAutoSave(elementId, storageKey) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.addEventListener('input', () => {
        chrome.storage.local.set({ [storageKey]: el.value });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof seedDatabase === 'function') {
        try {
            await seedDatabase();
        } catch (e) {}
    }

    const data = await chrome.storage.local.get(STORAGE_KEYS);
    const currentLang = data.preferred_locale || 'en';

    const langSelect = document.getElementById('lang-select');
    if (langSelect) langSelect.value = currentLang;

    if (data.automation_websites) document.getElementById('target-websites').value = data.automation_websites;
    if (data.automation_roles) document.getElementById('target-roles').value = data.automation_roles;
    if (data.automation_limit) document.getElementById('pagination-limit').value = data.automation_limit;

    bindAutoSave('target-websites', 'automation_websites');
    bindAutoSave('target-roles', 'automation_roles');
    bindAutoSave('pagination-limit', 'automation_limit');

    await renderPlatformsRegistryList();
    await applyTranslations(currentLang);
    await updateVacancyCount();
});

const togglePlatformsBtn = document.getElementById('toggle-platforms-btn');
togglePlatformsBtn?.addEventListener('click', () => {
    const listEl = document.getElementById('platforms-registry-list');
    if (!listEl) return;
    const isHidden = listEl.style.display === 'none';
    listEl.style.display = isHidden ? 'flex' : 'none';
    togglePlatformsBtn.textContent = isHidden ? 'Hide' : 'View All';
});

const addWebsiteBtn = document.getElementById('add-website-btn');
addWebsiteBtn?.addEventListener('click', async () => {
    const rawUrl = document.getElementById('quick-website-url').value.trim();
    const fallbackBox = document.getElementById('manual-selector-fallback');
    const autoStatus = document.getElementById('automation-status');

    if (!rawUrl) {
        if (autoStatus) autoStatus.innerText = 'Please enter a URL.';
        return;
    }

    let urlObj;
    try {
        urlObj = new URL(rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl);
    } catch (e) {
        if (autoStatus) autoStatus.innerText = 'Invalid URL format.';
        return;
    }

    const hostname = urlObj.hostname;
    const formattedUrl = urlObj.href;

    const baseName = hostname.replace(/^www\./, '').split('.')[0];
    const platformName = baseName.charAt(0).toUpperCase() + baseName.slice(1);

    if (autoStatus) autoStatus.innerText = `Inspecting ${hostname}...`;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        const isCurrentlyOnTab = currentTab?.url && currentTab.url.includes(hostname);

        if (isCurrentlyOnTab && currentTab.id) {
            chrome.tabs.sendMessage(currentTab.id, { action: 'detect_page_selectors_for_registration' }, (res) => {
                const detectedInput = res?.detected?.searchInput || '';
                if (detectedInput) {
                    fallbackBox.style.display = 'none';
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

function promptManualFallback(hostname, url) {
    pendingHostnameToConfigure = hostname;
    pendingUrlToConfigure = url;
    const fallbackBox = document.getElementById('manual-selector-fallback');
    if (fallbackBox) fallbackBox.style.display = 'block';
    const autoStatus = document.getElementById('automation-status');
    if (autoStatus) autoStatus.innerText = `Search field not detected for ${hostname}. Please enter selector manually.`;
}

function savePlatformAndFinish(name, url, hostname, searchSelector) {
    chrome.runtime.sendMessage({
        action: 'register_platform_data',
        platform: {
            name: name,
            url: url,
            hostname: hostname,
            searchSelector: searchSelector
        }
    }, async (res) => {
        const autoStatus = document.getElementById('automation-status');
        if (res && res.success) {
            if (autoStatus) autoStatus.innerText = `Platform ${name} saved.`;
            document.getElementById('quick-website-url').value = '';
            document.getElementById('manual-selector-fallback').style.display = 'none';

            const area = document.getElementById('target-websites');
            const lines = area.value.trim().split('\n').filter(Boolean);
            if (!lines.includes(url)) {
                lines.push(url);
                area.value = lines.join('\n');
                chrome.storage.local.set({ automation_websites: area.value });
            }
            await renderPlatformsRegistryList();
        } else {
            if (autoStatus) autoStatus.innerText = res ? res.error : 'Save failed.';
        }
    });
}

const saveManualSelectorBtn = document.getElementById('save-manual-selector-btn');
saveManualSelectorBtn?.addEventListener('click', () => {
    const selector = document.getElementById('manual-search-selector').value.trim();
    if (!selector) return;

    const baseName = pendingHostnameToConfigure.replace(/^www\./, '').split('.')[0];
    const platformName = baseName.charAt(0).toUpperCase() + baseName.slice(1);

    savePlatformAndFinish(platformName, pendingUrlToConfigure, pendingHostnameToConfigure, selector);
    document.getElementById('manual-search-selector').value = '';
});

const openPwaBtn = document.getElementById('open-pwa-btn');
openPwaBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: PWA_DEFAULT_URL });
});

const selectElement = document.getElementById('lang-select');
selectElement?.addEventListener('change', async (event) => {
    const target = event.target;
    const newLang = target.value;
    await chrome.storage.local.set({ preferred_locale: newLang });
    await applyTranslations(newLang);
});

const startAutomationBtn = document.getElementById('start-automation');
startAutomationBtn?.addEventListener('click', async () => {
    const websitesText = document.getElementById('target-websites').value.trim();
    const rolesText = document.getElementById('target-roles').value.trim();
    const limit = parseInt(document.getElementById('pagination-limit').value, 10) || 1;

    const websites = websitesText.split('\n').map(s => s.trim()).filter(Boolean);
    const roles = rolesText.split(',').map(s => s.trim()).filter(Boolean);

    const autoStatus = document.getElementById('automation-status');

    if (!websites.length || !roles.length) {
        if (autoStatus) autoStatus.innerText = 'Provide at least one website and role.';
        return;
    }

    await chrome.storage.local.set({
        automation_websites: websitesText,
        automation_roles: rolesText,
        automation_limit: limit
    });

    if (autoStatus) autoStatus.innerText = 'Starting automation workflow...';

    chrome.runtime.sendMessage({
        action: 'start_automation_workflow',
        config: {
            websites,
            roles,
            paginationLimit: limit
        }
    }, (res) => {
        if (res && !res.success && autoStatus) {
            autoStatus.innerText = 'Error: ' + res.error;
        }
    });
});

const stopAutomationBtn = document.getElementById('stop-automation');
stopAutomationBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stop_automation_workflow' }, () => {
        const autoStatus = document.getElementById('automation-status');
        if (autoStatus) autoStatus.innerText = 'Automation stopped.';
    });
});

chrome.runtime.onMessage.addListener((msg) => {
    const autoStatus = document.getElementById('automation-status');
    if (!autoStatus) return;

    if (msg.action === 'automation_status_update') {
        autoStatus.innerText = msg.message;
    } else if (msg.action === 'automation_completed') {
        autoStatus.innerText = msg.message;
        updateVacancyCount();
    } else if (msg.action === 'automation_failed') {
        autoStatus.innerText = 'Failed: ' + msg.error;
        updateVacancyCount();
    }
});

const addSiteButton = document.getElementById('add-site');
addSiteButton?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab?.url) return;

    const autoStatus = document.getElementById('automation-status');
    const hostname = new URL(tab.url).hostname;
    document.getElementById('quick-website-url').value = tab.url;

    chrome.tabs.sendMessage(tab.id, { action: 'detect_page_selectors_for_registration' }, async (response) => {
        const detectedInput = response?.detected?.searchInput || '';
        const baseName = hostname.replace(/^www\./, '').split('.')[0];
        const platformName = baseName.charAt(0).toUpperCase() + baseName.slice(1);

        if (detectedInput) {
            savePlatformAndFinish(platformName, tab.url, hostname, detectedInput);
            if (autoStatus) autoStatus.innerText = `Auto-registered ${hostname} with detected search field.`;
        } else {
            promptManualFallback(hostname, tab.url);
        }
    });
});

const autoGuessButton = document.getElementById('auto-guess');
autoGuessButton?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { action: 'auto_guess_selectors' }, (response) => {
        const statusElement = document.getElementById('status');
        if (statusElement && response) {
            statusElement.innerText = response.message || (response.success ? 'Heuristic guess evaluated.' : 'Guess failed.');
        }
    });
});

db.local_vacancies.hook('deleting', function () {
    this.onsuccess = async function () {
        await updateVacancyCount();
    };
});

const clearDbButton = document.getElementById('clear-db');
clearDbButton?.addEventListener('click', async () => {
    try {
        await db.local_vacancies.clear();
        await updateVacancyCount();
    } catch (err) {
        console.error(err);
    }
});