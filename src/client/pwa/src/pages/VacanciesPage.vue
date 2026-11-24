<template>
    <div class="pwa-view">
        <StatsGrid :stats="dashboardStats" />

        <div v-if="!store.isExtensionConnected" class="pwa-card">
            <span class="status-msg">
                Browser extension is not connected. Standalone local mode is active; import/export JSON or set your Extension ID in Settings &amp; Sync.
            </span>
        </div>

        <div class="view-controls-bar">
            <div class="search-input-wrap">
                <input v-model="filterText" type="text" placeholder="Search by title, company, skills or description..." autocomplete="off" />
            </div>
            <div class="view-mode-toggle" role="group" aria-label="Vacancies layout">
                <button type="button" class="view-mode-btn" :class="{ active: layout === 'grid' }" @click="setLayout('grid')">Grid</button>
                <button type="button" class="view-mode-btn" :class="{ active: layout === 'list' }" @click="setLayout('list')">List</button>
            </div>
            <button type="button" class="secondary-btn" :disabled="store.loading" @click="store.refreshDisplay()">
                {{ store.loading ? 'Refreshing...' : 'Refresh List' }}
            </button>
        </div>

        <div class="vacancies-filters-bar">
            <select v-model="sourceFilter" class="form-select" aria-label="Filter by website">
                <option value="">All Websites</option>
                <option v-for="s in availableSources" :key="s" :value="s">{{ s }}</option>
            </select>
            <select v-model="appStatusFilter" class="form-select" aria-label="Filter by application status">
                <option value="">All Statuses</option>
                <option value="none">Not Applied</option>
                <option v-for="st in APPLICATION_STATUSES" :key="st" :value="st">{{ st }}</option>
            </select>
            <select v-model="dateFilter" class="form-select" aria-label="Filter by post date">
                <option value="all">All Post Dates</option>
                <option value="today">Posted Today</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
            </select>
            <select v-model="sortBy" class="form-select" aria-label="Sort vacancies">
                <option value="posted_desc">Sort: Newest Posted</option>
                <option value="updated_desc">Sort: Recently Synced</option>
                <option value="title_asc">Sort: Title A–Z</option>
                <option value="company_asc">Sort: Company A–Z</option>
            </select>
            <button type="button" class="secondary-btn" @click="resetFilters">Reset</button>
            <span class="status-msg">{{ countLabel }}</span>
        </div>

        <section class="content-area" aria-label="Vacancies list">
            <div v-if="store.loading && !store.vacancies.length" class="vacancies-grid">
                <div v-for="n in 6" :key="n" class="ao-skeleton"></div>
            </div>
            <div v-else-if="filteredVacancies.length" :class="layout === 'list' ? 'vacancies-list' : 'vacancies-grid'">
                <div v-for="item in filteredVacancies" :key="item.id" class="vacancy-item" @click="store.selectedVacancyForModal = item">
                    <div :class="layout === 'list' ? 'vacancy-list-main' : ''">
                        <div class="vacancy-title">{{ item.full_position_name || 'Untitled Position' }}</div>
                        <div class="vacancy-company-source-row">
                            <span class="vacancy-company">{{ store.resolveCompanyLabel(item) || 'Company not specified' }}</span>
                            <span class="vacancy-source-badge">{{ store.resolveSourceLabel(item) }}</span>
                        </div>
                        <p v-if="layout === 'list' && item.description" class="vacancy-snippet">
                            {{ item.description.replace(/\s+/g, ' ').trim() }}
                        </p>
                        <div v-if="skillsFor(item).length" class="vacancy-skills-preview">
                            <span v-for="sk in skillsFor(item).slice(0, layout === 'list' ? 6 : 4)" :key="sk" class="skill-chip-sm">{{ sk }}</span>
                        </div>
                    </div>

                    <div :class="layout === 'list' ? 'vacancy-list-aside' : ''">
                        <div class="vacancy-meta-row">
                            <a
                                class="vacancy-link"
                                :href="isSafeHttpUrl(item.url) ? item.url : '#'"
                                target="_blank"
                                rel="noopener noreferrer"
                                @click.stop
                            >
                                <span>Open original</span>
                            </a>
                            <button type="button" class="secondary-btn btn-xs" @click.stop="store.reviewApplyVacancy = item">
                                Review &amp; Apply
                            </button>
                        </div>
                        <div class="vacancy-footer">
                            <span class="vacancy-date">{{ item.posted_at ? `Posted ${formatDate(item.posted_at)}` : 'Post date N/A' }}</span>
                            <select
                                class="form-select ao-select-compact"
                                :value="store.applicationsByVacancy.get(item.id)?.status || ''"
                                aria-label="Application status"
                                @click.stop
                                @change="store.upsertVacancyStatus(item.id, $event.target.value)"
                            >
                                <option value="">Not Applied</option>
                                <option v-for="st in APPLICATION_STATUSES" :key="st" :value="st">{{ st }}</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
            <div v-else class="empty-state">
                <h3>No Vacancies Stored</h3>
                <p>No vacancies currently match your filters. Open Settings &amp; Sync to import from your extension.</p>
                <router-link to="/settings" class="primary-btn ao-nav-link">Go to Settings &amp; Sync</router-link>
            </div>
        </section>

        <HotwordsChart />
    </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import HotwordsChart from '../components/HotwordsChart.vue';
import StatsGrid from '../components/StatsGrid.vue';
import { APPLICATION_STATUSES } from '../models/constants.js';
import { useAppStore } from '../stores/appStore.js';
import { formatDate, isSafeHttpUrl } from '../utils/helpers.js';

const store = useAppStore();
const layout = ref(localStorage.getItem('ao_vacancies_layout') === 'list' ? 'list' : 'grid');
const filterText = ref('');
const sourceFilter = ref('');
const appStatusFilter = ref('');
const dateFilter = ref('all');
const sortBy = ref('posted_desc');

function setLayout(next) {
    layout.value = next;
    localStorage.setItem('ao_vacancies_layout', next);
}

function resetFilters() {
    filterText.value = '';
    sourceFilter.value = '';
    appStatusFilter.value = '';
    dateFilter.value = 'all';
    sortBy.value = 'posted_desc';
}

function skillsFor(item) {
    return store.extractVacancySkills(item);
}

const dashboardStats = computed(() => {
    const total = store.vacancies.length;
    const detailed = store.vacancies.filter((v) => v.status === 'complete' && v.description?.length > 50).length;
    return [
        { value: total, label: 'Total Vacancies' },
        { value: detailed, label: 'Detailed' },
        { value: store.storageWeight.formatted, label: 'Storage Weight' },
    ];
});

const availableSources = computed(() => {
    const set = new Set(store.vacancies.map((v) => store.resolveSourceLabel(v)).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
});

const filteredVacancies = computed(() => {
    const q = filterText.value.trim().toLowerCase();
    let cutoff = 0;
    if (dateFilter.value !== 'all') {
        const days = dateFilter.value === 'today' ? 1 : dateFilter.value === '7days' ? 7 : 30;
        cutoff = Date.now() - days * 86400000;
    }
    const list = store.vacancies.filter((v) => {
        if (sourceFilter.value && store.resolveSourceLabel(v) !== sourceFilter.value) return false;
        const app = store.applicationsByVacancy.get(v.id);
        if (appStatusFilter.value === 'none' && app) return false;
        if (appStatusFilter.value && appStatusFilter.value !== 'none' && app?.status !== appStatusFilter.value) return false;
        if (cutoff > 0) {
            const ts = new Date(v.posted_at || v.created_at).getTime();
            if (isNaN(ts) || ts < cutoff) return false;
        }
        if (q) {
            const company = store.resolveCompanyLabel(v) || '';
            const skills = skillsFor(v).join(' ');
            const hay = `${v.full_position_name || ''} ${company} ${skills} ${v.description || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    return [...list].sort((a, b) => {
        if (sortBy.value === 'title_asc') return (a.full_position_name || '').localeCompare(b.full_position_name || '');
        if (sortBy.value === 'company_asc') return (store.resolveCompanyLabel(a) || 'zzz').localeCompare(store.resolveCompanyLabel(b) || 'zzz');
        if (sortBy.value === 'updated_desc') return (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '');
        return (b.posted_at || b.created_at || '').localeCompare(a.posted_at || a.created_at || '');
    });
});

const countLabel = computed(() =>
    filteredVacancies.value.length === store.vacancies.length
        ? `${filteredVacancies.value.length} shown`
        : `${filteredVacancies.value.length} of ${store.vacancies.length} shown`
);
</script>
