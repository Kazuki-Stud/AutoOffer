import { AoTheme } from './ui.js';
import { migrateLegacySecrets } from '../extension/database/crypto.js';
import { seedDatabase } from '../extension/database/seed.js';
import { initAiAssistantModal, initAiSettingsHandlers } from './aiView.js';
import { detectExtensionStatus, setSyncStatus, setupExtensionAutoPairing } from './bridge.js';
import { initJobsPage, loadJobsUI, loadPlatforms } from './jobsView.js';
import { initProfilePage, loadProfilesUI } from './profileView.js';
import { autoSyncAll, initSettingsHandlers, lastAutoSyncAt, loadSettingsUI } from './settingsView.js';
import { setVal, state } from './state.js';
import {
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
        navigator.serviceWorker.register('./sw.js').then((reg) => reg.update()).catch(() => {});
    }
    if (navigator.storage?.persist) {
        navigator.storage.persist().catch(() => {});
    }

    initNavigation();
    initProfilePage({ onDataChanged: refreshDisplay });
    initJobsPage({ onDataChanged: refreshDisplay });
    initAiSettingsHandlers();
    initAiAssistantModal();
    initSettingsHandlers();

    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
        AoTheme.toggleTheme();
        updateThemeToggleUI();
    });
    window.addEventListener('ao-theme-changed', updateThemeToggleUI);

    document.getElementById('quick-refresh-btn')?.addEventListener('click', () => {
        if (state.isExtensionConnected) autoSyncAll({ silent: false }).catch(console.error);
        else refreshDisplay().catch(console.error);
    });
    document.getElementById('load-hotwords-btn')?.addEventListener('click', () => loadHotwords().catch(console.error));
    document.getElementById('hotwords-position-select')?.addEventListener('change', () => loadHotwords().catch(console.error));
    document.getElementById('applications-search-input')?.addEventListener('input', renderApplicationsTable);
    document.getElementById('applications-status-filter')?.addEventListener('change', renderApplicationsTable);
    document.getElementById('filter-input')?.addEventListener('input', () => refreshDisplay().catch(console.error));

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

    await setupExtensionAutoPairing({
        onPaired: () => autoSyncAll({ silent: true }),
        onDataUpdated: () => autoSyncAll({ silent: true }),
    });

    try { await detectExtensionStatus(); } catch (err) { console.error(err); }

    if (state.isExtensionConnected) {
        await autoSyncAll({ silent: true });
    } else {
        try { await loadSettingsUI(); } catch (err) { console.error(err); }
        try { await loadPlatforms(); } catch (err) { console.error(err); }
        try { await loadProfilesUI(); } catch (err) { console.error(err); }
        try { await loadJobsUI(); } catch (err) { console.error(err); }
        try { await refreshDisplay(); } catch (err) { console.error(err); }
    }

    populateAnalyticsPositions().catch(() => {});

    const triggerThrottledSync = () => {
        if (!state.isExtensionConnected || document.visibilityState !== 'visible') return;
        if (Date.now() - lastAutoSyncAt < 3000) return;
        autoSyncAll({ silent: true }).catch(() => {});
    };
    window.addEventListener('focus', triggerThrottledSync);
    document.addEventListener('visibilitychange', triggerThrottledSync);
    setInterval(() => {
        if (state.isExtensionConnected && document.visibilityState === 'visible') {
            autoSyncAll({ silent: true }).catch(() => {});
        }
    }, 20000);
});