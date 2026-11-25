import 'fake-indexeddb/auto';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import AppHeader from '../src/components/AppHeader.vue';
import HotwordsChart from '../src/components/HotwordsChart.vue';
import StatsGrid from '../src/components/StatsGrid.vue';
import ToastContainer from '../src/components/ToastContainer.vue';
import { updateDeviceSnapshot } from '../src/composables/useDeviceInfo.js';
import { registerGlobalHttpErrorHandler, requestJson } from '../src/services/httpClient.js';
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

describe('PWA Vue Components & Services (Real Backend)', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('StatsGrid renders metric cards', () => {
        const wrapper = mount(StatsGrid, {
            props: {
                stats: [
                    { value: 12, label: 'Total Vacancies' },
                    { value: 8, label: 'Detailed' },
                    { value: '24 KB', label: 'Storage Weight' },
                ],
            },
        });
        expect(wrapper.findAll('.ao-stat-card')).toHaveLength(3);
        expect(wrapper.text()).toContain('12');
        expect(wrapper.text()).toContain('Total Vacancies');
    });

    it('AppHeader renders 5 navigation links, connection badge, and emits toggle-theme', async () => {
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/vacancies', component: { template: '<div />' } },
                { path: '/applications', component: { template: '<div />' } },
                { path: '/jobs', component: { template: '<div />' } },
                { path: '/profile', component: { template: '<div />' } },
                { path: '/settings', component: { template: '<div />' } },
            ],
        });
        await router.push('/vacancies');
        await router.isReady();

        const wrapper = mount(AppHeader, {
            props: { theme: 'dark', connected: false },
            global: { plugins: [router] },
        });
        expect(wrapper.find('.hub-badge').text()).toBe('Extension Disconnected');
        await wrapper.setProps({ connected: true });
        expect(wrapper.find('.hub-badge').text()).toBe('Extension Connected');
        expect(wrapper.findAll('.pwa-nav-btn')).toHaveLength(5);
        await wrapper.find('.theme-toggle-pill').trigger('click');
        expect(wrapper.emitted('toggle-theme')).toHaveLength(1);
    });

    it('ToastContainer displays and dismisses notifications', async () => {
        const store = useAppStore();
        store.notify('Failed to sync', 'error', 0);
        const wrapper = mount(ToastContainer);
        expect(wrapper.text()).toContain('Failed to sync');
        await wrapper.find('.ao-toast-close').trigger('click');
        expect(store.toasts).toHaveLength(0);
    });

    it('HotwordsChart loads positions from real backend /api/dictionaries/bootstrap', async () => {
        const store = useAppStore();
        store.settings.server_base_url = baseUrl;

        const wrapper = mount(HotwordsChart);
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Backend Developer');
        });
        expect(wrapper.text()).toContain('Skills Analytics');
        expect(wrapper.find('select').exists()).toBe(true);
    });

    it('httpClient handles real 401/403 response from backend and notifies global handler', async () => {
        const captured = [];
        registerGlobalHttpErrorHandler((msg) => captured.push(msg));

        await expect(requestJson(`${baseUrl}/api/admin/selectors/queue`)).rejects.toMatchObject({
            name: 'HttpApiError',
        });
        expect(captured).toHaveLength(1);
        expect(captured[0]).toMatch(/HTTP 40[13]/);
    });

    it('useDeviceInfo detects device type and orientation attributes', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 780 });
        updateDeviceSnapshot();
        expect(document.documentElement.getAttribute('data-device')).toBe('mobile');
        expect(document.documentElement.getAttribute('data-orientation')).toBe('portrait');

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 });
        updateDeviceSnapshot();
        expect(document.documentElement.getAttribute('data-device')).toBe('ultrawide');
        expect(document.documentElement.getAttribute('data-orientation')).toBe('landscape');
    });
});
