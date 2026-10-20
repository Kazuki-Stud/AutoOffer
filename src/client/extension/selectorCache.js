import { db } from './database.js';

class SelectorCache {
    constructor() {
        this.cache = new Map();
        this.isInitialized = false;
    }

    async init() {
        try {
            const allSelectors = await db.selectors.toArray();
            const activeSelectors = allSelectors.filter(item => Boolean(item.is_active));

            this.cache.clear();

            for (const item of activeSelectors) {
                const pattern = item.url_pattern || 'default';
                if (!this.cache.has(pattern)) {
                    this.cache.set(pattern, new Map());
                }
                this.cache.get(pattern).set(item.element_type_id, item.selector_string);
            }

            this.isInitialized = true;
            console.log(`[AutoOffer SelectorCache] Initialized with ${activeSelectors.length} active selectors.`);
        } catch (err) {
            console.error('[AutoOffer SelectorCache] Failed to initialize:', err);
            throw err;
        }
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
        console.log('[AutoOffer SelectorCache] Invalidation completed.');
    }
}

export const selectorCache = new SelectorCache();