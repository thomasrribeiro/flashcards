import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { FLASHCARDS_ROOT } from './paths.js';
import { requestFreshGeneration } from './fresh-generation-provider.js';
import { generateRecoverableCurriculum } from './fresh-curriculum-recovery.js';
import { freshGenerationSchema } from './fresh-generation-schema.js';
import { freshGenerationInstructions } from './fresh-generation-instructions.js';
import { globalCurriculumTarget } from '../../src/global-curriculum-input.js';
import { freshCandidateCatalog, writeFreshCatalog } from './fresh-generation-output.js';
import { validateFreshProvenance } from '../../src/fresh-generation-contract.js';
import { canonicalSubjectNames, validateGlobalCurriculumCandidate, validateChapterCurriculumCandidate } from '../../src/fresh-generation.js';
import { parseDeck } from '../../src/parser.js';
import { annotateCardIds } from '../../src/card-id-annotator.js';
import { cardMarkupErrors } from '../../src/card-markup-policy.js';
import { appendGenerationProvenance } from './generation-provenance.js';
import { createDeck } from './scaffold.js';
import { beginDeckDraft, publishDeckDraft, abandonDeckDraft } from './deck-github-publisher.js';
import { beginRegistryDraft, publishRegistryDraft, abandonRegistryDraft, assertRepositoryCommit, registryCatalogHash } from './github-publisher.js';
import { resolveRegistry } from './registry.js';

function command(command, args, cwd) {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || '').slice(0, 500)}`);
    return result.stdout.trim();
}

export function renderFreshChapter(candidate, chapter, deck, generation) {
    if (candidate.chapterId !== chapter.id || !candidate.markdown?.trim()) throw new Error('Invalid chapter candidate.');
    if (candidate.scopeIssues?.length) throw new Error(`Unresolved scope: ${candidate.scopeIssues.join('; ')}`);
    if (!candidate.coldStartAudit?.trim() || !candidate.figurePlan?.trim()) throw new Error('Missing chapter audit.');
    // Model output cannot choose old identities or inject frontmatter. Figures
    // needing files must be authored/reviewed separately, never broken links.
    if (/<!--\s*card-(?:id|alias)|^\+\+\+\s*$|!\[|<\/?(?:img|svg|script|iframe)\b/im.test(candidate.markdown)) throw new Error('Candidate needs an identity or asset review.');
    const file = `${chapter.id}.md`;
    const source = annotateCardIds(candidate.markdown, file, () => randomUUID()).markdown
        .replace(/^<!-- card-alias: [^\n]+ -->\n/gm, '');
    const fields = { order: Number.parseInt(chapter.id), subject: deck.subject, tags: [], prerequisites: chapter.prerequisites,
        provides: chapter.outcomes.map(outcome => outcome.id), authoring_provider: generation.provider_id,
        authoring_model: generation.model_id, authoring_reasoning_effort: generation.reasoning_effort, authoring_run_id: generation.run_id };
    const markdown = `+++\n${Object.entries(fields).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n')}\n+++\n\n# ${chapter.title}\n\n${source}`;
    const cards = parseDeck(markdown, file).cards;
    if (!cards.length || cards.some(card => !card.stableId)) throw new Error('No valid identified cards were generated.');
    const failures = cards.flatMap(card => cardMarkupErrors(card, { generated: true }));
    if (failures.length) throw new Error(`Invalid generated markup: ${failures.map(item => item.msg).join('; ')}`);
    return { markdown, cardCount: cards.length };
}

export async function runFreshGenerationJob(queued, { registryRoot, credential, beforePublish = async () => {},
    draftsRoot = path.join(os.homedir(), '.flashcards', 'generation-drafts') }) {
    const payload = validateFreshProvenance(queued.payload);
    assertRepositoryCommit(FLASHCARDS_ROOT, payload.workflowCommit);
    let draft = beginRegistryDraft(registryRoot, queued.id, { baseCommit: payload.registryBaseCommit, baseRef: payload.registryRef });
    const root = draft.worktreeRoot;
    let deckDraft = null, deckPath = null;
    try {
        const registry = resolveRegistry(root);
        if (registry.errors.length) throw new Error(registry.errors.join('\n'));
        if (registry.id !== queued.registry_id || registry.repository !== queued.target_repository || registry.output !== payload.catalogPath) throw new Error('Registry does not match the queued request.');
        if (registryCatalogHash(root, payload.catalogPath) !== payload.catalogHash) throw new Error('Pinned catalog hash mismatch.');
        const before = JSON.parse(readFileSync(registry.outputPath, 'utf8'));
        const jobType = queued.job_type;
        if (jobType === 'curriculum-design') {
            const current = canonicalSubjectNames(before.subjects);
            const target = globalCurriculumTarget(payload);
            if (target.newSubjects?.some(subject => current.includes(subject))) throw new Error('Subject already exists.');
            const expected = canonicalSubjectNames([...current, ...(target.newSubjects || [])]);
            if (JSON.stringify(expected) !== JSON.stringify(target.subjects)) throw new Error('Subject list changed. Refresh and try again.');
        }
        const instructions = freshGenerationInstructions(jobType);
        const requestOptions = { jobType, subjects: payload.subjects, mandatoryDecks: payload.mandatoryDecks,
            ...(jobType === 'curriculum-design' ? {} : { catalog: before, deckId: payload.deckId, chapterId: payload.chapterId }),
            instructions, schema: freshGenerationSchema(jobType), modelId: queued.model_id, reasoningEffort: payload.reasoningEffort,
            providerId: queued.provider_id, apiKey: credential?.apiKey };
        const generated = jobType === 'curriculum-design'
            ? await generateRecoverableCurriculum(requestOptions, {
                draftsRoot, requestId: queued.id, beforeAttempt: beforePublish
            }) : await requestFreshGeneration(requestOptions);
        const generation = { ...generated.provenance, run_id: `request-${queued.id}`, request_id: queued.id,
            operation: jobType === 'deck-plan' ? 'chapter-curriculum' : jobType === 'chapter-expand' ? 'chapter-content' : 'global-curriculum',
            artifacts: [jobType === 'chapter-expand' ? `flashcards/${payload.chapterId}.md` : 'curriculum'],
            provider_id: queued.provider_id, model_id: queued.model_id, reasoning_effort: payload.reasoningEffort,
            registry_base_commit: payload.registryBaseCommit, workflow_commit: payload.workflowCommit, generated_at: new Date().toISOString() };
        let after;
        const proposals = [];
        if (jobType === 'curriculum-design') {
            const candidate = validateGlobalCurriculumCandidate(generated.candidate, payload.subjects, { requireCoverage: true, mandatoryDecks: payload.mandatoryDecks });
            if (candidate.scopeIssues.length) throw new Error(`Unresolved curriculum scope: ${candidate.scopeIssues.join('; ')}`);
            after = freshCandidateCatalog(before, candidate, jobType, { generation });
        } else if (jobType === 'deck-plan') {
            if (!Array.isArray(generated.candidate.scopeIssues)) throw new Error('Missing chapter scope report.');
            if (generated.candidate.scopeIssues.length) throw new Error(`Unresolved chapter scope: ${generated.candidate.scopeIssues.join('; ')}`);
            const candidate = validateChapterCurriculumCandidate(generated.candidate, payload.deckId);
            after = freshCandidateCatalog(before, candidate, jobType, { deckId: payload.deckId, generation });
        } else {
            const deck = before.decks.find(deck => deck.id === payload.deckId);
            const chapter = deck.chapters.find(chapter => chapter.id === payload.chapterId);
            const rendered = renderFreshChapter(generated.candidate, chapter, deck, generation);
            const temp = mkdtempSync(path.join(os.tmpdir(), 'flashcards-fresh-content-'));
            const repositoryUrl = deck.repository?.url || `https://github.com/${registry.deckOwner}/${deck.subject}-${deck.deck}`;
            if (deck.repository?.configured) {
                deckPath = path.join(temp, 'deck');
                command('gh', ['repo', 'clone', repositoryUrl, deckPath], temp);
            } else {
                deckPath = (await createDeck({ subject: deck.subject, deck: deck.deck, notesRoot: temp, description: deck.description, prerequisiteDecks: deck.prerequisites })).deckPath;
            }
            deckDraft = beginDeckDraft(deckPath, repositoryUrl, queued.id, { visibility: registry.deckVisibility });
            const target = path.join(deckPath, 'flashcards', `${chapter.id}.md`);
            mkdirSync(path.dirname(target), { recursive: true });
            writeFileSync(target, rendered.markdown);
            appendGenerationProvenance(deckPath, { runId: generation.run_id, requestId: queued.id,
                operation: 'chapter-content', providerId: generation.provider_id, modelId: generation.model_id,
                reasoningEffort: generation.reasoning_effort, workflowVersion: payload.workflowVersion,
                workflowCommit: payload.workflowCommit, registryBaseCommit: payload.registryBaseCommit,
                catalogHash: payload.catalogHash, chapterId: chapter.id, artifacts: [`flashcards/${chapter.id}.md`] });
            const auditPath = path.join(deckPath, '.flashcards', 'audits', `fresh-${queued.id}.json`);
            mkdirSync(path.dirname(auditPath), { recursive: true });
            writeFileSync(auditPath, JSON.stringify({ generation, coldStartAudit: generated.candidate.coldStartAudit, figurePlan: generated.candidate.figurePlan, verification: 'Requires human review; no external verification performed.' }, null, 2));
            await beforePublish();
            const proposal = publishDeckDraft(deckPath, deckDraft, { title: `Generate ${payload.deckId} ${chapter.id}`, body: `Fresh request ${queued.id}. No old cards were supplied. Review content and identity changes before accepting.`, returnProposal: true });
            deckDraft = null;
            proposals.push(proposal);
            after = { ...before, decks: before.decks.map(item => item.id !== deck.id ? item : {
                ...item, status: 'pilot-approved', materialized: true, repository: { url: repositoryUrl, configured: true },
                chapters: item.chapters.map(item => item.id !== chapter.id ? item : { ...item, card_count: rendered.cardCount }),
                chapter_content_generation: generation, generation_runs: [...(item.generation_runs || []), generation]
            }) };
        }
        writeFreshCatalog(root, after, before, queued.id, registry.outputPath);
        if (generated.draftDirectory) cpSync(generated.draftDirectory,
            path.join(root, 'generation-archive', `request-${queued.id}`, 'attempts'), { recursive: true, errorOnExist: true, force: false });
        await beforePublish();
        const registryProposal = publishRegistryDraft(root, draft, { title: `Review ${jobType} request ${queued.id}`, body: `Fresh generation: ${queued.model_id} ${payload.reasoningEffort}.\n\nBase: ${payload.registryBaseCommit}\n\nPrevious curriculum metadata is archived. Existing card repositories are untouched by curriculum acceptance. Changed plans require new generation; no automatic identity mappings.`, returnProposal: true });
        draft = null;
        proposals.push(registryProposal);
        return { status: 'needs-review', resultUrl: proposals[0].url, result: { proposals,
            ...(proposals.length > 1 ? { registryResultUrl: registryProposal.url } : {}), provenance: generation } };
    } catch (error) {
        if (deckDraft) abandonDeckDraft(deckPath, deckDraft);
        if (draft) abandonRegistryDraft(root, draft);
        throw error;
    }
}
