<template>
    <div class="pwa-view">
        <div class="pwa-card">
            <div class="card-header-bar">
                <h2>Storage &amp; Device Metrics</h2>
            </div>
            <div class="metrics-grid">
                <div class="metric-box">
                    <span class="metric-label">Stored Information Weight</span>
                    <span class="metric-value">{{ store.storageWeight.formatted }}</span>
                </div>
                <div class="metric-box">
                    <span class="metric-label">Stored Vacancies Count</span>
                    <span class="metric-value">{{ store.vacancies.length }}</span>
                </div>
                <div class="metric-box">
                    <span class="metric-label">Sync Connection Status</span>
                    <span class="metric-value">{{ store.syncStatusText }}</span>
                </div>
            </div>
        </div>

        <div class="pwa-card">
            <div class="card-header-bar">
                <h2>Display &amp; Accessibility Preferences</h2>
                <span class="tag-status">
                    {{ deviceState.deviceType }} · {{ deviceState.orientation }} · {{ deviceState.aspectRatio }} · {{ deviceState.pixelRatio }}x
                </span>
            </div>
            <div class="sync-form-grid">
                <div class="form-field">
                    <label for="display-theme">Color Scheme</label>
                    <select id="display-theme" :value="store.theme" class="form-select" @change="store.setTheme($event.target.value)">
                        <option value="dark">Dark Theme</option>
                        <option value="light">Light Theme</option>
                    </select>
                </div>
                <div class="form-field">
                    <label for="display-scale">Interface Text Scale</label>
                    <select id="display-scale" :value="String(store.uiScale)" class="form-select" @change="store.setUiScale($event.target.value)">
                        <option value="100">100% — Default</option>
                        <option value="110">110% — Large</option>
                        <option value="120">120% — Extra Large</option>
                    </select>
                </div>
                <div class="form-field">
                    <label for="display-density">Layout Density</label>
                    <select id="display-density" :value="store.uiDensity" class="form-select" @change="store.setUiDensity($event.target.value)">
                        <option value="comfortable">Comfortable</option>
                        <option value="compact">Compact</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="pwa-card">
            <div class="card-header-bar">
                <h2>AI Assistant Configuration</h2>
                <span class="tag-status">
                    {{ store.aiConsent.consented ? `GDPR Opt-In: Consented · ${formatDate(store.aiConsent.givenAt)}` : 'GDPR Opt-In: Pending' }}
                </span>
            </div>
            <p class="status-msg ao-hint-text">
                API keys are encrypted at rest with a non-extractable device key, excluded from JSON backups, and never sent to the AutoOffer backend.
            </p>
            <div class="sync-form-grid">
                <div class="form-field">
                    <label for="ai-provider">AI Provider Mode</label>
                    <select id="ai-provider" v-model="aiForm.provider_name" class="form-select" @change="onProviderChange">
                        <option value="openai">OpenAI-Compatible HTTPS Endpoint</option>
                        <option value="gemini">Google Gemini AI</option>
                        <option value="local">Local Model — Ollama / LM Studio</option>
                        <option value="local_cosine">Offline Local Similarity · No LLM</option>
                    </select>
                </div>
                <div class="form-field">
                    <label for="ai-preset">Preset Model</label>
                    <select id="ai-preset" v-model="selectedPreset" class="form-select" :disabled="aiForm.provider_name === 'local_cosine'" @change="onPresetChange">
                        <option v-for="m in presetModels" :key="m" :value="m">{{ m }}</option>
                        <option v-if="aiForm.provider_name !== 'local_cosine'" value="__custom__">Custom model name...</option>
                    </select>
                </div>
                <div class="form-field">
                    <label for="ai-model">Model Name</label>
                    <input id="ai-model" v-model="aiForm.model_name" type="text" :disabled="aiForm.provider_name === 'local_cosine'" />
                </div>
                <div class="form-field full-width">
                    <label for="ai-endpoint">API Endpoint URL</label>
                    <input id="ai-endpoint" v-model="aiForm.api_endpoint" type="url" :disabled="aiForm.provider_name === 'local_cosine'" />
                </div>
                <div class="form-field">
                    <label for="ai-key">API Key</label>
                    <input id="ai-key" v-model="aiForm.api_key" type="password" autocomplete="new-password" :disabled="aiForm.provider_name === 'local_cosine'" />
                </div>
                <div class="form-field">
                    <label>Activation</label>
                    <label class="inline-check">
                        <input v-model="aiForm.is_active" type="checkbox" />
                        <span>Set as active AI configuration</span>
                    </label>
                </div>
            </div>
            <div class="sync-actions-bar">
                <button type="button" class="primary-btn" @click="saveAiConfig">Save AI Configuration</button>
                <span class="status-msg">{{ aiStatus }}</span>
            </div>
            <div class="ai-configs-list">
                <div v-if="!store.aiConfigs.length" class="status-msg">No saved AI provider configurations yet.</div>
                <div v-for="cfg in store.aiConfigs" :key="cfg.id" class="ai-config-row" :class="{ active: cfg.is_active }">
                    <div>
                        <strong>{{ cfg.provider_name }} · {{ cfg.model_name }}{{ cfg.is_active ? ' · Active' : '' }}</strong>
                        <div class="job-row-meta">{{ cfg.api_endpoint || 'Offline Cosine' }} · Key: {{ cfg.has_api_key ? 'Encrypted locally' : 'None' }}</div>
                    </div>
                    <div class="job-row-actions">
                        <button v-if="!cfg.is_active" type="button" class="secondary-btn btn-xs" @click="store.activateAiConfig(cfg.id)">Activate</button>
                        <button type="button" class="clear-button btn-xs" @click="store.removeAiConfig(cfg.id)">Delete</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="pwa-card">
            <div class="card-header-bar">
                <h2>Synchronization &amp; Privacy Options</h2>
                <span class="tag-status">{{ store.sourceTagLabel }}</span>
            </div>
            <div class="sync-form-grid">
                <div class="form-field">
                    <label for="sync-role">Filter by Role</label>
                    <input id="sync-role" v-model="syncOpts.role" type="text" />
                </div>
                <div class="form-field">
                    <label for="sync-date">Filter by Date</label>
                    <select id="sync-date" v-model="syncOpts.dateRange" class="form-select">
                        <option value="all">All Available Dates</option>
                        <option value="today">Today Only</option>
                        <option value="7days">Last 7 Days</option>
                        <option value="30days">Last 30 Days</option>
                    </select>
                </div>
                <div class="form-field">
                    <label for="sync-fields">Data Scope / Fields</label>
                    <select id="sync-fields" v-model="syncOpts.fieldsMode" class="form-select">
                        <option value="all">All Fields — Descriptions &amp; Metadata</option>
                        <option value="minimum">Minimum Fields — Titles &amp; Links</option>
                    </select>
                </div>
                <div class="form-field">
                    <label for="ext-id">Chrome Extension ID</label>
                    <input id="ext-id" v-model="store.extensionId" type="text" placeholder="Extension ID" @change="onExtIdChange" />
                </div>
                <div class="form-field">
                    <label for="srv-url">Server API Base URL</label>
                    <input id="srv-url" :value="store.settings.server_base_url" type="url" @change="onServerUrlChange($event.target.value)" />
                </div>
                <div class="form-field">
                    <label for="sub-mode">Submission Mode</label>
                    <select id="sub-mode" :value="store.settings.submission_mode" class="form-select" @change="store.updateSetting('submission_mode', $event.target.value)">
                        <option value="semi_automated">Semi-Automated · Highlight &amp; Confirm</option>
                        <option value="manual">Manual Only</option>
                    </select>
                </div>
                <div class="form-field full-width">
                    <label class="inline-check">
                        <input type="checkbox" :checked="store.settings.private_use_only" @change="store.updateSetting('private_use_only', $event.target.checked)" />
                        <span>Private use only — keep all vacancies and URLs on this device</span>
                    </label>
                </div>
                <div class="form-field full-width">
                    <label class="inline-check">
                        <input type="checkbox" :checked="store.settings.auto_sync_pwa_on_grab" @change="store.updateSetting('auto_sync_pwa_on_grab', $event.target.checked)" />
                        <span>Auto-sync grabbed vacancies with PWA when extension finishes</span>
                    </label>
                </div>
            </div>
            <div class="sync-actions-bar">
                <button type="button" class="primary-btn" @click="store.manualSyncFromExtension(syncOpts)">Download / Sync Data</button>
                <button type="button" class="secondary-btn" @click="exportLocalBackup">Export Local Backup</button>
                <button type="button" class="secondary-btn" @click="backupFileInput?.click()">
                    Import Backup
                </button>
                <input
                ref="backupFileInput"
                type="file"
                accept="application/json"
                class="ao-hidden-input"
                tabindex="-1"
                aria-hidden="true"
                @change="onImportBackup"
                />
                <button type="button" class="clear-button" @click="clearStored">Clear Stored Vacancies</button>
                <span class="sync-status-indicator" :class="store.syncStatusType">{{ store.syncStatusText }}</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { useDeviceInfo } from '../composables/useDeviceInfo.js';
import { AI_MODEL_PRESETS } from '../models/constants.js';
import { exportLocalBackup, importLocalBackup } from '../services/bridge.js';
import { useAppStore } from '../stores/appStore.js';
import { formatDate, isSafeHttpUrl } from '../utils/helpers.js';

const store = useAppStore();
const { deviceState } = useDeviceInfo();
const backupFileInput = ref(null);
const aiStatus = ref('');
const selectedPreset = ref('gpt-4o-mini');
const aiForm = reactive({
    provider_name: 'openai',
    model_name: 'gpt-4o-mini',
    api_endpoint: 'https://api.openai.com/v1/chat/completions',
    api_key: '',
    is_active: true,
});
const syncOpts = reactive({ role: 'all', dateRange: 'all', fieldsMode: 'all' });

const presetModels = computed(() => AI_MODEL_PRESETS[aiForm.provider_name] || AI_MODEL_PRESETS.openai);

function onProviderChange() {
    const models = presetModels.value;
    selectedPreset.value = models[0];
    aiForm.model_name = models[0];
    if (aiForm.provider_name === 'openai') aiForm.api_endpoint = 'https://api.openai.com/v1/chat/completions';
    else if (aiForm.provider_name === 'gemini') aiForm.api_endpoint = 'https://generativelanguage.googleapis.com/v1beta';
    else if (aiForm.provider_name === 'local') aiForm.api_endpoint = 'http://localhost:11434/v1/chat/completions';
    else {
        aiForm.api_endpoint = '';
        aiForm.api_key = '';
    }
}

function onPresetChange() {
    aiForm.model_name = selectedPreset.value === '__custom__' ? '' : selectedPreset.value;
}

async function saveAiConfig() {
    if (!aiForm.model_name.trim()) {
        aiStatus.value = 'Model name is required. Choose a preset or enter a custom model identifier.';
        return;
    }
    if (aiForm.provider_name !== 'local_cosine' && !isSafeHttpUrl(aiForm.api_endpoint)) {
        aiStatus.value = `Invalid AI endpoint "${aiForm.api_endpoint || ''}". Enter a full URL starting with https:// or http://.`;
        return;
    }
    if ((aiForm.provider_name === 'openai' || aiForm.provider_name === 'gemini') && !aiForm.api_key.trim()) {
        aiStatus.value = `An API key is required for ${aiForm.provider_name}. Paste your key or switch to Local Model / Offline Local Similarity.`;
        return;
    }
    try {
        await store.saveAiConfig({
            provider_name: aiForm.provider_name,
            api_endpoint: aiForm.api_endpoint.trim() || null,
            api_key: aiForm.api_key.trim(),
            model_name: aiForm.model_name.trim(),
            is_active: aiForm.is_active ? 1 : 0,
        });
        aiForm.api_key = '';
        aiStatus.value = 'AI configuration saved. Key encrypted locally.';
        store.notify('AI configuration saved.', 'success');
} catch (err) {
    aiStatus.value = `Could not save AI configuration: ${err.message}`;
    store.notify(aiStatus.value, 'error', 6000);
}
}

async function onExtIdChange() {
    const clean = store.extensionId.trim();
    if (clean && !/^[a-p]{32}$/.test(clean)) {
        store.notify(
        `Extension ID "${clean}" looks invalid (expected 32 lowercase letters a–p from chrome://extensions).`,
            'warning',
            6000
        );
    }
    localStorage.setItem('autooffer_extension_id', clean);
    await store.runExtensionSync();
}

async function onServerUrlChange(raw) {
    const url = String(raw || '').trim();
    if (!isSafeHttpUrl(url)) {
        store.notify(
        `Invalid Server API Base URL "${url}". It must start with http:// or https:// (for example http://localhost:8080).`,
        'error',
        6000
    );
    return;
}
try {
    await store.updateSetting('server_base_url', url);
    store.notify(`Server API URL updated to ${url}.`, 'success');
} catch (err) {
    store.notify(`Could not save Server API URL: ${err.message}`, 'error', 6000);
}
}

async function onImportBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        await importLocalBackup(file);
        await Promise.all([store.loadSettings(), store.loadProfiles(), store.loadJobs(), store.refreshDisplay()]);
        store.notify(`Imported backup from "${file.name}" into local IndexedDB.`, 'success');
    } catch (err) {
        store.notify(`Backup import failed: ${err.message}`, 'error', 6000);
    }
}

async function clearStored() {
    const skipped = await store.clearVacancies();
    store.notify(
        skipped ? `Cleared un-applied vacancies; ${skipped} kept due to linked applications.` : 'All stored vacancies cleared.',
        'info'
    );
}
</script>
