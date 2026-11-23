import { AoTheme } from './ui.js';
import { db } from '../extension/database/database.js';
import { migrateLegacySecrets } from '../extension/database/crypto.js';
import { seedDatabase } from '../extension/database/seed.js';
import { initAiAssistantModal, initAiSettingsHandlers } from './aiView.js';
import { detectExtensionStatus, setSyncStatus, setupExtensionAutoPairing } from './bridge.js';
import { initJobsPage, loadJobsUI, loadPlatforms } from './jobsView.js';
import { initProfilePage, loadProfilesUI } from './profileView.js';
import { initSettingsHandlers, loadSettingsUI, syncVacanciesFromExtensionQuietly } from './settingsView.js';
import { setVal, state } from './state.js';
import {
    applyVacanciesFiltersAndRender,
    loadHotwords,
    populateAnalyticsPositions,
    refreshDisplay,
    renderApplicationsTable,
} from './vacanciesView.js';

function initNavigation() {
    const navButtons = document.querySelectorAll('.pwa-nav-btn');
    navButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            navButtons.forEach((b) => b.classList.remove('active'));
            document.querySelectorAll('.pwa-view').forEach((v) => { v.style.display = 'none'; });
            btn.classList.add('active');
            const targetView = document.getElementById(btn.getAttribute('data-view'));
            if (targetView) targetView.style.display = 'flex';
        });
    });
    document.getElementById('goto-sync-btn')?.addEventListener('click', () => {
        document.getElementById('nav-btn-settings')?.click();
    });
}

function updateThemeToggleUI() {
    const currentTheme = AoTheme.getTheme();
    document.querySelector('.theme-icon.moon-icon')?.classList.toggle('active', currentTheme === 'dark');
    document.querySelector('.theme-icon.sun-icon')?.classList.toggle('active', currentTheme !== 'dark');
}

document.addEventListener('DOMContentLoaded', async () => {
    AoTheme.initTheme();
    updateThemeToggleUI();

    if ('serviceWorker' in navigator) {
        if (import.meta.env.PROD) {
            navigator.serviceWorker.register('./sw.js').then((reg) => reg.update()).catch(() => {});
        } else {
            navigator.serviceWorker.getRegistrations()
            .then((regs) => Promise.all(regs.map((r) => r.unregister())))
            .catch(() => {});
        }
    }
    if (navigator.storage?.persist) {
        navigator.storage.persist().catch(() => {});
    }

    initNavigation();
    initProfilePage({ onDataChanged: refreshDisplay });
    initJobsPage({ onDataChanged: refreshDisplay });
    initAiSettingsHandlers();
    initAiAssistantModal({ onApplicationLogged: refreshDisplay });
    initSettingsHandlers();

    window.addEventListener('message', (event) => {
            if (event.source === window && event.data?.type === 'AUTOOFFER_DATA_UPDATED') {
                const reason = event.data.reason;
                if (reason === 'vacancies_grabbed') {
                    syncVacanciesFromExtensionQuietly().catch(console.error);
                } else if (reason === 'vacancies_updated') {
                    syncVacanciesFromExtensionQuietly({ respectSetting: false }).catch(console.error);
                } else if (reason === 'vacancies_cleared') {
                    syncVacanciesFromExtensionQuietly({ respectSetting: false, pruneRemoved: true }).catch(console.error);
                } else {
                    refreshDisplay().catch(console.error);
                }
            }
    });

    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
        AoTheme.toggleTheme();
        updateThemeToggleUI();
    });
    window.addEventListener('ao-theme-changed', updateThemeToggleUI);

    document.getElementById('quick-refresh-btn')?.addEventListener('click', () => {
        refreshDisplay().catch(console.error);
    });
    document.getElementById('load-hotwords-btn')?.addEventListener('click', () => loadHotwords().catch(console.error));
    document.getElementById('hotwords-position-select')?.addEventListener('change', () => loadHotwords().catch(console.error));
    document.getElementById('applications-search-input')?.addEventListener('input', renderApplicationsTable);
    document.getElementById('applications-status-filter')?.addEventListener('change', renderApplicationsTable);
    const rerenderFilteredVacancies = () => applyVacanciesFiltersAndRender(state.activeProfileId);
document.getElementById('filter-input')?.addEventListener('input', rerenderFilteredVacancies);
document.getElementById('filter-source-select')?.addEventListener('change', rerenderFilteredVacancies);
document.getElementById('filter-app-status-select')?.addEventListener('change', rerenderFilteredVacancies);
document.getElementById('filter-date-select')?.addEventListener('change', rerenderFilteredVacancies);
document.getElementById('filter-sort-select')?.addEventListener('change', rerenderFilteredVacancies);
document.getElementById('clear-filters-btn')?.addEventListener('click', () => {
setVal('filter-input', '');
setVal('filter-source-select', '');
setVal('filter-app-status-select', '');
setVal('filter-date-select', 'all');
setVal('filter-sort-select', 'posted_desc');
rerenderFilteredVacancies();
});

    const syncViewModeButtons = () => {
        document.getElementById('view-mode-grid-btn')?.classList.toggle('active', state.vacanciesViewMode !== 'list');
        document.getElementById('view-mode-list-btn')?.classList.toggle('active', state.vacanciesViewMode === 'list');
    };
    syncViewModeButtons();
    for (const btnId of ['view-mode-grid-btn', 'view-mode-list-btn']) {
        document.getElementById(btnId)?.addEventListener('click', (e) => {
            const layout = e.currentTarget.getAttribute('data-layout') === 'list' ? 'list' : 'grid';
            state.vacanciesViewMode = layout;
            localStorage.setItem('ao_vacancies_layout', layout);
            syncViewModeButtons();
            rerenderFilteredVacancies();
        });
    }

    const urlExtId = new URLSearchParams(window.location.search).get('extId')?.trim();
    if (urlExtId) localStorage.setItem('autooffer_extension_id', urlExtId);

    const savedExtId = localStorage.getItem('autooffer_extension_id') || '';
    if (savedExtId) setVal('extension-id-input', savedExtId);

    try {
        await seedDatabase();
        await migrateLegacySecrets();
    } catch (err) {
        console.error('Database init failed:', err);
        setSyncStatus(`Local DB error: ${err.message}`, 'error');
    }

    // Render locally cached data immediately so slow/unreachable extension never leaves PWA blank
await Promise.allSettled([
db.platforms_dict.toArray().then((rows) => { state.cachedPlatforms = rows; }),
loadSettingsUI(),
loadProfilesUI(),
loadJobsUI(),
refreshDisplay(),
]);

    let syncInFlight = null;
    const runExtensionSync = async () => {
        if (syncInFlight) return syncInFlight;
        syncInFlight = (async () => {
            const connected = await detectExtensionStatus().catch(() => false);
            if (!connected) return;
            await Promise.allSettled([
                loadSettingsUI(),
                loadPlatforms(),
                loadProfilesUI(),
                loadJobsUI(),
            ]);
            await syncVacanciesFromExtensionQuietly().catch(console.error);
            await refreshDisplay().catch(console.error);
        })().finally(() => {
            syncInFlight = null;
        });
        return syncInFlight;
    };

    setupExtensionAutoPairing({ onPaired: runExtensionSync });
    runExtensionSync().catch(console.error);
    populateAnalyticsPositions().catch(() => {});
});