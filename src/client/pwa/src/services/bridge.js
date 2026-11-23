import { db } from '../../../extension/database/database.js';
import { newId, nowIso, setSetting } from '../../../extension/database/repository.js';
import {
    BACKUP_EXCLUDED_TABLES,
    getVal,
    isSafeHttpUrl,
    optUuid,
    setVal,
    state,
} from '../../../state.js';

export function getExtensionId() {
    return (getVal('extension-id-input') || localStorage.getItem('autooffer_extension_id') || '').trim();
}

export function callExtension(action, payload = {}, timeoutMs = 3500) {
    return new Promise((resolve, reject) => {
        const extId = getExtensionId();
        if (!extId || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
            return reject(new Error('Extension unavailable'));
        }
        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                reject(new Error(`Extension timeout (${action})`));
            }
        }, timeoutMs);

        try {
            chrome.runtime.sendMessage(extId, { action, ...payload }, (response) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                if (!response || response.status === 'error') {
                    const err = new Error(response?.message || 'Extension returned an error');
                    if (response?.code) err.code = response.code;
                    return reject(err);
                }
                resolve(response.data);
            });
        } catch (err) {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
            }
        }
    });
}

export function setSyncStatus(text, type = 'normal') {
    const statusEl = document.getElementById('sync-status');
    const connEl = document.getElementById('pwa-conn-status-val');
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.className = `sync-status-indicator ${type}`;
    }
    if (connEl) connEl.textContent = text;
}

export function updateSourceTags() {
    const label = state.isExtensionConnected ? 'Extension Source of Truth (Manual Sync)' : 'Standalone Local (Dexie v7)';
    for (const id of ['pwa-jobs-source-tag', 'pwa-profile-source-tag', 'pwa-settings-source-tag']) {
        const el = document.getElementById(id);
        if (el) el.textContent = label;
    }
}

export async function detectExtensionStatus() {
    const banner = document.getElementById('ext-missing-banner');
    const extId = getExtensionId();
    const available = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.sendMessage);

    if (!available) {
        state.isExtensionConnected = false;
        if (banner) banner.style.display = 'block';
        setSyncStatus('Standalone Mode (No Extension API)', 'normal');
        updateSourceTags();
        return false;
    }
    if (!extId) {
        state.isExtensionConnected = false;
        if (banner) banner.style.display = 'block';
        setSyncStatus('Set Extension ID in Settings', 'normal');
        updateSourceTags();
        return false;
    }

    try {
        await callExtension('get_storage_weight', {}, 2500);
        state.isExtensionConnected = true;
        if (banner) banner.style.display = 'none';
        setSyncStatus('Extension Paired (Manual Sync)', 'success');
        updateSourceTags();
        return true;
    } catch {
        state.isExtensionConnected = false;
        if (banner) banner.style.display = 'block';
        setSyncStatus('Extension Unreachable', 'error');
        updateSourceTags();
        return false;
    }
}

export function setupExtensionAutoPairing({ onPaired } = {}) {
    return new Promise((resolve) => {
        let resolved = false;
        const finish = (id) => {
            if (!resolved) {
                resolved = true;
                resolve(id || null);
            }
        };

        window.addEventListener('message', async (event) => {
            if (event.source !== window || !event.data) return;

            if (event.data.type === 'AUTOOFFER_EXTENSION_AVAILABLE' && event.data.extensionId) {
                const discoveredId = String(event.data.extensionId).trim();
                if (!discoveredId) return;

                const prevId = getExtensionId();
                localStorage.setItem('autooffer_extension_id', discoveredId);
                setVal('extension-id-input', discoveredId);
                finish(discoveredId);

                if (prevId !== discoveredId || !state.isExtensionConnected) {
                    const connected = await detectExtensionStatus();
                    if (connected && typeof onPaired === 'function') await onPaired();
                }
            }
        });

        try {
            window.postMessage({ type: 'AUTOOFFER_DISCOVER_EXTENSION' }, window.location.origin);
        } catch {}

        setTimeout(() => finish(getExtensionId()), 400);
    });
}

export async function calculateStorageWeight() {
    if (state.isExtensionConnected) {
        try {
            return await callExtension('get_storage_weight');
        } catch {}
    }
    try {
        const chunks = await Promise.all([
            db.local_vacancies.toArray(),
            db.personal_data.toArray(),
            db.resumes.toArray(),
            db.cover_letters.toArray(),
            db.match_results.toArray(),
            db.applications.toArray(),
            db.platforms_dict.toArray(),
            db.selectors.toArray(),
            db.automation_jobs.toArray(),
        ]);
        const bytes = new Blob([JSON.stringify(chunks)]).size;
        const formatted = bytes > 1048576
            ? `${(bytes / 1048576).toFixed(2)} MB`
            : `${Math.max(1, Math.round(bytes / 1024))} KB`;
        return { bytes, formatted };
    } catch {
        return { bytes: 0, formatted: '0 KB' };
    }
}

export async function syncApplicationsFromBridge() {
    if (state.isExtensionConnected) {
        try {
            const remoteApps = await callExtension('get_applications');
            if (Array.isArray(remoteApps)) {
                await db.applications.clear();
                if (remoteApps.length) await db.applications.bulkPut(remoteApps);
            }
        } catch {}
    }
}

export async function mirrorVacanciesToLocalDb(rows, { pruneRemoved = false } = {}) {
    if (!Array.isArray(rows)) return;
    const now = nowIso();

    await db.transaction('rw', [db.local_vacancies, db.applications, db.companies_dict], async () => {
            if (pruneRemoved) {
            const remoteIds = new Set(rows.map((r) => optUuid(r.id)).filter(Boolean));
            const remoteUrls = new Set(rows.map((r) => r.url).filter(Boolean));
            const existing = await db.local_vacancies.toArray();
            for (const loc of existing) {
                if (!remoteIds.has(loc.id) && !remoteUrls.has(loc.url)) {
                    const appCount = await db.applications.where('vacancy_id').equals(loc.id).count();
                    if (appCount === 0) await db.local_vacancies.delete(loc.id);
                }
            }
        }

        for (const v of rows) {
            if (!isSafeHttpUrl(v.url)) continue;
            const platform_id = optUuid(v.platform_id);
            let host = v.source_host ? String(v.source_host).trim() : null;
            if (!platform_id && !host) {
                try { host = new URL(v.url).hostname; } catch {}
            }
            if (!platform_id && !host) continue;

            const city_id = optUuid(v.city_id);
            const country_id = city_id ? null : optUuid(v.country_id);
            const region_id = (city_id || country_id) ? null : optUuid(v.region_id);

            const currency_id = optUuid(v.currency_id);
            let salary_from = typeof v.salary_from === 'number' && Number.isFinite(v.salary_from) && v.salary_from >= 0 ? v.salary_from : null;
            let salary_to = typeof v.salary_to === 'number' && Number.isFinite(v.salary_to) && v.salary_to >= 0 ? v.salary_to : null;
            if (!currency_id) {
                salary_from = null;
                salary_to = null;
            } else if (salary_from != null && salary_to != null && salary_from > salary_to) {
                salary_to = salary_from;
            }

            let company_id = optUuid(v.company_id);
            if (v.company_name && String(v.company_name).trim()) {
                const cleanCompany = String(v.company_name).trim().slice(0, 255);
                const existingCompany = await db.companies_dict.where('name').equals(cleanCompany).first();
                if (existingCompany) {
                    company_id = existingCompany.id;
                } else {
                    const targetCompanyId = company_id || newId();
                    await db.companies_dict.put({ id: targetCompanyId, name: cleanCompany, is_verified: 0 });
                    company_id = targetCompanyId;
                }
            }

            const hasDesc = Boolean(v.description && v.description.trim().length > 0);
            const postedAt = v.posted_at && !isNaN(new Date(v.posted_at).getTime()) ? v.posted_at : null;
            const record = {
                id: optUuid(v.id) || newId(),
                platform_id,
                source_host: platform_id ? null : host,
                position_id: optUuid(v.position_id),
                full_position_name: String(v.full_position_name || 'Untitled Position').slice(0, 255),
                company_id,
                address: v.address || null,
                region_id,
                country_id,
                city_id,
                salary_from,
                salary_to,
                currency_id,
                level_id: optUuid(v.level_id),
                work_format_id: optUuid(v.work_format_id),
                employment_type_id: optUuid(v.employment_type_id),
                url: v.url,
                description: hasDesc ? v.description.trim() : null,
                posted_at: postedAt,
                sync_level: ['none', 'url_only', 'full'].includes(v.sync_level) ? v.sync_level : 'none',
                source: v.source === 'manual' ? 'manual' : 'auto',
                status: hasDesc ? (v.status === 'error' ? 'error' : 'complete') : 'new',
                skill_ids: Array.isArray(v.skill_ids) ? [...new Set(v.skill_ids.map(optUuid).filter(Boolean))] : [],
                created_at: v.created_at || now,
                updated_at: v.updated_at || v.created_at || now,
            };

            const byUrl = await db.local_vacancies.where('url').equals(record.url).first();
            if (byUrl && byUrl.id !== record.id) {
                const linkedApps = await db.applications.where('vacancy_id').equals(byUrl.id).count();
                if (linkedApps > 0) {
                    await db.local_vacancies.update(byUrl.id, { ...record, id: byUrl.id });
                    continue;
                }
                await db.local_vacancies.delete(byUrl.id);
            }
            await db.local_vacancies.put(record);
        }
    });
}

export async function saveSingleSetting(key, value) {
    await setSetting(key, value);
    if (state.isExtensionConnected) {
        await callExtension('save_settings', { settings: { [key]: value } });
    }
}

export async function exportLocalBackup() {
    const dump = {};
    for (const t of db.tables) {
        if (BACKUP_EXCLUDED_TABLES.has(t.name)) continue;
        dump[t.name] = await t.toArray();
    }
    const blob = new Blob([JSON.stringify({ exportedAt: nowIso(), schemaVersion: 7, tables: dump }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `autooffer-backup-${nowIso().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}

export async function importLocalBackup(file) {
    const parsed = JSON.parse(await file.text());
    if (!parsed?.tables) throw new Error('Invalid backup format');
    await db.transaction('rw', db.tables, async () => {
        for (const [name, rows] of Object.entries(parsed.tables)) {
            if (BACKUP_EXCLUDED_TABLES.has(name) || !Array.isArray(rows)) continue;
            const table = db.tables.find((t) => t.name === name);
            if (table) await table.bulkPut(rows);
        }
    });
}