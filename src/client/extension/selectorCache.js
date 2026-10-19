import { db } from './database.js';

class SelectorCache {
    constructor() {
        this.cache = new Map();
        this.isInitialized = false;
    }

    async init() {
        const activeSelectors = await db.selectors
            .where('is_active')
            .equals(1)
            .or('is_active')
            .equals(true)
            .toArray();

        this.cache.clear();

        for (const item of activeSelectors) {
            const pattern = item.url_pattern || 'default';
            if (!this.cache.has(pattern)) {
                this.cache.set(pattern, new Map());
            }
            this.cache.get(pattern).set(item.element_type_id, item.selector_string);
        }

        this.isInitialized = true;
    }

    getSelectorsForUrl(url) {
        for (const [pattern, selectorsMap] of this.cache.entries()) {
            if (url.includes(pattern)) {
                return Object.fromEntries(selectorsMap);
            }
        }
        return null;
    }

    invalidate() {
        this.cache.clear();
        this.isInitialized = false;
    }
}

export const selectorCache = new SelectorCache();