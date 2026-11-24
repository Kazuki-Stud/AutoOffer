<template>
    <div class="pwa-view">
        <div class="pwa-card">
            <div class="card-header-bar">
                <h2>Candidate Profiles</h2>
                <span class="tag-status">{{ store.sourceTagLabel }}</span>
            </div>
            <div class="profile-toolbar">
                <select v-model="selectedProfileId" class="form-select" aria-label="Select candidate profile" @change="onSelectProfile">
                    <option v-for="p in store.profiles" :key="p.profile_id" :value="p.profile_id">
                        {{ p.profile_name || `${p.first_name} ${p.last_name}`.trim() || 'Profile' }}{{ p.is_default ? ' · Default' : '' }}
                    </option>
                </select>
                <button type="button" class="secondary-btn" @click="newProfile">+ New Profile</button>
                <button type="button" class="clear-button" @click="deleteProfile">Delete Profile</button>
            </div>
            <div class="profile-grid">
                <div class="form-field">
                    <label for="prof-label">Profile Label</label>
                    <input id="prof-label" v-model="profForm.profile_name" type="text" placeholder="e.g. Backend Profile" />
                </div>
                <div class="form-field">
                    <label>Default Profile</label>
                    <label class="inline-check">
                        <input v-model="profForm.is_default" type="checkbox" />
                        <span>Use as default profile</span>
                    </label>
                </div>
                <div class="form-field">
                    <label for="prof-first">First Name</label>
                    <input id="prof-first" v-model="profForm.first_name" type="text" placeholder="First Name" />
                </div>
                <div class="form-field">
                    <label for="prof-last">Last Name</label>
                    <input id="prof-last" v-model="profForm.last_name" type="text" placeholder="Last Name" />
                </div>
                <div class="form-field">
                    <label for="prof-email">Email Address</label>
                    <input id="prof-email" v-model="profForm.email" type="email" placeholder="user@example.com" />
                </div>
                <div class="form-field">
                    <label for="prof-phone">Phone Number</label>
                    <input id="prof-phone" v-model="profForm.phone" type="tel" placeholder="+370 600 00000" />
                </div>
                <div class="form-field full-width">
                    <label for="prof-loc">Location</label>
                    <input id="prof-loc" v-model="profForm.location" type="text" placeholder="Vilnius, Lithuania" />
                </div>
                <div class="form-field full-width">
                    <label for="prof-roles">Target Roles</label>
                    <input id="prof-roles" v-model="profForm.roles" type="text" placeholder="Backend Developer, Java Developer" />
                </div>
                <div class="form-field">
                    <label for="prof-locs">Preferred Search Locations</label>
                    <input id="prof-locs" v-model="profForm.locations" type="text" placeholder="Remote, Vilnius" />
                </div>
                <div class="form-field">
                    <label for="prof-kw">Preferred Search Keywords</label>
                    <input id="prof-kw" v-model="profForm.keywords" type="text" placeholder="Spring Boot, PostgreSQL" />
                </div>
                <div class="form-field full-width">
                    <label for="prof-links">Portfolio &amp; Profile Links</label>
                    <textarea id="prof-links" v-model="profForm.links" rows="2" placeholder="https://github.com/..., https://linkedin.com/in/..."></textarea>
                </div>
            </div>
            <div class="profile-actions-bar">
                <button type="button" class="primary-btn" @click="saveProfile">Save Profile Changes</button>
                <span class="status-msg">{{ profStatus }}</span>
            </div>
        </div>

        <div class="pwa-card">
            <div class="card-header-bar">
                <h2>Resume Variants</h2>
                <span class="tag-status">{{ store.profileResumes.length }} variant{{ store.profileResumes.length === 1 ? '' : 's' }}</span>
            </div>
            <div class="resume-variants-list">
                <div v-if="!store.profileResumes.length" class="status-msg">No resume variants yet for this profile.</div>
                <div
                    v-for="r in store.profileResumes"
                    :key="r.id"
                    class="resume-variant-card"
                    :class="{ active: r.id === store.activeResumeId }"
                    @click="selectResume(r.id)"
                >
                    <div class="resume-variant-title">{{ r.title }}</div>
                    <div class="resume-variant-meta">
                        {{ r.skills?.length || 0 }} skills · {{ r.file_name ? `File: ${r.file_name}` : 'Text only' }} · Updated {{ formatDate(r.updated_at) }}
                    </div>
                    <div class="resume-variant-actions">
                        <button type="button" class="secondary-btn btn-xs" @click.stop="doExportPdf(r)">Export PDF</button>
                        <button type="button" class="secondary-btn btn-xs" @click.stop="doExportWord(r)">Export .doc</button>
                    </div>
                </div>
            </div>

            <div class="profile-toolbar ao-section-spaced">
                <select v-model="selectedResumeId" class="form-select" aria-label="Select resume variant" @change="selectResume(selectedResumeId)">
                    <option v-for="r in store.profileResumes" :key="r.id" :value="r.id">{{ r.title }}</option>
                </select>
                <button type="button" class="secondary-btn" @click="newResume">+ New Resume Variant</button>
                <button type="button" class="clear-button" @click="deleteResume">Delete Variant</button>
            </div>

            <div class="profile-grid">
                <div class="form-field">
                    <label for="res-title">Variant Title / Name</label>
                    <input id="res-title" v-model="resForm.title" type="text" placeholder="e.g. Backend Architecture 2026" />
                </div>
                <div class="form-field">
                    <label for="res-skills">Skills</label>
                    <input id="res-skills" v-model="resForm.skills" type="text" placeholder="Java 21, Spring Boot, PostgreSQL, Docker" />
                </div>
                <div class="form-field full-width">
                    <label for="res-summary">Summary / Core Achievements</label>
                    <textarea id="res-summary" v-model="resForm.summary" rows="2"></textarea>
                </div>
                <div class="form-field full-width">
                    <label for="res-text">Full Resume Plain Text</label>
                    <textarea id="res-text" v-model="resForm.plain_text" rows="6"></textarea>
                </div>
                <div class="form-field full-width">
                    <label for="res-file">Optional Attached Resume File</label>
                    <div class="file-upload-row">
                        <input id="res-file" type="file" accept=".pdf,.doc,.docx,.txt,.md" @change="onFileChange" />
                        <span class="status-msg">{{ fileInfo }}</span>
                        <button v-if="hasFile" type="button" class="secondary-btn" @click="clearFile">Clear File</button>
                    </div>
                </div>
            </div>
            <div class="profile-actions-bar">
                <button type="button" class="primary-btn" @click="saveResume">Save Resume Variant</button>
                <button type="button" class="secondary-btn" @click="doExportPdf(null)">Export PDF</button>
                <button type="button" class="secondary-btn" @click="doExportWord(null)">Export Word</button>
                <span class="status-msg">{{ resStatus }}</span>
            </div>
        </div>
        <iframe ref="printFrame" title="Resume Print Frame" class="ao-print-frame"></iframe>
    </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { newId } from '../../../extension/database/repository.js';
import { logger } from '../services/logger.js';
import { exportResumeAsPdf, exportResumeAsWord } from '../services/resumeExport.js';
import { useAppStore } from '../stores/appStore.js';
import { fileToBase64, formatDate, toStringArray } from '../utils/helpers.js';

const store = useAppStore();
const printFrame = ref(null);
const selectedProfileId = ref('');
const selectedResumeId = ref('');
const profStatus = ref('');
const resStatus = ref('');
const pendingFile = ref(null);

const profForm = reactive({
    profile_name: 'Default',
    is_default: false,
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    location: '',
    roles: '',
    locations: '',
    keywords: '',
    links: '',
});

const resForm = reactive({
    title: '',
    skills: '',
    summary: '',
    plain_text: '',
    file_name: '',
});

function populateProfile(p) {
    profForm.profile_name = p?.profile_name || 'Default';
    profForm.is_default = Boolean(p?.is_default);
    profForm.first_name = p?.first_name || '';
    profForm.last_name = p?.last_name || '';
    profForm.email = p?.email || '';
    profForm.phone = p?.phone || '';
    profForm.location = p?.location || '';
    profForm.roles = p?.roles || '';
    profForm.locations = p?.locations || '';
    profForm.keywords = p?.keywords || '';
    profForm.links = p?.links || '';
}

function populateResume(r) {
    pendingFile.value = null;
    resForm.title = r?.title || '';
    resForm.skills = (r?.skills || []).join(', ');
    resForm.summary = r?.summary || '';
    resForm.plain_text = r?.plain_text || '';
    resForm.file_name = r?.file_name || '';
}

watch(
    () => [store.activeProfileId, store.profiles],
    () => {
        selectedProfileId.value = store.activeProfileId || '';
        const p = store.profiles.find((x) => x.profile_id === store.activeProfileId);
        if (p) populateProfile(p);
    },
    { immediate: true }
);

watch(
    () => [store.activeResumeId, store.profileResumes],
    () => {
        selectedResumeId.value = store.activeResumeId || '';
        const r = store.profileResumes.find((x) => x.id === store.activeResumeId);
        populateResume(r || null);
    },
    { immediate: true }
);

const hasFile = computed(() => Boolean(pendingFile.value?.file_name || (!pendingFile.value?.clear_file && resForm.file_name)));
const fileInfo = computed(() => {
        if (pendingFile.value?.clear_file) return 'File will be removed on save';
        if (pendingFile.value?.file_name) return `Selected: ${pendingFile.value.file_name}`;
        return resForm.file_name ? `Attached: ${resForm.file_name}` : 'No file attached';
});

async function onSelectProfile() {
    try {
        store.activeProfileId = selectedProfileId.value || null;
        await store.loadResumes();
    } catch (err) {
        logger.error('ProfilePage.onSelectProfile', err);
        store.notify(err.message, 'error');
    }
}

function newProfile() {
    store.activeProfileId = null;
    selectedProfileId.value = '';
    populateProfile({ profile_name: 'New Profile', is_default: false });
    store.profileResumes = [];
    store.activeResumeId = null;
    profStatus.value = 'Fill fields and click Save Profile Changes to create.';
}

async function saveProfile() {
    const first = profForm.first_name.trim();
    const last = profForm.last_name.trim();
    const email = profForm.email.trim();
    if (!first || !last || !email) {
        profStatus.value = 'First name, last name, and valid email are required.';
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        profStatus.value = `Invalid email address "${email}". Enter a valid format such as user@example.com.`;
        return;
    }
    const rawLinks = profForm.links.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const badLink = rawLinks.find((u) => !/^https?:\/\//i.test(u));
        if (badLink) {
            profStatus.value = `Invalid profile link "${badLink}". All links must start with http:// or https://.`;
            return;
        }
        try {
        await store.saveProfile({
            profile_id: store.activeProfileId,
            create_new: !store.activeProfileId,
            profile_name: profForm.profile_name.trim() || 'Profile',
            is_default: profForm.is_default ? 1 : 0,
            first_name: profForm.first_name.trim(),
            last_name: profForm.last_name.trim(),
            email: profForm.email.trim(),
            phone: profForm.phone.trim(),
            location: profForm.location.trim(),
            roles: profForm.roles.trim(),
            locations: profForm.locations.trim(),
            keywords: profForm.keywords.trim(),
            links: profForm.links.trim(),
        });
        profStatus.value = 'Profile saved.';
        store.notify('Profile saved locally.', 'success');
} catch (err) {
    logger.error('ProfilePage.saveProfile', err);
    profStatus.value = `Could not save profile: ${err.message}`;
    store.notify(profStatus.value, 'error', 6000);
}
}

async function deleteProfile() {
    if (!store.activeProfileId) {
        profStatus.value = 'Select or save a profile first before deleting.';
        return;
    }
    if (store.profiles.length <= 1) {
        profStatus.value = 'Cannot delete the only profile. Create a second profile before deleting this one.';
        store.notify(profStatus.value, 'warning');
        return;
    }
    if (!confirm('Delete this profile and its resumes?')) return;
    try {
        await store.removeProfile(store.activeProfileId);
        profStatus.value = 'Profile deleted.';
        store.notify('Profile deleted.', 'info');
    } catch (err) {
        logger.error('ProfilePage.deleteProfile', err);
        profStatus.value = err.message;
        store.notify(err.message, 'error');
    }
}

function selectResume(id) {
    store.activeResumeId = id;
    const r = store.profileResumes.find((x) => x.id === id);
    populateResume(r || null);
}

function newResume() {
    store.activeResumeId = null;
    selectedResumeId.value = '';
    populateResume(null);
    resStatus.value = 'Enter variant details and click Save Resume Variant.';
}

async function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
        resStatus.value = `File "${file.name}" is too large (${(file.size / 1048576).toFixed(1)} MB). Maximum supported size is 10 MB.`;
        store.notify(resStatus.value, 'error');
        return;
    }
    try {
        pendingFile.value = {
            file_name: file.name,
            mime_type: file.type || 'application/octet-stream',
            file_data_b64: await fileToBase64(file),
            clear_file: false,
        };
        resStatus.value = '';
    } catch (err) {
        logger.error('ProfilePage.onFileChange', err);
        resStatus.value = `Could not read "${file.name}": ${err.message}`;
        store.notify(resStatus.value, 'error');
    }
}

function clearFile() {
    pendingFile.value = { clear_file: true };
}

async function saveResume() {
    if (!store.activeProfileId) {
        resStatus.value = 'Save or select a candidate profile above before creating resume variants.';
        return;
    }
    if (!resForm.title.trim()) {
        resStatus.value = 'Variant title is required (e.g. "Backend Architecture 2026").';
        return;
    }
    const plain = resForm.plain_text.trim() || [resForm.title.trim(), resForm.summary.trim(), resForm.skills.trim() ? `Skills: ${resForm.skills.trim()}` : ''].filter(Boolean).join('\n\n');
    try {
        await store.saveResume(
            {
                id: store.activeResumeId || newId(),
                profile_id: store.activeProfileId,
                title: resForm.title.trim(),
                summary: resForm.summary.trim() || null,
                plain_text: plain,
                skills: toStringArray(resForm.skills),
            },
            pendingFile.value
        );
        pendingFile.value = null;
        resStatus.value = 'Resume variant saved.';
        store.notify('Resume variant saved.', 'success');
} catch (err) {
    logger.error('ProfilePage.saveResume', err);
    resStatus.value = `Could not save resume variant: ${err.message}`;
    store.notify(resStatus.value, 'error', 6000);
}
}

async function deleteResume() {
    if (!store.activeResumeId) {
        resStatus.value = 'Select a saved resume variant before deleting.';
        return;
    }
    if (!confirm('Delete this resume variant?')) return;
    try {
        await store.removeResume(store.activeResumeId);
        resStatus.value = 'Resume variant deleted.';
        store.notify('Resume variant deleted.', 'info');
    } catch (err) {
        logger.error('ProfilePage.deleteResume', err);
        resStatus.value = err.message;
        store.notify(err.message, 'error');
    }
}

function buildExportPayload(override) {
    return {
        profile: store.activeProfile || {},
        resume: override || {
            title: resForm.title,
            summary: resForm.summary,
            plain_text: resForm.plain_text,
            skills: toStringArray(resForm.skills),
        },
    };
}
function doExportPdf(r) {
    exportResumeAsPdf(buildExportPayload(r), printFrame.value);
}
function doExportWord(r) {
    exportResumeAsWord(buildExportPayload(r));
}
</script>
