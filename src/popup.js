import { db } from './database.js';

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

document.addEventListener('DOMContentLoaded', async () => {
    const result = await chrome.storage.local.get('preferred_locale');
    const currentLang = result.preferred_locale || 'en';

    const select = document.getElementById('lang-select');
    if (select) {
        select.value = currentLang;
    }

    await applyTranslations(currentLang);
});

const selectElement = document.getElementById('lang-select');
selectElement?.addEventListener('change', async (event) => {
    const target = event.target;
    const newLang = target.value;
    await chrome.storage.local.set({ preferred_locale: newLang });
    await applyTranslations(newLang);
});

const addVacancyButton = document.getElementById('add-vacancy');
addVacancyButton?.addEventListener('click', async () => {
    const statusElement = document.getElementById('status');
    try {
        await db.local_vacancies.add({
            id: crypto.randomUUID(),
            platform_id: crypto.randomUUID(),
            full_position_name: 'Software Engineer',
            company_id: crypto.randomUUID(),
            url: 'https://example.com/vacancy/1',
            description: 'Test description',
            synced: false,
            created_at: new Date().toISOString()
        });

        const allVacancies = await db.local_vacancies.toArray();
        console.log(allVacancies);

        const result = await chrome.storage.local.get('preferred_locale');
        const currentLang = result.preferred_locale || 'en';
        const url = chrome.runtime.getURL(`_locales/${currentLang}/messages.json`);
        const response = await fetch(url);
        const messages = await response.json();

        if (statusElement && messages.statusInitialized) {
            statusElement.innerText = messages.statusInitialized.message;
        }
    } catch (err) {
        if (statusElement && err instanceof Error) {
            statusElement.innerText = err.message;
        }
    }
});