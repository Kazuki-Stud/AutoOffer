import 'fake-indexeddb/auto';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { db } from '../../extension/database/database.js';
import { seedDatabase } from '../../extension/database/seed.js';
import ErrorBoundary from '../src/components/ErrorBoundary.vue';
import VacancyModal from '../src/components/VacancyModal.vue';
import ApplicationsPage from '../src/pages/ApplicationsPage.vue';
import VacanciesPage from '../src/pages/VacanciesPage.vue';
import { useAppStore } from '../src/stores/appStore.js';

describe('PWA Component & Page Offline Unit Tests', () => {
    beforeEach(async () => {
        setActivePinia(createPinia());
        localStorage.clear();
        await db.open();
        for (const table of db.tables) {
            await table.clear();
        }
        await seedDatabase();
    });

    it('ErrorBoundary isolates persistent child render errors even after retry', async () => {
        const Boom = {
            setup() {
                throw new Error('Render explosion');
            },
            template: '<div />',
        };
        const wrapper = mount(ErrorBoundary, {
            slots: { default: Boom },
        });
        await nextTick();
        expect(wrapper.find('[role="alert"]').text()).toContain('Render explosion');

        await wrapper.find('.ao-error-banner button').trigger('click');
        await nextTick();
        expect(wrapper.find('[role="alert"]').text()).toContain('Render explosion');
    });

    it('ErrorBoundary catches transient child event errors and recovers on retry', async () => {
        const ActionChild = {
            template: '<button class="trigger-err" @click="fail">Trigger</button>',
            methods: {
                fail() {
                    throw new Error('Action explosion');
                },
            },
        };
        const wrapper = mount(ErrorBoundary, {
            slots: { default: ActionChild },
        });
        await wrapper.find('.trigger-err').trigger('click');
        await nextTick();
        expect(wrapper.find('[role="alert"]').text()).toContain('Action explosion');

        await wrapper.find('.ao-error-banner button').trigger('click');
        await nextTick();
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
        expect(wrapper.find('.trigger-err').exists()).toBe(true);
    });

    it('VacancyModal displays vacancy metadata, emits review-apply, and closes on Escape', async () => {
        const store = useAppStore();
        const vacancy = {
            id: '00000000-0000-4000-8000-000000000111',
            full_position_name: 'Backend Engineer',
            description: 'Java 21 and PostgreSQL experience required.',
            url: 'https://www.indeed.com/viewjob?jk=123',
            source_host: 'indeed.com',
            posted_at: '2026-11-20T10:00:00Z',
            skill_ids: [],
        };
        const wrapper = mount(VacancyModal, { props: { vacancy } });
        expect(wrapper.text()).toContain('Backend Engineer');
        expect(wrapper.text()).toContain('Java 21');
        expect(store.vacancies).toHaveLength(0);

        await wrapper.find('.ao-modal-footer-actions button').trigger('click');
        expect(wrapper.emitted('review-apply')).toHaveLength(1);

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('VacanciesPage filters by search query and persists layout toggle', async () => {
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/vacancies', component: VacanciesPage },
                { path: '/settings', component: { template: '<div />' } },
            ],
        });
        await router.push('/vacancies');
        await router.isReady();

        const store = useAppStore();
        store.vacancies = [
            {
                id: '00000000-0000-4000-8000-000000000201',
                full_position_name: 'Vue Frontend Engineer',
                source_host: 'indeed.com',
                url: 'https://indeed.com/1',
                description: 'Vue 3 and TypeScript role',
                status: 'complete',
                skill_ids: [],
                created_at: '2026-11-21T10:00:00Z',
                updated_at: '2026-11-21T10:00:00Z',
            },
            {
                id: '00000000-0000-4000-8000-000000000202',
                full_position_name: 'Java Platform Architect',
                source_host: 'ziprecruiter.com',
                url: 'https://ziprecruiter.com/2',
                description: 'Spring Boot role',
                status: 'complete',
                skill_ids: [],
                created_at: '2026-11-20T10:00:00Z',
                updated_at: '2026-11-20T10:00:00Z',
            },
        ];

        const wrapper = mount(VacanciesPage, {
            global: {
                plugins: [router],
                stubs: { HotwordsChart: true },
            },
        });
        expect(wrapper.findAll('.vacancy-item')).toHaveLength(2);

        await wrapper.find('.search-input-wrap input').setValue('Java');
        expect(wrapper.findAll('.vacancy-item')).toHaveLength(1);
        expect(wrapper.text()).toContain('Java Platform Architect');

        const listBtn = wrapper.findAll('.view-mode-btn')[1];
        await listBtn.trigger('click');
        expect(wrapper.find('.vacancies-list').exists()).toBe(true);
        expect(localStorage.getItem('ao_vacancies_layout')).toBe('list');
    });

    it('ApplicationsPage filters rows by status and search text', () => {
        const store = useAppStore();
        store.vacancies = [
            {
                id: '00000000-0000-4000-8000-000000000301',
                full_position_name: 'Frontend Engineer',
                source_host: 'indeed.com',
                url: 'https://indeed.com/1',
            },
            {
                id: '00000000-0000-4000-8000-000000000302',
                full_position_name: 'Backend Engineer',
                source_host: 'indeed.com',
                url: 'https://indeed.com/2',
            },
        ];
        store.allApplications = [
            {
                id: '00000000-0000-4000-8000-000000000401',
                profile_id: 'p1',
                vacancy_id: '00000000-0000-4000-8000-000000000301',
                status: 'Applied',
                match_score: 85,
                applied_at: '2026-11-21T10:00:00Z',
                notes: 'Waiting reply',
            },
            {
                id: '00000000-0000-4000-8000-000000000402',
                profile_id: 'p1',
                vacancy_id: '00000000-0000-4000-8000-000000000302',
                status: 'Interview',
                match_score: 92,
                applied_at: '2026-11-22T10:00:00Z',
                notes: 'Technical screen Friday',
            },
        ];

        const wrapper = mount(ApplicationsPage);
        expect(wrapper.findAll('tbody tr')).toHaveLength(2);

        return wrapper
            .find('select[aria-label="Filter applications by status"]')
            .setValue('Interview')
            .then(() => {
                expect(wrapper.findAll('tbody tr')).toHaveLength(1);
                expect(wrapper.text()).toContain('Backend Engineer');
            });
    });
});
