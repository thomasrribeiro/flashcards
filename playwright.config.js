import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    use: { baseURL: 'http://127.0.0.1:3107', trace: 'retain-on-failure' },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } }
    ],
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 3107 --strictPort',
        url: 'http://127.0.0.1:3107',
        reuseExistingServer: false
    }
});
