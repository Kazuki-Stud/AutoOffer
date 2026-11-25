<template>
    <div class="ao-toast-stack" aria-live="polite">
        <div
            v-for="t in store.toasts"
            :key="t.id"
            class="ao-toast"
            :class="`ao-toast--${t.type}`"
            role="status"
        >
            <span>{{ t.message }}</span>
            <button
            type="button"
            class="ao-toast-close"
            aria-label="Dismiss notification"
            @click="store.dismissToast(t.id)"
            >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
            </svg>
        </button>
        </div>
    </div>
</template>

<script setup>
import { useAppStore } from '../stores/appStore.js';
const store = useAppStore();
</script>
