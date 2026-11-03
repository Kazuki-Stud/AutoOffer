const DB_NAME = 'AutoOfferPWADatabase';
const STORE_NAME = 'vacancies';

function openIndexedDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
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
    renderStats(cachedVacancies);
    renderList(cachedVacancies);
}

function renderStats(list) {
    const statsContainer = document.getElementById('dashboard-stats');
    if (!statsContainer) return;

    const total = list.length;
    const withDesc = list.filter(v => v.description && v.description.length > 50).length;
    const syncedCount = list.filter(v => v.synced).length;
    const raw = `${total} | Total Vacancies\n${withDesc} | Detailed\n${syncedCount} | Synced`;

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
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = `sync-status-indicator ${type}`;
}

async function syncFromExtension() {
    const extId = document.getElementById('extension-id-input')?.value.trim();

    if (!extId) {
        setSyncStatus('Extension ID.', 'error');
        return;
    }

    localStorage.setItem('autooffer_extension_id', extId);
    setSyncStatus('Contacting extension', 'active');

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        setSyncStatus('Chrome extension API not available in this browser context.', 'error');
        return;
    }

    chrome.runtime.sendMessage(extId, { action: 'get_vacancies' }, async (response) => {
        if (chrome.runtime.lastError) {
            setSyncStatus(`Sync failed: ${chrome.runtime.lastError.message}`, 'error');
            return;
        }

        if (response && response.status === 'success' && Array.isArray(response.data)) {
            await saveVacanciesToLocal(response.data);
            await refreshDisplay();
            setSyncStatus(`Synced ${response.data.length} vacancies.`, 'success');
        } else {
            setSyncStatus(response?.message || 'No response from extension.', 'error');
        }
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

window.clearVacancies = async function () {
    await clearStoredVacancies();
    await refreshDisplay();
    setSyncStatus('Vacancies cleared.', 'normal');
};

document.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            reg.update();
        }).catch(() => {});
    }

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

    document.getElementById('extension-toggle-btn')?.addEventListener('click', () => {
        const input = document.getElementById('extension-id-input');
        if (input) {
            input.focus();
            input.select();
            setSyncStatus('Enter your Chrome Extension ID here to sync.', 'active');
        }
    });

    if (window.customElements) {
        customElements.whenDefined('ao-stats').then(() => {
            if (cachedVacancies.length) {
                renderStats(cachedVacancies);
            }
        });
    }

    await refreshDisplay();

    document.getElementById('clear-btn')?.addEventListener('click', async () => {
        await clearStoredVacancies();
        await refreshDisplay();
        setSyncStatus('All vacancies cleared.', 'normal');
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