import { db } from '../database.js';
import { seedDatabase } from '../database/seed.js';

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

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof seedDatabase === 'function') {
        try {
            await seedDatabase();
        } catch (e) {}
    }
    const result = await chrome.storage.local.get('preferred_locale');
    const currentLang = result.preferred_locale || 'en';

    const select = document.getElementById('lang-select');
    if (select) {
        select.value = currentLang;
    }

    await applyTranslations(currentLang);
    await updateVacancyCount();
});

const selectElement = document.getElementById('lang-select');
selectElement?.addEventListener('change', async (event) => {
    const target = event.target;
    const newLang = target.value;
    await chrome.storage.local.set({ preferred_locale: newLang });
    await applyTranslations(newLang);
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
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { action: 'auto_detect_selectors' }, (response) => {
        const statusElement = document.getElementById('status');
        if (statusElement && response) {
            statusElement.innerText = response.message || (response.success ? 'Prompt logged to console.' : 'Failed.');
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