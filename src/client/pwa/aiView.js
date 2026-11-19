import { db } from '../extension/database/database.js';
import { saveAiConfiguration } from '../extension/database/crypto.js';
import {
    deleteAiConfiguration,
    ensureDefaultProfile,
    getCoverLetterForVacancy,
    getMatchResult,
    getSetting,
    hasAiConsent,
    recordAiConsent,
    saveCoverLetter,
    saveMatchResult,
    setActiveAiConfiguration,
} from '../extension/database/repository.js';
import { evaluateVacancyMatch, generateCoverLetter } from '../extension/aiClient.js';
import { callExtension } from './bridge.js';
import { loadResumesUI } from './profileView.js';
import { formatDate, isSafeHttpUrl, state } from './state.js';

let activeAiVacancy = null;
let activeCoverLetterId = null;
let lastLoadedLetterText = '';
let isLetterDirty = false;

function renderAiConfigsList() {
    const listEl = document.getElementById('ai-configs-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!state.cachedAiConfigs.length) {
        listEl.innerHTML = '<div class="status-msg">No saved AI provider configurations yet. Save one above or use Offline Local Similarity.</div>';
        return;
    }

    for (const cfg of state.cachedAiConfigs) {
        const row = document.createElement('div');
        row.className = 'ai-config-row' + (cfg.is_active ? ' active' : '');

        const info = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = `${cfg.provider_name} · ${cfg.model_name}${cfg.is_active ? ' (Active)' : ''}`;
        const meta = document.createElement('div');
        meta.className = 'job-row-meta';
        meta.textContent = `${cfg.api_endpoint || 'Offline Cosine'} · Key: ${cfg.has_api_key ? 'Encrypted locally' : 'None'}`;
        info.append(title, meta);

        const actions = document.createElement('div');
        actions.className = 'job-row-actions';

        if (!cfg.is_active) {
            const actBtn = document.createElement('button');
            actBtn.type = 'button';
            actBtn.className = 'secondary-btn btn-xs';
            actBtn.textContent = 'Activate';
            actBtn.addEventListener('click', async () => {
                if (state.isExtensionConnected) {
                    state.cachedAiConfigs = await callExtension('set_active_ai_configuration', { id: cfg.id });
                } else {
                    await setActiveAiConfiguration(cfg.id);
                    await loadAiConfigUI();
                }
                renderAiConfigsList();
            });
            actions.appendChild(actBtn);
        }

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'clear-button btn-xs';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
            if (state.isExtensionConnected) {
                state.cachedAiConfigs = await callExtension('delete_ai_configuration', { id: cfg.id });
            } else {
                await deleteAiConfiguration(cfg.id);
                await loadAiConfigUI();
            }
            renderAiConfigsList();
        });
        actions.appendChild(delBtn);

        row.append(info, actions);
        listEl.appendChild(row);
    }
}

export async function loadAiConfigUI() {
    let consented = false;
    let givenAt = null;

    if (state.isExtensionConnected) {
        try {
            state.cachedAiConfigs = await callExtension('get_ai_configurations');
            const consentInfo = await callExtension('get_ai_consent');
            consented = Boolean(consentInfo?.consented);
            givenAt = consentInfo?.givenAt || null;
        } catch {}
    } else {
        const rows = await db.ai_configurations.toArray();
        rows.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        state.cachedAiConfigs = rows.map((c) => ({
            id: c.id,
            provider_name: c.provider_name,
            api_endpoint: c.api_endpoint || null,
            model_name: c.model_name,
            is_active: c.is_active,
            has_api_key: Boolean(c.api_key_enc),
        }));
        consented = await hasAiConsent();
        givenAt = await getSetting('ai_consent_given_at');
    }

    const consentTag = document.getElementById('ai-consent-status-tag');
    if (consentTag) {
        consentTag.textContent = consented
            ? `GDPR Opt-In: Consented (${formatDate(givenAt)})`
            : 'GDPR Opt-In: Pending';
    }
    renderAiConfigsList();
}

function requestAiConsentModal(endpointLabel) {
    return new Promise((resolve) => {
        const modal = document.getElementById('ai-consent-modal');
        const labelEl = document.getElementById('ai-consent-endpoint-label');
        const acceptBtn = document.getElementById('ai-consent-accept-btn');
        const declineBtn = document.getElementById('ai-consent-decline-btn');
        if (!modal || !acceptBtn || !declineBtn) return resolve(false);

        if (labelEl) labelEl.textContent = endpointLabel || 'Remote AI Provider';
        modal.setAttribute('open', '');

        const cleanup = (result) => {
            modal.removeAttribute('open');
            acceptBtn.removeEventListener('click', onAccept);
            declineBtn.removeEventListener('click', onDecline);
            modal.removeEventListener('click', onBackdrop);
            resolve(result);
        };
        const onAccept = async () => {
            await recordAiConsent('1.0');
            if (state.isExtensionConnected) {
                await callExtension('set_ai_consent', { version: '1.0' }).catch(() => {});
            }
            await loadAiConfigUI();
            cleanup(true);
        };
        const onDecline = () => cleanup(false);
        const onBackdrop = (e) => { if (e.target === modal) cleanup(false); };

        acceptBtn.addEventListener('click', onAccept);
        declineBtn.addEventListener('click', onDecline);
        modal.addEventListener('click', onBackdrop);
    });
}

export function initAiSettingsHandlers() {
    const providerSel = document.getElementById('ai-provider-select');
    const endpointInput = document.getElementById('ai-endpoint-input');
    const modelInput = document.getElementById('ai-model-input');
    const apiKeyInput = document.getElementById('ai-apikey-input');
    const activeToggle = document.getElementById('ai-active-toggle');
    const saveBtn = document.getElementById('save-ai-config-btn');
    const statusEl = document.getElementById('ai-config-status');
    if (!providerSel || !saveBtn) return;

    providerSel.addEventListener('change', () => {
        const val = providerSel.value;
        if (val === 'openai') {
            if (endpointInput) { endpointInput.disabled = false; endpointInput.value = 'https://api.openai.com/v1/chat/completions'; }
            if (apiKeyInput) apiKeyInput.disabled = false;
            if (modelInput) modelInput.value = 'gpt-4o-mini';
        } else if (val === 'local') {
            if (endpointInput) { endpointInput.disabled = false; endpointInput.value = 'http://localhost:11434/v1/chat/completions'; }
            if (apiKeyInput) apiKeyInput.disabled = false;
            if (modelInput) modelInput.value = 'llama3.2';
        } else {
            if (endpointInput) { endpointInput.value = ''; endpointInput.disabled = true; }
            if (apiKeyInput) { apiKeyInput.value = ''; apiKeyInput.disabled = true; }
            if (modelInput) modelInput.value = 'local-cosine';
        }
    });

    saveBtn.addEventListener('click', async () => {
        const provider_name = providerSel.value;
        const model_name = (modelInput?.value || '').trim();
        const api_endpoint = (endpointInput?.value || '').trim() || null;
        const api_key = (apiKeyInput?.value || '').trim();
        const is_active = activeToggle?.checked ? 1 : 0;

        if (!model_name) {
            if (statusEl) { statusEl.textContent = 'Model name is required.'; statusEl.style.color = '#f87171'; }
            return;
        }
        if (provider_name !== 'local_cosine' && (!api_endpoint || !isSafeHttpUrl(api_endpoint))) {
            if (statusEl) { statusEl.textContent = 'Enter a valid http(s) AI endpoint URL.'; statusEl.style.color = '#f87171'; }
            return;
        }
        if (provider_name === 'openai' && !api_key) {
            if (statusEl) { statusEl.textContent = 'API key is required for remote OpenAI-compatible providers.'; statusEl.style.color = '#f87171'; }
            return;
        }

        try {
            if (state.isExtensionConnected) {
                state.cachedAiConfigs = await callExtension('save_ai_configuration', {
                    config: { provider_name, api_endpoint, api_key, model_name, is_active },
                });
            } else {
                const id = await saveAiConfiguration({
                    provider_name,
                    api_endpoint,
                    api_key,
                    model_name,
                    is_active,
                });
                if (is_active) await setActiveAiConfiguration(id);
                await loadAiConfigUI();
            }
            if (apiKeyInput) apiKeyInput.value = '';
            renderAiConfigsList();
            if (statusEl) {
                statusEl.textContent = 'AI configuration saved (key encrypted locally).';
                statusEl.style.color = '#34d399';
                setTimeout(() => { statusEl.textContent = ''; }, 3500);
            }
        } catch (err) {
            if (statusEl) { statusEl.textContent = err.message; statusEl.style.color = '#f87171'; }
        }
    });
}

function setMatchDisplay(match) {
    const scorePill = document.getElementById('ai-match-score-pill');
    const matchedEl = document.getElementById('ai-matched-skills');
    const missingEl = document.getElementById('ai-missing-skills');
    if (!scorePill || !matchedEl || !missingEl) return;

    if (!match) {
        scorePill.dataset.status = 'basic';
        scorePill.textContent = 'Not evaluated';
        matchedEl.innerHTML = '<span class="status-msg">—</span>';
        missingEl.innerHTML = '<span class="status-msg">—</span>';
        return;
    }

    scorePill.dataset.status = match.score >= 70 ? 'complete' : 'basic';
    scorePill.textContent = `${match.score}% Overlap`;

    matchedEl.innerHTML = '';
    if (match.matched_skills?.length) {
        for (const s of match.matched_skills) {
            const chip = document.createElement('span');
            chip.className = 'skill-chip matched';
            chip.textContent = s;
            matchedEl.appendChild(chip);
        }
    } else {
        matchedEl.innerHTML = '<span class="status-msg">None detected</span>';
    }

    missingEl.innerHTML = '';
    if (match.missing_skills?.length) {
        for (const s of match.missing_skills) {
            const chip = document.createElement('span');
            chip.className = 'skill-chip missing';
            chip.textContent = s;
            missingEl.appendChild(chip);
        }
    } else {
        missingEl.innerHTML = '<span class="status-msg">None missing</span>';
    }
}

function updateCoverLetterDirtyUI() {
    const textarea = document.getElementById('ai-letter-textarea');
    const dirtyEl = document.getElementById('ai-dirty-indicator');
    const genBtn = document.getElementById('ai-generate-letter-btn');
    if (!textarea) return;

    const current = textarea.value;
    isLetterDirty = current.trim().length > 0 && current !== lastLoadedLetterText;
    if (dirtyEl) dirtyEl.textContent = isLetterDirty ? 'Unsaved manual edits' : '';
    if (genBtn) genBtn.textContent = current.trim().length > 0 ? 'Regenerate Letter' : 'Generate Letter';
}

async function loadAiDialogStateForResume(vacancy, resumeId) {
    if (!vacancy || !resumeId) {
        setMatchDisplay(null);
        return;
    }

    let match = null;
    let draft = null;
    if (state.isExtensionConnected) {
        try {
            const matches = await callExtension('get_match_results', { vacancyId: vacancy.id });
            match = matches.find((m) => m.resume_id === resumeId) || null;
            if (match) await saveMatchResult(match).catch(() => {});
            const letters = await callExtension('get_cover_letters', { vacancyId: vacancy.id });
            draft = letters.find((c) => c.resume_id === resumeId) || letters[0] || null;
            if (draft) await db.cover_letters.put(draft).catch(() => {});
        } catch {}
    }
    const profId = state.activeProfileId || (await ensureDefaultProfile()).id;
    if (!match) match = await getMatchResult(vacancy.id, resumeId);
    if (!draft) draft = await getCoverLetterForVacancy(profId, vacancy.id, resumeId);

    setMatchDisplay(match);
    const textarea = document.getElementById('ai-letter-textarea');
    if (textarea) {
        activeCoverLetterId = draft?.id || null;
        lastLoadedLetterText = draft?.plain_text || '';
        textarea.value = lastLoadedLetterText;
        updateCoverLetterDirtyUI();
    }
}

export async function openAiAssistantModal(vacancy) {
    const modal = document.getElementById('ai-assistant-modal');
    const titleEl = document.getElementById('ai-modal-title');
    const resumeSel = document.getElementById('ai-modal-resume-select');
    const statusEl = document.getElementById('ai-modal-status');
    if (!modal || !resumeSel) return;

    activeAiVacancy = vacancy;
    activeCoverLetterId = null;
    lastLoadedLetterText = '';
    isLetterDirty = false;
    if (statusEl) statusEl.textContent = '';
    if (titleEl) titleEl.textContent = `AI Match & Cover Letter: ${vacancy.full_position_name || 'Vacancy'}`;

    if (!state.cachedProfileResumes.length) await loadResumesUI();

    resumeSel.innerHTML = '';
    if (!state.cachedProfileResumes.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No resume variants — add one in Profile & Resumes';
        resumeSel.appendChild(opt);
    } else {
        for (const r of state.cachedProfileResumes) {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.title;
            resumeSel.appendChild(opt);
        }
        if (state.activeResumeId && state.cachedProfileResumes.some((r) => r.id === state.activeResumeId)) {
            resumeSel.value = state.activeResumeId;
        }
    }

    await loadAiDialogStateForResume(vacancy, resumeSel.value);
    modal.setAttribute('open', '');
}

async function runWithBridgeConsentRetry(fn, endpointLabel) {
    try {
        return await fn();
    } catch (err) {
        if (err.code === 'AI_CONSENT_REQUIRED' || String(err.message).includes('GDPR opt-in consent')) {
            const accepted = await requestAiConsentModal(endpointLabel);
            if (!accepted) throw new Error('AI processing cancelled (consent not granted).');
            return await fn();
        }
        throw err;
    }
}

export function initAiAssistantModal() {
    const modal = document.getElementById('ai-assistant-modal');
    const closeBtn = document.getElementById('ai-modal-close-btn');
    const resumeSel = document.getElementById('ai-modal-resume-select');
    const evalBtn = document.getElementById('ai-evaluate-match-btn');
    const genBtn = document.getElementById('ai-generate-letter-btn');
    const saveBtn = document.getElementById('ai-save-letter-btn');
    const textarea = document.getElementById('ai-letter-textarea');
    const statusEl = document.getElementById('ai-modal-status');

    const closeModal = () => modal?.removeAttribute('open');
    closeBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.hasAttribute('open')) closeModal();
    });

    resumeSel?.addEventListener('change', () => {
        if (activeAiVacancy) loadAiDialogStateForResume(activeAiVacancy, resumeSel.value);
    });

    textarea?.addEventListener('input', updateCoverLetterDirtyUI);

    evalBtn?.addEventListener('click', async () => {
        const resumeId = resumeSel?.value;
        const resume = state.cachedProfileResumes.find((r) => r.id === resumeId);
        if (!activeAiVacancy || !resume) {
            if (statusEl) { statusEl.textContent = 'Create and select a resume variant first.'; statusEl.style.color = '#f87171'; }
            return;
        }

        const activeCfg = state.cachedAiConfigs.find((c) => c.is_active) || state.cachedAiConfigs[0];
        const endpointLabel = activeCfg?.api_endpoint || activeCfg?.provider_name || 'AI Provider';

        evalBtn.disabled = true;
        if (statusEl) { statusEl.textContent = 'Evaluating match...'; statusEl.style.color = 'var(--text-secondary)'; }
        try {
            let result;
            if (state.isExtensionConnected) {
                result = await runWithBridgeConsentRetry(
                    () => callExtension('ai_evaluate_match', {
                        vacancyId: activeAiVacancy.id,
                        resumeId: resume.id,
                        vacancy: activeAiVacancy,
                        resume,
                    }, 45000),
                    endpointLabel
                );
                await saveMatchResult(result).catch(() => {});
            } else {
                const personalData = await db.personal_data.where('profile_id').equals(resume.profile_id).first();
                result = await evaluateVacancyMatch(activeAiVacancy, resume, {
                    personalData,
                    requestConsentFn: () => requestAiConsentModal(endpointLabel),
                });
            }
            setMatchDisplay(result);
            if (statusEl) { statusEl.textContent = `Match evaluated (${result.score}%).`; statusEl.style.color = '#34d399'; }
        } catch (err) {
            if (statusEl) { statusEl.textContent = err.message; statusEl.style.color = '#f87171'; }
        } finally {
            evalBtn.disabled = false;
        }
    });

    genBtn?.addEventListener('click', async () => {
        const resumeId = resumeSel?.value;
        const resume = state.cachedProfileResumes.find((r) => r.id === resumeId);
        if (!activeAiVacancy || !resume) {
            if (statusEl) { statusEl.textContent = 'Create and select a resume variant first.'; statusEl.style.color = '#f87171'; }
            return;
        }

        if (isLetterDirty) {
            const ok = confirm('You have manually edited the cover letter. Overwrite your edits with a newly generated letter?');
            if (!ok) return;
        }

        const activeCfg = state.cachedAiConfigs.find((c) => c.is_active) || state.cachedAiConfigs[0];
        const endpointLabel = activeCfg?.api_endpoint || activeCfg?.provider_name || 'AI Provider';

        genBtn.disabled = true;
        if (statusEl) { statusEl.textContent = 'Generating tailored cover letter...'; statusEl.style.color = 'var(--text-secondary)'; }
        try {
            let draft;
            if (state.isExtensionConnected) {
                draft = await runWithBridgeConsentRetry(
                    () => callExtension('ai_generate_cover_letter', {
                        vacancyId: activeAiVacancy.id,
                        resumeId: resume.id,
                        existingDraftId: activeCoverLetterId,
                        vacancy: activeAiVacancy,
                        resume,
                    }, 45000),
                    endpointLabel
                );
                await db.cover_letters.put(draft).catch(() => {});
            } else {
                const personalData = await db.personal_data.where('profile_id').equals(resume.profile_id).first();
                draft = await generateCoverLetter(activeAiVacancy, resume, {
                    personalData,
                    existingDraftId: activeCoverLetterId,
                    isDirty: false,
                    requestConsentFn: () => requestAiConsentModal(endpointLabel),
                });
            }
            activeCoverLetterId = draft.id;
            lastLoadedLetterText = draft.plain_text || '';
            if (textarea) textarea.value = lastLoadedLetterText;
            updateCoverLetterDirtyUI();
            if (statusEl) { statusEl.textContent = 'Cover letter generated.'; statusEl.style.color = '#34d399'; }
        } catch (err) {
            if (statusEl) { statusEl.textContent = err.message; statusEl.style.color = '#f87171'; }
        } finally {
            genBtn.disabled = false;
        }
    });

    saveBtn?.addEventListener('click', async () => {
        const resumeId = resumeSel?.value;
        const resume = state.cachedProfileResumes.find((r) => r.id === resumeId);
        const text = (textarea?.value || '').trim();
        if (!activeAiVacancy || !resume || !text) {
            if (statusEl) { statusEl.textContent = 'Cover letter text and resume variant are required.'; statusEl.style.color = '#f87171'; }
            return;
        }

        try {
            const payload = {
                id: activeCoverLetterId || null,
                profile_id: resume.profile_id,
                vacancy_id: activeAiVacancy.id,
                resume_id: resume.id,
                title: `Cover Letter - ${activeAiVacancy.full_position_name || 'Application'}`.slice(0, 150),
                plain_text: text,
                skill_ids: Array.isArray(resume.skill_ids) ? resume.skill_ids : [],
            };
            let saved;
            if (state.isExtensionConnected) {
                saved = await callExtension('save_cover_letter', { coverLetter: payload });
                await db.cover_letters.put(saved).catch(() => {});
            } else {
                saved = await saveCoverLetter(payload);
            }
            activeCoverLetterId = saved.id;
            lastLoadedLetterText = saved.plain_text;
            updateCoverLetterDirtyUI();
            if (statusEl) { statusEl.textContent = 'Cover letter draft saved.'; statusEl.style.color = '#34d399'; }
        } catch (err) {
            if (statusEl) { statusEl.textContent = err.message; statusEl.style.color = '#f87171'; }
        }
    });
}