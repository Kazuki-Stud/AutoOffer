import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';

export default defineConfig({
    root: resolve(__dirname, 'src/client/extension'),
    publicDir: resolve(__dirname, 'public'),
    plugins: [
        webExtension({
            manifest: 'manifest.json'
        })
    ],
    build: {
        target: 'esnext',
        outDir: resolve(__dirname, 'dist'),
        emptyOutDir: true
    }
});