function getSanitizedDOMSnippet() {
    const ignoreSelectors = [
        'script', 'style', 'svg', 'noscript', 'iframe', 'canvas', 'link', 'form', 'button', 'input', 'select',
        'img', 'i', '[class*="icon"]', '[class*="tooltip"]', '[class*="badge"]', '[class*="category"]',
        '[class*="categories"]', '[class*="tag"]', '[class*="highlight"]', '[class*="dropdown"]',
        '[class*="filter"]', '[class*="menu"]', '[class*="nav"]', '[class*="banner"]', '[class*="promo"]',
        '[class*="popup"]', '[class*="modal"]', '[class*="subscribe"]', '[class*="facet"]', '[class*="search-panel"]',
        'header', 'footer'
    ].join(',');

    const urlKeywords = /\/(remote-)?jobs?\/[0-9a-zA-Z_-]+|\/careers?\/|[?&](jk|jobId)=/i;
    const categoryFilter = /\/(categories|category|tags?|locations?|about|faq|login|signup|pricing)\b/i;
    const jobKeywords = /developer|engineer|manager|designer|analyst|remote|specialist|lead|programmer/i;

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

        if (score >= 4) scoredLinks.push({ el: a, score: score });
    }

    scoredLinks.sort((a, b) => b.score - a.score);

    const candidates = [];
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

        if (!candidates.includes(card)) {
            candidates.push(card);
            if (candidates.length >= 2) break;
        }
    }

    let wrapper = null;
    if (candidates.length > 0) {
        const parentTag = candidates[0].parentElement ? candidates[0].parentElement.tagName.toLowerCase() : 'div';
        wrapper = document.createElement(parentTag === 'ul' || parentTag === 'ol' ? parentTag : 'div');
        for (const card of candidates) {
            wrapper.appendChild(card.cloneNode(true));
        }
    } else {
        const fallback = document.querySelector('main, article, section, .jobs-container, #jobs') || document.body;
        wrapper = fallback.cloneNode(true);
    }

    wrapper.querySelectorAll(ignoreSelectors).forEach(el => el.remove());

    const allowedAttrs = ['class', 'id', 'data-testid', 'href'];
    const allElements = wrapper.querySelectorAll('*');
    for (const node of allElements) {
        if (node.tagName.toLowerCase() === 'a' && node.hasAttribute('href')) {
            node.setAttribute('href', node.getAttribute('href').split('?')[0]);
        }
        for (const attr of Array.from(node.attributes)) {
            if (!allowedAttrs.includes(attr.name)) {
                node.removeAttribute(attr.name);
            } else if (attr.name === 'class') {
                const stableClasses = attr.value
                    .split(/\s+/)
                    .filter(c => !/^css-[a-z0-9]+/i.test(c) && !/^[a-z][0-9]{3,}/i.test(c) && !/^(feature|boosted|highlight|hasSection)/i.test(c))
                    .join(' ');
                if (stableClasses) node.setAttribute('class', stableClasses);
                else node.removeAttribute('class');
            }
        }
    }

    const textNodes = [];
    const walk = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, null, false);
    let n;
    while (n = walk.nextNode()) textNodes.push(n);
    for (const t of textNodes) {
        const text = t.textContent.trim();
        if (!text) {
            t.textContent = '';
            continue;
        }
        t.textContent = text.length > 30 ? text.slice(0, 30) + '...' : text;
    }

    return wrapper.innerHTML.replace(/\s+/g, ' ').slice(0, 3500);
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

    const urlKeywords = /\/(remote-)?jobs?\/[0-9a-zA-Z_-]+|\/careers?\/|[?&](jk|jobId)=/i;
    const categoryFilter = /\/(categories|category|tags?|locations?|about|faq|login|signup|pricing)\b/i;
    const jobKeywords = /developer|engineer|manager|designer|analyst|remote|specialist|lead|programmer/i;

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

        if (score >= 4) scoredLinks.push({ el: a, score: score });
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

    let companySel = '';
    const companyCandidates = Array.from(c1.querySelectorAll('*')).filter(node => {
        if (node === titleEl || titleEl.contains(node) || node === linkElements[0]) return false;
        const cls = String(node.className || '');
        const id = String(node.id || '');
        const testid = node.getAttribute('data-testid') || '';
        const attrStr = `${cls} ${id} ${testid}`.toLowerCase();
        return /company|employer|hiring|org/i.test(attrStr);
    });

    if (companyCandidates.length > 0) {
        companySel = deriveOptimalSelector(companyCandidates[0], c1);
    } else {
        const fallbackTextNodes = Array.from(c1.querySelectorAll('a, span, p, div')).filter(node => {
            if (node === titleEl || titleEl.contains(node) || node.children.length > 0) return false;
            const t = node.textContent.trim();
            return t.length >= 2 && t.length <= 40;
        });
        if (fallbackTextNodes.length > 0) {
            companySel = deriveOptimalSelector(fallbackTextNodes[0], c1);
        }
    }

    return {
        container: containerSel,
        title: titleSel || linkSel,
        link: linkSel,
        company: companySel
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
            const companyEl = selectors.company ? card.querySelector(selectors.company) : null;

            if (titleEl && linkEl && linkEl.hasAttribute('href')) {
                validCount++;
                if (samples.length < 3) {
                    samples.push({
                        title: titleEl.textContent.trim(),
                        link: linkEl.getAttribute('href'),
                        company: companyEl ? companyEl.textContent.trim() : 'Unknown'
                    });
                }
            }
        } catch (err) {
            return { isValid: false, error: 'Evaluation failed inside card: ' + err.message };
        }
    }

    if (validCount / cards.length < 0.5) {
        return { isValid: false, error: 'Low match accuracy: ' + validCount + ' of ' + cards.length + ' matched.' };
    }

    return { isValid: true, count: validCount, samples };
}

window.testAiSelectors = function(responseInput) {
    let selectors;
    try {
        selectors = typeof responseInput === 'string' ? JSON.parse(responseInput) : responseInput;
    } catch (err) {
        console.error('❌ AutoOffer: JSON parse error:', err.message);
        return;
    }

    if (!selectors.container || !selectors.title || !selectors.link) {
        console.error('❌ AutoOffer: Missing required fields (container, title, link)');
        return;
    }

    let cards;
    try {
        cards = document.querySelectorAll(selectors.container);
    } catch (e) {
        console.error('❌ AutoOffer: Invalid container query selector:', selectors.container);
        return;
    }

    if (cards.length === 0) {
        console.warn('⚠️ Elements matching container selector were not found.');
        return;
    }

    const previewList = [];
    for (const card of cards) {
        const titleEl = card.querySelector(selectors.title);
        const linkEl = card.querySelector(selectors.link);
        const companyEl = selectors.company ? card.querySelector(selectors.company) : null;

        if (titleEl && linkEl) {
            const rawUrl = linkEl.getAttribute('href') || '';
            const absoluteUrl = rawUrl ? new URL(rawUrl, window.location.origin).href : 'No link';
            previewList.push({
                'Position': titleEl.textContent.trim(),
                'Company': companyEl ? companyEl.textContent.trim() : 'Not found',
                'Link': absoluteUrl
            });
            if (previewList.length === 3) break;
        }
    }

    if (previewList.length === 0) {
        console.error('❌ Containers were found, but title or link selectors failed within them:', {
            title: selectors.title,
            link: selectors.link
        });
        return;
    }

    console.log(`✅ Matches found: ${cards.length}. Sample preview:\n` +
        JSON.stringify(previewList, null, 2) +
        '\n💡 To persist run: window.applyAiSelectors(' + JSON.stringify(selectors) + ')');
};

window.applyAiSelectors = function(responseInput) {
    let selectors;
    try {
        selectors = typeof responseInput === 'string' ? JSON.parse(responseInput) : responseInput;
    } catch (err) {
        console.error('AutoOffer: Invalid JSON provided.', err);
        return;
    }

    const validation = validateSelectors(selectors);
    if (!validation.isValid) {
        console.error('AutoOffer: Validation failed:', validation.error);
        return;
    }

    chrome.runtime.sendMessage({
        action: 'save_platform_selectors',
        hostname: window.location.hostname,
        selectors: selectors
    }, (res) => {
        if (res && res.success) {
            console.log('AutoOffer: Selectors validated and saved. Scraping initialized.');
            executeParsing(selectors);
        } else {
            console.error('AutoOffer: Failed to persist selectors:', res ? res.error : 'No response');
        }
    });
};

function executeParsing(selectors) {
    const cards = document.querySelectorAll(selectors.container);
    if (!cards.length) return;

    const items = [];
    for (const card of cards) {
        const titleEl = card.querySelector(selectors.title);
        const linkEl = card.querySelector(selectors.link);
        const companyEl = selectors.company ? card.querySelector(selectors.company) : null;

        if (!titleEl || !linkEl) continue;

        const rawUrl = linkEl.getAttribute('href');
        if (!rawUrl) continue;

        items.push({
            fullPositionName: titleEl.textContent.trim(),
            url: new URL(rawUrl, window.location.origin).href,
            companyName: companyEl ? companyEl.textContent.trim() : 'Unknown Company'
        });
    }

    if (!items.length) return;

    chrome.runtime.sendMessage({
        action: 'save_scraped_vacancies',
        hostname: window.location.hostname,
        vacancies: items
    }, (res) => {
        if (res && res.success) {
            console.log('AutoOffer: Extracted and sent ' + items.length + ' vacancies to background.');
        }
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'auto_detect_selectors') {
        const snippet = getSanitizedDOMSnippet();
        const singleLogOutput = [
            '=== AUTOOFFER AI PROMPT ===',
            'Analyze this HTML snippet of a job listing page (' + window.location.hostname + ').',
            'Identify CSS selectors for:',
            '1. container: job card container',
            '2. title: job title inside container',
            '3. link: job URL link inside container',
            '4. company: company name inside container',
            '',
            'Return ONLY JSON format:',
            '{',
            '  "container": "...",',
            '  "title": "...",',
            '  "link": "...",',
            '  "company": "..."',
            '}',
            '',
            'HTML Snippet:',
            snippet,
            '=== END PROMPT ===',
            'To test run: window.testAiSelectors({"container": "...", "title": "...", "link": "...", "company": "..."})',
            'To apply run: window.applyAiSelectors({"container": "...", "title": "...", "link": "...", "company": "..."})'
        ].join('\n');

        console.log(singleLogOutput);
        sendResponse({ success: true, message: 'Prompt output printed to console.' });
        return true;
    }

    if (request.action === 'auto_guess_selectors') {
        const guessed = guessSelectorsHeuristically();
        if (!guessed) {
            console.warn('⚠️ AutoOffer: Heuristic detection could not find repeated job cards on this page.');
            sendResponse({ success: false, message: 'Could not detect job listings automatically.' });
            return true;
        }

        console.log('=== AUTOOFFER HEURISTIC GUESS ===');
        console.log('Guessed selectors:', guessed);
        window.testAiSelectors(guessed);
        sendResponse({ success: true, message: 'Selectors guessed and tested in console.' });
        return true;
    }

    if (request.action === 'run_task_with_selectors') {
        if (!request.selectors) {
            sendResponse({ success: false, error: 'No selectors provided for this platform.' });
            return true;
        }
        try {
            executeParsing(request.selectors);
            sendResponse({ success: true });
        } catch (err) {
            sendResponse({ success: false, error: err.message });
        }
        return true;
    }
});