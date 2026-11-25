<template>
    <div
        v-if="vacancy"
        class="ao-overlay-modal"
        open
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-modal-title"
        @click.self="$emit('close')"
    >
        <div ref="modalCard" class="ao-modal-card ai-modal-card" tabindex="-1">
            <div class="ao-modal-header">
                <h2 id="ai-modal-title" class="ao-modal-title">Review &amp; Apply: {{ vacancy.full_position_name || 'Vacancy' }}</h2>
                <button class="ao-modal-close" type="button" aria-label="Close" @click="$emit('close')">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="ai-modal-body">
                <div class="form-field">
                    <label for="ai-modal-resume-select">Selected Resume Variant</label>
                    <select id="ai-modal-resume-select" v-model="selectedResumeId" class="form-select" @change="loadStateForResume">
                        <option v-if="!store.profileResumes.length" value="">No resume variants — add one in Profile &amp; Resumes</option>
                        <option v-for="r in store.profileResumes" :key="r.id" :value="r.id">{{ r.title }}</option>
                    </select>
                </div>

                <div class="ai-match-panel">
                    <div class="ai-match-header">
                        <div class="ai-score-summary">
                            <span class="metric-label">Compatibility Match</span>
                            <span class="ao-pill" :data-status="matchResult?.score >= 70 ? 'complete' : 'basic'">
                                {{ matchResult ? `${matchResult.score}% Overlap` : 'Not evaluated' }}
                            </span>
                        </div>
                        <button type="button" class="primary-btn" :disabled="evaluating" @click="evaluateMatch">
                            {{ evaluating ? 'Evaluating...' : 'Evaluate Match' }}
                        </button>
                    </div>
                    <div class="ai-skills-columns">
                        <div>
                            <div class="ai-sub-label">Matched Skills</div>
                            <div class="skill-chips-row">
                                <span v-for="s in matchResult?.matched_skills || []" :key="s" class="skill-chip matched">{{ s }}</span>
                                <span v-if="!matchResult?.matched_skills?.length" class="status-msg">—</span>
                            </div>
                        </div>
                        <div>
                            <div class="ai-sub-label">Missing Skills</div>
                            <div class="skill-chips-row">
                                <span v-for="s in matchResult?.missing_skills || []" :key="s" class="skill-chip missing">{{ s }}</span>
                                <span v-if="!matchResult?.missing_skills?.length" class="status-msg">—</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="ai-letter-panel">
                    <div class="ai-match-header">
                        <label for="ai-letter-textarea">Tailored Cover Letter Draft</label>
                        <span class="status-msg">{{ isLetterDirty ? 'Unsaved manual edits' : '' }}</span>
                    </div>
                    <textarea id="ai-letter-textarea" v-model="letterText" rows="7" placeholder="Click Generate Letter to create a tailored cover letter draft..."></textarea>
                    <div class="ai-letter-actions">
                        <button type="button" class="secondary-btn" :disabled="generating" @click="generateLetter">
                            {{ letterText.trim() ? 'Regenerate Letter' : 'Generate Letter' }}
                        </button>
                        <button type="button" class="secondary-btn" @click="saveLetterDraft(true)">Save Draft</button>
                        <span class="status-msg">{{ aiStatus }}</span>
                    </div>
                </div>

                <div class="apply-preview-panel">
                    <div class="ai-match-header">
                        <span class="metric-label">Profile Autofill Preview</span>
                        <div class="apply-mode-row">
                            <label for="apply-mode-select" class="status-msg">Mode:</label>
                            <select id="apply-mode-select" v-model="submissionMode" class="form-select ao-select-mode">
                                <option value="semi_automated">Semi-Automated · Autofill &amp; Review</option>
                                <option value="manual">Manual · Open Posting Only</option>
                            </select>
                        </div>
                    </div>
                    <div class="apply-preview-grid">
                        <div v-for="f in previewFields" :key="f.label" class="apply-preview-item" :class="{ 'full-width': f.full }">
                            <span class="apply-preview-label">{{ f.label }}</span>
                            <span class="apply-preview-value">{{ f.value }}</span>
                        </div>
                    </div>
                </div>

                <div v-if="captchaDetected" class="apply-captcha-alert">
                    <div>
                        <strong>Captcha Detected</strong>
                        <p class="status-msg">Solve the captcha in the focused application tab, then click Resume Autofill.</p>
                    </div>
                    <button type="button" class="primary-btn" :disabled="filling" @click="executeAutofill(autofillTabId)">
                        Resume Autofill
                    </button>
                </div>
            </div>
            <div class="ao-modal-footer">
                <span class="status-msg">{{ applyStatus }}</span>
                <div class="ao-modal-footer-actions">
                    <button type="button" class="secondary-btn" :disabled="filling" @click="executeAutofill(null)">
                        {{ submissionMode === 'manual' ? 'Open Application Page' : 'Fill Application Form' }}
                    </button>
                    <button type="button" class="primary-btn" :disabled="submitting" @click="confirmAndSubmit">
                        Confirm and Submit
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { db } from '../../../extension/database/database.js';
import {
    createApplication,
    ensureDefaultProfile,
    getCoverLetterForVacancy,
    getMatchResult,
    saveCoverLetter,
    saveMatchResult,
    setApplicationStatus,
} from '../../../extension/database/repository.js';
import { evaluateVacancyMatch, generateCoverLetter } from '../../../extension/aiClient.js';
import { callExtension } from '../services/bridge.js';
import { logger } from '../services/logger.js';
import { useAppStore } from '../stores/appStore.js';
import { isSafeHttpUrl } from '../utils/helpers.js';

const props = defineProps({ vacancy: { type: Object, default: null } });
const emit = defineEmits(['close']);
const store = useAppStore();
const modalCard = ref(null);

const selectedResumeId = ref('');
const matchResult = ref(null);
const letterText = ref('');
const lastLoadedText = ref('');
const coverLetterId = ref(null);
const submissionMode = ref(store.settings.submission_mode || 'semi_automated');
const evaluating = ref(false);
const generating = ref(false);
const filling = ref(false);
const submitting = ref(false);
const captchaDetected = ref(false);
const autofillTabId = ref(null);
const aiStatus = ref('');
const applyStatus = ref('');

const isLetterDirty = computed(() => letterText.value.trim().length > 0 && letterText.value !== lastLoadedText.value);
const previewFields = computed(() => {
    const p = store.activeProfile || {};
    return [
        { label: 'First Name', value: p.first_name || '—', full: false },
        { label: 'Last Name', value: p.last_name || '—', full: false },
        { label: 'Email', value: p.email || '—', full: false },
        { label: 'Phone', value: p.phone || '—', full: false },
        { label: 'Location', value: p.location || '—', full: false },
        { label: 'Links', value: p.links || '—', full: true },
    ];
});

watch(
    () => props.vacancy,
    async (vac) => {
        if (!vac) return;
        await nextTick();
        modalCard.value?.focus();
        aiStatus.value = '';
        applyStatus.value = '';
        captchaDetected.value = false;
        autofillTabId.value = null;
        submissionMode.value = store.settings.submission_mode || 'semi_automated';
        if (!store.profileResumes.length) await store.loadResumes();
        selectedResumeId.value = store.activeResumeId || store.profileResumes[0]?.id || '';
        await loadStateForResume();
    },
    { immediate: true }
);

async function loadStateForResume() {
    if (!props.vacancy || !selectedResumeId.value) {
        matchResult.value = null;
        letterText.value = '';
        lastLoadedText.value = '';
        coverLetterId.value = null;
        return;
    }
    let m = null;
    let d = null;
    if (store.isExtensionConnected) {
        try {
            const matches = await callExtension('get_match_results', { vacancyId: props.vacancy.id });
            m = matches.find((x) => x.resume_id === selectedResumeId.value) || null;
            const letters = await callExtension('get_cover_letters', { vacancyId: props.vacancy.id });
            d = letters.find((c) => c.resume_id === selectedResumeId.value) || letters[0] || null;
    } catch (err) {
        logger.warn('ReviewApplyModal.loadStateForResume', 'Failed loading AI state from extension; using local cache', err);
    }
}
    const profId = store.activeProfileId || (await ensureDefaultProfile()).id;
    matchResult.value = m || (await getMatchResult(props.vacancy.id, selectedResumeId.value)) || null;
    d = d || (await getCoverLetterForVacancy(profId, props.vacancy.id, selectedResumeId.value));
    coverLetterId.value = d?.id || null;
    lastLoadedText.value = d?.plain_text || '';
    letterText.value = lastLoadedText.value;
}

async function runWithConsent(fn, endpointLabel) {
    try {
        return await fn();
    } catch (err) {
        if (err.code === 'AI_CONSENT_REQUIRED' || String(err.message).includes('GDPR opt-in consent')) {
            const ok = await store.requestAiConsent(endpointLabel);
            if (!ok) throw new Error('AI processing cancelled: consent not granted.');
            return await fn();
        }
        throw err;
    }
}

function getActiveResume() {
    return store.profileResumes.find((r) => r.id === selectedResumeId.value) || null;
}

function getEndpointLabel() {
    const cfg = store.aiConfigs.find((c) => c.is_active) || store.aiConfigs[0];
    return cfg?.api_endpoint || cfg?.provider_name || 'AI Provider';
}

function formatAiError(actionLabel, err) {
    const msg = err?.message || 'Unknown AI error';
    if (msg.includes('API key') || msg.includes('401') || msg.includes('403')) {
        return `${actionLabel} failed: ${msg}. Open Settings & Sync and verify your API key or switch to Offline Local Similarity.`;
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        return `${actionLabel} failed: cannot reach AI endpoint (${getEndpointLabel()}). Check the endpoint URL or ensure your local model server is running.`;
    }
    if (msg.includes('JSON')) {
        return `${actionLabel} failed: AI model returned invalid JSON (${msg}). Retry or choose another model in Settings & Sync.`;
    }
    return `${actionLabel} failed: ${msg}`;
}

async function evaluateMatch() {
    const resume = getActiveResume();
    if (!props.vacancy) {
        aiStatus.value = 'No vacancy selected for evaluation.';
        return;
    }
    if (!resume) {
        aiStatus.value = 'No resume variant selected. Create one in Profile & Resumes first.';
        return;
    }
    evaluating.value = true;
    aiStatus.value = 'Evaluating match...';
    try {
        let res;
        if (store.isExtensionConnected) {
            res = await runWithConsent(
                () => callExtension('ai_evaluate_match', { vacancyId: props.vacancy.id, resumeId: resume.id, vacancy: props.vacancy, resume }, 45000),
                getEndpointLabel()
            );
            await saveMatchResult(res).catch((err) => logger.warn('ReviewApplyModal.evaluateMatch', 'Failed caching match result locally', err));
        } else {
            const personalData = await db.personal_data.where('profile_id').equals(resume.profile_id).first();
            res = await evaluateVacancyMatch(props.vacancy, resume, {
                personalData,
                requestConsentFn: () => store.requestAiConsent(getEndpointLabel()),
            });
        }
        matchResult.value = res;
        aiStatus.value = `Match evaluated: ${res.score}%.`;
} catch (err) {
    aiStatus.value = formatAiError('Match evaluation', err);
    store.notify(aiStatus.value, 'error', 6000);
} finally {
    evaluating.value = false;
}
}

async function generateLetter() {
    const resume = getActiveResume();
    if (!props.vacancy) {
        aiStatus.value = 'No vacancy selected for cover letter generation.';
        return;
    }
    if (!resume) {
        aiStatus.value = 'No resume variant selected. Create one in Profile & Resumes first.';
        return;
    }
    if (isLetterDirty.value && !confirm('You have manually edited the cover letter. Overwrite your edits?')) return;
    generating.value = true;
    aiStatus.value = 'Generating tailored cover letter...';
    try {
        let draft;
        if (store.isExtensionConnected) {
            draft = await runWithConsent(
                () => callExtension('ai_generate_cover_letter', { vacancyId: props.vacancy.id, resumeId: resume.id, existingDraftId: coverLetterId.value, vacancy: props.vacancy, resume }, 45000),
                getEndpointLabel()
            );
            await db.cover_letters.put(draft).catch((err) => logger.warn('ReviewApplyModal.generateLetter', 'Failed caching cover letter locally', err));
        } else {
            const personalData = await db.personal_data.where('profile_id').equals(resume.profile_id).first();
            draft = await generateCoverLetter(props.vacancy, resume, {
                personalData,
                existingDraftId: coverLetterId.value,
                isDirty: false,
                requestConsentFn: () => store.requestAiConsent(getEndpointLabel()),
            });
        }
        coverLetterId.value = draft.id;
        lastLoadedText.value = draft.plain_text || '';
        letterText.value = lastLoadedText.value;
        aiStatus.value = 'Cover letter generated.';
} catch (err) {
    aiStatus.value = formatAiError('Cover letter generation', err);
    store.notify(aiStatus.value, 'error', 6000);
} finally {
    generating.value = false;
}
}

async function saveLetterDraft(requireNonEmpty = false) {
    const resume = getActiveResume();
    const text = letterText.value.trim();
    if (!text || !props.vacancy || !resume) {
        if (requireNonEmpty) aiStatus.value = 'Cover letter text and resume variant are required.';
        return coverLetterId.value;
    }
    if (coverLetterId.value && !isLetterDirty.value) return coverLetterId.value;
    const payload = {
        id: coverLetterId.value || null,
        profile_id: resume.profile_id,
        vacancy_id: props.vacancy.id,
        resume_id: resume.id,
        title: `Cover Letter - ${props.vacancy.full_position_name || 'Application'}`.slice(0, 150),
        plain_text: text,
        skill_ids: Array.isArray(resume.skill_ids) ? resume.skill_ids : [],
    };
    let saved;
    if (store.isExtensionConnected) {
        saved = await callExtension('save_cover_letter', { coverLetter: payload });
        await db.cover_letters.put(saved).catch((err) => logger.warn('ReviewApplyModal.saveLetterDraft', 'Failed caching cover letter locally', err));
    } else {
        saved = await saveCoverLetter(payload);
    }
    coverLetterId.value = saved.id;
    lastLoadedText.value = saved.plain_text;
    if (requireNonEmpty) aiStatus.value = 'Cover letter draft saved.';
    return saved.id;
}

async function executeAutofill(reuseTabId = null) {
    if (!props.vacancy) return;
    if (!store.isExtensionConnected) {
        if (isSafeHttpUrl(props.vacancy.url)) {
            window.open(props.vacancy.url, '_blank', 'noopener,noreferrer');
            applyStatus.value = 'Extension not connected — opened posting in a new tab for manual application. Pair the extension in Settings & Sync to enable autofill.';
        } else {
            applyStatus.value = 'Cannot open application page: vacancy URL is missing or invalid.';
            store.notify(applyStatus.value, 'error');
        }
        return;
    }
    filling.value = true;
    applyStatus.value = submissionMode.value === 'manual' ? 'Opening application page...' : 'Opening tab & autofilling form...';
    try {
        await saveLetterDraft(false).catch((err) => logger.warn('ReviewApplyModal.executeAutofill', 'Could not persist draft before autofill', err));
        const p = store.activeProfile || {};
        const res = await callExtension(
            'prepare_application_autofill',
            {
                vacancyId: props.vacancy.id,
                vacancyUrl: props.vacancy.url,
                profileId: p.profile_id || store.activeProfileId,
                profile: p,
                resumeId: selectedResumeId.value || null,
                coverLetterId: coverLetterId.value,
                coverLetter: letterText.value.trim(),
                matchScore: matchResult.value?.score ?? null,
                submissionMode: submissionMode.value,
                tabId: reuseTabId,
            },
            15000
        );
        autofillTabId.value = res.tabId || null;
        captchaDetected.value = Boolean(res.captchaDetected);
        if (res.captchaDetected) {
            applyStatus.value = 'Captcha detected — solve it in the tab, then click Resume Autofill.';
        } else if (res.mode === 'manual') {
            applyStatus.value = 'Opened posting in manual mode. Click Confirm and Submit after applying.';
    } else {
        applyStatus.value = `Filled ${res.filled?.length || 0} fields, ${res.unmapped?.length || 0} unmapped. Review & confirm.`;
    }
} catch (err) {
    applyStatus.value = `Autofill failed on ${props.vacancy.url}: ${err.message}. Wait for the page to finish loading or reload the extension.`;
    store.notify(applyStatus.value, 'error', 6000);
} finally {
        filling.value = false;
    }
}

function onKey(e) {
    if (e.key === 'Escape' && props.vacancy) emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

async function confirmAndSubmit() {
    if (!props.vacancy) return;
    submitting.value = true;
    try {
        const profId = store.activeProfile?.profile_id || store.activeProfileId || (await ensureDefaultProfile()).id;
        const cId = await saveLetterDraft(false).catch((err) => {
                logger.warn('ReviewApplyModal.confirmAndSubmit', 'Could not persist cover letter draft', err);
                return coverLetterId.value;
        });
        const score = matchResult.value?.score != null ? Math.round(Number(matchResult.value.score)) : null;
        if (store.isExtensionConnected) {
            const created = await callExtension('create_application', {
                profile_id: profId,
                vacancy_id: props.vacancy.id,
                resume_id: selectedResumeId.value || null,
                cover_letter_id: cId || null,
                match_score: score,
                status: 'Applied',
            });
            await db.applications.put(created);
        } else {
            const existing = await db.applications.where('[profile_id+vacancy_id]').equals([profId, props.vacancy.id]).first();
            if (existing) {
                await setApplicationStatus(existing.id, 'Applied');
            } else {
                await createApplication({ profile_id: profId, vacancy_id: props.vacancy.id, resume_id: selectedResumeId.value || null, cover_letter_id: cId || null, match_score: score });
            }
        }
        await store.refreshDisplay();
        store.notify('Application recorded as Applied!', 'success');
        emit('close');
} catch (err) {
    applyStatus.value = `Could not log application: ${err.message}`;
    store.notify(applyStatus.value, 'error', 6000);
} finally {
        submitting.value = false;
    }
}
</script>
