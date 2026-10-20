import { db } from './database.js';

const ELEMENT_TYPES = {
    CONTAINER: '33333333-3333-3333-3333-333333333333',
    TITLE: '44444444-4444-4444-4444-444444444444',
    LINK: '55555555-5555-5555-5555-555555555555',
    SEARCH_INPUT: '77777777-7777-7777-7777-777777777777',
    SEARCH_BUTTON: '88888888-8888-8888-8888-888888888888',
    PAGINATION: '99999999-9999-9999-9999-999999999999',
    DESCRIPTION: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
};

let activeAutomationSession = null;

function waitForTabLoad(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (tab && tab.status === 'complete') {
                return resolve();
            }

            function onUpdatedListener(updatedTabId, changeInfo) {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(onUpdatedListener);
                    resolve();
                }
            }

            chrome.tabs.onUpdated.addListener(onUpdatedListener);
        });
    });
}

function waitForNavigationOrDomChange(tabId, triggerActionFn) {
    return new Promise((resolve, reject) => {
        let settled = false;

        function cleanup() {
            chrome.tabs.onUpdated.removeListener(onUpdatedListener);
            chrome.webNavigation.onCompleted.removeListener(onNavCompleted);
        }

        function finish() {
            if (!settled) {
                settled = true;
                cleanup();
                resolve();
            }
        }

        function onUpdatedListener(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                finish();
            }
        }

        function onNavCompleted(details) {
            if (details.tabId === tabId && details.frameId === 0) {
                finish();
            }
        }

        chrome.tabs.onUpdated.addListener(onUpdatedListener);
        chrome.webNavigation.onCompleted.addListener(onNavCompleted);

        triggerActionFn().then((actionResult) => {
            if (actionResult && (actionResult.navigated || actionResult.domMutated)) {
                finish();
            }
        }).catch((err) => {
            const msg = err?.message || '';
            if (msg.includes('back/forward cache') || msg.includes('message channel is closed') || msg.includes('message port closed')) {
                return;
            }
            cleanup();
            reject(err);
        });
    });
}

async function sendTabMessage(tabId, message) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                const errMsg = chrome.runtime.lastError.message || '';
                if (errMsg.includes('back/forward cache') || errMsg.includes('message channel is closed') || errMsg.includes('message port closed')) {
                    return resolve({ navigated: true, success: true });
                }
                return reject(new Error(errMsg));
            }
            resolve(response);
        });
    });
}

async function getOrRegisterPlatform(hostname, url) {
    let platform = await db.platforms_dict.where('code').equals(hostname).first();
    if (!platform) {
        const newId = crypto.randomUUID();
        const baseName = hostname.replace(/^www\./, '').split('.')[0];
        const formattedName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
        platform = {
            id: newId,
            name: formattedName,
            code: hostname,
            url: url || `https://${hostname}`
        };
        await db.platforms_dict.add(platform);
        console.log(`[AutoOffer Background] Registered platform:`, platform);
    }
    return platform;
}

async function getSelectorsForHostname(hostname) {
    const allSelectors = await db.selectors.toArray();
    const activeList = allSelectors.filter(item => Boolean(item.is_active));
    const matching = activeList.filter(item => item.url_pattern && hostname.includes(item.url_pattern));

    const result = {};
    const map = {
        [ELEMENT_TYPES.CONTAINER]: 'container',
        [ELEMENT_TYPES.TITLE]: 'title',
        [ELEMENT_TYPES.LINK]: 'link',
        [ELEMENT_TYPES.SEARCH_INPUT]: 'searchInput',
        [ELEMENT_TYPES.SEARCH_BUTTON]: 'searchButton',
        [ELEMENT_TYPES.PAGINATION]: 'pagination',
        [ELEMENT_TYPES.DESCRIPTION]: 'description'
    };

    for (const item of matching) {
        const key = map[item.element_type_id];
        if (key && !result[key]) {
            result[key] = item.selector_string;
        }
    }

    const platform = await db.platforms_dict.where('code').equals(hostname).first();
    if (platform && platform.search_selector && !result.searchInput) {
        result.searchInput = platform.search_selector;
    }

    return Object.keys(result).length > 0 ? result : null;
}

async function saveSelectorsForHostname(hostname, selectors, targetUrl) {
    const platform = await getOrRegisterPlatform(hostname, targetUrl);
    const taskId = '11111111-1111-1111-1111-111111111111';

    const entries = [
        { type: ELEMENT_TYPES.CONTAINER, str: selectors.container },
        { type: ELEMENT_TYPES.TITLE, str: selectors.title },
        { type: ELEMENT_TYPES.LINK, str: selectors.link },
        { type: ELEMENT_TYPES.SEARCH_INPUT, str: selectors.searchInput || '' },
        { type: ELEMENT_TYPES.SEARCH_BUTTON, str: selectors.searchButton || '' },
        { type: ELEMENT_TYPES.PAGINATION, str: selectors.pagination || '' },
        { type: ELEMENT_TYPES.DESCRIPTION, str: selectors.description || '' }
    ];

    for (const item of entries) {
        if (!item.str) continue;
        const existing = await db.selectors
            .where('url_pattern')
            .equals(hostname)
            .and(s => s.element_type_id === item.type)
            .first();

        if (existing) {
            await db.selectors.update(existing.id, {
                selector_string: item.str,
                is_active: 1,
                updated_at: new Date().toISOString()
            });
        } else {
            await db.selectors.add({
                id: crypto.randomUUID(),
                platform_id: platform.id,
                task_id: taskId,
                element_type_id: item.type,
                url_pattern: hostname,
                selector_string: item.str,
                is_active: 1,
                updated_at: new Date().toISOString()
            });
        }
    }
}

async function saveVacancies(hostname, vacancies) {
    let platform = await db.platforms_dict.where('code').equals(hostname).first();
    const platformId = platform ? platform.id : 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

    await db.transaction('rw', [db.local_vacancies], async () => {
        for (const item of vacancies) {
            const exists = await db.local_vacancies.where('url').equals(item.url).first();
            if (!exists) {
                await db.local_vacancies.add({
                    id: crypto.randomUUID(),
                    platform_id: platformId,
                    position_id: null,
                    full_position_name: item.fullPositionName,
                    company_id: null,
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
                    description: item.description || '',
                    synced: false,
                    created_at: new Date().toISOString()
                });
            } else if (item.description && !exists.description) {
                await db.local_vacancies.update(exists.id, {
                    description: item.description
                });
            }
        }
    });
}

async function resolveWorkingSelectors(tabId, hostname, targetUrl) {
    let selectors = await getSelectorsForHostname(hostname);
    if (selectors && selectors.container && selectors.title && selectors.link) {
        try {
            const verifyRes = await sendTabMessage(tabId, { action: 'validate_selectors', selectors });
            if (verifyRes && verifyRes.isValid) {
                return selectors;
            }
        } catch (e) {}
    }

    const guessRes = await sendTabMessage(tabId, { action: 'auto_guess_selectors_internal' });
    if (guessRes && guessRes.success && guessRes.selectors) {
        await saveSelectorsForHostname(hostname, guessRes.selectors, targetUrl);
        return guessRes.selectors;
    }

    const fallbackDefault = {
        container: '[data-testid*="job" i], article, li, div[class*="job" i], div[class*="card" i]',
        title: 'h2, h3, a[class*="title" i], [class*="jobTitle" i], [data-testid*="title" i]',
        link: 'a[href*="job"], a[href*="career"], a'
    };
    return fallbackDefault;
}

async function runAutomationPipeline(config) {
    const { websites, roles, paginationLimit } = config;
    let tab = null;
    let tabId = null;

    try {
        tab = await chrome.tabs.create({ url: 'about:blank', active: false });
        tabId = tab.id;

        for (let wIndex = 0; wIndex < websites.length; wIndex++) {
            if (!activeAutomationSession || activeAutomationSession.abort) break;

            const targetUrl = websites[wIndex];
            const parsedUrl = new URL(targetUrl);
            const hostname = parsedUrl.hostname;

            await getOrRegisterPlatform(hostname, targetUrl);

            chrome.runtime.sendMessage({
                action: 'automation_status_update',
                stage: 1,
                message: `Status 1: Loading ${hostname} (${wIndex + 1}/${websites.length})`
            }).catch(() => {});

            await chrome.tabs.update(tabId, { url: targetUrl });
            await waitForTabLoad(tabId);

            const collectedVacanciesForSite = [];

            for (let rIndex = 0; rIndex < roles.length; rIndex++) {
                if (!activeAutomationSession || activeAutomationSession.abort) break;

                const role = roles[rIndex];
                chrome.runtime.sendMessage({
                    action: 'automation_status_update',
                    stage: 2,
                    message: `Status 2: Searching role "${role}" on ${hostname}`
                }).catch(() => {});

                const existingSelectors = await getSelectorsForHostname(hostname);

                await waitForNavigationOrDomChange(tabId, async () => {
                    return await sendTabMessage(tabId, {
                        action: 'execute_search_input',
                        role: role,
                        selectors: existingSelectors || {}
                    });
                });

                await waitForTabLoad(tabId);

                const workingSelectors = await resolveWorkingSelectors(tabId, hostname, targetUrl);

                let pagesProcessed = 0;
                while (pagesProcessed < paginationLimit) {
                    if (!activeAutomationSession || activeAutomationSession.abort) break;

                    const parseRes = await sendTabMessage(tabId, {
                        action: 'extract_listing_vacancies',
                        selectors: workingSelectors
                    });

                    if (parseRes && parseRes.vacancies && parseRes.vacancies.length) {
                        for (const v of parseRes.vacancies) {
                            if (!collectedVacanciesForSite.some(cv => cv.url === v.url)) {
                                collectedVacanciesForSite.push(v);
                            }
                        }
                    }

                    pagesProcessed++;
                    if (pagesProcessed >= paginationLimit) break;

                    let paginationAdvanceResult = null;
                    await waitForNavigationOrDomChange(tabId, async () => {
                        paginationAdvanceResult = await sendTabMessage(tabId, {
                            action: 'advance_pagination',
                            selectors: workingSelectors
                        });
                        return paginationAdvanceResult;
                    });

                    await waitForTabLoad(tabId);

                    if (!paginationAdvanceResult || !paginationAdvanceResult.advanced) {
                        console.log(`[AutoOffer Automation] No further pagination elements available for ${hostname}`);
                        break;
                    }
                }
            }

            if (collectedVacanciesForSite.length > 0) {
                chrome.runtime.sendMessage({
                    action: 'automation_status_update',
                    stage: 3,
                    message: `Status 3: Parsing details for ${collectedVacanciesForSite.length} vacancies`
                }).catch(() => {});

                for (let vIndex = 0; vIndex < collectedVacanciesForSite.length; vIndex++) {
                    if (!activeAutomationSession || activeAutomationSession.abort) break;

                    const vacancy = collectedVacanciesForSite[vIndex];
                    try {
                        await chrome.tabs.update(tabId, { url: vacancy.url });
                        await waitForTabLoad(tabId);

                        const detailRes = await sendTabMessage(tabId, {
                            action: 'extract_detail_description'
                        });

                        if (detailRes && detailRes.description) {
                            vacancy.description = detailRes.description;
                        }
                    } catch (e) {
                        vacancy.description = '';
                    }

                    await saveVacancies(hostname, [vacancy]);
                }
            }

            chrome.runtime.sendMessage({
                action: 'automation_status_update',
                stage: 4,
                message: `Status 4: Finished ${hostname}.`
            }).catch(() => {});
        }

        chrome.runtime.sendMessage({
            action: 'automation_completed',
            message: 'Automation completed successfully.'
        }).catch(() => {});

    } catch (err) {
        console.error('[AutoOffer Automation] Pipeline execution failure:', err);
        throw err;
    } finally {
        if (tabId) {
            chrome.tabs.remove(tabId).catch(() => {});
        }
        activeAutomationSession = null;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'register_platform_data') {
        (async () => {
            const { name, url, hostname, searchSelector } = request.platform;
            let platform = await db.platforms_dict.where('code').equals(hostname).first();
            let platformId = platform ? platform.id : crypto.randomUUID();

            if (!platform) {
                await db.platforms_dict.add({
                    id: platformId,
                    name: name,
                    code: hostname,
                    url: url
                });
            } else {
                await db.platforms_dict.update(platform.id, {
                    name: name,
                    url: url
                });
            }

            if (searchSelector) {
                await saveSelectorsForHostname(hostname, { searchInput: searchSelector }, url);
            }

            sendResponse({ success: true, platformId: platformId });
        })().catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'start_automation_workflow') {
        if (activeAutomationSession) {
            sendResponse({ success: false, error: 'Automation workflow already running.' });
            return true;
        }

        activeAutomationSession = { abort: false, config: request.config };
        runAutomationPipeline(request.config).catch(err => {
            console.error('[AutoOffer Background] Pipeline exception:', err);
            activeAutomationSession = null;
            chrome.runtime.sendMessage({
                action: 'automation_failed',
                error: err.message
            }).catch(() => {});
        });

        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'stop_automation_workflow') {
        if (activeAutomationSession) {
            activeAutomationSession.abort = true;
            activeAutomationSession = null;
        }
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'save_platform_selectors') {
        saveSelectorsForHostname(request.hostname, request.selectors, sender.tab?.url || '')
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'save_scraped_vacancies') {
        saveVacancies(request.hostname, request.vacancies || [])
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'run_parse_task_for_tab') {
        (async () => {
            const hostname = new URL(request.tabUrl).hostname;
            const selectors = await getSelectorsForHostname(hostname);
            if (!selectors) {
                sendResponse({ success: false, error: 'No configured selectors for host: ' + hostname });
                return;
            }
            chrome.tabs.sendMessage(request.tabId, {
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