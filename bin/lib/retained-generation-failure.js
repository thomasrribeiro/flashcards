// Only completed model JSON and its recorded provenance belong here, never
// request objects, credentials or provider error bodies. Keep full local files.
export function retainedGenerationFailure(generated, issues) {
    const bytes = new TextEncoder().encode(JSON.stringify(generated.candidate, null, 2));
    const result = {
        provenance: generated.provenance,
        preview: {
            available: true, readOnly: true, kind: 'invalid-output',
            issues: issues.slice(0, 50).map(issue => String(issue).slice(0, 500)),
            output: new TextDecoder().decode(bytes.slice(0, 700_000)),
            outputTruncated: bytes.length > 700_000
        }
    };
    // JSON escaping can expand even a byte-bounded string substantially.
    while (result.preview.output.length && new TextEncoder().encode(JSON.stringify(result)).length > 950_000) {
        result.preview.output = result.preview.output.slice(0, Math.floor(result.preview.output.length / 2));
        result.preview.outputTruncated = true;
    }
    return result;
}
