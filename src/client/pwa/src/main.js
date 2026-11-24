import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router/index.js';
import { logger } from './services/logger.js';
import './styles/main.css';

if ('serviceWorker' in navigator) {
    if (import.meta.env.PROD) {
        navigator.serviceWorker
        .register('./sw.js')
        .then((reg) => reg.update())
        .catch((err) => logger.warn('sw', 'Service Worker registration failed', err));
    } else {
        navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch((err) => logger.warn('sw', 'Service Worker cleanup failed', err));
    }
}
if (navigator.storage?.persist) {
    navigator.storage.persist().catch((err) => logger.warn('storage', 'Persistent storage request failed', err));
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
