import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    root,
    publicDir: resolve(root, 'public'),
    build: {
        outDir: resolve(root, 'dist'),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                popup: resolve(root, 'popup/popup.html'),
                background: resolve(root, 'background.js'),
                content: resolve(root, 'content.js'),
            },
            output: { entryFileNames: '[name].js' },
        },
    },
});