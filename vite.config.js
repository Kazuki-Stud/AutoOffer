import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';

export default defineConfig({
    plugins: [
        webExtension({
            manifest: resolve(__dirname, 'src/manifest.json'),
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