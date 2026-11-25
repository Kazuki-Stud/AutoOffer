import { createRouter, createWebHashHistory } from 'vue-router';

export const routes = [
    { path: '/', redirect: '/vacancies' },
    {
        path: '/vacancies',
        name: 'vacancies',
        component: () => import('../pages/VacanciesPage.vue'),
        meta: { label: 'Vacancies' },
    },
    {
        path: '/applications',
        name: 'applications',
        component: () => import('../pages/ApplicationsPage.vue'),
        meta: { label: 'Applications' },
    },
    {
        path: '/jobs',
        name: 'jobs',
        component: () => import('../pages/JobsPage.vue'),
        meta: { label: 'Jobs & Automation' },
    },
    {
        path: '/profile',
        name: 'profile',
        component: () => import('../pages/ProfilePage.vue'),
        meta: { label: 'Profile & Resumes' },
    },
    {
        path: '/settings',
        name: 'settings',
        component: () => import('../pages/SettingsPage.vue'),
        meta: { label: 'Settings & Sync' },
    },
];

export const router = createRouter({
    history: createWebHashHistory(),
    routes,
});
