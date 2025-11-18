import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
    // Only use /flashcards/ base in production, use / for local dev
    base: mode === 'production' ? '/flashcards/' : '/',
    root: '.',
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: 'index.html',
                app: 'app.html'
            }
        }
    },
    publicDir: 'public',
    server: {
        port: 3000
    }
}));
