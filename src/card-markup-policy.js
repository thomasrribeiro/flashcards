const IPEE_HEADING_RE =
    /^(?:\*\*(?:IDENTIFY|PLAN|EXECUTE|EVALUATE)(?::\*\*|\*\*:)|(?:IDENTIFY|PLAN|EXECUTE|EVALUATE):)[ \t]*/im;

function cardBack(card) {
    if (card.type === 'basic') return card.content.answer;
    if (card.type === 'problem') return card.content.solution;
    return '';
}

/**
 * Return deterministic authoring-policy failures for a parsed card.
 *
 * Existing collections use the universal checks. Fresh AI-generated chapters
 * additionally require structured IPEE solutions to begin at their first
 * retained heading, which keeps a direct result out of the pre-reveal stages.
 */
export function cardMarkupErrors(card, { generated = false } = {}) {
    const content = cardBack(card);
    if (!content) return [];

    const errors = [];
    const numericPrefix = content.match(/^\s*(\d+)\.[ \t]+\S/);
    if (numericPrefix) {
        errors.push({
            rule: 'U10',
            msg: `answer starts with bare "${numericPrefix[1]}."; Markdown renders this as an ordered-list marker—use prose, **${numericPrefix[1]}**., or ${numericPrefix[1]}\\.`,
            excerpt: content.replace(/\s+/g, ' ').slice(0, 80)
        });
    }

    if (generated && card.type === 'problem') {
        const firstHeading = IPEE_HEADING_RE.exec(content);
        const prelude = firstHeading ? content.slice(0, firstHeading.index).trim() : '';
        if (prelude) {
            errors.push({
                rule: 'P1',
                msg: 'structured solution has unlabeled content before its first IPEE heading; begin at the first retained heading and put the direct result inside EXECUTE',
                excerpt: prelude.replace(/\s+/g, ' ').slice(0, 80)
            });
        }
    }

    return errors;
}
