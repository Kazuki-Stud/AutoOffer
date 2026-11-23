<template>
    <div class="layout-container">
        <AppHeader :theme="store.theme" @toggle-theme="store.toggleTheme()" />
        <ErrorBoundary>
            <router-view />
        </ErrorBoundary>
        <VacancyModal
            :vacancy="store.selectedVacancyForModal"
            @close="store.selectedVacancyForModal = null"
            @review-apply="openReviewApply"
        />
        <ReviewApplyModal
            :vacancy="store.reviewApplyVacancy"
            @close="store.reviewApplyVacancy = null"
        />
        <AiConsentModal />
        <ToastContainer />
    </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import AiConsentModal from './components/AiConsentModal.vue';
import AppHeader from './components/AppHeader.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';
import ReviewApplyModal from './components/ReviewApplyModal.vue';
import ToastContainer from './components/ToastContainer.vue';
import VacancyModal from './components/VacancyModal.vue';
import { registerGlobalHttpErrorHandler } from './services/httpClient.js';
import { useAppStore } from './stores/appStore.js';

const store = useAppStore();

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
