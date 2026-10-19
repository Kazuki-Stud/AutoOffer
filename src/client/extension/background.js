import { db } from './database.js';

const ELEMENT_TYPES = {
    CONTAINER: '33333333-3333-3333-3333-333333333333',
    TITLE: '44444444-4444-4444-4444-444444444444',
    LINK: '55555555-5555-5555-5555-555555555555',
    COMPANY: '66666666-6666-6666-6666-666666666666'
};

async function getSelectorsForHostname(hostname) {
    const list = await db.selectors
        .where('is_active')
        .equals(1)
        .or('is_active')
        .equals(true)
        .toArray();

    const matching = list.filter(item => item.url_pattern && hostname.includes(item.url_pattern));
    if (!matching.length) return null;

    const result = {};
    const container = matching.find(s => s.element_type_id === ELEMENT_TYPES.CONTAINER);
    const title = matching.find(s => s.element_type_id === ELEMENT_TYPES.TITLE);
    const link = matching.find(s => s.element_type_id === ELEMENT_TYPES.LINK);
    const company = matching.find(s => s.element_type_id === ELEMENT_TYPES.COMPANY);

    if (container) result.container = container.selector_string;
    if (title) result.title = title.selector_string;
    if (link) result.link = link.selector_string;
    if (company) result.company = company.selector_string;

    return result;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'save_platform_selectors') {
        (async () => {
            const hostname = request.hostname;
            const selectors = request.selectors;

            let platform = await db.platforms_dict.where('code').equals(hostname).first();
            let platformId;
            if (!platform) {
                platformId = crypto.randomUUID();
                await db.platforms_dict.add({
                    id: platformId,
                    name: hostname,
                    code: hostname
                });
            } else {
                platformId = platform.id;
            }

            const taskId = '11111111-1111-1111-1111-111111111111';
            const entries = [
                { type: ELEMENT_TYPES.CONTAINER, str: selectors.container },
                { type: ELEMENT_TYPES.TITLE, str: selectors.title },
                { type: ELEMENT_TYPES.LINK, str: selectors.link },
                { type: ELEMENT_TYPES.COMPANY, str: selectors.company || selectors.title }
            ];

            for (const item of entries) {
                const existing = await db.selectors
                    .where('url_pattern')
                    .equals(hostname)
                    .and(s => s.element_type_id === item.type)
                    .first();

                if (existing) {
                    await db.selectors.update(existing.id, {
                        selector_string: item.str,
                        is_active: true,
                        updated_at: new Date().toISOString()
                    });
                } else {
                    await db.selectors.add({
                        id: crypto.randomUUID(),
                        platform_id: platformId,
                        task_id: taskId,
                        element_type_id: item.type,
                        url_pattern: hostname,
                        selector_string: item.str,
                        is_active: true,
                        updated_at: new Date().toISOString()
                    });
                }
            }
            sendResponse({ success: true });
        })().catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'save_scraped_vacancies') {
        (async () => {
            const hostname = request.hostname;
            const vacancies = request.vacancies || [];

            let platform = await db.platforms_dict.where('code').equals(hostname).first();
            const platformId = platform ? platform.id : 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

            await db.transaction('rw', [db.local_vacancies, db.companies_dict], async () => {
                for (const item of vacancies) {
                    let company = await db.companies_dict.where('name').equals(item.companyName).first();
                    let companyId;
                    if (!company) {
                        companyId = crypto.randomUUID();
                        await db.companies_dict.add({
                            id: companyId,
                            name: item.companyName,
                            website: '',
                            is_verified: false
                        });
                    } else {
                        companyId = company.id;
                    }

                    const exists = await db.local_vacancies.where('url').equals(item.url).first();
                    if (!exists) {
                        await db.local_vacancies.add({
                            id: crypto.randomUUID(),
                            platform_id: platformId,
                            position_id: null,
                            full_position_name: item.fullPositionName,
                            company_id: companyId,
                            address: null,
                            region_id: null,
                            country_id: null,
                            city_id: null,
                            salary_from: null,
                            salary_to: null,
                            currency_id: null,
                            level_id: null,
                            url: item.url,
                            work_format_id: 'wf111111-1111-1111-1111-111111111111',
                            employment_type_id: 'et111111-1111-1111-1111-111111111111',
                            description: '',
                            synced: false,
                            created_at: new Date().toISOString()
                        });
                    }
                }
            });
            sendResponse({ success: true });
        })().catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'run_parse_task_for_tab') {
        (async () => {
            const tabId = request.tabId;
            const tabUrl = request.tabUrl;
            const hostname = new URL(tabUrl).hostname;
            const selectors = await getSelectorsForHostname(hostname);

            if (!selectors) {
                sendResponse({ success: false, error: 'No configured selectors for host: ' + hostname });
                return;
            }

            chrome.tabs.sendMessage(tabId, {
                action: 'run_task_with_selectors',
                selectors: selectors
            }, (tabResponse) => {
                sendResponse(tabResponse || { success: true });
            });
        })().catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

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