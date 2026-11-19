import { db } from '../extension/database/database.js';
import { deleteVacancy, getSetting, setSetting } from '../extension/database/repository.js';
import { loadAiConfigUI } from './aiView.js';
import {
    callExtension,
    detectExtensionStatus,
    exportLocalBackup,
    getExtensionId,
    importLocalBackup,
    mirrorVacanciesToLocalDb,
    saveSingleSetting,
    setSyncStatus,
} from './bridge.js';
import { loadJobsUI, loadPlatforms } from './jobsView.js';
import { loadProfilesUI } from './profileView.js';
import { getVal, setVal, state } from './state.js';
import { populateAnalyticsPositions, refreshDisplay } from './vacanciesView.js';

export async function loadSettingsUI() {
    let settings = null;
    if (state.isExtensionConnected) {
        try {
            settings = await callExtension('get_settings');
            for (const [k, v] of Object.entries(settings)) {
                await setSetting(k, v).catch(() => {});
            }
        } catch {}
    }

    const serverUrl = settings ? settings.server_base_url : await getSetting('server_base_url');
    const privOnly = settings ? settings.private_use_only : await getSetting('private_use_only');
    const autoSync = settings ? settings.auto_sync_pwa_on_grab : await getSetting('auto_sync_pwa_on_grab');
    const subMode = settings ? settings.submission_mode : await getSetting('submission_mode');

    setVal('server-url-input', serverUrl || 'http://localhost:8080');
    const privToggle = document.getElementById('private-use-only-toggle');
    if (privToggle) privToggle.checked = Boolean(privOnly);
    const autoSyncToggle = document.getElementById('auto-sync-pwa-toggle');
    if (autoSyncToggle) autoSyncToggle.checked = autoSync !== false;
    setVal('submission-mode-select', subMode || 'semi_automated');

    await loadAiConfigUI();
}

export async function syncVacanciesFromExtensionQuietly() {
if (!state.isExtensionConnected || !getExtensionId()) return false;
const autoSync = await getSetting('auto_sync_pwa_on_grab').catch(() => true);
if (autoSync === false) return false;
try {
const rows = await callExtension('get_vacancies', { role: 'all', dateRange: 'all', fieldsMode: 'all' }, 10000);
await mirrorVacanciesToLocalDb(rows || [], { pruneRemoved: false });
await refreshDisplay();
setSyncStatus(`Auto-synced ${(rows || []).length} vacancies.`, 'success');
return true;
} catch {
return false;
}
}

export async function syncFromExtension() {
    const extId = getExtensionId();
    const role = getVal('sync-role-input').trim() || 'all';
    const dateRange = getVal('sync-date-select') || 'all';
    const fieldsMode = getVal('sync-fields-select') || 'all';

    if (!extId) return setSyncStatus('Specify Chrome Extension ID.', 'error');
    localStorage.setItem('autooffer_extension_id', extId);

    setSyncStatus('Connecting to extension...', 'active');
    try {
        const rows = await callExtension('get_vacancies', { role, dateRange, fieldsMode }, 10000);
        await mirrorVacanciesToLocalDb(rows || [], { pruneRemoved: false });
        await detectExtensionStatus();
        await loadSettingsUI();
        await loadPlatforms();
        await loadProfilesUI();
        await loadJobsUI();
        await refreshDisplay();
        setSyncStatus(`Synchronized ${(rows || []).length} vacancies.`, 'success');
    } catch (err) {
        setSyncStatus(`Sync failed: ${err.message}`, 'error');
    }
}

export function initSettingsHandlers() {
    document.getElementById('export-json-btn')?.addEventListener('click', () => exportLocalBackup().catch(console.error));

    document.getElementById('import-json-input')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await importLocalBackup(file);
            await loadSettingsUI();
            await loadProfilesUI();
            await loadJobsUI();
            await refreshDisplay();
            setSyncStatus('Backup imported locally.', 'success');
        } catch (err) {
            setSyncStatus(err.message, 'error');
        }
    });

    document.getElementById('clear-btn')?.addEventListener('click', async () => {
        if (state.isExtensionConnected) {
            try { await callExtension('clear_vacancies'); } catch {}
        }
        const rows = await db.local_vacancies.toArray();
        let skipped = 0;
        for (const r of rows) {
            try { await deleteVacancy(r.id); } catch { skipped++; }
        }
        await refreshDisplay();
        setSyncStatus(skipped ? `Cleared un-applied vacancies (${skipped} kept due to applications).` : 'All stored vacancies cleared.', 'normal');
    });

    document.getElementById('sync-btn')?.addEventListener('click', () => syncFromExtension().catch(console.error));

    document.getElementById('extension-id-input')?.addEventListener('change', async (e) => {
        localStorage.setItem('autooffer_extension_id', e.target.value.trim());
        await detectExtensionStatus();
    });

    document.getElementById('server-url-input')?.addEventListener('change', (e) =>
        saveSingleSetting('server_base_url', e.target.value.trim())
            .then(populateAnalyticsPositions)
            .catch((err) => setSyncStatus(err.message, 'error'))
    );
    document.getElementById('private-use-only-toggle')?.addEventListener('change', (e) =>
        saveSingleSetting('private_use_only', e.target.checked).catch((err) => setSyncStatus(err.message, 'error'))
    );
    document.getElementById('auto-sync-pwa-toggle')?.addEventListener('change', (e) =>
        saveSingleSetting('auto_sync_pwa_on_grab', e.target.checked).catch((err) => setSyncStatus(err.message, 'error'))
    );
    document.getElementById('submission-mode-select')?.addEventListener('change', (e) =>
        saveSingleSetting('submission_mode', e.target.value).catch((err) => setSyncStatus(err.message, 'error'))
    );
}