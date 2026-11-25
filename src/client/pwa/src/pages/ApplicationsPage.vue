<template>
    <div class="pwa-view">
        <div class="pwa-card">
            <div class="card-header-bar">
                <h2>Application Lifecycle Tracker</h2>
                <span class="tag-status">{{ rows.length }} application{{ rows.length === 1 ? '' : 's' }}</span>
            </div>
            <div class="view-controls-bar ao-section-spaced">
                <div class="search-input-wrap">
                    <input v-model="searchQuery" type="text" placeholder="Filter by company, role, resume or notes..." autocomplete="off" />
                </div>
                <select v-model="statusFilter" class="form-select ao-select-compact" aria-label="Filter applications by status">
                    <option value="">All Statuses</option>
                    <option v-for="st in APPLICATION_STATUSES" :key="st" :value="st">{{ st }}</option>
                </select>
            </div>
            <div v-if="store.loading && !rows.length" class="ao-skeleton ao-section-spaced"></div>
<div v-else-if="!rows.length" class="empty-state">
                <h3>No Applications Tracked Yet</h3>
                <p>Change a vacancy status in the Vacancies tab or submit via Review &amp; Apply to start tracking your pipeline.</p>
            </div>
            <div v-else class="applications-table-wrap ao-section-spaced">
                <table class="applications-table">
                    <thead>
                        <tr>
                            <th>Company</th>
                            <th>Role / Position</th>
                            <th>Applied</th>
                            <th>Resume Variant</th>
                            <th>Match Score</th>
                            <th>Status</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in rows" :key="row.app.id">
                            <td data-label="Company">{{ row.companyName }}</td>
                            <td data-label="Role">
                                <button v-if="row.vac" type="button" class="app-role-link" @click="store.selectedVacancyForModal = row.vac">
                                    {{ row.roleName }}
                                </button>
                                <span v-else>{{ row.roleName }}</span>
                            </td>
                            <td data-label="Applied">{{ formatDateTime(row.app.applied_at) }}</td>
                            <td data-label="Resume">{{ row.resumeTitle }}</td>
                            <td data-label="Match Score">
                                <span class="ao-pill" :data-status="row.app.match_score != null && row.app.match_score >= 70 ? 'complete' : 'basic'">
                                    {{ row.app.match_score != null ? `${row.app.match_score}%` : '—' }}
                                </span>
                            </td>
                            <td data-label="Status">
                                <select
                                    class="form-select"
                                    :value="row.app.status"
                                    aria-label="Update status"
                                    @change="store.updateApplicationStatusAndNotes(row.app.id, { status: $event.target.value })"
                                >
                                    <option v-for="st in APPLICATION_STATUSES" :key="st" :value="st">{{ st }}</option>
                                </select>
                            </td>
                            <td data-label="Notes">
                                <input
                                    type="text"
                                    class="inline-notes-input"
                                    placeholder="Add follow-up note..."
                                    :value="row.app.notes || ''"
                                    @change="store.updateApplicationStatusAndNotes(row.app.id, { notes: $event.target.value.trim() || null })"
                                />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { APPLICATION_STATUSES } from '../models/constants.js';
import { useAppStore } from '../stores/appStore.js';
import { formatDateTime } from '../utils/helpers.js';

const store = useAppStore();
const searchQuery = ref('');
const statusFilter = ref('');

const rows = computed(() => {
    const vacById = new Map(store.vacancies.map((v) => [v.id, v]));
    const q = searchQuery.value.trim().toLowerCase();

    return store.allApplications
        .map((app) => {
            const vac = vacById.get(app.vacancy_id) || null;
            const company = vac ? store.resolveCompanyLabel(vac) : null;
            const companyName = company || (vac ? store.resolveSourceLabel(vac) : '—');
            const roleName = vac?.full_position_name || 'Untitled Vacancy';
            const resumeTitle = app.resume_id ? store.resumesMap.get(app.resume_id)?.title || '—' : '—';
            return { app, vac, companyName, roleName, resumeTitle };
        })
        .filter((row) => {
            if (statusFilter.value && row.app.status !== statusFilter.value) return false;
            if (!q) return true;
            return `${row.companyName} ${row.roleName} ${row.resumeTitle} ${row.app.notes || ''}`.toLowerCase().includes(q);
        });
});
</script>
