<template>
    <div class="pwa-card">
        <div class="card-header-bar analytics-header-bar">
            <div>
                <h2>Skills Analytics (Market Demand)</h2>
                <span class="status-msg">Most frequent skills for the selected role</span>
            </div>
            <div class="analytics-controls">
                <select v-model="selectedPositionId" class="form-select" aria-label="Filter skills by role" @change="loadHotwords">
                    <option value="">All Positions / Roles</option>
                    <option v-for="pos in positions" :key="pos.id" :value="pos.id">{{ pos.name }}</option>
                </select>
                <button type="button" class="secondary-btn" :disabled="loading" @click="loadHotwords">
                    {{ loading ? 'Loading...' : 'Load Analytics' }}
                </button>
            </div>
        </div>
        <div class="status-msg">{{ statusText }}</div>
        <div v-if="loading" class="ao-skeleton ao-section-spaced"></div>
        <div v-else-if="chartRows.length" class="hotwords-chart-wrap" aria-live="polite">
            <svg :viewBox="`0 0 640 ${svgHeight}`" class="hotwords-svg" role="img" aria-label="Skill demand frequency bar chart">
                <g v-for="(row, idx) in chartRows" :key="`${row.skillName}-${idx}`">
                    <text x="4" :y="idx * 32 + 23" fill="currentColor" font-size="12" font-weight="600">
                        <title>{{ row.skillName }} ({{ row.positionName || 'All' }}): {{ row.vacancyCount }} vacancies</title>
                        {{ formatLabel(row) }}
                    </text>
                    <rect x="175" :y="idx * 32 + 10" width="384" height="18" rx="4" fill="rgba(148, 163, 184, 0.16)" />
                    <rect x="175" :y="idx * 32 + 10" :width="barWidth(row.vacancyCount)" height="18" rx="4" fill="var(--color-primary, #3b82f6)" />
                    <text x="569" :y="idx * 32 + 23" fill="var(--text-secondary, #94a3b8)" font-size="12" font-weight="600">
                        {{ row.vacancyCount }}
                    </text>
                </g>
            </svg>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { db } from '../../../extension/database/database.js';
import { requestJson } from '../services/httpClient.js';
import { useAppStore } from '../stores/appStore.js';

const store = useAppStore();
const positions = ref([]);
const selectedPositionId = ref('');
const rows = ref([]);
const loading = ref(false);
const statusText = ref('Select a role and click "Load Analytics" to query public skill demand.');

const chartRows = computed(() => rows.value.slice(0, 15));
const maxCount = computed(() => Math.max(...chartRows.value.map((r) => Number(r.vacancyCount) || 0), 1));
const svgHeight = computed(() => chartRows.value.length * 32 + 12);

function barWidth(cnt) {
    return Math.max(4, Math.round(((Number(cnt) || 0) / maxCount.value) * 384));
}

function formatLabel(row) {
    const raw = row.positionName && !selectedPositionId.value ? `${row.skillName} (${row.positionName})` : row.skillName;
    return raw.length > 25 ? `${raw.slice(0, 23)}…` : raw;
}

async function populatePositions() {
    const base = (store.settings.server_base_url || 'http://localhost:8080').replace(/\/+$/, '');
    try {
        const boot = await requestJson(`${base}/api/dictionaries/bootstrap`, {}, { timeoutMs: 3500, notifyOnError: false });
        if (Array.isArray(boot?.positions) && boot.positions.length) {
            positions.value = boot.positions;
            return;
        }
    } catch {}
    positions.value = await db.positions_dict.toArray().catch(() => []);
}

async function loadHotwords() {
    const base = (store.settings.server_base_url || 'http://localhost:8080').replace(/\/+$/, '');
    const posId = selectedPositionId.value;
    const roleName = positions.value.find((p) => p.id === posId)?.name || '';
    const qs = posId ? `?positionId=${encodeURIComponent(posId)}` : '';

    loading.value = true;
    statusText.value = 'Loading skill demand...';
    rows.value = [];

    try {
        let data = await requestJson(`${base}/api/skills/hotwords${qs}`, {}, { timeoutMs: 5000, notifyOnError: false });
        if (!Array.isArray(data) || !data.length) {
            const ch = await requestJson(`${base}/api/analytics/skills-demand`, {}, { timeoutMs: 4000, notifyOnError: false }).catch(() => null);
            const items = Array.isArray(ch?.data) ? ch.data : [];
            data = items
                .filter((d) => !posId || d.position_name === roleName)
                .map((d) => ({ positionName: d.position_name, skillName: d.skill_name, vacancyCount: Number(d.total_vacancies) || 0 }));
        }
        rows.value = Array.isArray(data) ? data : [];
        statusText.value = rows.value.length
            ? `Showing top ${Math.min(rows.value.length, 15)} skills${roleName ? ` for ${roleName}` : ''}:`
            : 'No aggregated skill hotwords available for this role yet.';
    } catch (err) {
        statusText.value = `Could not reach backend analytics (${err.message}).`;
    } finally {
        loading.value = false;
    }
}

onMounted(() => {
    populatePositions().catch(() => {});
});
</script>
