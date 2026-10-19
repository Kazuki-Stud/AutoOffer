function getSanitizedDOMSnippet() {
    const ignoreSelectors = [
        'script', 'style', 'svg', 'noscript', 'iframe', 'canvas', 'link', 'form', 'button', 'input', 'select',
        'img', 'i', '[class*="icon"]', '[class*="tooltip"]', '[class*="badge"]', '[class*="category"]',
        '[class*="categories"]', '[class*="tag"]', '[class*="highlight"]', '[class*="dropdown"]',
        '[class*="filter"]', '[class*="menu"]', '[class*="nav"]', '[class*="banner"]', '[class*="promo"]',
        '[class*="popup"]', '[class*="modal"]', '[class*="subscribe"]', '[class*="facet"]', '[class*="search-panel"]',
        'header', 'footer'
    ].join(',');

    const urlKeywords = /\/jobs?\/[0-9a-zA-Z_-]+|\/careers?\/|[?&](jk|jobId)=/i;
    const jobKeywords = /developer|engineer|manager|designer|analyst|remote|specialist|lead|programmer/i;

    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    const scoredLinks = [];

    for (const a of allLinks) {
        if (a.closest(ignoreSelectors)) continue;
        const href = a.getAttribute('href') || '';
        const text = a.textContent.trim();
        if (text.length < 3 || text.length > 100) continue;

        let score = 0;
        if (urlKeywords.test(href)) score += 3;
        if (jobKeywords.test(text)) score += 3;
        if (a.closest('h1, h2, h3, h4, strong')) score += 2;
        if (/[0-9]{4,}/.test(href)) score += 2;

        if (score >= 3) scoredLinks.push({ el: a, score: score });
    }

    scoredLinks.sort((a, b) => b.score - a.score);

    const candidates = [];
    for (const item of scoredLinks) {
        let card = item.el.parentElement;
        while (card && card !== document.body) {
            const tag = card.tagName.toLowerCase();
            const cls = card.className || '';
            if (tag === 'li' || tag === 'article' || tag === 'tr' || /card|item|job|listing|result/i.test(cls)) {
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

    if (!candidates.length) return '';

    const parentTag = candidates[0].parentElement ? candidates[0].parentElement.tagName.toLowerCase() : 'div';
    const wrapper = document.createElement(parentTag === 'ul' || parentTag === 'ol' ? parentTag : 'div');

    for (const card of candidates) {
        const cardClone = card.cloneNode(true);
        cardClone.querySelectorAll(ignoreSelectors).forEach(el => el.remove());

        const allowedAttrs = ['class', 'id', 'data-testid', 'href'];
        const allElements = cardClone.querySelectorAll('*');
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
        const walk = document.createTreeWalker(cardClone, NodeFilter.SHOW_TEXT, null, false);
        let n;
        while (n = walk.nextNode()) textNodes.push(n);
        for (const t of textNodes) {
            const text = t.textContent.trim();
            if (!text) {
                t.textContent = '';
                continue;
            }
            t.textContent = text.length > 25 ? text.slice(0, 25) + '...' : text;
        }

        wrapper.appendChild(cardClone);
    }

    return wrapper.innerHTML.replace(/\s+/g, ' ').slice(0, 3000);
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
        console.error('❌ AutoOffer: Ошибка разбора JSON:', err.message);
        return;
    }

    if (!selectors.container || !selectors.title || !selectors.link) {
        console.error('❌ AutoOffer: Не хватает обязательных полей (container, title, link)');
        return;
    }

    const cards = document.querySelectorAll(selectors.container);
    if (cards.length === 0) {
        console.warn('⚠️ Элементы по данному контейнеру не найдены.');
        return;
    }

    const previewList = [];
    for (const card of cards) {
        const titleEl = card.querySelector(selectors.title);
        const linkEl = card.querySelector(selectors.link);
        const companyEl = selectors.company ? card.querySelector(selectors.company) : null;

        if (titleEl && linkEl) {
            const rawUrl = linkEl.getAttribute('href') || '';
            const absoluteUrl = rawUrl ? new URL(rawUrl, window.location.origin).href : 'Нет ссылки';
            previewList.push({
                'Должность': titleEl.textContent.trim(),
                'Компания': companyEl ? companyEl.textContent.trim() : 'Не указана',
                'Ссылка': absoluteUrl
            });
            if (previewList.length === 3) break;
        }
    }

    if (previewList.length === 0) {
        console.error('❌ Контейнеры найдены, но внутри них не удалось найти заголовок или ссылку по селекторам:', {
            title: selectors.title,
            link: selectors.link
        });
        return;
    }

    console.log(`✅ Найдено карточек: ${cards.length}. Первые 3 вакансии:\n` +
        JSON.stringify(previewList, null, 2) +
        '\n💡 Для сохранения выполните: window.applyAiSelectors(...)');
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