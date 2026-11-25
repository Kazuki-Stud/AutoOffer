import { fetchWithTimeout } from '../utils/helpers.js';
import { logger } from './logger.js';

export class HttpApiError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'HttpApiError';
        this.status = status;
    }
}

let errorHandler = null;

export function registerGlobalHttpErrorHandler(fn) {
    errorHandler = fn;
}

async function extractServerDetail(res) {
    try {
        const text = typeof res.text === 'function' ? await res.text() : '';
        if (!text) return '';
        try {
            const body = JSON.parse(text);
            const details = body?.details && typeof body.details === 'object'
            ? Object.entries(body.details).map(([k, v]) => `${k}: ${v}`).join(', ')
            : '';
            return [body?.message, details].filter(Boolean).join(' — ');
        } catch {
            return text.slice(0, 160);
        }
    } catch {
        return '';
    }
}

function mapStatusMessage(status, fallback, serverDetail, url) {
    const detailSuffix = serverDetail ? ` Detail: ${serverDetail}` : '';
    if (status === 400) return `Invalid request sent to ${url} · HTTP 400.${detailSuffix}`;
    if (status === 401) return `Authentication required or token expired for ${url} · HTTP 401.${detailSuffix}`;
    if (status === 403) return `Access denied by server policy for ${url} · HTTP 403.${detailSuffix}`;
    if (status === 404) return `Backend endpoint not found at ${url} · HTTP 404.${detailSuffix} Verify Server API Base URL in Settings & Sync.`;
    if (status >= 500) return `Backend server error at ${url} · HTTP ${status}.${detailSuffix} Check server logs and retry.`;
    return `${fallback || 'Request failed'} (${url}) · HTTP ${status}.${detailSuffix}`;
}

export async function requestJson(url, options = {}, { timeoutMs = 4500, notifyOnError = true } = {}) {
    try {
        const res = await fetchWithTimeout(url, options, timeoutMs);
        if (!res.ok) {
            const detail = await extractServerDetail(res);
            const msg = mapStatusMessage(res.status, res.statusText, detail, url);
            const err = new HttpApiError(res.status, msg);
            logger.error('httpClient', err, { url });
            if (notifyOnError && errorHandler) errorHandler(msg);
            throw err;
        }
        if (res.status === 204) return null;
        return await res.json();
    } catch (err) {
        if (err instanceof HttpApiError) throw err;
        const msg = err?.name === 'AbortError'
        ? `Request to ${url} timed out after ${timeoutMs}ms. Verify Server API Base URL in Settings & Sync and confirm the backend is running.`
        : `Cannot reach backend at ${url}: ${err?.message || 'network failure'}. Check that the server is running and CORS is allowed.`;
        logger.error('httpClient', err, { url });
        if (notifyOnError && errorHandler) errorHandler(msg);
        throw new HttpApiError(0, msg);
    }
}
