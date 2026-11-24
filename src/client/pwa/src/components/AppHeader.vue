<template>
    <header class="app-header">
        <div class="header-top-row">
            <div class="brand-group">
                <img :src="`${baseUrl}image.svg`" alt="AutoOffer logo" class="header-brand-logo" width="30" height="30" />
                <h1 class="header-brand-title">AutoOffer</h1>
                <span class="hub-badge">Local Hub</span>
            </div>
            <div class="header-actions">
                <nav class="pwa-nav" aria-label="Main navigation">
                    <router-link
                        v-for="item in navItems"
                        :key="item.to"
                        :to="item.to"
                        class="pwa-nav-btn ao-nav-link"
                        active-class="active"
                    >
                        {{ item.label }}
                    </router-link>
                </nav>
                <button
                    class="theme-toggle-pill"
                    type="button"
                    aria-label="Toggle theme"
                    title="Switch Theme"
                    @click="$emit('toggle-theme')"
                >
                    <span class="theme-icon sun-icon" :class="{ active: theme !== 'dark' }">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="4" />
                            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                        </svg>
                    </span>
                    <span class="theme-icon moon-icon" :class="{ active: theme === 'dark' }">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                        </svg>
                    </span>
                </button>
            </div>
        </div>
    </header>
</template>

<script setup>
const baseUrl = import.meta.env.BASE_URL || '/';

defineProps({
    theme: { type: String, default: 'dark' },
});
defineEmits(['toggle-theme']);

const navItems = [
    { to: '/vacancies', label: 'Vacancies' },
    { to: '/applications', label: 'Applications' },
    { to: '/jobs', label: 'Jobs & Automation' },
    { to: '/profile', label: 'Profile & Resumes' },
    { to: '/settings', label: 'Settings & Sync' },
];
</script>
