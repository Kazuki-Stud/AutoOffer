import { createRouter, createWebHashHistory } from 'vue-router';
import VacanciesPage from '../pages/VacanciesPage.vue';
import ApplicationsPage from '../pages/ApplicationsPage.vue';
import JobsPage from '../pages/JobsPage.vue';
import ProfilePage from '../pages/ProfilePage.vue';
import SettingsPage from '../pages/SettingsPage.vue';

export const routes = [
    { path: '/', redirect: '/vacancies' },
    { path: '/vacancies', name: 'vacancies', component: VacanciesPage, meta: { label: 'Vacancies' } },
    { path: '/applications', name: 'applications', component: ApplicationsPage, meta: { label: 'Applications' } },
    { path: '/jobs', name: 'jobs', component: JobsPage, meta: { label: 'Jobs & Automation' } },
    { path: '/profile', name: 'profile', component: ProfilePage, meta: { label: 'Profile & Resumes' } },
    { path: '/settings', name: 'settings', component: SettingsPage, meta: { label: 'Settings & Sync' } },
];

export const router = createRouter({
    history: createWebHashHistory(),
    routes,
});
