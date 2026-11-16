import { db } from './database/database.js';
import { rollbackSelector } from './database/repository.js';

class SelectorCache {
    constructor() {
        this.cache = new Map();
        this.isInitialized = false;
    }

    async init() {
        const activeSelectors = await db.selectors.where('is_active').equals(1).toArray();
        this.cache.clear();
        for (const item of activeSelectors) {
            const pattern = item.url_pattern || 'default';
            if (!this.cache.has(pattern)) this.cache.set(pattern, new Map());
            this.cache.get(pattern).set(item.element_type_id, item);
        }
        this.isInitialized = true;
    }

    getSelectorsForUrl(url) {
        for (const [pattern, selectorsMap] of this.cache.entries()) {
            if (url.includes(pattern)) {
                const out = {};
                for (const [elId, rec] of selectorsMap.entries()) {
                    out[elId] = rec.selector_string;
                }
                return out;
            }
        }
        return null;
    }

    async rollbackForUrl(url, elementTypeId) {
        for (const [pattern, selectorsMap] of this.cache.entries()) {
            if (url.includes(pattern) && selectorsMap.has(elementTypeId)) {
                const rec = selectorsMap.get(elementTypeId);
                const rolled = await rollbackSelector(rec.id);
                if (rolled) await this.init();
                return rolled;
            }
        }
        return false;
    }

    invalidate() {
        this.cache.clear();
        this.isInitialized = false;
    }
}

export const selectorCache = new SelectorCache();