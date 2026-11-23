function waitForPageReady() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', () => resolve(), { once: true });
  });
}

function observeDomMutationWithTimeout(targetNode = document.body, timeoutMs = 100) {
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

// Auto-pairing handshake with AutoOffer PWA pages (only shares extensionId, never personal data)
(function initPwaDiscoveryBridge() {
  const isAutoOfferPwa = Boolean(document.querySelector('meta[name="autooffer-pwa"]'));
  if (!isAutoOfferPwa) return;

  const announceExtension = () => {
    try {
      window.postMessage(
          { type: 'AUTOOFFER_EXTENSION_AVAILABLE', extensionId: chrome.runtime.id },
          window.location.origin
      );
    } catch {}
  };

  announceExtension();
  window.addEventListener('message', (event) => {
      if (event.source === window && event.data?.type === 'AUTOOFFER_DISCOVER_EXTENSION') {
        announceExtension();
      }
  });
  chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.action === 'autooffer_data_updated') {
        try {
          window.postMessage(
            { type: 'AUTOOFFER_DATA_UPDATED', reason: msg.reason || 'general' },
            window.location.origin
          );
        } catch {}
      }
  });
})();

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

function parsePostedDateToIso(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw
  .replace(/\u00a0/g, ' ')
  .replace(/^(?:posted|published|updated|active|date posted)\s*[:\-]?\s*/i, '')
  .trim();
  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();
  const now = Date.now();

  if (/\b(?:just posted|just now|today|0\s*days?\s*ago)\b/.test(lower)) {
    return new Date(now).toISOString();
  }
  if (/\byesterday\b/.test(lower)) {
    return new Date(now - 86400000).toISOString();
  }

  const relMatch = lower.match(/(\d+)\s*\+?\s*(?:(minute|min|m)|(hour|hr|h)|(day|d)|(week|wk|w)|(month|mo))s?\s*(?:ago)?\b/);
  if (relMatch && (lower.includes('ago') || /\b\d+\s*\+?\s*(?:min|hr|d|wk|w|h|m)\b/.test(lower))) {
    const n = Number(relMatch[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 3650) {
      let ms = 0;
      if (relMatch[2]) ms = n * 60000;
      else if (relMatch[3]) ms = n * 3600000;
      else if (relMatch[4]) ms = n * 86400000;
      else if (relMatch[5]) ms = n * 7 * 86400000;
      else if (relMatch[6]) ms = n * 30 * 86400000;
      if (ms > 0) return new Date(now - ms).toISOString();
    }
  }

  if (/\d/.test(cleaned)) {
    const parsed = new Date(cleaned);
    const t = parsed.getTime();
    if (!isNaN(t) && parsed.getUTCFullYear() >= 2000 && t <= now + 2 * 86400000) {
      return parsed.toISOString();
    }
  }
  return null;
}

function extractJobPostingJsonLd() {
  const findJobPosting = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = findJobPosting(item);
        if (hit) return hit;
      }
      return null;
    }
    const typeVal = node['@type'];
    const isJob = typeVal === 'JobPosting' || (Array.isArray(typeVal) && typeVal.includes('JobPosting'));
    if (isJob) return node;
    if (Array.isArray(node['@graph'])) return findJobPosting(node['@graph']);
    return null;
  };

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const json = JSON.parse(script.textContent || '');
      const job = findJobPosting(json);
      if (job) {
        const companyName = typeof job.hiringOrganization === 'string'
        ? job.hiringOrganization.trim()
        : (job.hiringOrganization?.name ? String(job.hiringOrganization.name).trim() : null);
        const datePosted = job.datePosted ? parsePostedDateToIso(String(job.datePosted)) : null;
        return { companyName: companyName || null, datePosted };
      }
    } catch {}
  }
  return null;
}

function cleanCompanyText(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > 120) return null;
  return text;
}

function extractCompanyFromCard(card, explicitSelector) {
  const queries = [
    explicitSelector,
    '[data-testid="company-name"]',
    '[data-testid="companyName"]',
    '[data-automation="jobCompany"]',
    '[class*="companyName" i]',
    '[class*="company-name" i]',
    'span.company',
    'a[href*="/cmp/"]',
    'a[href*="/company/"]',
    '[class*="company" i]',
    '[class*="employer" i]',
  ].filter(Boolean);

  for (const q of queries) {
    try {
      const el = card.querySelector(q);
      const clean = el ? cleanCompanyText(el.textContent) : null;
      if (clean) return clean;
    } catch {}
  }
  return null;
}

function extractPostedAtFromCard(card) {
  const timeEl = card.querySelector('time');
  if (timeEl) {
    const dt = parsePostedDateToIso(timeEl.getAttribute('datetime') || timeEl.textContent);
    if (dt) return dt;
  }
  const dateQueries = [
    '[data-testid="myJobsStateDate"]',
    '[data-testid*="date" i]',
    '[class*="posted" i]',
    '[class*="date" i]',
  ];
  for (const q of dateQueries) {
    const el = card.querySelector(q);
    if (el) {
      const dt = parsePostedDateToIso(el.getAttribute('datetime') || el.textContent);
      if (dt) return dt;
    }
  }
  const textMatch = (card.innerText || '').match(/\b(?:posted\s+)?(?:\d+\s*\+?\s*(?:minutes?|hours?|days?|weeks?|months?)\s+ago|just posted|today|yesterday)\b/i);
  return textMatch ? parsePostedDateToIso(textMatch[0]) : null;
}

function extractDetailMetadata(explicitCompanySelector) {
  const jsonLd = extractJobPostingJsonLd();
  let companyName = jsonLd?.companyName ? cleanCompanyText(jsonLd.companyName) : null;

  if (!companyName) {
    const companyQueries = [
      explicitCompanySelector,
      '[data-testid="inlineHeader-companyName"]',
      '[data-testid="company-name"]',
      '[data-company-name]',
      '[class*="companyName" i]',
      '[class*="company-name" i]',
      '[class*="employer" i]',
      'a[href*="/cmp/"]',
      'a[href*="/company/"]',
    ].filter(Boolean);
    for (const q of companyQueries) {
      const el = querySelectorSafe(q);
      const clean = el ? cleanCompanyText(el.textContent) : null;
      if (clean) { companyName = clean; break; }
    }
  }
  if (!companyName) {
    const metaCo = document.querySelector('meta[name="company"], meta[property="og:site_name"]');
    if (metaCo?.getAttribute('name') === 'company') {
      companyName = cleanCompanyText(metaCo.getAttribute('content'));
    }
  }

  let postedAt = jsonLd?.datePosted || null;
  if (!postedAt) {
    const metaDate = document.querySelector('meta[property="article:published_time"], meta[name="date"], meta[itemprop="datePosted"]');
    if (metaDate) postedAt = parsePostedDateToIso(metaDate.getAttribute('content'));
  }
  if (!postedAt) {
    for (const q of ['time[datetime]', 'time', '[data-testid="myJobsStateDate"]', '[data-testid*="date" i]', '[class*="posted" i]', '[class*="date" i]']) {
      const el = document.querySelector(q);
      if (el) {
        const dt = parsePostedDateToIso(el.getAttribute('datetime') || el.textContent);
        if (dt) { postedAt = dt; break; }
      }
    }
  }
  return { companyName, postedAt };
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
        companyName: extractCompanyFromCard(card, selectors.company),
        postedAt: extractPostedAtFromCard(card),
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

  const mutationPromise = observeDomMutationWithTimeout(document.body, 100);
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.click();
  const domMutated = await mutationPromise;
  return { advanced: true, domMutated, method };
}

function isElementVisible(el) {
  if (!el || !el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  return el.getClientRects().length > 0;
}

function querySelectorSafe(sel) {
  const trimmed = String(sel || '').trim();
  if (!trimmed) return null;
  try {
    if (/^\s*(\/|\(|\.\/)/.test(trimmed)) {
        const res = document.evaluate(trimmed, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return res.singleNodeValue instanceof Element ? res.singleNodeValue : null;
      }
      return document.querySelector(trimmed);
    } catch {
      return null;
    }
  }

  function setNativeInputValue(el, value) {
    const proto = el.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT'
    ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.style.outline = '2px solid #2563eb';
    el.style.outlineOffset = '2px';
    el.setAttribute('data-ao-filled', 'true');
    el.removeAttribute('data-ao-unmapped');
  }

  function clearAutofillHighlights() {
    document.querySelectorAll('[data-ao-filled], [data-ao-unmapped]').forEach((el) => {
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.removeAttribute('data-ao-filled');
        el.removeAttribute('data-ao-unmapped');
    });
  }

  function detectCaptcha(customSelector) {
    const queries = [
      customSelector,
      'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', 'iframe[src*="turnstile"]',
      '[class*="g-recaptcha"]', '[class*="h-captcha"]', '[data-sitekey]'
    ].filter(Boolean);
    for (const q of queries) {
      const el = querySelectorSafe(q);
      if (el && isElementVisible(el)) return true;
    }
    return false;
  }

  function getFieldDescriptor(el) {
    const labelEl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label');
    return (
      labelEl?.textContent?.trim() ||
      el.getAttribute('aria-label') ||
      el.placeholder ||
      el.name ||
      el.id ||
      el.type ||
      el.tagName.toLowerCase()
    );
  }

  function findInputByKeywords(keywords, excludeSet = null) {
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea'));
    for (const el of inputs) {
      if (excludeSet?.has(el)) continue;
      if (el.closest('#ao-autofill-banner')) continue;
      if (!isElementVisible(el) || el.disabled || el.readOnly) continue;
      const labelEl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label');
      const haystack = [
        el.name, el.id, el.placeholder, el.getAttribute('aria-label'),
        el.getAttribute('autocomplete'), labelEl?.textContent
      ].filter(Boolean).join(' ').toLowerCase();
      if (keywords.some((kw) => haystack.includes(kw))) return el;
    }
    return null;
  }

  function attachResumeFileToInput(fileInput, resumeFile) {
    if (!fileInput || !resumeFile?.fileDataB64) return false;
    try {
      const bin = atob(resumeFile.fileDataB64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], resumeFile.fileName || 'resume.pdf', {
          type: resumeFile.mimeType || 'application/pdf',
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.style.outline = '2px solid #2563eb';
      fileInput.style.outlineOffset = '2px';
      fileInput.setAttribute('data-ao-filled', 'true');
      fileInput.removeAttribute('data-ao-unmapped');
      return true;
    } catch {
      return false;
    }
  }

  function renderAutofillBanner({ filled, unmapped, selectors, context, filledElements }) {
    document.getElementById('ao-autofill-banner')?.remove();

    const banner = document.createElement('div');
    banner.id = 'ao-autofill-banner';
    banner.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'max-width:380px', 'background:#0f172a', 'color:#f8fafc',
      'border:1px solid #3b82f6', 'border-radius:10px', 'padding:14px 16px',
      'box-shadow:0 12px 30px rgba(0,0,0,0.45)',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'font-size:13px', 'line-height:1.45',
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;margin-bottom:4px;color:#93c5fd;';
    title.textContent = 'AutoOffer Semi-Automated Review';

    const summary = document.createElement('div');
    summary.style.cssText = 'margin-bottom:10px;color:#e2e8f0;';
    summary.textContent = unmapped.length
    ? `Filled ${filled.length} field(s). ${unmapped.length} unmapped field(s) outlined in amber for manual review.`
    : `Filled ${filled.length} field(s). Review before confirming.`;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.textContent = 'Confirm and Submit';
    confirmBtn.style.cssText = 'background:#2563eb;color:#fff;border:none;border-radius:6px;padding:7px 12px;font-weight:600;font-size:12px;cursor:pointer;';
    confirmBtn.addEventListener('click', () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Logging...';
        chrome.runtime.sendMessage({ action: 'confirm_application_submission', context }, (res) => {
            if (chrome.runtime.lastError || !res?.success) {
              confirmBtn.disabled = false;
              confirmBtn.textContent = 'Confirm and Submit';
              summary.textContent = res?.error || 'Could not log application.';
              return;
            }
            const firstFilled = Array.from(filledElements)[0];
            const submitEl = (selectors?.form_submit ? querySelectorSafe(selectors.form_submit) : null)
            || firstFilled?.form?.querySelector('button[type="submit"], input[type="submit"]');
            if (submitEl && isElementVisible(submitEl) && !submitEl.disabled) {
              summary.textContent = 'Application logged! Submitting form...';
              submitEl.click();
              setTimeout(() => banner.remove(), 100);
            } else {
              summary.textContent = 'Application logged as Applied! Click the page Submit button if not yet submitted.';
              confirmBtn.style.display = 'none';
              cancelBtn.textContent = 'Close';
            }
        });
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'background:transparent;color:#cbd5e1;border:1px solid #475569;border-radius:6px;padding:7px 12px;font-weight:500;font-size:12px;cursor:pointer;';
    cancelBtn.addEventListener('click', () => {
        clearAutofillHighlights();
        banner.remove();
    });

    btnRow.append(confirmBtn, cancelBtn);
    banner.append(title, summary, btnRow);
    document.body.appendChild(banner);
  }

  function autofillApplicationForm({
      profile = {},
      coverLetter = '',
      resumeFile = null,
      selectors = {},
      submissionMode = 'semi_automated',
      context = {},
  }) {
    clearAutofillHighlights();

    if (detectCaptcha(selectors.captcha)) {
      return {
        success: false,
        captchaDetected: true,
        filled: [],
        unmapped: [],
        error: 'Captcha detected; please solve it and click Resume Autofill.',
      };
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
    const filledElements = new Set();

    for (const [field, explicitSel, value, keywords] of mappings) {
      if (!value) continue;
      let el = explicitSel ? querySelectorSafe(explicitSel) : null;
      if (!el || filledElements.has(el)) el = findInputByKeywords(keywords, filledElements);
      if (el && isElementVisible(el) && !el.disabled && !el.readOnly) {
        setNativeInputValue(el, value);
        filled.push(field);
        filledElements.add(el);
      }
    }

    if (resumeFile?.fileDataB64) {
      const fileEl = (selectors.form_resume_upload ? querySelectorSafe(selectors.form_resume_upload) : null)
      || document.querySelector('input[type="file"]');
      if (fileEl && isElementVisible(fileEl) && !fileEl.disabled && attachResumeFileToInput(fileEl, resumeFile)) {
        filled.push('resume_upload');
        filledElements.add(fileEl);
      }
    }

    const unmapped = [];
    const candidates = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, select'
    );
    for (const el of candidates) {
      if (filledElements.has(el) || el.closest('#ao-autofill-banner')) continue;
      if (!isElementVisible(el) || el.disabled || el.readOnly) continue;
      if (el.tagName !== 'SELECT' && el.type !== 'file' && el.value && el.value.trim().length > 0) continue;
      el.style.outline = '2px dashed #f59e0b';
      el.style.outlineOffset = '2px';
      el.setAttribute('data-ao-unmapped', 'true');
      el.title = 'AutoOffer: unmapped field — please review and fill manually';
      unmapped.push(getFieldDescriptor(el));
    }

    if (submissionMode === 'semi_automated') {
      renderAutofillBanner({ filled, unmapped, selectors, context, filledElements });
    }

    return { success: true, captchaDetected: false, filled, unmapped };
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

      const mutationPromise = observeDomMutationWithTimeout(document.body, 20);
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
    const meta = extractDetailMetadata(request.companySelector);
    sendResponse({ description: content, companyName: meta.companyName, postedAt: meta.postedAt });
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