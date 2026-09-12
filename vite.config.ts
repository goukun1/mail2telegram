import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const WORKER_ORIGIN = 'http://127.0.0.1:8787';

export default defineConfig({
    root: fileURLToPath(new URL('./web', import.meta.url)),
    base: '/',
    plugins: [
        react(),
        tailwindcss(),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./web', import.meta.url)),
        },
    },
    server: {
        port: 5173,
        host: true,
        proxy: {
            '/api': WORKER_ORIGIN,
            '/init': WORKER_ORIGIN,
            '/email': WORKER_ORIGIN,
            '/telegram': WORKER_ORIGIN,
            '/tma': WORKER_ORIGIN,
        },
    },
    build: {
        outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
        emptyOutDir: true,
        target: 'esnext',
        sourcemap: false,
    },
});
