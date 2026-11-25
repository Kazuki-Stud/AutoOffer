import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
        root: __dirname,
        base: '/AutoOffer/',
        plugins: [vue()],
        build: {
            outDir: resolve(__dirname, 'dist'),
            emptyOutDir: true,
            target: 'esnext',
        },
        server: {
            port: 5173,
        },
        test: {
            environment: 'jsdom',
            globals: true,
            exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
        },
});