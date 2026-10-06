import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
    // Only use /flashcards/ base in production, use / for local dev
    base: mode === 'production' ? '/flashcards/' : '/',
    server: {
        port: 3000
    },
    test: {
        include: ['src/**/*.test.js']
    }
}));
