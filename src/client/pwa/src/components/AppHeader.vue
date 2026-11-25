<template>
    <header class="app-header">
        <div class="header-top-row">
            <div class="brand-group">
                <img :src="`${baseUrl}image.svg`" alt="AutoOffer logo" class="header-brand-logo" width="30" height="30" />
                <h1 class="header-brand-title">AutoOffer</h1>
                <span class="hub-badge" :class="{ 'hub-badge--connected': connected }">
                    {{ connected ? 'Extension Connected' : 'Extension Disconnected' }}
                </span>
            </div>
            <div class="header-actions">
                <nav class="pwa-nav" aria-label="Main navigation">
                    <router-link
                    v-for="item in navItems"
                    :key="item.to"
                    :to="item.to"
                    :aria-label="item.label"
                    class="pwa-nav-btn ao-nav-link"
                    active-class="active"
                    >
                    <svg class="nav-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path :d="item.iconPath" />
                    </svg>
                    <span class="nav-label-full">{{ item.label }}</span>
                    <span class="nav-label-short" aria-hidden="true">{{ item.shortLabel }}</span>
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
        connected: { type: Boolean, default: false },
});
defineEmits(['toggle-theme']);

const navItems = [
    {
        to: '/vacancies',
        label: 'Vacancies',
        shortLabel: 'Vacancies',
        iconPath: 'M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zm5-4h8v4H8V3z',
    },
    {
        to: '/applications',
        label: 'Applications',
        shortLabel: 'Applied',
        iconPath: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    },
    {
        to: '/jobs',
        label: 'Jobs & Automation',
        shortLabel: 'Jobs',
        iconPath: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    },
    {
        to: '/profile',
        label: 'Profile & Resumes',
        shortLabel: 'Profile',
        iconPath: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    },
    {
        to: '/settings',
        label: 'Settings & Sync',
        shortLabel: 'Settings',
        iconPath: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-1.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.02 1.51 1H21a2 2 0 1 1 0 4h-.09c-.74 0-1.25.4-1.51 1z',
    },
];
</script>
