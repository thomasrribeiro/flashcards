import { createHash } from 'node:crypto';
import { buildFreshGenerationContext, FRESH_GENERATION_VERSION } from '../../src/fresh-generation.js';

const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

/**
 * Tool-free generation boundary. This process, not the model, owns credentials
 * and publication. Do not add shell, browsing, file, MCP or conversation tools
 * here: that would invalidate the guarantee that old content is inaccessible.
 */
export async function requestFreshGeneration({
    jobType, subjects, catalog, deckId, chapterId,
    instructions, schema, modelId, reasoningEffort, providerId = 'openai',
    apiKey, signal, fetchImpl = fetch
}) {
    if (providerId !== 'openai') throw new Error('This provider does not yet support restricted generation.');
    if (!apiKey) throw new Error('A connected provider credential is required.');
    if (!modelId || !reasoningEffort) throw new Error('Pin a model and reasoning level before generation.');
    if (typeof instructions !== 'string' || !instructions.trim()) throw new Error('Versioned generation instructions are required.');
    if (!schema || schema.type !== 'object' || schema.additionalProperties !== false) {
        throw new Error('A strict output schema is required.');
    }
    const context = buildFreshGenerationContext({ jobType, subjects, catalog, deckId, chapterId });
    const input = JSON.stringify(context);
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: signal || AbortSignal.timeout(20 * 60 * 1000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modelId,
            reasoning: { effort: reasoningEffort },
            instructions,
            input,
            tools: [],
            tool_choice: 'none',
            store: false,
            truncation: 'disabled',
            text: { format: { type: 'json_schema', name: 'generation_candidate', strict: true, schema } }
        })
    });
    // Do not echo provider error bodies: they can contain request data or
    // credentials. Never silently retry a paid or uncertain generation.
    if (!response.ok) throw new Error(`Generation provider returned HTTP ${response.status}.`);
    const result = await response.json();
    if (result.status !== 'completed') throw new Error('Generation did not complete. No candidate was accepted.');
    if ((result.output || []).some(item => !['message', 'reasoning'].includes(item.type))) {
        throw new Error('Unexpected tool output from restricted generation.');
    }
    const content = (result.output || []).flatMap(item => item.type === 'message' ? item.content || [] : []);
    if (content.some(item => item.type === 'refusal')) throw new Error('The provider declined this generation request.');
    const output = content.filter(item => item.type === 'output_text').map(item => item.text).join('');
    let candidate;
    try { candidate = JSON.parse(output); }
    catch { throw new Error('The provider returned an invalid candidate.'); }
    return {
        candidate,
        provenance: {
            workflowVersion: FRESH_GENERATION_VERSION,
            providerId, modelId, reasoningEffort,
            resolvedModelId: result.model || modelId,
            inputHash: hash(input), instructionsHash: hash(instructions), schemaHash: hash(JSON.stringify(schema)),
            responseId: result.id || null
        }
    };
}
