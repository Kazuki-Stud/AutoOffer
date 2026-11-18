function waitForPageReady() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', () => resolve(), { once: true });
  });
}

function observeDomMutationWithTimeout(targetNode = document.body, timeoutMs = 2000) {
  return new Promise((resolve) => {
    if (!targetNode) return resolve(false);
    let done = false;
    let timer = null;
    const observer = new MutationObserver(() => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      observer.disconnect();
      resolve(true);
    });
    observer.observe(targetNode, { childList: true, subtree: true });
    timer = setTimeout(() => {
      if (done) return;
      done = true;
      observer.disconnect();
      resolve(false);
    }, timeoutMs);
  });
}

function deriveOptimalSelector(el, scope) {
  if (!el || el === scope) return '';
  if (el.id && !/[0-9]{4,}/.test(el.id)) return '#' + CSS.escape(el.id);
  const testId = el.getAttribute('data-testid');
  if (testId) return `[data-testid="${testId}"]`;

  const tag = el.tagName.toLowerCase();
  const validClasses = Array.from(el.classList).filter((c) =>
      !/^css-[a-z0-9]+/i.test(c) &&
      !/^[a-z][0-9]{3,}/i.test(c) &&
      !/active|hover|focus|selected|boosted|feature|paid/i.test(c)
  );
  if (validClasses.length > 0) return tag + '.' + CSS.escape(validClasses[0]);

  if (scope && scope.contains(el)) {
    const parent = el.parentElement;
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

  const scoredLinks = [];
  for (const a of document.querySelectorAll('a[href]')) {
    if (a.closest(ignoreSelectors)) continue;
    const href = a.getAttribute('href') || '';
    if (categoryFilter.test(href)) continue;
    const text = a.textContent.trim();
    let score = 0;
    if (urlKeywords.test(href)) score += 5;
    if (jobKeywords.test(text) || jobKeywords.test(href)) score += 3;
    if (a.closest('h1, h2, h3, h4, strong') || a.querySelector('h1, h2, h3, h4, strong')) score += 2;
    if (/[0-9]{4,}/.test(href)) score += 2;
    if (score >= 2) scoredLinks.push({ el: a, score });
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
      if (tag === 'li' || tag === 'article' || tag === 'tr' || /card|item|listing|result|job/i.test(cls)) break;
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
  const [c1, c2] = cards;
  if (c1.tagName === c2.tagName) {
    const sharedClasses = Array.from(c1.classList).filter((c) =>
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
      const pClasses = Array.from(p.classList).filter((c) => !/^css-[a-z0-9]+/i.test(c));
      const pSel = pClasses.length > 0 ? `${p.tagName.toLowerCase()}.${CSS.escape(pClasses[0])}` : p.tagName.toLowerCase();
      containerSel = `${pSel} > ${tag}`;
    } else {
      containerSel = tag;
    }
  } else {
    containerSel = deriveOptimalSelector(c1, document.body);
  }

  if (document.querySelectorAll(containerSel).length < 2) containerSel = c1.tagName.toLowerCase();

  const titleEl = linkElements[0].querySelector('h1, h2, h3, h4, span') || linkElements[0].closest('h1, h2, h3, h4') || linkElements[0];
  const titleSel = deriveOptimalSelector(titleEl, c1);
  const linkSel = deriveOptimalSelector(linkElements[0], c1);
  const searchInputEl = document.querySelector('input#q, input[name="q"], input#search-job-keyword, input[name="search"], input[type="search"], input[name*="search" i], input[placeholder*="Keywords" i], input[type="text"]');

  return {
    container: containerSel,
    title: titleSel || linkSel,
    link: linkSel,
    searchInput: searchInputEl ? deriveOptimalSelector(searchInputEl, document.body) : 'input[type="text"]',
    pagination: '',
    description: 'main, article, [class*="description"], [id*="job-description"]',
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
  if (cards.length < 2) return { isValid: false, error: 'Found ' + cards.length + ' elements. At least 2 required.' };

  let validCount = 0;
  const samples = [];
  for (const card of cards) {
    try {
      const titleEl = card.querySelector(selectors.title);
      const linkEl = card.querySelector(selectors.link);
      if (titleEl && linkEl && linkEl.hasAttribute('href')) {
        validCount++;
        if (samples.length < 3) samples.push({ title: titleEl.textContent.trim(), link: linkEl.getAttribute('href') });
      }
    } catch (err) {
      return { isValid: false, error: 'Evaluation failed inside card: ' + err.message };
    }
  }
  if (validCount / cards.length < 0.4) return { isValid: false, error: 'Low match accuracy: ' + validCount + ' of ' + cards.length + ' matched.' };
  return { isValid: true, count: validCount, samples };
}

function extractCardsData(selectors) {
  const items = [];
  for (const card of document.querySelectorAll(selectors.container)) {
    const titleEl = card.querySelector(selectors.title);
    const linkEl = card.querySelector(selectors.link);
    if (!titleEl || !linkEl) continue;
    const rawUrl = linkEl.getAttribute('href');
    if (!rawUrl) continue;
    items.push({
      fullPositionName: titleEl.textContent.trim(),
      url: new URL(rawUrl, window.location.origin).href,
      cardText: (card.innerText || '').trim(),
    });
  }
  return items;
}

async function executePagination(explicitSelector) {
  let target = null;
  let method = 'none';

  if (explicitSelector) {
    const el = document.querySelector(explicitSelector);
    if (el && el.offsetParent !== null && !el.hasAttribute('disabled')) {
      target = el;
      method = 'explicit_selector';
    }
  }

  if (!target) {
    const loadMoreQueries = [
      'button[data-testid*="load-more"]', 'button[class*="loadMore" i]', 'button[class*="load-more" i]',
      'button[class*="showMore" i]', 'button[class*="show-more" i]', 'a[class*="load-more" i]', 'button[id*="loadMore" i]'
    ];
    for (const q of loadMoreQueries) {
      const btn = document.querySelector(q);
      if (btn && btn.offsetParent !== null && !btn.hasAttribute('disabled')) {
        target = btn;
        method = 'load_more_button';
        break;
      }
    }
  }

  if (!target) {
    const nextNavQueries = [
      'a[rel="next"]', 'a[aria-label*="Next" i]', 'button[aria-label*="Next" i]',
      '[data-testid*="pagination-page-next"]', '[class*="pagination"] a[class*="next" i]',
      '[class*="pagination"] button[class*="next" i]', 'li.next a', 'a.next'
    ];
    for (const q of nextNavQueries) {
      const nextEl = document.querySelector(q);
      if (nextEl && nextEl.offsetParent !== null && !nextEl.hasAttribute('disabled') && !nextEl.getAttribute('aria-disabled')) {
        target = nextEl;
        method = 'next_page_link';
        break;
      }
    }
  }

  if (!target) return { advanced: false, domMutated: false, method: 'none' };

  const mutationPromise = observeDomMutationWithTimeout(document.body, 2500);
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.click();
  const domMutated = await mutationPromise;
  return { advanced: true, domMutated, method };
}

// US 3.1 / 3.4 / 3.5: React/Vue-safe native value setter + field highlight + captcha check
function setNativeInputValue(el, value) {
  const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.style.outline = '2px solid #2563eb';
  el.style.outlineOffset = '2px';
}

function detectCaptcha(customSelector) {
  const queries = [
    customSelector,
    'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', 'iframe[src*="turnstile"]',
    '[class*="g-recaptcha"]', '[class*="h-captcha"]', '[data-sitekey]'
  ].filter(Boolean);
  for (const q of queries) {
    const el = document.querySelector(q);
    if (el && el.offsetParent !== null) return true;
  }
  return false;
}

function findInputByKeywords(keywords) {
  const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]), textarea'));
  for (const el of inputs) {
    if (el.offsetParent === null || el.disabled || el.readOnly) continue;
    const labelEl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label');
    const haystack = [
      el.name, el.id, el.placeholder, el.getAttribute('aria-label'),
      el.getAttribute('autocomplete'), labelEl?.textContent
    ].filter(Boolean).join(' ').toLowerCase();
    if (keywords.some((kw) => haystack.includes(kw))) return el;
  }
  return null;
}

function autofillApplicationForm({ profile = {}, coverLetter = '', selectors = {} }) {
  if (detectCaptcha(selectors.captcha)) {
    return { success: false, captchaDetected: true, filled: [], error: 'Captcha detected; user action required.' };
  }

  const mappings = [
    ['first_name',   selectors.form_first_name,   profile.first_name,   ['first name', 'firstname', 'given-name', 'fname']],
    ['last_name',    selectors.form_last_name,    profile.last_name,    ['last name', 'lastname', 'family-name', 'lname', 'surname']],
    ['email',        selectors.form_email,        profile.email,        ['email', 'e-mail']],
    ['phone',        selectors.form_phone,        profile.phone,        ['phone', 'tel', 'mobile']],
    ['location',     selectors.form_location,     profile.location,     ['location', 'city', 'address']],
    ['website',      selectors.form_website,      profile.website,      ['website', 'portfolio', 'personal site']],
    ['github',       selectors.form_github,       profile.github,       ['github']],
    ['linkedin',     selectors.form_linkedin,     profile.linkedin,     ['linkedin']],
    ['telegram',     selectors.form_telegram,     profile.telegram,     ['telegram']],
    ['cover_letter', selectors.form_cover_letter, coverLetter,          ['cover letter', 'cover_letter', 'motivation', 'summary']],
  ];

  const filled = [];
  for (const [field, explicitSel, value, keywords] of mappings) {
    if (!value) continue;
    let el = explicitSel ? document.querySelector(explicitSel) : null;
    if (!el) el = findInputByKeywords(keywords);
    if (el && el.offsetParent !== null) {
      setNativeInputValue(el, value);
      filled.push(field);
    }
  }
  return { success: true, captchaDetected: false, filled };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'detect_page_selectors_for_registration') {
    const inputEl = document.querySelector('input#q, input[name="q"], input#search-job-keyword, input[name="search"], input[type="search"], input[name*="search" i], input[placeholder*="Keywords" i], input[type="text"]');
    sendResponse({ detected: { searchInput: inputEl ? deriveOptimalSelector(inputEl, document.body) : '' } });
    return true;
  }

  if (request.action === 'validate_selectors') {
    sendResponse(validateSelectors(request.selectors));
    return true;
  }

  if (request.action === 'auto_guess_selectors_internal') {
    const guessed = guessSelectorsHeuristically();
    sendResponse({ success: !!guessed, selectors: guessed });
    return true;
  }

  if (request.action === 'execute_search_input') {
    waitForPageReady().then(async () => {
      const role = request.role;
      const sel = request.selectors || {};
      const inputSelectors = [
        sel.searchInput, 'input#q', 'input[name="q"]', 'input#search-job-keyword',
        'input[name="search"]', 'input[type="search"]', 'input[name*="search" i]',
        'input[placeholder*="Keywords" i]', 'input[placeholder*="job" i]', 'input[placeholder*="title" i]', 'input[type="text"]'
      ].filter(Boolean);

      let inputEl = null;
      let matchedSelector = '';
      for (const s of inputSelectors) {
        const found = document.querySelector(s);
        if (found && found.offsetParent !== null) { inputEl = found; matchedSelector = s; break; }
      }
      if (!inputEl) {
        sendResponse({ success: false, triggered: false, domMutated: true, error: 'Search input not found.' });
        return;
      }

      inputEl.focus();
      setNativeInputValue(inputEl, role);
      inputEl.style.outline = '';

      let submitBtn = sel.searchButton ? document.querySelector(sel.searchButton) : null;
      if (!submitBtn && inputEl.form) {
        submitBtn = inputEl.form.querySelector('.siteSearch-submit button, button[type="submit"], input[type="submit"], button.btn-success, button:not([type="button"])');
      }
      if (!submitBtn) {
        submitBtn = document.querySelector('.siteSearch-submit button, button[type="submit"], input[type="submit"], button[class*="search" i], button[aria-label*="search" i]');
      }

      const mutationPromise = observeDomMutationWithTimeout(document.body, 2000);
      if (submitBtn) submitBtn.click();
      else if (inputEl.form) {
        if (typeof inputEl.form.requestSubmit === 'function') inputEl.form.requestSubmit();
        else inputEl.form.submit();
      } else {
        inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        inputEl.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
      }

      const domMutated = await mutationPromise;
      sendResponse({ success: true, triggered: true, domMutated: true, mutated: domMutated, searchInput: matchedSelector });
    });
    return true;
  }

  if (request.action === 'extract_listing_vacancies') {
    sendResponse({ vacancies: extractCardsData(request.selectors) });
    return true;
  }

  if (request.action === 'advance_pagination') {
    executePagination((request.selectors || {}).pagination).then(sendResponse);
    return true;
  }

  if (request.action === 'extract_detail_description') {
    const candidateSelectors = [
      request.descriptionSelector,
      '#jobDescriptionText',
      '#job-description',
      '.job-description',
      '[data-testid="jobDescriptionText"]',
      'main article',
      'article',
      'main'
    ].filter(Boolean);

    let content = '';
    for (const s of candidateSelectors) {
      const el = document.querySelector(s);
      if (el && el.innerText.trim().length > 100) {
        content = el.innerText.trim();
        break;
      }
    }
    if (!content && document.body) content = document.body.innerText.trim().slice(0, 5000);
    sendResponse({ description: content });
    return true;
  }

  if (request.action === 'autofill_application_form') {
    sendResponse(autofillApplicationForm(request));
    return true;
  }

  if (request.action === 'auto_guess_selectors') {
    const guessed = guessSelectorsHeuristically();
    sendResponse({ success: !!guessed, message: guessed ? 'Selectors guessed successfully.' : 'Could not detect job listings.' });
    return true;
  }

  if (request.action === 'run_task_with_selectors') {
    if (!request.selectors) { sendResponse({ success: false, error: 'No selectors provided.' }); return true; }
    try {
      const items = extractCardsData(request.selectors);
      if (items.length) {
        chrome.runtime.sendMessage({ action: 'save_scraped_vacancies', hostname: window.location.hostname, vacancies: items });
      }
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }
});