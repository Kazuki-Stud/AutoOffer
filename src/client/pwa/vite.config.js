import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: resolve(__dirname),
    build: {
        outDir: resolve(__dirname, '../../../dist-pwa'),
        emptyOutDir: true,
        target: 'esnext'
    },
    server: {
        port: 5173
    }
});