import { db } from './database.js';

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request.action === 'get_vacancies') {
        db.local_vacancies.toArray().then(vacancies => {
            sendResponse({ status: 'success', data: vacancies });
        }).catch(error => {
            sendResponse({ status: 'error', message: error.message });
        });
        return true;
    }
});