import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    expect: { timeout: 10_000 },
    fullyParallel: false,
    reporter: 'line',
    use: {
        baseURL: 'http://127.0.0.1:3000',
        trace: 'retain-on-failure'
    },
    projects: [
        { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
        {
            name: 'mobile-webkit',
            grep: /mobile layered scrolling|mobile subject layers|subject overview emphasizes|agent activity stays within/,
            use: { ...devices['iPhone 13'], browserName: 'webkit' }
        }
    ],
    webServer: {
        command: 'npm run dev:no-watch -- --host 127.0.0.1',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: true,
        timeout: 20_000
    }
});
