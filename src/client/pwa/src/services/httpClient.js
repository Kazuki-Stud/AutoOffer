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

function mapStatusMessage(status, fallback) {
    if (status === 401) return 'Authentication required or session expired · HTTP 401';
    if (status === 403) return 'Access denied by server policy · HTTP 403';
    if (status === 404) return 'Requested backend resource not found · HTTP 404';
    if (status >= 500) return `Backend server error · HTTP ${status}. Please try again later.`;
    return fallback || `Request failed · HTTP ${status}`;
}

export async function requestJson(url, options = {}, { timeoutMs = 4500, notifyOnError = true } = {}) {
    try {
        const res = await fetchWithTimeout(url, options, timeoutMs);
        if (!res.ok) {
            const msg = mapStatusMessage(res.status, res.statusText);
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
            ? 'Backend request timed out.'
            : `Network error: ${err?.message || 'Backend unreachable'}`;
        logger.error('httpClient', err, { url });
        if (notifyOnError && errorHandler) errorHandler(msg);
        throw new HttpApiError(0, msg);
    }
}
