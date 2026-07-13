import { describe, expect, it } from 'vitest';
import { heatmapHtml } from './dashboard.js';

describe('review activity calendar', () => {
    it('renders a labeled trailing year with daily review details', () => {
        const now = new Date(2026, 6, 13, 12);
        const html = heatmapHtml([
            { date: '2026-07-13', reviews: 4, goalMet: true },
            { date: '2026-07-12', reviews: 1, goalMet: false }
        ], now);

        expect(html).toContain('5 reviews in the last year');
        expect(html).toContain('2025–2026');
        expect(html).toContain('Jul 14, 2025');
        expect(html).toContain('Jul 13, 2026');
        expect(html).toContain('Monday, July 13, 2026: 4 reviews; daily goal met');
        expect(html).toContain('Daily goal met');
        expect(html).toContain('Fewer');
        expect(html).toContain('More');
    });

    it('uses singular review grammar', () => {
        const html = heatmapHtml([
            { date: '2026-01-01', reviews: 1, goalMet: false }
        ], new Date(2026, 0, 1, 12));

        expect(html).toContain('1 review in the last year');
        expect(html).toContain('Thursday, January 1, 2026: 1 review');
    });
});
