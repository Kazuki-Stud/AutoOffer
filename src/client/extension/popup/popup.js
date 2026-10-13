import { db } from '../database.js';

async function applyTranslations(lang) {
    const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
    const response = await fetch(url);
    const messages = await response.json();

    document.querySelectorAll('[data-i18n]').forEach(node => {
        const key = node.getAttribute('data-i18n');
        if (key && messages[key]) {
            node.textContent = messages[key].message;
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(node => {
        const key = node.getAttribute('data-i18n-placeholder');
        if (key && messages[key]) {
            node.placeholder = messages[key].message;
        }
    });
}

async function updateVacancyCount() {
    const statusElement = document.getElementById('status');
    if (!statusElement) return;

    try {
        const count = await db.local_vacancies.count();
        statusElement.innerText = `Vacancies in database: ${count}`;
    } catch (err) {
        if (err instanceof Error) {
            statusElement.innerText = err.message;
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
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

db.local_vacancies.hook('deleting', function () {
    this.onsuccess = async function () {
        await updateVacancyCount();
    };
    this.onerror = function (err) {
        const statusElement = document.getElementById('status');
        if (statusElement && err instanceof Error) {
            statusElement.innerText = err.message;
        }
    };
});

const clearDbButton = document.getElementById('clear-db');
clearDbButton?.addEventListener('click', async () => {
    try {
        await db.local_vacancies.clear();
    } catch (err) {
        console.error(err);
    }
});