<template>
    <div
        v-if="store.consentRequest"
        class="ao-overlay-modal"
        open
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-consent-title"
        @click.self="store.resolveAiConsent(false)"
    >
        <div class="ao-modal-card">
            <div class="ao-modal-header">
                <h2 id="ai-consent-title" class="ao-modal-title">GDPR AI Data Processing Consent</h2>
            </div>
            <div class="ai-modal-body">
                <p>
                    Before calling the remote AI provider <strong>{{ store.consentRequest.endpointLabel }}</strong>, please confirm that you consent to sending minimized resume text and sanitized vacancy descriptions.
                </p>
                <div class="consent-box">
                    All personal contact details — such as name, email, phone, location, and profile links — are stripped locally before transmission. Your API key and profile never leave your device to the AutoOffer backend.
                </div>
            </div>
            <div class="ao-modal-footer">
                <button type="button" class="secondary-btn" @click="store.resolveAiConsent(false)">Cancel</button>
                <button type="button" class="primary-btn" @click="store.resolveAiConsent(true)">I Consent &amp; Continue</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useAppStore } from '../stores/appStore.js';
const store = useAppStore();
</script>
