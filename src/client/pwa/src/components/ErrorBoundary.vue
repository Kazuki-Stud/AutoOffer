<template>
    <div v-if="capturedError" class="ao-error-banner" role="alert">
        <span><strong>Unexpected UI Error:</strong> {{ capturedError }}</span>
        <button type="button" class="secondary-btn" @click="resetError">
            {{ renderCrashed ? 'Retry' : 'Dismiss' }}
        </button>
    </div>
    <slot v-if="!renderCrashed" />
</template>

<script setup>
import { onErrorCaptured, onMounted, onUnmounted, ref } from 'vue';
import { logger } from '../services/logger.js';

const capturedError = ref(null);
const renderCrashed = ref(false);

function resetError() {
    capturedError.value = null;
    renderCrashed.value = false;
}

function onUnhandledRejection(e) {
    logger.error('ErrorBoundary', e.reason);
    capturedError.value = e.reason?.message || String(e.reason || 'Unhandled async failure');
}

onErrorCaptured((err) => {
    logger.error('ErrorBoundary', err);
    capturedError.value = err?.message || 'Component rendering error';
    renderCrashed.value = true;
    return false;
});

onMounted(() => window.addEventListener('unhandledrejection', onUnhandledRejection));
onUnmounted(() => window.removeEventListener('unhandledrejection', onUnhandledRejection));
</script>
