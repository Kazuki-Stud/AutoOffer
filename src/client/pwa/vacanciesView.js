import { db } from '../extension/database/database.js';
import {
    createApplication,
    ensureDefaultProfile,
    getSetting,
    setApplicationStatus,
} from '../extension/database/repository.js';
import { ENUMS } from '../extension/database/validation.js';
import { openReviewApplyModal } from './aiView.js';
import {
    calculateStorageWeight,
    callExtension,
    syncApplicationsFromBridge,
} from './bridge.js';
import {
    fetchWithTimeout,
    formatDate,
    formatDateTime,
    getVal,
    isSafeHttpUrl,
    state,
} from './state.js';

function updateMetricsView(count, weightStr) {
    const countEl = document.getElementById('pwa-storage-count-val');
    const weightEl = document.getElementById('pwa-storage-weight-val');
    if (countEl) countEl.textContent = String(count);
    if (weightEl) weightEl.textContent = weightStr;
}

function renderStats(list, weightStr = '0 KB') {
    const statsContainer = document.getElementById('dashboard-stats');
    if (!statsContainer) return;

    const total = list.length;
    const withDesc = list.filter((v) => v.status === 'complete' && v.description && v.description.length > 50).length;
    const raw = `${total} | Total Vacancies\n${withDesc} | Detailed\n${weightStr} | Storage Weight`;

    if (typeof statsContainer.render === 'function') {
        statsContainer.render(raw);
    } else {
        statsContainer.textContent = raw;
    }
}

export function openVacancyModal(item) {
    const modal = document.getElementById('vacancy-modal');
    if (!modal || typeof modal.open !== 'function') return;
    let hostname = item.source_host || 'Direct';
    try {
        if (item.url) hostname = new URL(item.url).hostname;
    } catch {}
    modal.open({
            title: item.full_position_name || 'Untitled Vacancy',
            description: item.description || '(No full description stored locally)',
            url: isSafeHttpUrl(item.url) ? item.url : '#',
            source: hostname,
            rawItem: item,
    });
}

window.addEventListener('ao-modal-review-apply', (e) => {
        if (e.detail) openReviewApplyModal(e.detail);
});

async function upsertApplicationStatus(existingApp, profileId, vacancyId, newStatus) {
    if (existingApp) {
        await setApplicationStatus(existingApp.id, newStatus);
        if (state.isExtensionConnected) {
            await callExtension('update_application', { id: existingApp.id, status: newStatus }).catch(() => {});
        }
    } else {
        const defaultResumeId = state.cachedProfileResumes[0]?.id || null;
        if (state.isExtensionConnected) {
            const created = await callExtension('create_application', {
                profile_id: profileId,
                vacancy_id: vacancyId,
                resume_id: defaultResumeId,
                status: newStatus,
            });
            await db.applications.put(created);
        } else {
            const id = await createApplication({ profile_id: profileId, vacancy_id: vacancyId, resume_id: defaultResumeId });
            if (newStatus !== 'Applied') await setApplicationStatus(id, newStatus);
        }
    }
}

function renderList(list, profileId) {
    const grid = document.getElementById('vacancies-grid');
    const emptyState = document.getElementById('empty-state');
    if (!grid) return;

    grid.innerHTML = '';
    if (!list.length) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    for (const item of list) {
        const card = document.createElement('div');
        card.className = 'vacancy-item';

        const titleEl = document.createElement('div');
        titleEl.className = 'vacancy-title';
        titleEl.textContent = item.full_position_name || 'Untitled Position';

        const metaRow = document.createElement('div');
        metaRow.className = 'vacancy-meta-row';

        const linkEl = document.createElement('a');
        linkEl.className = 'vacancy-link';
        linkEl.href = isSafeHttpUrl(item.url) ? item.url : '#';
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
        linkEl.innerHTML = `
            <span>Open original</span>
            <svg class="link-circle-arrow" viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.6"></circle>
                <path d="M8.5 7l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
        `;
        linkEl.addEventListener('click', (e) => e.stopPropagation());

        const aiBtn = document.createElement('button');
        aiBtn.type = 'button';
        aiBtn.className = 'secondary-btn btn-xs';
        aiBtn.textContent = 'Review & Apply';
        aiBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openReviewApplyModal(item);
        });

        metaRow.append(linkEl, aiBtn);

        const footerEl = document.createElement('div');
        footerEl.className = 'vacancy-footer';

        const dateStr = formatDate(item.created_at);
        const isComplete = item.status === 'complete' && item.description && item.description.length > 50;

        const dateSpan = document.createElement('span');
        dateSpan.className = 'vacancy-date';
        dateSpan.textContent = dateStr;

        const pillSpan = document.createElement('span');
        pillSpan.className = 'ao-pill';
        pillSpan.dataset.status = isComplete ? 'complete' : 'basic';
        pillSpan.textContent = `${isComplete ? 'Complete' : 'Basic'} · ${item.sync_level || 'none'}`;

        const app = state.cachedApplications.get(item.id);
        const statusSelect = document.createElement('select');
        statusSelect.className = 'form-select';
        statusSelect.style.maxWidth = '130px';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = 'Not Applied';
        statusSelect.appendChild(noneOpt);
        for (const st of ENUMS.application_status) {
            const opt = document.createElement('option');
            opt.value = st;
            opt.textContent = st;
            statusSelect.appendChild(opt);
        }
        statusSelect.value = app ? app.status : '';
        statusSelect.addEventListener('click', (e) => e.stopPropagation());
        statusSelect.addEventListener('change', async (e) => {
            const chosen = e.target.value;
            if (!chosen) return;
            await upsertApplicationStatus(app, profileId, item.id, chosen);
            await refreshDisplay();
        });

        footerEl.append(dateSpan, pillSpan, statusSelect);
        card.append(titleEl, metaRow, footerEl);
        card.addEventListener('click', () => openVacancyModal(item));

        grid.appendChild(card);
    }
}

export function renderApplicationsTable() {
    const tbody = document.getElementById('applications-tbody');
    const emptyEl = document.getElementById('applications-empty');
    const tableEl = document.getElementById('applications-table');
    const countBadge = document.getElementById('applications-count-badge');
    if (!tbody) return;

    const searchQ = getVal('applications-search-input').trim().toLowerCase();
    const statusFilter = getVal('applications-status-filter');
    const vacancyById = new Map(state.cachedVacancies.map((v) => [v.id, v]));

    const joined = state.cachedAllApplications.map((app) => {
        const vac = vacancyById.get(app.vacancy_id) || null;
        const companyObj = vac?.company_id ? state.cachedCompanies.get(vac.company_id) : null;
        let hostFallback = vac?.source_host || '—';
        if (hostFallback === '—' && vac?.url) {
            try { hostFallback = new URL(vac.url).hostname.replace(/^www\./, ''); } catch {}
        }
        const companyName = companyObj?.name || hostFallback;
        const roleName = vac?.full_position_name || 'Untitled Vacancy';
        const resumeObj = app.resume_id ? state.cachedResumesMap.get(app.resume_id) : null;
        const resumeTitle = resumeObj?.title || '—';
        return { app, vac, companyName, roleName, resumeTitle };
    }).filter((row) => {
        if (statusFilter && row.app.status !== statusFilter) return false;
        if (!searchQ) return true;
        const hay = `${row.companyName} ${row.roleName} ${row.resumeTitle} ${row.app.notes || ''}`.toLowerCase();
        return hay.includes(searchQ);
    });

    if (countBadge) countBadge.textContent = `${joined.length} application${joined.length === 1 ? '' : 's'}`;

    tbody.innerHTML = '';
    if (!joined.length) {
        if (emptyEl) emptyEl.style.display = 'block';
        if (tableEl) tableEl.style.display = 'none';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (tableEl) tableEl.style.display = '';

    for (const { app, vac, companyName, roleName, resumeTitle } of joined) {
        const tr = document.createElement('tr');

        const tdCompany = document.createElement('td');
        tdCompany.dataset.label = 'Company';
        tdCompany.textContent = companyName;

        const tdRole = document.createElement('td');
        tdRole.dataset.label = 'Role';
        if (vac) {
            const roleBtn = document.createElement('button');
            roleBtn.type = 'button';
            roleBtn.className = 'app-role-link';
            roleBtn.textContent = roleName;
            roleBtn.addEventListener('click', () => openVacancyModal(vac));
            tdRole.appendChild(roleBtn);
        } else {
            tdRole.textContent = roleName;
        }

        const tdApplied = document.createElement('td');
        tdApplied.dataset.label = 'Applied';
        tdApplied.textContent = formatDateTime(app.applied_at);

        const tdResume = document.createElement('td');
        tdResume.dataset.label = 'Resume';
        tdResume.textContent = resumeTitle;

        const tdMatch = document.createElement('td');
        tdMatch.dataset.label = 'Match Score';
        const scorePill = document.createElement('span');
        scorePill.className = 'ao-pill';
        scorePill.dataset.status = app.match_score != null && app.match_score >= 70 ? 'complete' : 'basic';
        scorePill.textContent = app.match_score != null ? `${app.match_score}%` : '—';
        tdMatch.appendChild(scorePill);

        const tdStatus = document.createElement('td');
        tdStatus.dataset.label = 'Status';
        const sel = document.createElement('select');
        sel.className = 'form-select';
        for (const st of ENUMS.application_status) {
            const opt = document.createElement('option');
            opt.value = st;
            opt.textContent = st;
            sel.appendChild(opt);
        }
        sel.value = app.status;
        sel.addEventListener('change', async (e) => {
            await setApplicationStatus(app.id, e.target.value);
            if (state.isExtensionConnected) {
                await callExtension('update_application', { id: app.id, status: e.target.value }).catch(() => {});
            }
            await refreshDisplay();
        });
        tdStatus.appendChild(sel);

        const tdNotes = document.createElement('td');
        tdNotes.dataset.label = 'Notes';
        const notesInput = document.createElement('input');
        notesInput.type = 'text';
        notesInput.className = 'inline-notes-input';
        notesInput.placeholder = 'Add follow-up note...';
        notesInput.value = app.notes || '';
        notesInput.addEventListener('change', async (e) => {
            const val = e.target.value.trim() || null;
            await db.applications.update(app.id, { notes: val });
            if (state.isExtensionConnected) {
                await callExtension('update_application', { id: app.id, notes: val }).catch(() => {});
            }
        });
        tdNotes.appendChild(notesInput);

        tr.append(tdCompany, tdRole, tdApplied, tdResume, tdMatch, tdStatus, tdNotes);
        tbody.appendChild(tr);
    }
}

export async function refreshDisplay() {
    state.cachedVacancies = await db.local_vacancies.orderBy('updated_at').reverse().toArray();
    const profile = await ensureDefaultProfile();
    await syncApplicationsFromBridge();

    const [allApps, companies, allResumes] = await Promise.all([
        db.applications.toArray(),
        db.companies_dict.toArray(),
        db.resumes.toArray(),
    ]);
    state.cachedAllApplications = allApps.sort((a, b) => (b.applied_at || '').localeCompare(a.applied_at || ''));
    state.cachedCompanies = new Map(companies.map((c) => [c.id, c]));
    state.cachedResumesMap = new Map(allResumes.map((r) => [r.id, r]));

    const activeProfApps = state.cachedAllApplications.filter((a) => a.profile_id === (state.activeProfileId || profile.id));
    state.cachedApplications = new Map(activeProfApps.map((a) => [a.vacancy_id, a]));

    const weightInfo = await calculateStorageWeight();
    renderStats(state.cachedVacancies, weightInfo.formatted);

    const filterText = getVal('filter-input').toLowerCase().trim();
    const listToRender = filterText
        ? state.cachedVacancies.filter((v) =>
            (v.full_position_name && v.full_position_name.toLowerCase().includes(filterText)) ||
            (v.description && v.description.toLowerCase().includes(filterText))
        )
        : state.cachedVacancies;
    renderList(listToRender, state.activeProfileId || profile.id);
    renderApplicationsTable();
    updateMetricsView(state.cachedVacancies.length, weightInfo.formatted);
}

export async function populateAnalyticsPositions() {
    const selectEl = document.getElementById('hotwords-position-select');
    if (!selectEl) return;
    const base = (await getSetting('server_base_url') || 'http://localhost:8080').replace(/\/+$/, '');
    let positions = [];
    try {
        const res = await fetchWithTimeout(`${base}/api/dictionaries/bootstrap`, {}, 3500);
        if (res.ok) {
            const boot = await res.json();
            if (Array.isArray(boot.positions) && boot.positions.length) {
                positions = boot.positions;
            }
        }
    } catch {}

    if (!positions.length) {
        positions = await db.positions_dict.toArray().catch(() => []);
    }

    const prev = selectEl.value;
    selectEl.innerHTML = '<option value="">All Positions / Roles</option>';
    for (const pos of positions) {
        const opt = document.createElement('option');
        opt.value = pos.id;
        opt.textContent = pos.name;
        selectEl.appendChild(opt);
    }
    if (prev && positions.some((p) => p.id === prev)) selectEl.value = prev;
}

function renderHotwordsChart(items) {
    const chartEl = document.getElementById('hotwords-chart');
    if (!chartEl) return;
    chartEl.innerHTML = '';
    if (!items.length) return;

    const top = items.slice(0, 15);
    const maxCount = Math.max(...top.map((r) => Number(r.vacancyCount) || 0), 1);

    const rowHeight = 32;
    const labelWidth = 175;
    const valueWidth = 65;
    const chartWidth = 640;
    const barMaxWidth = chartWidth - labelWidth - valueWidth - 16;
    const svgHeight = top.length * rowHeight + 12;

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', `0 0 ${chartWidth} ${svgHeight}`);
    svg.setAttribute('class', 'hotwords-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Skill demand frequency bar chart');

    top.forEach((row, idx) => {
        const y = idx * rowHeight + 6;
        const count = Number(row.vacancyCount) || 0;
        const barW = Math.max(4, Math.round((count / maxCount) * barMaxWidth));

        const label = document.createElementNS(svgNs, 'text');
        label.setAttribute('x', '4');
        label.setAttribute('y', String(y + 17));
        label.setAttribute('fill', 'currentColor');
        label.setAttribute('font-size', '12');
        label.setAttribute('font-weight', '600');
        const fullLabel = row.positionName && !document.getElementById('hotwords-position-select')?.value
            ? `${row.skillName} (${row.positionName})`
            : row.skillName;
        label.textContent = fullLabel.length > 25 ? `${fullLabel.slice(0, 23)}…` : fullLabel;

        const titleTag = document.createElementNS(svgNs, 'title');
        titleTag.textContent = `${row.skillName}${row.positionName ? ` — ${row.positionName}` : ''}: ${count} vacancies`;
        label.appendChild(titleTag);

        const track = document.createElementNS(svgNs, 'rect');
        track.setAttribute('x', String(labelWidth));
        track.setAttribute('y', String(y + 4));
        track.setAttribute('width', String(barMaxWidth));
        track.setAttribute('height', '18');
        track.setAttribute('rx', '4');
        track.setAttribute('fill', 'rgba(148, 163, 184, 0.16)');

        const bar = document.createElementNS(svgNs, 'rect');
        bar.setAttribute('x', String(labelWidth));
        bar.setAttribute('y', String(y + 4));
        bar.setAttribute('width', String(barW));
        bar.setAttribute('height', '18');
        bar.setAttribute('rx', '4');
        bar.setAttribute('fill', 'var(--color-primary, #3b82f6)');

        const valText = document.createElementNS(svgNs, 'text');
        valText.setAttribute('x', String(labelWidth + barMaxWidth + 10));
        valText.setAttribute('y', String(y + 17));
        valText.setAttribute('fill', 'var(--text-secondary, #94a3b8)');
        valText.setAttribute('font-size', '12');
        valText.setAttribute('font-weight', '600');
        valText.textContent = String(count);

        svg.append(label, track, bar, valText);
    });

    chartEl.appendChild(svg);
}

export async function loadHotwords() {
    const statusEl = document.getElementById('hotwords-status');
    const chartEl = document.getElementById('hotwords-chart');
    const posSelect = document.getElementById('hotwords-position-select');
    if (!statusEl) return;

    const base = (await getSetting('server_base_url') || 'http://localhost:8080').replace(/\/+$/, '');
    const positionId = posSelect?.value || '';
    const selectedRoleName = posSelect?.selectedOptions?.[0]?.textContent || '';
    const qs = positionId ? `?positionId=${encodeURIComponent(positionId)}` : '';

    statusEl.textContent = 'Loading skill demand...';
    if (chartEl) chartEl.innerHTML = '';

    try {
        const res = await fetchWithTimeout(`${base}/api/skills/hotwords${qs}`, {}, 5000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let rows = await res.json();

        if (!Array.isArray(rows) || !rows.length) {
            try {
                const chRes = await fetchWithTimeout(`${base}/api/analytics/skills-demand`, {}, 4000);
                if (chRes.ok) {
                    const chBody = await chRes.json();
                    const data = Array.isArray(chBody?.data) ? chBody.data : [];
                    rows = data
                        .filter((d) => !positionId || d.position_name === selectedRoleName)
                        .map((d) => ({
                            positionName: d.position_name,
                            skillName: d.skill_name,
                            vacancyCount: Number(d.total_vacancies) || 0,
                        }));
                }
            } catch {}
        }

        if (!Array.isArray(rows) || !rows.length) {
            statusEl.textContent = 'No aggregated skill hotwords available for this role yet.';
            return;
        }
        statusEl.textContent = `Showing top ${Math.min(rows.length, 15)} skills${positionId ? ` for ${selectedRoleName}` : ''}:`;
        renderHotwordsChart(rows);
    } catch (err) {
        statusEl.textContent = `Could not reach backend analytics (${err.message}).`;
    }
}