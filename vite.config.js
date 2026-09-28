import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
    // Only use /flashcards/ base in production, use / for local dev
    base: mode === 'production' ? '/flashcards/' : '/',
    root: '.',
    publicDir: 'public',
    server: {
        port: 3000
    },
    test: {
        exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**']
    }
}));
