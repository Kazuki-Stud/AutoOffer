import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import App from '../src/App.vue';
import JobsPage from '../src/pages/JobsPage.vue';
import ProfilePage from '../src/pages/ProfilePage.vue';
import SettingsPage from '../src/pages/SettingsPage.vue';
import { routes } from '../src/router/index.js';
import { useAppStore } from '../src/stores/appStore.js';

vi.mock('../../../extension/database/seed.js', () => ({
    seedDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../extension/database/crypto.js', () => ({
    migrateLegacySecrets: vi.fn().mockResolvedValue(undefined),
    saveAiConfiguration: vi.fn().mockResolvedValue('cfg-1'),
}));
vi.mock('../src/services/bridge.js', () => ({
    calculateStorageWeight: vi.fn().mockResolvedValue({ bytes: 1024, formatted: '1 KB' }),
    callExtension: vi.fn(),
    detectExtensionStatus: vi.fn().mockResolvedValue({ connected: false, text: 'Standalone Mode', type: 'normal' }),
    exportLocalBackup: vi.fn(),
    getExtensionId: vi.fn().mockReturnValue(''),
    importLocalBackup: vi.fn(),
    mirrorVacanciesToLocalDb: vi.fn(),
    saveSingleSetting: vi.fn().mockResolvedValue(undefined),
    setupExtensionAutoPairing: vi.fn().mockResolvedValue(null),
    syncApplicationsFromBridge: vi.fn().mockResolvedValue(undefined),
}));

describe('PWA Integration Flows', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        localStorage.clear();
    });

    it('navigates between routes via Vue Router inside App', async () => {
        const router = createRouter({ history: createMemoryHistory(), routes });
        await router.push('/vacancies');
        await router.isReady();

        const store = useAppStore();
        vi.spyOn(store, 'bootstrap').mockResolvedValue(undefined);

        const wrapper = mount(App, { global: { plugins: [router] } });
        expect(wrapper.text()).toContain('No Vacancies Stored');

        await router.push('/settings');
        await flushPromises();
        expect(wrapper.text()).toContain('Display & Accessibility Preferences');
    });

    it('validates ProfilePage form before saving', async () => {
        const store = useAppStore();
        store.profiles = [{ profile_id: 'p-1', profile_name: 'Default', is_default: 1, first_name: '', last_name: '', email: '' }];
        store.activeProfileId = 'p-1';
        const saveSpy = vi.spyOn(store, 'saveProfile').mockResolvedValue(undefined);

        const wrapper = mount(ProfilePage);
        await wrapper.find('.primary-btn').trigger('click');
        expect(wrapper.text()).toContain('required');
        expect(saveSpy).not.toHaveBeenCalled();

        await wrapper.find('#prof-first').setValue('Anna');
        await wrapper.find('#prof-last').setValue('Koval');
        await wrapper.find('#prof-email').setValue('anna@example.com');
        await wrapper.find('.primary-btn').trigger('click');
        expect(saveSpy).toHaveBeenCalledOnce();
    });

    it('validates JobsPage form and saves job when valid', async () => {
        const store = useAppStore();
        store.profiles = [{ profile_id: 'p-1', profile_name: 'Default', roles: '' }];
        store.activeProfileId = 'p-1';
        store.platforms = [{ id: 'pl-1', name: 'Indeed', code: 'indeed.com', url: 'https://www.indeed.com', permission_status: 'granted' }];
        const saveJobSpy = vi.spyOn(store, 'saveJob').mockResolvedValue(undefined);

        const wrapper = mount(JobsPage);
        await wrapper.find('.primary-btn').trigger('click');
        expect(wrapper.text()).toContain('Select at least one target platform');
        expect(saveJobSpy).not.toHaveBeenCalled();

        await wrapper.find('.platform-chip').trigger('click');
        await wrapper.find('#job-roles').setValue('Frontend Developer');
        await wrapper.find('.primary-btn').trigger('click');
        expect(saveJobSpy).toHaveBeenCalledOnce();
    });

    it('updates UI scale and theme in SettingsPage', async () => {
        const store = useAppStore();
        const wrapper = mount(SettingsPage);
        await wrapper.find('#display-scale').setValue('120');
        expect(store.uiScale).toBe(120);
        expect(document.documentElement.style.fontSize).toBe('120%');
    });
});
