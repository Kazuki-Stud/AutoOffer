import { db } from '../extension/database/database.js';
import {
    deleteProfileCascade,
    deleteResume,
    ensureDefaultProfile,
    getOrCreateByName,
    newId,
    nowIso,
    setDefaultProfile,
} from '../extension/database/repository.js';
import { callExtension } from './bridge.js';
import {
    base64ToBlob,
    escapeHtml,
    fileToBase64,
    formatDate,
    getVal,
    parseProfileLinks,
    setVal,
    state,
    toStringArray,
} from './state.js';

async function loadLocalHydratedProfiles() {
    await ensureDefaultProfile();
    const profiles = await db.user_profiles.toArray();
    const out = [];
    for (const row of profiles) {
        const pData = await db.personal_data.where('profile_id').equals(row.id).first();
        const resume = await db.resumes.where('profile_id').equals(row.id).first();
        const prefs = await db.search_preferences.where('profile_id').equals(row.id).first();
        const skillRows = resume?.skill_ids?.length ? await db.skills.bulkGet(resume.skill_ids) : [];
        out.push({
            profile_id: row.id,
            profile_name: row.name,
            is_default: row.is_default,
            first_name: pData?.first_name || '',
            last_name: pData?.last_name || '',
            email: pData?.email || '',
            phone: pData?.phone || '',
            location: pData?.location || '',
            links: pData ? [pData.github, pData.linkedin, pData.website].filter(Boolean).join(', ') : '',
            headline: resume?.title || '',
            skills: skillRows.filter(Boolean).map((s) => s.name).join(', '),
            roles: (prefs?.roles || []).join(', '),
            locations: (prefs?.locations || []).join(', '),
            keywords: (prefs?.keywords || []).join(', '),
        });
    }
    return out;
}

async function saveLocalProfile(incoming) {
    const now = nowIso();
    let profileId = incoming.profile_id || null;
    if (!profileId) {
        if (incoming.create_new) {
            profileId = newId();
            await db.user_profiles.add({
                id: profileId,
                name: incoming.profile_name || 'New Profile',
                is_default: incoming.is_default ? 1 : 0,
                created_at: now,
                updated_at: now,
            });
        } else {
            const def = await ensureDefaultProfile();
            profileId = def.id;
        }
    } else {
        const exists = await db.user_profiles.get(profileId);
        if (!exists) {
            await db.user_profiles.add({
                id: profileId,
                name: incoming.profile_name || 'Profile',
                is_default: incoming.is_default ? 1 : 0,
                created_at: now,
                updated_at: now,
            });
        } else if (incoming.profile_name) {
            await db.user_profiles.update(profileId, { name: incoming.profile_name, updated_at: now });
        }
    }
    if (incoming.is_default) await setDefaultProfile(profileId);

    const { github, linkedin, website } = parseProfileLinks(incoming.links);
    const personalPayload = {
        first_name: incoming.first_name,
        last_name: incoming.last_name,
        email: incoming.email,
        phone: incoming.phone || null,
        location: incoming.location || null,
        github, linkedin, website,
        updated_at: now,
    };
    const existingPersonal = await db.personal_data.where('profile_id').equals(profileId).first();
    if (existingPersonal) {
        await db.personal_data.update(existingPersonal.id, personalPayload);
    } else {
        await db.personal_data.add({ id: newId(), profile_id: profileId, ...personalPayload, created_at: now });
    }

    if (incoming.headline !== undefined || incoming.skills !== undefined) {
        const skillNames = [...new Set(toStringArray(incoming.skills))];
        const skillIds = [];
        for (const name of skillNames) skillIds.push(await getOrCreateByName('skills', name));
        const headline = incoming.headline || 'Default Resume';
        const resumeText = `${headline}\nSkills: ${skillNames.join(', ')}`;
        const existingResume = await db.resumes.where('profile_id').equals(profileId).first();
        if (existingResume) {
            await db.resumes.update(existingResume.id, { title: headline, plain_text: resumeText, skill_ids: skillIds, updated_at: now });
        } else {
            await db.resumes.add({ id: newId(), profile_id: profileId, title: headline, plain_text: resumeText, skill_ids: skillIds, created_at: now, updated_at: now });
        }
    }

    const rolesArr = toStringArray(incoming.roles);
    const locsArr = toStringArray(incoming.locations);
    const kwArr = toStringArray(incoming.keywords);
    const existingPrefs = await db.search_preferences.where('profile_id').equals(profileId).first();
    if (rolesArr.length > 0) {
        if (existingPrefs) {
            await db.search_preferences.update(existingPrefs.id, { roles: rolesArr, locations: locsArr, keywords: kwArr, updated_at: now });
        } else {
            await db.search_preferences.add({
                id: newId(), profile_id: profileId, roles: rolesArr,
                locations: locsArr, keywords: kwArr, urls: [], platform_ids: [], page_limit: 2, updated_at: now,
            });
        }
    } else if (existingPrefs) {
        await db.search_preferences.delete(existingPrefs.id);
    }
    return profileId;
}

function populateProfileForm(p) {
    setVal('pwa-prof-label', p?.profile_name || 'Default');
    const defBox = document.getElementById('pwa-prof-default');
    if (defBox) defBox.checked = Boolean(p?.is_default);
    setVal('pwa-prof-firstname', p?.first_name || '');
    setVal('pwa-prof-lastname', p?.last_name || '');
    setVal('pwa-prof-email', p?.email || '');
    setVal('pwa-prof-phone', p?.phone || '');
    setVal('pwa-prof-location', p?.location || '');
    setVal('pwa-prof-roles', p?.roles || '');
    setVal('pwa-prof-locations', p?.locations || '');
    setVal('pwa-prof-keywords', p?.keywords || '');
    setVal('pwa-prof-links', p?.links || '');
}

function renderProfileSelects() {
    const profSelect = document.getElementById('pwa-profile-select');
    const jobProfSelect = document.getElementById('pwa-job-profile');

    for (const sel of [profSelect, jobProfSelect]) {
        if (!sel) continue;
        const prev = sel.value;
        sel.innerHTML = '';
        for (const p of state.cachedProfiles) {
            const opt = document.createElement('option');
            opt.value = p.profile_id;
            const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
            opt.textContent = `${p.profile_name || fullName || 'Profile'}${p.is_default ? ' (Default)' : ''}`;
            sel.appendChild(opt);
        }
        if (prev && state.cachedProfiles.some((p) => p.profile_id === prev)) sel.value = prev;
    }

    if (state.activeProfileId && state.cachedProfiles.some((p) => p.profile_id === state.activeProfileId)) {
        if (profSelect) profSelect.value = state.activeProfileId;
    } else {
        const def = state.cachedProfiles.find((p) => p.is_default) || state.cachedProfiles[0];
        state.activeProfileId = def?.profile_id || null;
        if (profSelect && state.activeProfileId) profSelect.value = state.activeProfileId;
    }

    const current = state.cachedProfiles.find((p) => p.profile_id === state.activeProfileId);
    if (current) populateProfileForm(current);
}

export async function loadProfilesUI() {
    if (state.isExtensionConnected) {
        try {
            state.cachedProfiles = await callExtension('get_profiles');
            renderProfileSelects();
            await loadResumesUI();
            return;
        } catch {}
    }
    state.cachedProfiles = await loadLocalHydratedProfiles();
    renderProfileSelects();
    await loadResumesUI();
}

async function loadLocalHydratedResumes(profileId) {
    const rows = await db.resumes.where('profile_id').equals(profileId).toArray();
    rows.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    const out = [];
    for (const r of rows) {
        const skillRows = r.skill_ids?.length ? await db.skills.bulkGet(r.skill_ids) : [];
        out.push({
            ...r,
            skills: skillRows.filter(Boolean).map((s) => s.name),
        });
    }
    return out;
}

async function mirrorResumesToLocalDb(profileId, remoteList) {
    await db.transaction('rw', [db.resumes, db.skills], async () => {
        const existingIds = await db.resumes.where('profile_id').equals(profileId).primaryKeys();
        const remoteIds = new Set(remoteList.map((r) => r.id));
        for (const id of existingIds) {
            if (!remoteIds.has(id)) await db.resumes.delete(id);
        }
        for (const r of remoteList) {
            const skillIds = [];
            for (const name of (r.skills || [])) {
                skillIds.push(await getOrCreateByName('skills', name));
            }
            const file_data = r.file_data_b64 ? base64ToBlob(r.file_data_b64, r.mime_type) : undefined;
            const rec = {
                id: r.id,
                profile_id: r.profile_id,
                title: r.title,
                summary: r.summary || null,
                plain_text: r.plain_text,
                skill_ids: skillIds.length ? skillIds : (r.skill_ids || []),
                file_name: r.file_name || null,
                mime_type: r.mime_type || null,
                created_at: r.created_at,
                updated_at: r.updated_at,
            };
            if (file_data) rec.file_data = file_data;
            await db.resumes.put(rec);
        }
    });
}

function populateResumeForm(r) {
    state.pendingResumeFile = null;
    const fileInput = document.getElementById('pwa-resume-file');
    if (fileInput) fileInput.value = '';

    setVal('pwa-resume-title', r?.title || '');
    setVal('pwa-resume-skills', (r?.skills || []).join(', '));
    setVal('pwa-resume-summary', r?.summary || '');
    setVal('pwa-resume-text', r?.plain_text || '');

    const fileInfo = document.getElementById('pwa-resume-file-info');
    const clearFileBtn = document.getElementById('pwa-resume-clear-file-btn');
    if (r?.file_name) {
        if (fileInfo) fileInfo.textContent = `Attached: ${r.file_name}`;
        if (clearFileBtn) clearFileBtn.style.display = 'inline-block';
    } else {
        if (fileInfo) fileInfo.textContent = 'No file attached';
        if (clearFileBtn) clearFileBtn.style.display = 'none';
    }
}

export function renderResumesUI() {
    const listEl = document.getElementById('pwa-resumes-list');
    const selEl = document.getElementById('pwa-resume-select');
    const countEl = document.getElementById('pwa-resumes-count');
    if (!listEl || !selEl) return;

    if (countEl) countEl.textContent = `${state.cachedProfileResumes.length} variant${state.cachedProfileResumes.length === 1 ? '' : 's'}`;

    selEl.innerHTML = '';
    for (const r of state.cachedProfileResumes) {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.title;
        selEl.appendChild(opt);
    }

    if (state.activeResumeId && state.cachedProfileResumes.some((r) => r.id === state.activeResumeId)) {
        selEl.value = state.activeResumeId;
    } else if (state.cachedProfileResumes.length > 0) {
        state.activeResumeId = state.cachedProfileResumes[0].id;
        selEl.value = state.activeResumeId;
    } else {
        state.activeResumeId = null;
    }

    listEl.innerHTML = '';
    if (!state.cachedProfileResumes.length) {
        listEl.innerHTML = '<div class="status-msg">No resume variants yet for this profile. Fill the form below and click Save Resume Variant.</div>';
        populateResumeForm(null);
        return;
    }

    for (const r of state.cachedProfileResumes) {
        const card = document.createElement('div');
        card.className = 'resume-variant-card' + (r.id === state.activeResumeId ? ' active' : '');
        card.addEventListener('click', () => {
            state.activeResumeId = r.id;
            renderResumesUI();
        });

        const title = document.createElement('div');
        title.className = 'resume-variant-title';
        title.textContent = r.title;

        const meta = document.createElement('div');
        meta.className = 'resume-variant-meta';
        const parts = [
            r.skills?.length ? `${r.skills.length} skills` : '0 skills',
            r.file_name ? `File: ${r.file_name}` : null,
            `Updated ${formatDate(r.updated_at)}`,
        ].filter(Boolean);
        meta.textContent = parts.join(' · ');

        const actions = document.createElement('div');
        actions.className = 'resume-variant-actions';

        const pdfBtn = document.createElement('button');
        pdfBtn.type = 'button';
        pdfBtn.className = 'secondary-btn btn-xs';
        pdfBtn.textContent = 'Export PDF';
        pdfBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportResumeAsPdf(r);
        });

        const docBtn = document.createElement('button');
        docBtn.type = 'button';
        docBtn.className = 'secondary-btn btn-xs';
        docBtn.textContent = 'Export .doc';
        docBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportResumeAsWord(r);
        });

        actions.append(pdfBtn, docBtn);
        card.append(title, meta, actions);
        listEl.appendChild(card);
    }

    const active = state.cachedProfileResumes.find((r) => r.id === state.activeResumeId) || null;
    populateResumeForm(active);
}

export async function loadResumesUI() {
    if (!state.activeProfileId) {
        state.cachedProfileResumes = [];
        renderResumesUI();
        return;
    }
    if (state.isExtensionConnected) {
        try {
            state.cachedProfileResumes = await callExtension('get_resumes', { profileId: state.activeProfileId });
            await mirrorResumesToLocalDb(state.activeProfileId, state.cachedProfileResumes).catch(() => {});
            renderResumesUI();
            return;
        } catch {}
    }
    state.cachedProfileResumes = await loadLocalHydratedResumes(state.activeProfileId);
    renderResumesUI();
}

function buildResumeDocumentHtml(resumeOverride = null) {
    const profile = state.cachedProfiles.find((p) => p.profile_id === state.activeProfileId) || {};
    const title = resumeOverride?.title ?? getVal('pwa-resume-title').trim();
    const summary = resumeOverride?.summary ?? getVal('pwa-resume-summary').trim();
    const plainText = resumeOverride?.plain_text ?? getVal('pwa-resume-text').trim();
    const skills = resumeOverride?.skills ?? toStringArray(getVal('pwa-resume-skills'));

    const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.profile_name || 'Candidate';
    const contactLine = [profile.email, profile.phone, profile.location, profile.links].filter(Boolean).join('  |  ');
    const bodyParagraphs = (plainText || summary || '')
        .split(/\r?\n/)
        .map((line) => `<p>${escapeHtml(line) || '&nbsp;'}</p>`)
        .join('');

    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(fullName)} - ${escapeHtml(title || 'Resume')}</title>
<style>
  @page { margin: 18mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.5; margin: 0; padding: 24px; }
  h1 { font-size: 22pt; margin: 0 0 4px 0; color: #0f172a; }
  .subtitle { font-size: 13pt; font-weight: 600; color: #1d4ed8; margin-bottom: 6px; }
  .contact { font-size: 9.5pt; color: #475569; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 16px; }
  h2 { font-size: 11.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 16px 0 8px 0; }
  p { font-size: 10.5pt; margin: 0 0 6px 0; }
  .skills { font-size: 10.5pt; }
</style>
</head>
<body>
  <h1>${escapeHtml(fullName)}</h1>
  ${title ? `<div class="subtitle">${escapeHtml(title)}</div>` : ''}
  ${contactLine ? `<div class="contact">${escapeHtml(contactLine)}</div>` : ''}
  ${summary ? `<h2>Summary</h2><p>${escapeHtml(summary)}</p>` : ''}
  ${skills.length ? `<h2>Skills</h2><p class="skills">${escapeHtml(skills.join(' • '))}</p>` : ''}
  <h2>Experience & Details</h2>
  ${bodyParagraphs}
</body>
</html>`;
}

export function exportResumeAsWord(resumeOverride = null) {
    const title = (resumeOverride?.title ?? getVal('pwa-resume-title').trim()) || 'resume';
    const html = buildResumeDocumentHtml(resumeOverride);
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'resume'}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
}

export function exportResumeAsPdf(resumeOverride = null) {
    const iframe = document.getElementById('print-resume-frame');
    if (!iframe) return;
    const html = buildResumeDocumentHtml(resumeOverride);
    iframe.onload = () => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (err) {
            console.error('PDF print failed:', err);
        }
    };
    iframe.srcdoc = html;
}

export function initProfilePage({ onDataChanged } = {}) {
    const profSelect = document.getElementById('pwa-profile-select');
    const newBtn = document.getElementById('pwa-new-profile-btn');
    const delBtn = document.getElementById('pwa-delete-profile-btn');
    const saveBtn = document.getElementById('pwa-save-profile-btn');
    const statusMsg = document.getElementById('pwa-profile-status');

    const notifyChange = () => (typeof onDataChanged === 'function' ? onDataChanged() : Promise.resolve());

    const showStatus = (text, ok = true) => {
        if (!statusMsg) return;
        statusMsg.textContent = text;
        statusMsg.style.color = ok ? '#34d399' : '#f87171';
        if (ok) setTimeout(() => { statusMsg.textContent = ''; }, 3000);
    };

    profSelect?.addEventListener('change', async (e) => {
        state.activeProfileId = e.target.value || null;
        state.activeResumeId = null;
        const found = state.cachedProfiles.find((p) => p.profile_id === state.activeProfileId);
        populateProfileForm(found || null);
        await loadResumesUI();
        await notifyChange();
    });

    newBtn?.addEventListener('click', () => {
        state.activeProfileId = null;
        state.activeResumeId = null;
        populateProfileForm({ profile_name: 'New Profile', is_default: 0 });
        state.cachedProfileResumes = [];
        renderResumesUI();
        showStatus('Fill fields and click Save Profile Changes to create.', true);
    });

    delBtn?.addEventListener('click', async () => {
        if (!state.activeProfileId) return showStatus('Select a saved profile to delete.', false);
        if (state.cachedProfiles.length <= 1) return showStatus('Cannot delete the only profile.', false);
        if (!confirm('Delete this profile and its resumes?')) return;
        try {
            if (state.isExtensionConnected) {
                await callExtension('delete_profile', { profileId: state.activeProfileId });
            } else {
                await deleteProfileCascade(state.activeProfileId);
                await ensureDefaultProfile();
            }
            state.activeProfileId = null;
            state.activeResumeId = null;
            await loadProfilesUI();
            await notifyChange();
            showStatus('Profile deleted.', true);
        } catch (err) {
            showStatus(err.message, false);
        }
    });

    saveBtn?.addEventListener('click', async () => {
        try {
            const payload = {
                profile_id: state.activeProfileId,
                create_new: !state.activeProfileId,
                profile_name: getVal('pwa-prof-label').trim() || 'Profile',
                is_default: document.getElementById('pwa-prof-default')?.checked ? 1 : 0,
                first_name: getVal('pwa-prof-firstname').trim(),
                last_name: getVal('pwa-prof-lastname').trim(),
                email: getVal('pwa-prof-email').trim(),
                phone: getVal('pwa-prof-phone').trim(),
                location: getVal('pwa-prof-location').trim(),
                roles: getVal('pwa-prof-roles').trim(),
                locations: getVal('pwa-prof-locations').trim(),
                keywords: getVal('pwa-prof-keywords').trim(),
                links: getVal('pwa-prof-links').trim(),
            };

            if (state.isExtensionConnected) {
                const saved = await callExtension('save_profile', { profile: payload });
                state.activeProfileId = saved.profile_id;
                await saveLocalProfile({ ...payload, profile_id: saved.profile_id, create_new: false }).catch(() => {});
            } else {
                state.activeProfileId = await saveLocalProfile(payload);
            }

            await loadProfilesUI();
            await notifyChange();
            showStatus('Profile saved.', true);
        } catch (err) {
            showStatus(err.message, false);
        }
    });

    const resumeSelect = document.getElementById('pwa-resume-select');
    const newResumeBtn = document.getElementById('pwa-new-resume-btn');
    const delResumeBtn = document.getElementById('pwa-delete-resume-btn');
    const saveResumeBtn = document.getElementById('pwa-save-resume-btn');
    const resumeFileEl = document.getElementById('pwa-resume-file');
    const clearFileBtn = document.getElementById('pwa-resume-clear-file-btn');
    const resumeStatus = document.getElementById('pwa-resume-status');

    const showResumeStatus = (text, ok = true) => {
        if (!resumeStatus) return;
        resumeStatus.textContent = text;
        resumeStatus.style.color = ok ? '#34d399' : '#f87171';
        if (ok) setTimeout(() => { resumeStatus.textContent = ''; }, 3000);
    };

    resumeSelect?.addEventListener('change', (e) => {
        state.activeResumeId = e.target.value || null;
        renderResumesUI();
    });

    newResumeBtn?.addEventListener('click', () => {
        if (!state.activeProfileId) return showResumeStatus('Save the profile first before adding resume variants.', false);
        state.activeResumeId = null;
        document.querySelectorAll('.resume-variant-card').forEach((c) => c.classList.remove('active'));
        populateResumeForm(null);
        showResumeStatus('Enter variant details and click Save Resume Variant.', true);
    });

    resumeFileEl?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const b64 = await fileToBase64(file);
        state.pendingResumeFile = {
            file_name: file.name,
            mime_type: file.type || 'application/octet-stream',
            file_data_b64: b64,
            clear_file: false,
        };
        const infoEl = document.getElementById('pwa-resume-file-info');
        if (infoEl) infoEl.textContent = `Selected: ${file.name}`;
        if (clearFileBtn) clearFileBtn.style.display = 'inline-block';
    });

    clearFileBtn?.addEventListener('click', () => {
        state.pendingResumeFile = { clear_file: true };
        if (resumeFileEl) resumeFileEl.value = '';
        const infoEl = document.getElementById('pwa-resume-file-info');
        if (infoEl) infoEl.textContent = 'No file attached (save to confirm removal)';
        clearFileBtn.style.display = 'none';
    });

    saveResumeBtn?.addEventListener('click', async () => {
        if (!state.activeProfileId) return showResumeStatus('Save the profile first.', false);
        const title = getVal('pwa-resume-title').trim();
        if (!title) return showResumeStatus('Variant title is required.', false);

        const summary = getVal('pwa-resume-summary').trim();
        const skillsText = getVal('pwa-resume-skills').trim();
        const plainTextInput = getVal('pwa-resume-text').trim();
        const plain_text = plainTextInput || [title, summary, skillsText ? `Skills: ${skillsText}` : ''].filter(Boolean).join('\n\n');

        try {
            const existing = state.activeResumeId ? state.cachedProfileResumes.find((r) => r.id === state.activeResumeId) : null;
            const payload = {
                id: state.activeResumeId || newId(),
                profile_id: state.activeProfileId,
                title,
                summary: summary || null,
                plain_text,
                skills: toStringArray(skillsText),
                ...(state.pendingResumeFile || {}),
            };

            if (state.isExtensionConnected) {
                const saved = await callExtension('save_resume', { resume: payload });
                state.activeResumeId = saved.id;
            } else {
                const now = nowIso();
                const skillIds = [];
                for (const s of payload.skills) skillIds.push(await getOrCreateByName('skills', s));

                let file_name = existing?.file_name || null;
                let mime_type = existing?.mime_type || null;
                let file_data = existing?.file_data || null;
                if (state.pendingResumeFile?.clear_file) {
                    file_name = null; mime_type = null; file_data = null;
                } else if (state.pendingResumeFile?.file_data_b64) {
                    file_name = state.pendingResumeFile.file_name;
                    mime_type = state.pendingResumeFile.mime_type;
                    file_data = base64ToBlob(state.pendingResumeFile.file_data_b64, mime_type);
                }

                const rec = {
                    id: payload.id,
                    profile_id: state.activeProfileId,
                    title,
                    summary: payload.summary,
                    plain_text,
                    skill_ids: skillIds,
                    file_name,
                    mime_type,
                    created_at: existing?.created_at || now,
                    updated_at: now,
                };
                if (file_data) rec.file_data = file_data;
                await db.resumes.put(rec);
                state.activeResumeId = rec.id;
            }

            state.pendingResumeFile = null;
            await loadResumesUI();
            await notifyChange();
            showResumeStatus('Resume variant saved.', true);
        } catch (err) {
            showResumeStatus(err.message, false);
        }
    });

    delResumeBtn?.addEventListener('click', async () => {
        if (!state.activeResumeId) return showResumeStatus('Select a saved resume variant to delete.', false);
        if (!confirm('Delete this resume variant?')) return;
        try {
            if (state.isExtensionConnected) {
                await callExtension('delete_resume', { resumeId: state.activeResumeId });
            } else {
                await deleteResume(state.activeResumeId);
            }
            state.activeResumeId = null;
            await loadResumesUI();
            await notifyChange();
            showResumeStatus('Resume variant deleted.', true);
        } catch (err) {
            showResumeStatus(err.message, false);
        }
    });

    document.getElementById('pwa-export-pdf-btn')?.addEventListener('click', () => exportResumeAsPdf());
    document.getElementById('pwa-export-doc-btn')?.addEventListener('click', () => exportResumeAsWord());
}