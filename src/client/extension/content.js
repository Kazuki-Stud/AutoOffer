function waitForPageReady() {
    return new Promise((resolve) => {
        if (document.readyState === 'complete') {
            resolve();
        } else {
            window.addEventListener('load', () => resolve(), { once: true });
        }
    });
}

function observeDomMutation(targetNode = document.body) {
    return new Promise((resolve) => {
        const observer = new MutationObserver((mutations, obs) => {
            obs.disconnect();
            resolve();
        });
        observer.observe(targetNode, { childList: true, subtree: true });
    });
}

function deriveOptimalSelector(el, scope) {
    if (!el || el === scope) return '';
    if (el.id && !/[0-9]{4,}/.test(el.id)) return '#' + CSS.escape(el.id);
    const testId = el.getAttribute('data-testid');
    if (testId) return `[data-testid="${testId}"]`;

    const tag = el.tagName.toLowerCase();
    const validClasses = Array.from(el.classList).filter(c =>
        !/^css-[a-z0-9]+/i.test(c) &&
        !/^[a-z][0-9]{3,}/i.test(c) &&
        !/active|hover|focus|selected|boosted|feature|paid/i.test(c)
    );

    if (validClasses.length > 0) {
        return tag + '.' + CSS.escape(validClasses[0]);
    }

    if (scope && scope.contains(el)) {
        let parent = el.parentElement;
        if (parent && parent !== scope) {
            const parentSel = deriveOptimalSelector(parent, scope);
            return parentSel ? `${parentSel} > ${tag}` : tag;
        }
    }
    return tag;
}

function guessSelectorsHeuristically() {
    const ignoreSelectors = [
        'script', 'style', 'svg', 'noscript', 'iframe', 'canvas', 'link', 'form', 'button', 'input', 'select',
        '[class*="dropdown"]', '[class*="filter"]', '[class*="menu"]', '[class*="nav"]', '[class*="banner"]',
        '[class*="promo"]', '[class*="popup"]', '[class*="modal"]', '[class*="subscribe"]', '[class*="facet"]'
    ].join(',');

    const urlKeywords = /\/(remote-)?jobs?\/[0-9a-zA-Z_-]+|\/careers?\/|[?&](jk|jobId|job_id)=/i;
    const categoryFilter = /\/(categories|category|tags?|locations?|about|faq|login|signup|pricing)\b/i;
    const jobKeywords = /developer|engineer|manager|designer|analyst|remote|specialist|lead|programmer|java|python|react/i;

    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    const scoredLinks = [];

    for (const a of allLinks) {
        if (a.closest(ignoreSelectors)) continue;
        const href = a.getAttribute('href') || '';
        if (categoryFilter.test(href)) continue;

        const text = a.textContent.trim();
        let score = 0;

        if (urlKeywords.test(href)) score += 5;
        if (jobKeywords.test(text) || jobKeywords.test(href)) score += 3;
        if (a.closest('h1, h2, h3, h4, strong') || a.querySelector('h1, h2, h3, h4, strong')) score += 2;
        if (/[0-9]{4,}/.test(href)) score += 2;

        if (score >= 2) scoredLinks.push({ el: a, score: score });
    }

    scoredLinks.sort((a, b) => b.score - a.score);
    if (scoredLinks.length < 2) return null;

    const cards = [];
    const linkElements = [];
    for (const item of scoredLinks) {
        let card = item.el.parentElement;
        while (card && card !== document.body) {
            const tag = card.tagName.toLowerCase();
            const cls = card.className || '';
            if (tag === 'li' || tag === 'article' || tag === 'tr' || /card|item|listing|result|job/i.test(cls)) {
                break;
            }
            card = card.parentElement;
        }
        if (!card || card === document.body) card = item.el.parentElement;

        if (!cards.includes(card)) {
            cards.push(card);
            linkElements.push(item.el);
            if (cards.length >= 2) break;
        }
    }

    if (cards.length < 2) return null;

    let containerSel = '';
    const c1 = cards[0];
    const c2 = cards[1];

    if (c1.tagName === c2.tagName) {
        const sharedClasses = Array.from(c1.classList).filter(c =>
            c2.classList.contains(c) &&
            !/^css-[a-z0-9]+/i.test(c) &&
            !/^[a-z][0-9]{3,}/i.test(c) &&
            !/active|hover|focus|selected|boosted|feature/i.test(c)
        );
        const tag = c1.tagName.toLowerCase();
        if (sharedClasses.length > 0) {
            containerSel = `${tag}.${CSS.escape(sharedClasses[0])}`;
        } else if (c1.parentElement && c1.parentElement === c2.parentElement) {
            const p = c1.parentElement;
            const pClasses = Array.from(p.classList).filter(c => !/^css-[a-z0-9]+/i.test(c));
            const pSel = pClasses.length > 0 ? `${p.tagName.toLowerCase()}.${CSS.escape(pClasses[0])}` : p.tagName.toLowerCase();
            containerSel = `${pSel} > ${tag}`;
        } else {
            containerSel = tag;
        }
    } else {
        containerSel = deriveOptimalSelector(c1, document.body);
    }

    let testMatches = document.querySelectorAll(containerSel);
    if (testMatches.length < 2) {
        containerSel = `${c1.tagName.toLowerCase()}`;
    }

    const titleEl = linkElements[0].querySelector('h1, h2, h3, h4, span') || linkElements[0].closest('h1, h2, h3, h4') || linkElements[0];
    const titleSel = deriveOptimalSelector(titleEl, c1);
    const linkSel = deriveOptimalSelector(linkElements[0], c1);

    const searchInputEl = document.querySelector('input#q, input[name="q"], input#search-job-keyword, input[name="search"], input[type="search"], input[name*="search" i], input[placeholder*="Keywords" i], input[type="text"]');
    const searchInputSel = searchInputEl ? deriveOptimalSelector(searchInputEl, document.body) : 'input[type="text"]';

    return {
        container: containerSel,
        title: titleSel || linkSel,
        link: linkSel,
        searchInput: searchInputSel,
        pagination: '',
        description: 'main, article, [class*="description"], [id*="job-description"]'
    };
}

function validateSelectors(selectors) {
    if (!selectors || !selectors.container || !selectors.title || !selectors.link) {
        return { isValid: false, error: 'Missing required selector properties: container, title, or link.' };
    }

    let cards;
    try {
        cards = document.querySelectorAll(selectors.container);
    } catch (err) {
        return { isValid: false, error: 'Container selector syntax error: ' + err.message };
    }

    if (cards.length < 2) {
        return { isValid: false, error: 'Found ' + cards.length + ' elements. At least 2 required.' };
    }

    let validCount = 0;
    const samples = [];

    for (const card of cards) {
        try {
            const titleEl = card.querySelector(selectors.title);
            const linkEl = card.querySelector(selectors.link);

            if (titleEl && linkEl && linkEl.hasAttribute('href')) {
                validCount++;
                if (samples.length < 3) {
                    samples.push({
                        title: titleEl.textContent.trim(),
                        link: linkEl.getAttribute('href')
                    });
                }
            }
        } catch (err) {
            return { isValid: false, error: 'Evaluation failed inside card: ' + err.message };
        }
    }

    if (validCount / cards.length < 0.4) {
        return { isValid: false, error: 'Low match accuracy: ' + validCount + ' of ' + cards.length + ' matched.' };
    }

    return { isValid: true, count: validCount, samples };
}

function extractCardsData(selectors) {
    const cards = document.querySelectorAll(selectors.container);
    const items = [];
    for (const card of cards) {
        const titleEl = card.querySelector(selectors.title);
        const linkEl = card.querySelector(selectors.link);

        if (!titleEl || !linkEl) continue;

        const rawUrl = linkEl.getAttribute('href');
        if (!rawUrl) continue;

        items.push({
            fullPositionName: titleEl.textContent.trim(),
            url: new URL(rawUrl, window.location.origin).href
        });
    }
    return items;
}

function executePagination(explicitSelector) {
    if (explicitSelector) {
        const target = document.querySelector(explicitSelector);
        if (target && target.offsetParent !== null && !target.hasAttribute('disabled')) {
            const mutationPromise = observeDomMutation(document.body);
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.click();
            return { advanced: true, method: 'explicit_selector', promise: mutationPromise };
        }
    }

    const loadMoreQueries = [
        'button[data-testid*="load-more"]',
        'button[class*="loadMore" i]',
        'button[class*="load-more" i]',
        'button[class*="showMore" i]',
        'button[class*="show-more" i]',
        'a[class*="load-more" i]',
        'button[id*="loadMore" i]'
    ];

    for (const query of loadMoreQueries) {
        const btn = document.querySelector(query);
        if (btn && btn.offsetParent !== null && !btn.hasAttribute('disabled')) {
            const mutationPromise = observeDomMutation(document.body);
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            btn.click();
            return { advanced: true, method: 'load_more_button', promise: mutationPromise };
        }
    }

    const nextNavQueries = [
        'a[rel="next"]',
        'a[aria-label*="Next" i]',
        'button[aria-label*="Next" i]',
        '[data-testid*="pagination-page-next"]',
        '[class*="pagination"] a[class*="next" i]',
        '[class*="pagination"] button[class*="next" i]',
        'li.next a',
        'a.next'
    ];

    for (const query of nextNavQueries) {
        const nextEl = document.querySelector(query);
        if (nextEl && nextEl.offsetParent !== null && !nextEl.hasAttribute('disabled') && !nextEl.getAttribute('aria-disabled')) {
            const mutationPromise = observeDomMutation(document.body);
            nextEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            nextEl.click();
            return { advanced: true, method: 'next_page_link', promise: mutationPromise };
        }
    }

    return { advanced: false, method: 'none', promise: Promise.resolve() };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'detect_page_selectors_for_registration') {
        const inputEl = document.querySelector('input#q, input[name="q"], input#search-job-keyword, input[name="search"], input[type="search"], input[name*="search" i], input[placeholder*="Keywords" i], input[type="text"]');
        const sel = inputEl ? deriveOptimalSelector(inputEl, document.body) : '';
        sendResponse({
            detected: {
                searchInput: sel
            }
        });
        return true;
    }

    if (request.action === 'validate_selectors') {
        const result = validateSelectors(request.selectors);
        sendResponse(result);
        return true;
    }

    if (request.action === 'auto_guess_selectors_internal') {
        const guessed = guessSelectorsHeuristically();
        sendResponse({ success: !!guessed, selectors: guessed });
        return true;
    }

    if (request.action === 'execute_search_input') {
        waitForPageReady().then(() => {
            const role = request.role;
            const sel = request.selectors || {};

            const inputSelectors = [
                sel.searchInput,
                'input#q',
                'input[name="q"]',
                'input#search-job-keyword',
                'input[name="search"]',
                'input[type="search"]',
                'input[name*="search" i]',
                'input[placeholder*="Keywords" i]',
                'input[placeholder*="job" i]',
                'input[placeholder*="title" i]',
                'input[type="text"]'
            ].filter(Boolean);

            let inputEl = null;
            let matchedSelector = '';
            for (const selector of inputSelectors) {
                const found = document.querySelector(selector);
                if (found && found.offsetParent !== null) {
                    inputEl = found;
                    matchedSelector = selector;
                    break;
                }
            }

            if (!inputEl) {
                sendResponse({ success: false, triggered: false, error: 'Search input not found.' });
                return;
            }

            inputEl.focus();
            inputEl.value = '';
            inputEl.value = role;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));

            let submitBtn = null;
            if (sel.searchButton) {
                submitBtn = document.querySelector(sel.searchButton);
            }

            if (!submitBtn && inputEl.form) {
                submitBtn = inputEl.form.querySelector('.siteSearch-submit button, button[type="submit"], input[type="submit"], button.btn-success, button:not([type="button"])');
            }

            if (!submitBtn) {
                submitBtn = document.querySelector('.siteSearch-submit button, button[type="submit"], input[type="submit"], button[class*="search" i], button[aria-label*="search" i]');
            }

            sendResponse({ success: true, triggered: true, searchInput: matchedSelector });

            queueMicrotask(() => {
                if (submitBtn) {
                    submitBtn.click();
                } else if (inputEl.form) {
                    if (typeof inputEl.form.requestSubmit === 'function') {
                        inputEl.form.requestSubmit();
                    } else {
                        inputEl.form.submit();
                    }
                } else {
                    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                    inputEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
                }
            });
        });
        return true;
    }

    if (request.action === 'extract_listing_vacancies') {
        const items = extractCardsData(request.selectors);
        sendResponse({ vacancies: items });
        return true;
    }

    if (request.action === 'advance_pagination') {
        const sel = request.selectors || {};
        const outcome = executePagination(sel.pagination);
        sendResponse({ advanced: outcome.advanced, method: outcome.method });
        return true;
    }

    if (request.action === 'extract_detail_description') {
        const candidateSelectors = [
            '#job-description',
            '.job-description',
            '[data-testid="jobDescriptionText"]',
            'main article',
            'article',
            'main'
        ];

        let content = '';
        for (const s of candidateSelectors) {
            const el = document.querySelector(s);
            if (el && el.innerText.trim().length > 100) {
                content = el.innerText.trim();
                break;
            }
        }
        if (!content && document.body) {
            content = document.body.innerText.trim().slice(0, 5000);
        }
        sendResponse({ description: content });
        return true;
    }

    if (request.action === 'auto_guess_selectors') {
        const guessed = guessSelectorsHeuristically();
        if (!guessed) {
            sendResponse({ success: false, message: 'Could not detect job listings.' });
            return true;
        }
        sendResponse({ success: true, message: 'Selectors guessed successfully.' });
        return true;
    }

    if (request.action === 'run_task_with_selectors') {
        if (!request.selectors) {
            sendResponse({ success: false, error: 'No selectors provided.' });
            return true;
        }
        try {
            const items = extractCardsData(request.selectors);
            if (items.length) {
                chrome.runtime.sendMessage({
                    action: 'save_scraped_vacancies',
                    hostname: window.location.hostname,
                    vacancies: items
                });
            }
            sendResponse({ success: true });
        } catch (err) {
            sendResponse({ success: false, error: err.message });
        }
        return true;
    }
});