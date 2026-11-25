<template>
    <div
        v-if="vacancy"
        class="ao-overlay-modal"
        open
        role="dialog"
        aria-modal="true"
        aria-labelledby="ao-modal-title"
        @click.self="$emit('close')"
    >
        <div ref="modalCard" class="ao-modal-card" tabindex="-1">
            <div class="ao-modal-header">
                <h2 id="ao-modal-title" class="ao-modal-title">{{ vacancy.full_position_name || 'Untitled Vacancy' }}</h2>
                <button class="ao-modal-close" type="button" aria-label="Close" @click="$emit('close')">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="ao-modal-body">
                <div class="ao-modal-meta-grid">
                    <div v-for="m in metaItems" :key="m.label" class="ao-modal-meta-item">
                        <span class="ao-modal-meta-label">{{ m.label }}</span>
                        <span class="ao-modal-meta-value">{{ m.value }}</span>
                    </div>
                </div>
                <div v-if="skills.length" class="ao-modal-section">
                    <h3 class="ao-modal-section-title">Detected &amp; Tagged Skills</h3>
                    <div class="skill-chips-row">
                        <span v-for="sk in skills" :key="sk" class="skill-chip-sm">{{ sk }}</span>
                    </div>
                </div>
                <div class="ao-modal-section">
                    <h3 class="ao-modal-section-title">Job Description</h3>
                    <div class="ao-modal-desc">
                        <p v-for="(line, idx) in descLines" :key="idx">{{ line }}</p>
                    </div>
                </div>
            </div>
            <div class="ao-modal-footer">
                <span class="ao-pill">{{ sourceBadge }}</span>
                <div class="ao-modal-footer-actions">
                    <button type="button" class="ao-btn" @click="$emit('review-apply', vacancy)">Review &amp; Apply</button>
                    <a v-if="safeUrl" class="ao-btn" :href="safeUrl" target="_blank" rel="noopener noreferrer">Open Source URL</a>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useAppStore } from '../stores/appStore.js';
import { formatDate, isSafeHttpUrl } from '../utils/helpers.js';

const props = defineProps({
    vacancy: { type: Object, default: null },
});
const emit = defineEmits(['close', 'review-apply']);
const store = useAppStore();
const modalCard = ref(null);

const company = computed(() => (props.vacancy ? store.resolveCompanyLabel(props.vacancy) : null));
const website = computed(() => (props.vacancy ? store.resolveSourceLabel(props.vacancy) : 'Direct'));
const sourceBadge = computed(() => [company.value, website.value].filter(Boolean).join(' · '));
const safeUrl = computed(() => (props.vacancy && isSafeHttpUrl(props.vacancy.url) ? props.vacancy.url : null));
const skills = computed(() => (props.vacancy ? store.extractVacancySkills(props.vacancy) : []));
const descLines = computed(() =>
    String(props.vacancy?.description || 'No full description stored locally.')
    .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
);

const metaItems = computed(() => {
    if (!props.vacancy) return [];
    const app = store.applicationsByVacancy.get(props.vacancy.id);
    const match = store.matchByVacancy.get(props.vacancy.id);
    const items = [
        { label: 'Company', value: company.value || 'Not specified' },
        { label: 'Source Website', value: website.value },
        { label: 'Posted Date', value: props.vacancy.posted_at ? formatDate(props.vacancy.posted_at) : 'Unavailable' },
        { label: 'Application Status', value: app ? app.status : 'Not Applied' },
    ];
    if (match?.score != null) items.push({ label: 'AI Match Score', value: `${match.score}%` });
    if (props.vacancy.address) items.push({ label: 'Location', value: props.vacancy.address });
    return items;
});

watch(
    () => props.vacancy,
    async (val) => {
        if (val) {
            await nextTick();
            modalCard.value?.focus();
        }
    },
    { immediate: true }
);

function onKey(e) {
    if (e.key === 'Escape' && props.vacancy) emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>
