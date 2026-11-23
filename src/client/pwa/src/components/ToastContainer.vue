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
                &times;
            </button>
        </div>
    </div>
</template>

<script setup>
import { useAppStore } from '../stores/appStore.js';
const store = useAppStore();
</script>
