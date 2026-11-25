<template>
    <div class="pwa-view">
        <div class="pwa-card">
            <div class="card-header-bar">
                <h2>{{ editingJobId ? `Edit Job: ${form.title}` : 'Create Automation Job' }}</h2>
                <span class="tag-status">{{ store.sourceTagLabel }}</span>
            </div>
            <div class="profile-grid">
                <div class="form-field">
                    <label for="job-title">Job Title</label>
                    <input id="job-title" v-model="form.title" type="text" placeholder="e.g. Frontend React Search" />
                </div>
                <div class="form-field">
                    <label for="job-profile">Profile to Use</label>
                    <select id="job-profile" v-model="form.profile_id" class="form-select">
                        <option v-for="p in store.profiles" :key="p.profile_id" :value="p.profile_id">{{ p.profile_name }}</option>
                    </select>
                </div>
                <div class="form-field full-width">
                    <label>Target Platforms</label>
                    <div class="chips-grid">
                        <button
                        v-for="p in store.platforms"
                        :key="p.id"
                        type="button"
                        class="platform-chip"
                        :class="{ selected: selectedUrls.has(platformUrl(p)) }"
                        @click="togglePlatform(platformUrl(p))"
                        >
                        {{ p.name || p.code }}{{ p.permission_status === 'granted' ? '' : ' · Manual' }}
                    </button>
                </div>
            </div>
            <div class="form-field full-width">
                <label for="job-roles">Target Roles</label>
                <input id="job-roles" v-model="form.roles" type="text" placeholder="Frontend Developer, React, TypeScript" />
            </div>
            <div class="form-field">
                <label for="job-locations">Locations</label>
                <input id="job-locations" v-model="form.locations" type="text" placeholder="Remote, Vilnius, Berlin" />
            </div>
            <div class="form-field">
                <label for="job-keywords">Keywords</label>
                <input id="job-keywords" v-model="form.keywords" type="text" placeholder="TypeScript, REST, Docker" />
            </div>
            <div class="form-field">
                <label for="job-fields">Fields Extraction</label>
                <select id="job-fields" v-model="form.fields_mode" class="form-select">
                    <option value="all">All Fields — Title, URL &amp; Details</option>
                    <option value="minimum">Minimum Fields — Title &amp; URL</option>
                </select>
            </div>
                <div class="form-field">
                    <label for="job-limit">Page Limit</label>
                    <input id="job-limit" v-model.number="form.limit" type="number" min="1" max="50" />
                </div>
            </div>
            <div class="profile-actions-bar">
                <button type="button" class="primary-btn" :disabled="saving" @click="onSave">
                    {{ saving ? 'Saving...' : 'Save Job' }}
                </button>
                <button v-if="editingJobId" type="button" class="secondary-btn" @click="resetForm">Cancel Edit</button>
                <span class="status-msg">{{ statusMsg }}</span>
            </div>
        </div>

        <div class="pwa-card">
            <div class="card-header-bar">
                <h2>Saved Automation Jobs</h2>
                <span class="tag-status">{{ store.jobs.length }} jobs</span>
            </div>
            <div class="jobs-list">
                <div v-if="store.loading && !store.jobs.length" class="ao-skeleton"></div>
                <div v-else-if="!store.jobs.length" class="status-msg">
                    No saved automation jobs yet. Create one above and run it from the Extension popup.
                </div>
                <div v-for="j in store.jobs" :key="j.id" class="job-row-card">
                    <div>
                        <strong>{{ j.title || 'Untitled Job' }}</strong>
                        <div class="job-row-meta">
                            Sites: {{ (j.websites || '').split('\n').filter(Boolean).length }} · Roles: {{ j.roles || 'From profile' }} · Pages: {{ j.limit || 2 }}
                        </div>
                    </div>
                    <div class="job-row-actions">
                        <button type="button" class="secondary-btn" @click="editJob(j)">Edit</button>
                        <button type="button" class="clear-button" @click="deleteJob(j)">Delete</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { reactive, ref, watchEffect } from 'vue';
import { newId, nowIso } from '../../../extension/database/repository.js';
import { logger } from '../services/logger.js';
import { useAppStore } from '../stores/appStore.js';
import { toStringArray } from '../utils/helpers.js';

const store = useAppStore();
const editingJobId = ref(null);
const selectedUrls = ref(new Set());
const statusMsg = ref('');
const saving = ref(false);
const form = reactive({
    title: '',
    profile_id: '',
    roles: '',
    locations: '',
    keywords: '',
    fields_mode: 'all',
    limit: 2,
});

watchEffect(() => {
    if (!form.profile_id && store.activeProfileId) form.profile_id = store.activeProfileId;
});

function platformUrl(p) {
    return p.url || `https://${p.code}`;
}

function togglePlatform(url) {
    const next = new Set(selectedUrls.value);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    selectedUrls.value = next;
}

function resetForm() {
    editingJobId.value = null;
    form.title = '';
    form.roles = '';
    form.locations = '';
    form.keywords = '';
    form.fields_mode = 'all';
    form.limit = 2;
    selectedUrls.value = new Set();
}

function editJob(j) {
    editingJobId.value = j.id;
    form.title = j.title || '';
    form.profile_id = j.profile_id || store.activeProfileId || '';
    form.roles = j.roles || '';
    form.locations = j.locations || '';
    form.keywords = j.keywords || '';
    form.fields_mode = j.fields_mode || 'all';
    form.limit = j.limit || 2;
    selectedUrls.value = new Set((j.websites || '').split('\n').map((s) => s.trim()).filter(Boolean));
}

async function onSave() {
    const websites = Array.from(selectedUrls.value).join('\n');
    const prof = store.profiles.find((p) => p.profile_id === form.profile_id);
    const effectiveRoles = toStringArray(form.roles.trim() || prof?.roles || prof?.skills || '');
    if (!store.platforms.length) {
        statusMsg.value = 'No platforms are loaded yet. Sync registry in the extension popup or refresh the app.';
        return;
    }
    if (!websites) return (statusMsg.value = 'Select at least one target platform chip above.');
    if (!effectiveRoles.length) {
        statusMsg.value = 'Provide at least one target role here or configure Target Roles on the selected profile.';
        return;
    }
    if (!Number.isInteger(form.limit) || form.limit < 1 || form.limit > 50) {
        statusMsg.value = 'Page limit must be a whole number between 1 and 50.';
        return;
    }

    saving.value = true;
    try {
        await store.saveJob({
                id: editingJobId.value || newId(),
                title: form.title.trim() || 'Custom Job',
                websites,
                roles: form.roles.trim(),
                locations: form.locations.trim(),
                keywords: form.keywords.trim(),
                profile_id: form.profile_id,
                fields_mode: form.fields_mode,
                limit: form.limit,
                status: 'ready',
                created_at: nowIso(),
        });
        resetForm();
        statusMsg.value = 'Job saved.';
        store.notify('Automation job saved.', 'success');
    } catch (err) {
        logger.error('JobsPage.onSave', err);
        statusMsg.value = err.message;
        store.notify(err.message, 'error');
    } finally {
        saving.value = false;
    }
}

async function deleteJob(j) {
    if (!confirm(`Delete job "${j.title}"?`)) return;
    try {
        await store.removeJob(j.id);
        store.notify('Automation job deleted.', 'info');
    } catch (err) {
        logger.error('JobsPage.deleteJob', err);
        store.notify(err.message, 'error');
    }
}
</script>
