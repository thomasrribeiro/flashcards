import { describe, expect, it } from 'vitest';
import { canReviewGenerationDag, compareGenerationDag, generationJobCategory } from './generation-dag-review.js';

describe('generation DAG review', () => {
    it('tags subject DAG, deck DAG, and flashcard jobs independently of lifecycle', () => {
        for (const status of ['queued', 'running', 'needs-review', 'published', 'failed', 'cancelled']) {
            expect(generationJobCategory({jobType:'subject-design', status}).label).toBe('Subject DAG');
            expect(generationJobCategory({job_type:'deck-plan', status}).label).toBe('Deck DAG');
            for (const jobType of ['chapter-expand','deck-build','deck-audit']) expect(generationJobCategory({jobType,status}).label).toBe('Flashcards');
        }
        expect(generationJobCategory({jobType:'future-type'}).id).toBe('other');
    });
    it('allows completed DAG previews without offering pending or flashcard jobs as DAGs', () => {
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
