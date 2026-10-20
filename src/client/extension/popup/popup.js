import { db } from '../database.js';
import { seedDatabase } from '../database/seed.js';

const ELEMENT_TYPE_SEARCH = '77777777-7777-7777-7777-777777777777';
const PWA_DEFAULT_URL = 'http://localhost:5173';

const STORAGE_KEYS = [
    'preferred_locale',
    'automation_websites',
    'automation_roles',
    'automation_limit',
    'field_platform_name',
    'field_platform_url',
    'field_platform_search_selector',
    'field_selected_dropdown'
];

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

async function populateSavedWebsitesDropdown() {
    const dropdown = document.getElementById('saved-websites-dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="">-- Choose or add new --</option>';
    const platforms = await db.platforms_dict.toArray();
    for (const p of platforms) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name || p.code} (${p.url || p.code})`;
        dropdown.appendChild(opt);
    }
}

function bindAutoSave(elementId, storageKey) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const evtName = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evtName, () => {
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
    if (data.field_platform_name) document.getElementById('platform-name').value = data.field_platform_name;
    if (data.field_platform_url) document.getElementById('platform-url').value = data.field_platform_url;
    if (data.field_platform_search_selector) document.getElementById('platform-search-selector').value = data.field_platform_search_selector;

    await populateSavedWebsitesDropdown();

    if (data.field_selected_dropdown) {
        const dropdown = document.getElementById('saved-websites-dropdown');
        if (dropdown) dropdown.value = data.field_selected_dropdown;
    }

    bindAutoSave('target-websites', 'automation_websites');
    bindAutoSave('target-roles', 'automation_roles');
    bindAutoSave('pagination-limit', 'automation_limit');
    bindAutoSave('platform-name', 'field_platform_name');
    bindAutoSave('platform-url', 'field_platform_url');
    bindAutoSave('platform-search-selector', 'field_platform_search_selector');
    bindAutoSave('saved-websites-dropdown', 'field_selected_dropdown');

    await applyTranslations(currentLang);
    await updateVacancyCount();
});

const openPwaBtn = document.getElementById('open-pwa-btn');
openPwaBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: PWA_DEFAULT_URL });
});

const dropdown = document.getElementById('saved-websites-dropdown');
dropdown?.addEventListener('change', async () => {
    const platformId = dropdown.value;
    if (!platformId) {
        document.getElementById('platform-name').value = '';
        document.getElementById('platform-url').value = '';
        document.getElementById('platform-search-selector').value = '';
        await chrome.storage.local.set({
            field_platform_name: '',
            field_platform_url: '',
            field_platform_search_selector: ''
        });
        return;
    }

    const platform = await db.platforms_dict.get(platformId);
    if (!platform) return;

    const nameVal = platform.name || '';
    const urlVal = platform.url || '';
    document.getElementById('platform-name').value = nameVal;
    document.getElementById('platform-url').value = urlVal;

    const selectorObj = await db.selectors.where('platform_id').equals(platform.id).and(s => s.element_type_id === ELEMENT_TYPE_SEARCH).first();
    const selVal = selectorObj ? selectorObj.selector_string : (platform.search_selector || '');
    document.getElementById('platform-search-selector').value = selVal;

    await chrome.storage.local.set({
        field_platform_name: nameVal,
        field_platform_url: urlVal,
        field_platform_search_selector: selVal
    });
});

const savePlatformBtn = document.getElementById('save-platform-btn');
savePlatformBtn?.addEventListener('click', async () => {
    const name = document.getElementById('platform-name').value.trim();
    const url = document.getElementById('platform-url').value.trim();
    const searchSelector = document.getElementById('platform-search-selector').value.trim();
    const autoStatus = document.getElementById('automation-status');

    if (!url) {
        if (autoStatus) autoStatus.innerText = 'Website URL is required.';
        return;
    }

    let hostname = '';
    try {
        hostname = new URL(url).hostname;
    } catch (e) {
        hostname = url;
    }

    const platformName = name || hostname;

    chrome.runtime.sendMessage({
        action: 'register_platform_data',
        platform: {
            name: platformName,
            url: url,
            hostname: hostname,
            searchSelector: searchSelector
        }
    }, async (res) => {
        if (res && res.success) {
            if (autoStatus) autoStatus.innerText = `Saved ${platformName} to registry.`;
            await populateSavedWebsitesDropdown();
        } else {
            if (autoStatus) autoStatus.innerText = res ? res.error : 'Save failed.';
        }
    });
});

const useSelectedBtn = document.getElementById('use-selected-btn');
useSelectedBtn?.addEventListener('click', async () => {
    const url = document.getElementById('platform-url').value.trim();
    if (!url) return;

    const area = document.getElementById('target-websites');
    const existing = area.value.trim().split('\n').filter(Boolean);
    if (!existing.includes(url)) {
        existing.push(url);
    }
    area.value = existing.join('\n');
    await chrome.storage.local.set({ automation_websites: area.value });
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

const runTaskButton = document.getElementById('run-task');
runTaskButton?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab?.url) return;

    chrome.runtime.sendMessage({
        action: 'run_parse_task_for_tab',
        tabId: tab.id,
        tabUrl: tab.url
    }, async (response) => {
        const statusElement = document.getElementById('status');
        if (response && !response.success && statusElement) {
            statusElement.innerText = response.error;
        } else {
            await updateVacancyCount();
        }
    });
});

const addSiteButton = document.getElementById('add-site');
addSiteButton?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab?.url) return;

    const autoStatus = document.getElementById('automation-status');
    const hostname = new URL(tab.url).hostname;

    chrome.tabs.sendMessage(tab.id, { action: 'detect_page_selectors_for_registration' }, async (response) => {
        document.getElementById('platform-name').value = hostname;
        document.getElementById('platform-url').value = tab.url;
        let searchInputVal = '';
        if (response && response.detected && response.detected.searchInput) {
            searchInputVal = response.detected.searchInput;
            document.getElementById('platform-search-selector').value = searchInputVal;
        }
        await chrome.storage.local.set({
            field_platform_name: hostname,
            field_platform_url: tab.url,
            field_platform_search_selector: searchInputVal
        });
        if (autoStatus) autoStatus.innerText = `Detected configuration for ${hostname}.`;
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