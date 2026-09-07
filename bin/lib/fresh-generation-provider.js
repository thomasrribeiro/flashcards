import { createHash } from 'node:crypto';
import { Agent } from 'undici';
import { buildFreshGenerationContext, FRESH_GENERATION_VERSION } from '../../src/fresh-generation.js';

const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const GENERATION_TIMEOUT_MS = 20 * 60 * 1000;

function transportError(error) {
    // Never expose arbitrary provider messages, URLs, request bodies or keys.
    const code = error?.cause?.code || error?.code;
    const safeCodes = new Set(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
        'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'ECONNRESET', 'ENOTFOUND',
        'EAI_AGAIN', 'ETIMEDOUT', 'ENETUNREACH']);
    if (error?.name === 'TimeoutError') return new Error('Generation timed out after 20 minutes.');
    if (error?.name === 'AbortError') return new Error('Generation cancelled.');
    return new Error(`Generation connection failed${safeCodes.has(code) ? ` (${code})` : ''}. Not retried automatically.`);
}

async function readGenerationResponse(response) {
    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        return response.json();
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let completed;
    const consume = frame => {
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trimStart()).join('\n');
        if (!data || data === '[DONE]') return;
        const event = JSON.parse(data);
        if (event.type === 'response.completed') completed = event.response;
        if (['response.failed', 'response.incomplete', 'error'].includes(event.type)) {
            throw new Error('Generation did not complete. No candidate was accepted.');
        }
    };
    for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let boundary;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
            consume(buffer.slice(0, boundary.index));
            buffer = buffer.slice(boundary.index + boundary[0].length);
        }
        // Do not wait for a proxy to close a successfully completed stream.
        if (completed) return completed;
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    if (!completed) throw new Error('Generation stream ended before completion. Not retried automatically.');
    return completed;
}

/**
 * Tool-free generation boundary. This process, not the model, owns credentials
 * and publication. Do not add shell, browsing, file, MCP or conversation tools
 * here: that would invalidate the guarantee that old content is inaccessible.
 */
export async function requestFreshGeneration({
    jobType, subjects, mandatoryDecks, catalog, deckId, chapterId,
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
    const context = buildFreshGenerationContext({ jobType, subjects, mandatoryDecks, catalog, deckId, chapterId });
    const input = JSON.stringify(context);
    // AbortSignal alone does not override the HTTP client's shorter header /
    // body timeouts. Scope the transport to this job; never change global fetch.
    const dispatcher = new Agent({ headersTimeout: GENERATION_TIMEOUT_MS, bodyTimeout: GENERATION_TIMEOUT_MS });
    let result;
    try {
        const response = await fetchImpl('https://api.openai.com/v1/responses', {
            method: 'POST',
            dispatcher,
            signal: AbortSignal.any([AbortSignal.timeout(GENERATION_TIMEOUT_MS), ...(signal ? [signal] : [])]),
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelId,
                reasoning: { effort: reasoningEffort },
                instructions,
                input,
                tools: [],
                tool_choice: 'none',
                store: false,
                stream: true,
                truncation: 'disabled',
                text: { format: { type: 'json_schema', name: 'generation_candidate', strict: true, schema } }
            })
        });
        // Do not echo provider error bodies: they can contain request data or
        // credentials. Never silently retry a paid or uncertain generation.
        if (!response.ok) throw new Error(`Generation provider returned HTTP ${response.status}.`);
        result = await readGenerationResponse(response);
    } catch (error) {
        if (error instanceof TypeError || ['AbortError', 'TimeoutError'].includes(error?.name) || error?.cause?.code || error?.code) {
            throw transportError(error);
        }
        if (error instanceof SyntaxError) throw new Error('The provider returned an invalid response.');
        throw error;
    } finally {
        await dispatcher.destroy();
    }
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
