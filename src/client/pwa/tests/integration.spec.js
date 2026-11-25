import 'fake-indexeddb/auto';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { db } from '../../extension/database/database.js';
import { setSetting } from '../../extension/database/repository.js';
import { seedDatabase } from '../../extension/database/seed.js';
import App from '../src/App.vue';
import JobsPage from '../src/pages/JobsPage.vue';
import ProfilePage from '../src/pages/ProfilePage.vue';
import SettingsPage from '../src/pages/SettingsPage.vue';
import { routes } from '../src/router/index.js';
import { useAppStore } from '../src/stores/appStore.js';

const baseUrl = (process.env.AO_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

beforeAll(async () => {
    try {
        const res = await fetch(`${baseUrl}/api/health`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
        throw new Error(
            `Real backend server is not reachable at ${baseUrl}/api/health (${err.message}). Start PostgreSQL, ClickHouse, and Spring Boot before running npm test.`
        );
    }
});

describe('PWA Integration Flows (Real IndexedDB, Router & Backend)', () => {
    beforeEach(async () => {
        setActivePinia(createPinia());
        localStorage.clear();
        await db.open();
        for (const table of db.tables) {
            await table.clear();
        }
        await seedDatabase();
        await setSetting('server_base_url', baseUrl);
    });

    it('navigates between routes via Vue Router inside App with real DB & backend', async () => {
        const router = createRouter({ history: createMemoryHistory(), routes });
        await router.push('/vacancies');
        await router.isReady();

        const store = useAppStore();
        store.settings.server_base_url = baseUrl;

        const wrapper = mount(App, { global: { plugins: [router] } });
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('No Vacancies Stored');
        });

        await router.push('/settings');
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Display & Accessibility Preferences');
        });
    });

    it('validates ProfilePage form and persists profile to IndexedDB', async () => {
        const store = useAppStore();
        await store.loadProfiles();

        const wrapper = mount(ProfilePage);
        await wrapper.find('.primary-btn').trigger('click');
        expect(wrapper.text()).toContain('required');
        expect(await db.personal_data.count()).toBe(0);

        await wrapper.find('#prof-first').setValue('Anna');
        await wrapper.find('#prof-last').setValue('Koval');
        await wrapper.find('#prof-email').setValue('anna@example.com');
        await wrapper.find('.primary-btn').trigger('click');
        await vi.waitFor(async () => {
            expect(await db.personal_data.count()).toBe(1);
        });

        const saved = await db.personal_data.toArray();
        expect(saved[0].email).toBe('anna@example.com');
    });

    it('validates JobsPage form and persists job to IndexedDB using seeded platforms', async () => {
        const store = useAppStore();
        await Promise.all([store.loadProfiles(), store.loadPlatforms()]);

        const wrapper = mount(JobsPage);
        await wrapper.find('.primary-btn').trigger('click');
        expect(wrapper.text()).toContain('Select at least one target platform');
        expect(await db.automation_jobs.count()).toBe(0);

        await wrapper.find('.platform-chip').trigger('click');
        await wrapper.find('#job-roles').setValue('Frontend Developer');
        await wrapper.find('.primary-btn').trigger('click');
        await vi.waitFor(async () => {
            expect(await db.automation_jobs.count()).toBe(1);
        });

        const jobs = await db.automation_jobs.toArray();
        expect(jobs[0].roles).toBe('Frontend Developer');
    });

    it('updates UI scale and theme in SettingsPage', async () => {
        const store = useAppStore();
        const wrapper = mount(SettingsPage);
        await wrapper.find('#display-scale').setValue('120');
        expect(store.uiScale).toBe(120);
        expect(document.documentElement.style.fontSize).toBe('120%');
        expect(localStorage.getItem('ao_ui_scale')).toBe('120');
    });
});
