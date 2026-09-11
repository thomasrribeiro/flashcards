// Render model output as inert text, never HTML or a publishable graph.
export function renderGenerationFailureReview(document, preview) {
    const section = document.createElement('section');
    section.className = 'generation-failure-review';
    const heading = document.createElement('h4');
    heading.textContent = 'Validation errors';
    const errors = document.createElement('ul');
    for (const issue of preview.issues) {
        const item = document.createElement('li');
        item.textContent = issue;
        errors.append(item);
    }
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = preview.outputTruncated ? 'Returned JSON (truncated)' : 'Returned JSON';
    const output = document.createElement('pre');
    output.textContent = preview.output;
    output.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:50vh;overflow:auto;min-width:0;font-size:0.85em;';
    details.append(summary, output);
    section.append(heading, errors, details);
    section.style.cssText = 'min-width:0;max-width:100%;overflow-wrap:anywhere;';
    return section;
}
