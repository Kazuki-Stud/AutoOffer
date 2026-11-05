const DB_NAME = 'AutoOfferPWADatabase';
const STORE_NAME = 'vacancies';
const PROFILE_STORE = 'profile';

function openIndexedDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 2);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(PROFILE_STORE)) {
                db.createObjectStore(PROFILE_STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getStoredVacancies() {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function saveVacanciesToLocal(vacancies) {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const item of vacancies) {
            store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function clearStoredVacancies() {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getStoredProfile() {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROFILE_STORE, 'readonly');
        const store = tx.objectStore(PROFILE_STORE);
        const req = store.get('default_candidate');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function saveStoredProfile(profileData) {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PROFILE_STORE, 'readwrite');
        const store = tx.objectStore(PROFILE_STORE);
        profileData.id = 'default_candidate';
        store.put(profileData);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function calculateStorageWeight() {
    try {
        const vacancies = await getStoredVacancies();
        const profile = await getStoredProfile();
        const raw = JSON.stringify(vacancies) + JSON.stringify(profile || {});
        const bytes = new Blob([raw]).size;

        let formatted = '0 KB';
        if (bytes > 1048576) {
            formatted = (bytes / 1048576).toFixed(2) + ' MB';
        } else {
            formatted = Math.max(1, Math.round(bytes / 1024)) + ' KB';
        }
        return { bytes, formatted };
    } catch {
        return { bytes: 0, formatted: '0 KB' };
    }
}

function formatDate(dateVal) {
    if (!dateVal) return '20.10.2026';
    try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return '20.10.2026';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}.${month}.${year}`;
    } catch {
        return '20.10.2026';
    }
}

let cachedVacancies = [];

async function refreshDisplay() {
    cachedVacancies = await getStoredVacancies();
    const weightInfo = await calculateStorageWeight();

    renderStats(cachedVacancies, weightInfo.formatted);
    renderList(cachedVacancies);
    updateMetricsView(cachedVacancies.length, weightInfo.formatted);
}

function updateMetricsView(count, weightStr) {
    const countEl = document.getElementById('pwa-storage-count-val');
    const weightEl = document.getElementById('pwa-storage-weight-val');
    if (countEl) countEl.textContent = String(count);
    if (weightEl) weightEl.textContent = weightStr;
}

function renderStats(list, weightStr = '0 KB') {
    const statsContainer = document.getElementById('dashboard-stats');
    if (!statsContainer) return;

    const total = list.length;
    const withDesc = list.filter(v => v.description && v.description.length > 50).length;
    const raw = `${total} | Total Vacancies\n${withDesc} | Detailed\n${weightStr} | Storage Weight`;

    if (typeof statsContainer.render === 'function') {
        statsContainer.render(raw);
    } else {
        statsContainer.textContent = raw;
        if (typeof statsContainer.connectedCallback === 'function') {
            statsContainer.connectedCallback();
        }
    }
}

function renderList(list) {
    const grid = document.getElementById('vacancies-grid');
    const emptyState = document.getElementById('empty-state');
    if (!grid) return;

    grid.innerHTML = '';
    if (!list.length) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    const modal = document.getElementById('vacancy-modal');

    for (const item of list) {
        const card = document.createElement('div');
        card.className = 'vacancy-item';

        const titleEl = document.createElement('div');
        titleEl.className = 'vacancy-title';
        titleEl.textContent = item.full_position_name || 'Untitled Position';

        const linkEl = document.createElement('a');
        linkEl.className = 'vacancy-link';
        linkEl.href = item.url || '#';
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
        linkEl.innerHTML = `
            <span>Open original</span>
            <svg class="link-circle-arrow" viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.6"></circle>
                <path d="M8.5 7l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
        `;
        linkEl.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        const footerEl = document.createElement('div');
        footerEl.className = 'vacancy-footer';

        const dateStr = formatDate(item.created_at);
        const hasDesc = Boolean(item.description && item.description.length > 50);

        footerEl.innerHTML = `
            <span class="vacancy-date">${dateStr}</span>
            <span class="ao-pill" data-status="${hasDesc ? 'complete' : 'basic'}">${hasDesc ? 'Complete' : 'Basic'}</span>
        `;

        card.appendChild(titleEl);
        card.appendChild(linkEl);
        card.appendChild(footerEl);

        card.addEventListener('click', () => {
            if (modal) {
                let hostname = 'Direct';
                try {
                    if (item.url) hostname = new URL(item.url).hostname;
                } catch {
                    hostname = 'Direct';
                }

                modal.open({
                    title: item.full_position_name || 'Lead Software Engineer',
                    description: item.description,
                    url: item.url,
                    source: hostname
                });
            }
        });

        grid.appendChild(card);
    }
}

function setSyncStatus(text, type = 'normal') {
    const statusEl = document.getElementById('sync-status');
    const connEl = document.getElementById('pwa-conn-status-val');
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.className = `sync-status-indicator ${type}`;
    }
    if (connEl) {
        connEl.textContent = text;
    }
}

async function syncFromExtension() {
    const extId = document.getElementById('extension-id-input')?.value.trim();
    const role = document.getElementById('sync-role-input')?.value.trim() || 'all';
    const dateRange = document.getElementById('sync-date-select')?.value || 'all';
    const fieldsMode = document.getElementById('sync-fields-select')?.value || 'all';

    if (!extId) {
        setSyncStatus('Specify Chrome Extension ID.', 'error');
        return;
    }

    localStorage.setItem('autooffer_extension_id', extId);
    setSyncStatus('Connecting to extension...', 'active');

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        setSyncStatus('Chrome extension API not available in this context.', 'error');
        return;
    }

    const payload = {
        action: 'get_vacancies',
        role: role,
        dateRange: dateRange,
        fieldsMode: fieldsMode
    };

    chrome.runtime.sendMessage(extId, payload, async (response) => {
        if (chrome.runtime.lastError) {
            setSyncStatus(`Sync failed: ${chrome.runtime.lastError.message}`, 'error');
            return;
        }

        if (response && response.status === 'success' && Array.isArray(response.data)) {
            await saveVacanciesToLocal(response.data);
            await refreshDisplay();
            setSyncStatus(`Successfully synchronized ${response.data.length} vacancies.`, 'success');
        } else {
            setSyncStatus(response?.message || 'No response from extension.', 'error');
        }
    });
}

async function loadProfileUI() {
    const profile = await getStoredProfile();
    if (!profile) return;

    if (profile.first_name) document.getElementById('pwa-prof-firstname').value = profile.first_name;
    if (profile.last_name) document.getElementById('pwa-prof-lastname').value = profile.last_name;
    if (profile.email) document.getElementById('pwa-prof-email').value = profile.email;
    if (profile.phone) document.getElementById('pwa-prof-phone').value = profile.phone;
    if (profile.location) document.getElementById('pwa-prof-location').value = profile.location;
    if (profile.headline) document.getElementById('pwa-prof-headline').value = profile.headline;
    if (profile.links) document.getElementById('pwa-prof-links').value = profile.links;
    if (profile.skills) document.getElementById('pwa-prof-skills').value = profile.skills;
}

function initProfilePage() {
    const saveBtn = document.getElementById('pwa-save-profile-btn');
    const statusMsg = document.getElementById('pwa-profile-status');

    saveBtn?.addEventListener('click', async () => {
        const profileData = {
            first_name: document.getElementById('pwa-prof-firstname').value.trim(),
            last_name: document.getElementById('pwa-prof-lastname').value.trim(),
            email: document.getElementById('pwa-prof-email').value.trim(),
            phone: document.getElementById('pwa-prof-phone').value.trim(),
            location: document.getElementById('pwa-prof-location').value.trim(),
            headline: document.getElementById('pwa-prof-headline').value.trim(),
            links: document.getElementById('pwa-prof-links').value.trim(),
            skills: document.getElementById('pwa-prof-skills').value.trim(),
            updated_at: new Date().toISOString()
        };

        await saveStoredProfile(profileData);

        const extId = document.getElementById('extension-id-input')?.value.trim();
        if (extId && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage(extId, { action: 'save_profile', profile: profileData }, () => {});
        }

        if (statusMsg) {
            statusMsg.textContent = 'Profile successfully saved locally.';
            statusMsg.style.color = '#34d399';
            setTimeout(() => {
                statusMsg.textContent = '';
            }, 3000);
        }

        await refreshDisplay();
    });
}

function initNavigation() {
    const navButtons = document.querySelectorAll('.pwa-nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.pwa-view').forEach(v => v.style.display = 'none');

            btn.classList.add('active');
            const targetViewId = btn.getAttribute('data-view');
            const targetView = document.getElementById(targetViewId);
            if (targetView) {
                targetView.style.display = 'flex';
            }
        });
    });

    document.getElementById('goto-sync-btn')?.addEventListener('click', () => {
        const settingsNav = document.getElementById('nav-btn-settings');
        settingsNav?.click();
    });
}

function updateThemeToggleUI() {
    const currentTheme = window.AoTheme ? window.AoTheme.getTheme() : (document.documentElement.getAttribute('data-theme') || 'dark');
    const sunIcon = document.querySelector('.theme-icon.sun-icon');
    const moonIcon = document.querySelector('.theme-icon.moon-icon');

    if (currentTheme === 'dark') {
        moonIcon?.classList.add('active');
        sunIcon?.classList.remove('active');
    } else {
        sunIcon?.classList.add('active');
        moonIcon?.classList.remove('active');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            reg.update();
        }).catch(() => {});
    }

    initNavigation();
    initProfilePage();

    const savedExtId = localStorage.getItem('autooffer_extension_id') || '';
    const extInput = document.getElementById('extension-id-input');
    if (extInput && savedExtId) extInput.value = savedExtId;

    updateThemeToggleUI();

    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
        if (window.AoTheme) {
            window.AoTheme.toggleTheme();
            updateThemeToggleUI();
        }
    });

    window.addEventListener('ao-theme-changed', () => {
        updateThemeToggleUI();
    });

    await loadProfileUI();
    await refreshDisplay();

    document.getElementById('quick-refresh-btn')?.addEventListener('click', async () => {
        await refreshDisplay();
    });

    document.getElementById('clear-btn')?.addEventListener('click', async () => {
        await clearStoredVacancies();
        await refreshDisplay();
        setSyncStatus('All stored vacancies cleared.', 'normal');
    });

    document.getElementById('sync-btn')?.addEventListener('click', () => {
        syncFromExtension();
    });

    document.getElementById('filter-input')?.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        if (!val) {
            renderList(cachedVacancies);
            return;
        }
        const filtered = cachedVacancies.filter(v =>
            (v.full_position_name && v.full_position_name.toLowerCase().includes(val)) ||
            (v.description && v.description.toLowerCase().includes(val))
        );
        renderList(filtered);
    });
});
