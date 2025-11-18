import { defineConfig } from 'vite';

export default defineConfig({
    base: '/flashcards/',
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
});
