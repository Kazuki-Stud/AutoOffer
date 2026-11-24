export const logger = {
    info(scope, msg, meta = null) {
        console.info(`[AutoOffer:${scope}] ${msg}`, meta ?? '');
    },
    warn(scope, msg, meta = null) {
        console.warn(`[AutoOffer:${scope}] ${msg}`, meta ?? '');
    },
    error(scope, err, meta = null) {
        console.error(`[AutoOffer:${scope}]`, err, meta ?? '');
    },
};
