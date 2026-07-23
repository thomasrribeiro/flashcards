import { describe, expect, it, vi } from 'vitest';
import { installAvailableDependencyDecks } from './dependency-install.js';

describe('prerequisite repository installation', () => {
    it('installs configured prerequisites without receiving or changing study scope', async () => {
        const load = vi.fn().mockResolvedValue(undefined);
        const plan = {
            requiredDecks: [
                {
                    id: 'mathematics/arithmetic',
                    repository: {
                        configured: true,
                        url: 'https://github.com/example/arithmetic.git'
                    }
                },
                {
                    id: 'mathematics/algebra',
                    repository: { configured: false }
                }
            ]
        };

        await expect(installAvailableDependencyDecks(plan, load)).resolves.toEqual([]);
        expect(load).toHaveBeenCalledOnce();
        expect(load).toHaveBeenCalledWith('example/arithmetic');
    });

    it('reports a failed prerequisite without blocking the remaining installs', async () => {
        const load = vi.fn()
            .mockRejectedValueOnce(new Error('unavailable'))
            .mockResolvedValueOnce(undefined);
        const plan = {
            requiredDecks: [
                {
                    id: 'mathematics/arithmetic',
                    repository: { configured: true, url: 'https://github.com/example/arithmetic' }
                },
                {
                    id: 'physics/measurement',
                    repository: { configured: true, url: 'https://github.com/example/measurement' }
                }
            ]
        };

        await expect(installAvailableDependencyDecks(plan, load)).resolves.toEqual([
            'mathematics/arithmetic: unavailable'
        ]);
        expect(load).toHaveBeenCalledTimes(2);
    });
});
