import { describe, expect, it } from 'vitest';
import { daysSinceYearStart, heatmapHtml, reviewScheduleHtml, scrollHeatmapToPresent } from './dashboard.js';

describe('review activity calendar', () => {
    it('renders January through today with daily review details', () => {
        const now = new Date(2026, 6, 13, 12);
        const html = heatmapHtml([
            { date: '2025-12-31', reviews: 20, goalMet: true },
            { date: '2026-07-13', reviews: 4, goalMet: true },
            { date: '2026-07-12', reviews: 1, goalMet: false }
        ], now);

        expect(html).toContain('5 reviews in 2026');
        expect(html).not.toContain('25 reviews');
        expect(html).toContain('Jan 1, 2026');
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

        expect(html).toContain('1 review in 2026');
        expect(html).toContain('Thursday, January 1, 2026: 1 review');
    });

    it('requests only the current calendar year and initially shows today', () => {
        expect(daysSinceYearStart(new Date(2026, 0, 1, 12))).toBe(1);
        expect(daysSinceYearStart(new Date(2026, 6, 13, 12))).toBe(193);

        const scroll = { scrollLeft: 0, scrollWidth: 900 };
        scrollHeatmapToPresent({ querySelector: () => scroll });
        expect(scroll.scrollLeft).toBe(900);
    });
});

describe('card review schedule', () => {
    it('orders cards by due time and marks overdue cards', () => {
        const now = new Date('2026-07-14T18:00:00Z');
        const cards = [
            { hash: 'later', type: 'basic', content: { question: 'Later card?' }, source: { repo: 'owner/mechanics', file: 'flashcards/02_vectors.md' } },
            { hash: 'due', type: 'basic', content: { question: 'Due card?' }, source: { repo: 'owner/mechanics', file: 'flashcards/01_foundations.md' } }
        ];
        const reviews = [
            { cardHash: 'later', fsrsCard: { due: '2026-07-17T18:00:00Z' }, lastReviewed: '2026-07-13T18:00:00Z' },
            { cardHash: 'due', fsrsCard: { due: '2026-07-14T17:00:00Z' }, lastReviewed: '2026-07-13T17:00:00Z' }
        ];
        const html = reviewScheduleHtml(reviews, cards, now);
        expect(html).toContain('2 introduced · 1 due now');
        expect(html.indexOf('Due card?')).toBeLessThan(html.indexOf('Later card?'));
        expect(html).toContain('1h overdue');
        expect(html).toContain('in 3d');
        expect(html).toContain('mechanics / 01_foundations');
    });

    it('falls back to a persisted label when card content is not loaded', () => {
        const html = reviewScheduleHtml([{
            cardHash: 'abcdef123456',
            cardLabel: 'What is inertia?',
            repo: 'owner/mechanics',
            filepath: 'flashcards/05_newtons_laws.md',
            fsrsCard: { due: '2026-07-20T12:00:00Z' },
            lastReviewed: '2026-07-14T12:00:00Z'
        }], [], new Date('2026-07-14T12:00:00Z'));
        expect(html).toContain('What is inertia?');
        expect(html).toContain('05_newtons_laws');
    });
});
