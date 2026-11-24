import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import AppHeader from '../src/components/AppHeader.vue';
import HotwordsChart from '../src/components/HotwordsChart.vue';
import StatsGrid from '../src/components/StatsGrid.vue';
import ToastContainer from '../src/components/ToastContainer.vue';
import { updateDeviceSnapshot } from '../src/composables/useDeviceInfo.js';
import { registerGlobalHttpErrorHandler, requestJson } from '../src/services/httpClient.js';
import { useAppStore } from '../src/stores/appStore.js';

describe('PWA Vue Components & Services', () => {
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

    it('AppHeader renders 5 navigation links and emits toggle-theme', async () => {
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
            props: { theme: 'dark' },
            global: { plugins: [router] },
        });
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

    it('HotwordsChart mounts with empty state prompt', () => {
        const wrapper = mount(HotwordsChart);
        expect(wrapper.text()).toContain('Skills Analytics');
        expect(wrapper.find('select').exists()).toBe(true);
    });

    it('httpClient handles 404/500 errors and notifies global handler', async () => {
        const handler = vi.fn();
        registerGlobalHttpErrorHandler(handler);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));

        await expect(requestJson('http://localhost:8080/api/missing')).rejects.toThrow(/404/);
                expect(handler).toHaveBeenCalledWith(expect.stringContaining('404'));
                vi.unstubAllGlobals();
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
