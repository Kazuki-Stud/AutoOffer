import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router/index.js';
import './styles/main.css';

if ('serviceWorker' in navigator) {
    if (import.meta.env.PROD) {
        navigator.serviceWorker.register('./sw.js').then((reg) => reg.update()).catch(() => {});
    } else {
        navigator.serviceWorker.getRegistrations()
            .then((regs) => Promise.all(regs.map((r) => r.unregister())))
            .catch(() => {});
    }
}
if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
