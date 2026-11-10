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

    return Object.keys(result).length > 0 ? result : null;
}

async function saveSpecificSelector(platformId, hostname, elementTypeId, selectorString) {
    const taskId = '11111111-1111-1111-1111-111111111111';
    const existing = await db.selectors
        .where('url_pattern')
        .equals(hostname)
        .and(s => s.element_type_id === elementTypeId)
        .first();

    if (existing) {
        await db.selectors.update(existing.id, {
            selector_string: selectorString,
            is_active: 1,
            updated_at: new Date().toISOString()
        });
    } else {
        await db.selectors.add({
            id: crypto.randomUUID(),
            platform_id: platformId,
            task_id: taskId,
            element_type_id: elementTypeId,
            url_pattern: hostname,
            selector_string: selectorString,
            is_active: 1,
            updated_at: new Date().toISOString()
        });
    }
}

async function autoFixPlatformSelectors(platformId, hostname, url) {
    let tab = null;
    try {
        tab = await chrome.tabs.create({ url: url, active: false });
        await waitForTabLoad(tab.id);

        const guessRes = await sendTabMessage(tab.id, { action: 'auto_guess_selectors_internal' });
        if (guessRes && guessRes.success && guessRes.selectors) {
            const guessed = guessRes.selectors;
            const mapping = [
                { type: ELEMENT_TYPES.CONTAINER, val: guessed.container },
                { type: ELEMENT_TYPES.TITLE, val: guessed.title },
                { type: ELEMENT_TYPES.LINK, val: guessed.link },
                { type: ELEMENT_TYPES.SEARCH_INPUT, val: guessed.searchInput },
                { type: ELEMENT_TYPES.PAGINATION, val: guessed.pagination },
                { type: ELEMENT_TYPES.DESCRIPTION, val: guessed.description }
            ];

            for (const item of mapping) {
                if (item.val) {
                    await saveSpecificSelector(platformId, hostname, item.type, item.val);
                }
            }
            return { success: true };
        } else {
            return { success: false, error: 'Could not automatically determine selectors.' };
        }
    } catch (err) {
        return { success: false, error: err.message };
    } finally {
        if (tab && tab.id) {
            chrome.tabs.remove(tab.id).catch(() => {});
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

    const fallbackDefault = {
        container: '[data-testid*="job" i], article, li, div[class*="job" i], div[class*="card" i]',
        title: 'h2, h3, a[class*="title" i], [class*="jobTitle" i], [data-testid*="title" i]',
        link: 'a[href*="job"], a[href*="career"], a'
    };
    return selectors || fallbackDefault;
}

async function calculateStorageWeight() {
    let totalBytes = 0;
    const tables = [
        db.local_vacancies,
        db.platforms_dict,
        db.selectors,
        db.personal_data,
        db.resumes,
        db.automation_jobs
    ];

    for (const table of tables) {
        try {
            const records = await table.toArray();
            const serialized = JSON.stringify(records);
            totalBytes += new Blob([serialized]).size;
        } catch (e) {}
    }

    let formatted = '0 KB';
    if (totalBytes > 1048576) {
        formatted = (totalBytes / 1048576).toFixed(2) + ' MB';
    } else {
        formatted = Math.max(1, Math.round(totalBytes / 1024)) + ' KB';
    }

    return { bytes: totalBytes, formatted: formatted };
}

async function runAutomationPipeline(config) {
    const { websites, roles, paginationLimit, fieldsMode = 'all', jobTitle = 'Job Execution' } = config;
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

            await chrome.tabs.update(tabId, { url: targetUrl });
            await waitForTabLoad(tabId);

            const collectedVacanciesForSite = [];

            for (let rIndex = 0; rIndex < roles.length; rIndex++) {
                if (!activeAutomationSession || activeAutomationSession.abort) break;

                const role = roles[rIndex];

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
                        break;
                    }
                }
            }

            if (collectedVacanciesForSite.length > 0) {
                if (fieldsMode === 'all') {
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
                } else {
                    await saveVacancies(hostname, collectedVacanciesForSite);
                }
            }
        }

        chrome.runtime.sendMessage({
            action: 'automation_completed',
            message: 'Automation completed successfully.'
        }).catch(() => {});

    } catch (err) {
        throw err;
    } finally {
        if (tabId) {
            chrome.tabs.remove(tabId).catch(() => {});
        }
        activeAutomationSession = null;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'get_background_status') {
        calculateStorageWeight().then((weightInfo) => {
            sendResponse({
                success: true,
                isRunning: Boolean(activeAutomationSession),
                activeJobTitle: activeAutomationSession ? activeAutomationSession.config?.jobTitle || 'Active Job' : null,
                storageWeight: weightInfo.formatted,
                storageBytes: weightInfo.bytes
            });
        }).catch((err) => {
            sendResponse({
                success: false,
                isRunning: Boolean(activeAutomationSession),
                error: err.message
            });
        });
        return true;
    }

    if (request.action === 'get_storage_weight') {
        calculateStorageWeight().then((weightInfo) => {
            sendResponse({ success: true, weight: weightInfo.formatted, bytes: weightInfo.bytes });
        }).catch((err) => {
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }

    if (request.action === 'get_jobs') {
        db.automation_jobs.toArray().then((jobs) => {
            sendResponse({ success: true, jobs: jobs });
        }).catch((err) => {
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }

    if (request.action === 'save_job') {
        (async () => {
            const jobData = request.job;
            if (!jobData.id) {
                jobData.id = crypto.randomUUID();
                jobData.created_at = new Date().toISOString();
                jobData.status = 'ready';
                await db.automation_jobs.add(jobData);
            } else {
                await db.automation_jobs.put(jobData);
            }
            sendResponse({ success: true, job: jobData });
        })().catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'delete_job') {
        db.automation_jobs.delete(request.id).then(() => {
            sendResponse({ success: true });
        }).catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'get_profile_data') {
        db.personal_data.toArray().then(items => {
            const profile = items.length ? items[0] : null;
            sendResponse({ success: true, profile: profile });
        }).catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'save_profile_data') {
        (async () => {
            const profileData = request.profile;
            const existing = await db.personal_data.toArray();
            if (existing.length) {
                await db.personal_data.update(existing[0].id, profileData);
            } else {
                profileData.id = crypto.randomUUID();
                profileData.profile_id = 'default';
                await db.personal_data.add(profileData);
            }
            sendResponse({ success: true });
        })().catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'update_platform_mode') {
        (async () => {
            const { platformId, mode } = request;
            await db.platforms_dict.update(platformId, { mode: mode });
            sendResponse({ success: true });
        })().catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'update_specific_selector') {
        (async () => {
            const { platformId, hostname, elementTypeId, selectorString } = request;
            await saveSpecificSelector(platformId, hostname, elementTypeId, selectorString);
            sendResponse({ success: true });
        })().catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'auto_fix_platform_selectors') {
        (async () => {
            const { platformId, hostname, url } = request;
            const res = await autoFixPlatformSelectors(platformId, hostname, url);
            sendResponse(res);
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
});

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request.action === 'get_vacancies') {
        db.local_vacancies.toArray().then(vacancies => {
            let filtered = vacancies;
            if (request.role && request.role !== 'all') {
                const targetRole = request.role.toLowerCase();
                filtered = filtered.filter(v =>
                    v.full_position_name && v.full_position_name.toLowerCase().includes(targetRole)
                );
            }
            if (request.dateRange && request.dateRange !== 'all') {
                const now = new Date().getTime();
                const days = request.dateRange === 'today' ? 1 : request.dateRange === '7days' ? 7 : 30;
                const cutoff = now - days * 86400000;
                filtered = filtered.filter(v => {
                    const t = new Date(v.created_at).getTime();
                    return !isNaN(t) && t >= cutoff;
                });
            }
            if (request.fieldsMode === 'minimum') {
                filtered = filtered.map(v => ({
                    id: v.id,
                    full_position_name: v.full_position_name,
                    url: v.url,
                    created_at: v.created_at,
                    synced: v.synced
                }));
            }
            sendResponse({ status: 'success', data: filtered });
        }).catch(error => {
            sendResponse({ status: 'error', message: error.message });
        });
        return true;
    }

    if (request.action === 'get_profile') {
        db.personal_data.toArray().then(items => {
            sendResponse({ status: 'success', data: items.length ? items[0] : null });
        }).catch(error => {
            sendResponse({ status: 'error', message: error.message });
        });
        return true;
    }

    if (request.action === 'save_profile') {
        (async () => {
            const profileData = request.profile;
            const existing = await db.personal_data.toArray();
            if (existing.length) {
                await db.personal_data.update(existing[0].id, profileData);
            } else {
                profileData.id = crypto.randomUUID();
                profileData.profile_id = 'default';
                await db.personal_data.add(profileData);
            }
            sendResponse({ status: 'success' });
        })().catch(error => {
            sendResponse({ status: 'error', message: error.message });
        });
        return true;
    }

    if (request.action === 'get_storage_weight') {
        calculateStorageWeight().then(weightInfo => {
            sendResponse({ status: 'success', data: weightInfo });
        }).catch(error => {
            sendResponse({ status: 'error', message: error.message });
        });
        return true;
    }
});
