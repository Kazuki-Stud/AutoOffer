import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: __dirname,
    base: '/',
    build: {
        outDir: resolve(__dirname, 'dist'),
        emptyOutDir: true,
        target: 'esnext'
    },
    server: {
        port: 5173
    }
});