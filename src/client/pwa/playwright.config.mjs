import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 30000,
    use: {
        baseURL: 'http://localhost:5173/AutoOffer/',
        headless: true,
    },
    webServer: {
        command: 'npm run dev -- --port 5173',
        url: 'http://localhost:5173/AutoOffer/',
        reuseExistingServer: true,
        timeout: 30000,
    },
});
