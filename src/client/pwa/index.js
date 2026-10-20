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

    statsContainer.textContent = `${total} | Total Vacancies\n${withDesc} | Detailed\n${syncedCount} | Synced`;
    if (typeof statsContainer.connectedCallback === 'function') {
        statsContainer.connectedCallback();
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
        linkEl.textContent = 'Open original posting ->';
        linkEl.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        const footerEl = document.createElement('div');
        footerEl.className = 'vacancy-footer';

        const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString() : '';
        const hasDesc = Boolean(item.description && item.description.length > 50);

        footerEl.innerHTML = `<span>${dateStr}</span><span class="ao-pill" data-status="${hasDesc ? 'complete' : 'basic'}">${hasDesc ? 'Complete' : 'Basic'}</span>`;

        card.appendChild(titleEl);
        card.appendChild(linkEl);
        card.appendChild(footerEl);

        card.addEventListener('click', () => {
            modal.open({
                title: item.full_position_name,
                description: item.description,
                url: item.url,
                source: new URL(item.url || 'https://localhost').hostname
            });
        });

        grid.appendChild(card);
    }
}

async function syncFromExtension() {
    const extId = document.getElementById('extension-id-input').value.trim();
    const statusEl = document.getElementById('sync-status');

    if (!extId) {
        if (statusEl) statusEl.textContent = 'Please enter Extension ID.';
        return;
    }

    localStorage.setItem('autooffer_extension_id', extId);
    if (statusEl) statusEl.textContent = 'Contacting extension...';

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        if (statusEl) statusEl.textContent = 'Chrome extension API not available in this browser context.';
        return;
    }

    chrome.runtime.sendMessage(extId, { action: 'get_vacancies' }, async (response) => {
        if (chrome.runtime.lastError) {
            if (statusEl) statusEl.textContent = `Sync failed: ${chrome.runtime.lastError.message}`;
            return;
        }

        if (response && response.status === 'success' && Array.isArray(response.data)) {
            await saveVacanciesToLocal(response.data);
            await refreshDisplay();
            if (statusEl) statusEl.textContent = `Synced ${response.data.length} vacancies.`;
        } else {
            if (statusEl) statusEl.textContent = response ? response.message : 'No response from extension.';
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    const savedExtId = localStorage.getItem('autooffer_extension_id') || '';
    const extInput = document.getElementById('extension-id-input');
    if (extInput) extInput.value = savedExtId;

    await refreshDisplay();

    document.getElementById('sync-btn')?.addEventListener('click', () => {
        syncFromExtension();
    });

    document.getElementById('filter-input')?.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        const filtered = cachedVacancies.filter(v =>
            (v.full_position_name && v.full_position_name.toLowerCase().includes(val)) ||
            (v.description && v.description.toLowerCase().includes(val))
        );
        renderList(filtered);
    });
});