import { describe, expect, it } from 'vitest';
import { canReviewGenerationDag, canApplyGenerationDag, loadRetainedGenerationDag, compareGenerationDag, generationJobCategory, generationModelSummary } from './generation-dag-review.js';

describe('generation curriculum review', () => {
    it('allows viewing a successful evaluation but never applying it, even without preview metadata', () => {
        const request = { jobType: 'curriculum-design', status: 'needs-review', payload: { evaluationOnly: true },
            result: { preview: { available: true, readOnly: true } } };
        expect(canReviewGenerationDag(request)).toBe(true);
        expect(canApplyGenerationDag(request)).toBe(false);
        expect(canApplyGenerationDag({ ...request, result: {} })).toBe(false);
    });
    it('reviews completed rejected graphs without allowing Apply or requiring a PR', async () => {
        for (const jobType of ['curriculum-design', 'deck-plan']) {
            const request = { id: 52, jobType, status: 'failed', result: { preview: { available: true, readOnly: true } } };
            expect(canReviewGenerationDag(request)).toBe(true);
            expect(canApplyGenerationDag(request)).toBe(false);
            expect(canApplyGenerationDag({ ...request, status: 'needs-review' })).toBe(false);
            const catalog = { subjects: [], decks: [] };
            const loaded = await loadRetainedGenerationDag(request, async endpoint => {
                expect(endpoint).toBe('/api/generation-requests/52/preview');
                return { preview: { readOnly: true, catalog, issues: ['Missing route.'] } };
            });
            expect(loaded).toEqual({ catalog, issues: ['Missing route.'], commit: '', pull: null });
            expect(canReviewGenerationDag({ ...request, status: 'running' })).toBe(false);
            expect(canReviewGenerationDag({ ...request, result: {} })).toBe(false);
            await expect(loadRetainedGenerationDag(request, async () => ({ preview: {} }))).rejects.toThrow('Invalid draft');
        }
        expect(canApplyGenerationDag({ status: 'needs-review' })).toBe(true);
    });
    it('compares the whole deck graph and reports downstream content without altering it', () => {
        const a = { id: 'math/a', subject: 'math', description: 'Old scope', prerequisites: [], chapters: [{ card_count: 12 }] };
        const b = { id: 'physics/b', subject: 'physics', prerequisites: ['math/a'], chapters: [{ card_count: 7 }] };
        const before = { decks: [a, b] }, snapshot = structuredClone(before);
        const after = { decks: [{ ...a, description: 'New scope', chapters: [] }, b, { id: 'biology/c', subject: 'biology', prerequisites: [] }] };
        const diff = compareGenerationDag(before, after, { jobType: 'curriculum-design' });
        expect(diff.beforeCount).toBe(2);
        expect(diff.afterCount).toBe(3);
        expect(diff.changed[0].changes).toEqual([{ field: 'description', before: 'Old scope', after: 'New scope' }]);
        expect(diff.affectedContent).toEqual([
            { id: 'math/a', reason: 'Deck specification changed', chapterCount: 1, cardCount: 12 },
            { id: 'physics/b', reason: 'Prerequisite changed', chapterCount: 1, cardCount: 7 }
        ]);
        expect(before).toEqual(snapshot);
        expect(canReviewGenerationDag({ jobType: 'curriculum-design', status: 'needs-review', resultUrl: 'https://github.com/o/r/pull/1' })).toBe(true);
    });
    it('treats required outcome changes as curriculum changes even when the deck edge stays the same', () => {
        const node = { id: 'physics/b', prerequisites: ['math/a'], required_outcomes: [{ deck_id: 'math/a', outcome_ids: ['addition'] }] };
        const next = { ...node, required_outcomes: [{ deck_id: 'math/a', outcome_ids: ['multiplication'] }] };
        const diff = compareGenerationDag({ decks: [node] }, { decks: [next] }, { jobType: 'curriculum-design' });
        expect(diff.changed[0].fields).toEqual(['required_outcomes']);
        expect(diff.addedEdges).toEqual([]);
        expect(diff.removedEdges).toEqual([]);
    });
    it('discloses the exact queued model and reasoning without inventing missing values', () => {
        expect(generationModelSummary({providerId:'openai',modelId:'gpt-6-astra',payload:{reasoningEffort:'high'}})).toBe('Model: gpt-6-astra · Reasoning: High · Provider: OpenAI');
        expect(generationModelSummary({providerId:'openai',modelId:'gpt-6-astra',payload:{reasoningEffort:'max'}})).toContain('Reasoning: Max');
        expect(generationModelSummary({})).toContain('Runner default (not pinned)');
        expect(generationModelSummary({})).toContain('Runner default (not specified)');
    });
    it('tags subject curriculum, deck curriculum, and flashcard jobs independently of lifecycle', () => {
        for (const status of ['queued', 'running', 'needs-review', 'published', 'failed', 'cancelled']) {
            expect(generationJobCategory({jobType:'subject-design', status}).label).toBe('Subject curriculum');
            expect(generationJobCategory({job_type:'deck-plan', status}).label).toBe('Deck curriculum');
            for (const jobType of ['chapter-expand','deck-build','deck-audit']) expect(generationJobCategory({jobType,status}).label).toBe('Flashcards');
        }
        expect(generationJobCategory({jobType:'future-type'}).id).toBe('other');
    });
    it('allows completed curriculum previews without offering pending or flashcard jobs as curricula', () => {
        for (const jobType of ['subject-design','deck-plan']) {
            for (const status of ['needs-review','published','cancelled']) expect(canReviewGenerationDag({jobType,status,resultUrl:'https://github.com/o/r/pull/1'})).toBe(true);
            for (const status of ['queued','running','failed']) expect(canReviewGenerationDag({jobType,status,resultUrl:'url'})).toBe(false);
            expect(canReviewGenerationDag({jobType,status:'needs-review'})).toBe(false);
        }
        expect(canReviewGenerationDag({jobType:'chapter-expand',status:'needs-review',resultUrl:'url'})).toBe(false);
    });
    it('compares only the requested subject, with incoming external edges and recommended edges', () => {
        const a={id:'math/a',subject:'math',title:'A',prerequisites:['external/x'],recommended_after:[]};
        const b={id:'math/b',subject:'math',prerequisites:['math/a']};
        const before={decks:[a,b,{id:'physics/z',subject:'physics'}]};
        const after={decks:[{...a,title:'New A',prerequisites:[],recommended_after:['external/x']},{id:'math/c',subject:'math',prerequisites:['math/a']}]};
        const original=structuredClone(before);
        const diff=compareGenerationDag(before,after,{jobType:'subject-design',subject:'math'});
        expect(diff.beforeCount).toBe(2);
        expect(diff.added.map(n=>n.id)).toEqual(['math/c']);
        expect(diff.removed.map(n=>n.id)).toEqual(['math/b']);
        expect(diff.changed[0].fields).toEqual(['title','prerequisites','recommended_after']);
        expect(diff.addedEdges).toContainEqual({source:'external/x',target:'math/a',type:'recommended'});
        expect(diff.removedEdges).toContainEqual({source:'external/x',target:'math/a',type:'required'});
        expect(before).toEqual(original);
    });
    it('compares chapter identities and resolved concept edges, ignoring card counts and set order', () => {
        const chapter={id:'02_next',title:'Next',card_count:3,provides:['a','b'],resolved_dependencies:[{kind:'concept',resolved:'01_start'}]};
        const before={decks:[{id:'math/a',chapters:[chapter]}]};
        const reordered={decks:[{id:'math/a',chapters:[{...chapter,card_count:90,provides:['b','a']}]}]};
        const request={jobType:'deck-plan',deckId:'math/a'};
        expect(compareGenerationDag(before,reordered,request).changed).toEqual([]);
        const after={decks:[{id:'math/a',chapters:[{...chapter,resolved_dependencies:[{kind:'external-concept',resolved:'other/deck#03_external'}]}]}]};
        const diff=compareGenerationDag(before,after,request);
        expect(diff.removedEdges).toEqual([{source:'math/a#01_start',target:'math/a#02_next',type:'required'}]);
        expect(diff.addedEdges).toEqual([{source:'other/deck#03_external',target:'math/a#02_next',type:'required'}]);
    });
    it('handles brand-new subjects and empty deck plans', () => {
        expect(compareGenerationDag(null,{decks:[{id:'math/a',subject:'math'}]},{jobType:'subject-design',subject:'math'}).added).toHaveLength(1);
        expect(compareGenerationDag(null,null,{jobType:'deck-plan',deckId:'math/a'})).toMatchObject({beforeCount:0,afterCount:0,added:[],removed:[]});
    });
});
