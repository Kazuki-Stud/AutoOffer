<template>
    <div class="layout-container">
        <a href="#main-content" class="skip-link">Skip to main content</a>
        <AppHeader :theme="store.theme" :connected="store.isExtensionConnected" @toggle-theme="store.toggleTheme()" />
        <main id="main-content" tabindex="-1">
            <ErrorBoundary>
                <router-view />
            </ErrorBoundary>
        </main>
        <VacancyModal
        v-if="store.selectedVacancyForModal"
        :vacancy="store.selectedVacancyForModal"
        @close="store.selectedVacancyForModal = null"
        @review-apply="openReviewApply"
        />
        <ReviewApplyModal
        v-if="store.reviewApplyVacancy"
        :vacancy="store.reviewApplyVacancy"
        @close="store.reviewApplyVacancy = null"
        />
        <AiConsentModal v-if="store.consentRequest" />
        <ToastContainer />
    </div>
</template>

<script setup>
import { defineAsyncComponent, onMounted, onUnmounted } from 'vue';
import AppHeader from './components/AppHeader.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';
import ToastContainer from './components/ToastContainer.vue';
import { useDeviceInfo } from './composables/useDeviceInfo.js';
import { registerGlobalHttpErrorHandler } from './services/httpClient.js';
import { useAppStore } from './stores/appStore.js';

const VacancyModal = defineAsyncComponent(() => import('./components/VacancyModal.vue'));
const ReviewApplyModal = defineAsyncComponent(() => import('./components/ReviewApplyModal.vue'));
const AiConsentModal = defineAsyncComponent(() => import('./components/AiConsentModal.vue'));

const store = useAppStore();
useDeviceInfo();

function openReviewApply(vacancy) {
    store.selectedVacancyForModal = null;
    store.reviewApplyVacancy = vacancy;
}

function onBridgeMessage(event) {
    if (event.source !== window || event.data?.type !== 'AUTOOFFER_DATA_UPDATED') return;
    const reason = event.data.reason;
    if (reason === 'vacancies_grabbed') store.syncVacanciesQuietly({ respectSetting: true });
    else if (reason === 'vacancies_updated') store.syncVacanciesQuietly({ respectSetting: false });
    else if (reason === 'vacancies_cleared') store.syncVacanciesQuietly({ respectSetting: false, pruneRemoved: true });
    else store.refreshDisplay();
}

onMounted(() => {
    registerGlobalHttpErrorHandler((msg) => store.notify(msg, 'error'));
    window.addEventListener('message', onBridgeMessage);
    store.bootstrap();
});

onUnmounted(() => {
    window.removeEventListener('message', onBridgeMessage);
});
</script>
