import { db } from './database/database.js';
import { ensureDeviceState, getAuthToken, setAuthToken } from './database/crypto.js';
import {
    allowedSyncLevel, applyRegistrySelectors, getSetting, markSynced, nowIso
} from './database/repository.js';

async function baseUrl() {
    const url = await getSetting('server_base_url');
    return (url || 'http://localhost:8080').replace(/\/+$/, '');
}

export async function ensureRegisteredDevice() {
    const state = await ensureDeviceState();
    let token = await getAuthToken();
    if (token) return { pseudonymousId: state.pseudonymous_id, token };

    const res = await fetch(`${await baseUrl()}/api/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudonymousId: state.pseudonymous_id }),
    });
    if (!res.ok) throw new Error(`Device registration failed: ${res.status}`);
    const body = await res.json();
    await setAuthToken(body.token);
    return { pseudonymousId: state.pseudonymous_id, token: body.token };
}

async function deviceFetch(path, options = {}) {
    const { pseudonymousId, token } = await ensureRegisteredDevice();
    return fetch(`${await baseUrl()}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'X-Device-Id': pseudonymousId,
            'Authorization': `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });
}

/** US 1.1: refresh platform whitelist permission_status and insert newly added server boards. */
export async function syncWhitelist() {
    try {
        const base = await baseUrl();
        const res = await fetch(`${base}/api/registry/whitelist`);
        if (!res.ok) return false;
        const rows = await res.json();
        if (!Array.isArray(rows)) return false;

        const localCodes = new Set((await db.platforms_dict.toArray()).map((p) => p.code));
        const hasMissing = rows.some((r) => !localCodes.has(r.platformCode ?? r.platform_code));

        const idByCode = new Map();
        if (hasMissing) {
            try {
                const bootRes = await fetch(`${base}/api/dictionaries/bootstrap`);
                if (bootRes.ok) {
                    const boot = await bootRes.json();
                    for (const p of boot.platforms || []) {
                        if (p.code && p.id) idByCode.set(p.code, p.id);
                    }
                }
            } catch {}
        }

        const now = nowIso();
        await db.transaction('rw', db.platforms_dict, async () => {
            for (const r of rows) {
                const code = r.platformCode ?? r.platform_code;
                const perm = r.permissionStatus ?? r.permission_status ?? 'none';
                if (!code) continue;

                const existing = await db.platforms_dict.where('code').equals(code).first();
                if (existing) {
                    await db.platforms_dict.update(existing.id, {
                        name: r.name || existing.name,
                        url: r.url || existing.url,
                        permission_status: perm,
                        last_checked_at: now,
                    });
                } else {
                    await db.platforms_dict.add({
                        id: idByCode.get(code) || crypto.randomUUID(),
                        name: r.name || code,
                        code,
                        url: r.url || `https://${code}`,
                        permission_status: perm,
                        last_checked_at: now,
                    });
                }
            }
        });
        return true;
    } catch {
        return false;
    }
}

/** US 2.1: fetch active approved selectors and map server codes -> local dictionary UUIDs. */
export async function syncRegistrySelectors() {
    try {
        const state = await ensureDeviceState();
        const qs = state.last_synced_at ? `?since=${encodeURIComponent(state.last_synced_at)}` : '';
        const res = await fetch(`${await baseUrl()}/api/registry/selectors${qs}`);
        if (!res.ok) return 0;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) return 0;

        const platforms = new Map((await db.platforms_dict.toArray()).map((p) => [p.code, p.id]));
        const tasks = new Map((await db.selector_tasks_dict.toArray()).map((t) => [t.code, t.id]));
        const elements = new Map((await db.selector_element_types_dict.toArray()).map((e) => [e.code, e.id]));

        const mapped = [];
        for (const r of rows) {
            const platform_id = platforms.get(r.platformCode ?? r.platform_code);
            const task_id = tasks.get(r.taskCode ?? r.task_code);
            const element_type_id = elements.get(r.elementTypeCode ?? r.element_type_code);
            if (!platform_id || !task_id || !element_type_id) continue;
            mapped.push({
                platform_id,
                task_id,
                element_type_id,
                url_pattern: r.urlPattern ?? r.url_pattern ?? null,
                selector_kind: r.selectorKind ?? r.selector_kind ?? 'css',
                selector_string: r.selectorString ?? r.selector_string,
                version: r.version ?? 1,
            });
        }

        const applied = await applyRegistrySelectors(mapped);
        await db.local_device_state.update('device', { last_synced_at: nowIso() });
        return applied;
    } catch {
        return 0;
    }
}

/** US 2.3 & US 3.7: submit a selector or field mapping proposal to the admin review queue. */
export async function submitSelectorProposal({
                                                 platformId,
                                                 taskId,
                                                 elementTypeId,
                                                 urlPattern = null,
                                                 kind = 'css',
                                                 selectorString,
                                             }) {
    const res = await deviceFetch('/api/selectors', {
        method: 'POST',
        body: JSON.stringify({
            platformId,
            taskId,
            elementTypeId,
            urlPattern,
            kind,
            selectorString,
        }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Selector submission failed (${res.status}): ${text}`);
    }
    return res.json();
}

/** US 1.3 / 1.5 / 7.4: send public URL (and full text ONLY if board is granted & private_use_only is off). */
export async function syncVacancyToServer(vacancy) {
    const level = await allowedSyncLevel(vacancy);
    if (level === 'none' || !vacancy.platform_id) return false;

    const payload = level === 'full'
        ? {
            platformId: vacancy.platform_id,
            url: vacancy.url,
            fullPositionName: vacancy.full_position_name,
            description: vacancy.description || null,
            address: vacancy.address || null,
            positionId: vacancy.position_id || null,
            regionId: vacancy.region_id || null,
            countryId: vacancy.country_id || null,
            cityId: vacancy.city_id || null,
            salaryFrom: vacancy.salary_from ?? null,
            salaryTo: vacancy.salary_to ?? null,
            currencyId: vacancy.currency_id || null,
            levelId: vacancy.level_id || null,
            workFormatId: vacancy.work_format_id || null,
            employmentTypeId: vacancy.employment_type_id || null,
            skillIds: vacancy.skill_ids || [],
        }
        : {
            platformId: vacancy.platform_id,
            url: vacancy.url,
        };

    const res = await deviceFetch('/api/vacancies', { method: 'POST', body: JSON.stringify(payload) });
    if (res.ok) {
        await markSynced(vacancy.id, level);
        return true;
    }
    return false;
}