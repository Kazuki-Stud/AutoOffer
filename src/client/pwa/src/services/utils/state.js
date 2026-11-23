export const BACKUP_EXCLUDED_TABLES = new Set([
    'local_device_state',
    'ai_configurations',
    'platform_credentials',
]);

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const optUuid = (val) => (typeof val === 'string' && UUID_RE.test(val.trim()) ? val.trim() : null);

export const state = {
    cachedVacancies: [],
    cachedApplications: new Map(),
    cachedAllApplications: [],
    cachedCompanies: new Map(),
    cachedPlatformsMap: new Map(),
    cachedSkillsMap: new Map(),
    cachedMatchByVacancy: new Map(),
    cachedResumesMap: new Map(),
    vacanciesViewMode: localStorage.getItem('ao_vacancies_layout') === 'list' ? 'list' : 'grid',
    cachedPlatforms: [],
    cachedProfiles: [],
    cachedProfileResumes: [],
    cachedJobs: [],
    cachedAiConfigs: [],

    isExtensionConnected: false,
    activeProfileId: null,
    activeResumeId: null,
    pendingResumeFile: null,
    editingJobId: null,
    selectedJobUrls: new Set(),
};

export function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}

export function getVal(id) {
    return document.getElementById(id)?.value ?? '';
}

export function isSafeHttpUrl(raw) {
    try {
        const u = new URL(raw);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

export function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function formatDate(dateVal) {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}.${d.getFullYear()}`;
}

export function formatDateTime(dateVal) {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${d.getFullYear()} ${hh}:${mm}`;
}

export function parseProfileLinks(rawText) {
    const urls = (rawText || '').split(/[\s,]+/).map((s) => s.trim()).filter(isSafeHttpUrl);
    return {
        github: urls.find((u) => u.includes('github.com')) || null,
        linkedin: urls.find((u) => u.includes('linkedin.com')) || null,
        website: urls.find((u) => !u.includes('github.com') && !u.includes('linkedin.com')) || null,
    };
}

export function toStringArray(raw) {
    if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
    return (raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const bytes = new Uint8Array(reader.result);
            let bin = '';
            for (let i = 0; i < bytes.length; i += 8192) {
                bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
            }
            resolve(btoa(bin));
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

export function base64ToBlob(b64, mimeType = 'application/octet-stream') {
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}