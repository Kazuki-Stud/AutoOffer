import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';

export default defineConfig({
    plugins: [
        webExtension({
            manifest: resolve(__dirname, 'src/client/extension/manifest.json'),
            additionalInputs: ['src/client/extension/popup/popup.html'],
        })
    ],
    build: {
        target: 'esnext',
        outDir: 'dist',
        emptyOutDir: true,
        modulePreload: {
            polyfill: false
        }
    }
});