const IPEE_HEADING_RE =
    /^(?:\*\*((IDENTIFY|PLAN|EXECUTE|EVALUATE))(?::\*\*|\*\*:|\*\*(?=[ \t]*\r?$))[ \t]*|((IDENTIFY|PLAN|EXECUTE|EVALUATE))(?::[ \t]*|[ \t]*(?=\r?$)))/gim;
const COMPLETE_IPEE = ['IDENTIFY', 'PLAN', 'EXECUTE', 'EVALUATE'];

function cardBack(card) {
    if (card.type === 'basic') return card.content.answer;
    if (card.type === 'problem') return card.content.solution;
    return '';
}

function cardSource(card) {
    if (card.type === 'basic') return `${card.content.question}\n${card.content.answer}`;
    if (card.type === 'problem') return `${card.content.problem}\n${card.content.solution}`;
    if (card.type === 'cloze') return card.content.text;
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
    const source = cardSource(card);
    if (!source) return [];

    const errors = [];
    const controlCharacter = source.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/);
    if (controlCharacter) {
        errors.push({
            rule: 'U10',
            msg: `card contains an invalid control character (U+${controlCharacter[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`,
            excerpt: source.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').slice(0, 80)
        });
    }
    const strippedMath = source.match(
        /\((?:overline|overrightarrow|overleftrightarrow|angle|mangle)\b[^)]*\)|\([^\n)]*\^circ\)/i
    );
    if (strippedMath) {
        errors.push({
            rule: 'U10',
            msg: 'card contains stripped TeX-like notation; use valid \\(…\\) delimiters and backslash commands',
            excerpt: strippedMath[0].replace(/\s+/g, ' ').slice(0, 80)
        });
    }
    const numericPrefix = content.match(/^\s*(\d+)\.[ \t]+\S/);
    if (numericPrefix) {
        errors.push({
            rule: 'U10',
            msg: `answer starts with bare "${numericPrefix[1]}."; Markdown renders this as an ordered-list marker—use prose, **${numericPrefix[1]}**., or ${numericPrefix[1]}\\.`,
            excerpt: content.replace(/\s+/g, ' ').slice(0, 80)
        });
    }

    if (generated && card.type === 'problem') {
        const headings = [...content.matchAll(IPEE_HEADING_RE)];
        const firstHeading = headings[0];
        const prelude = firstHeading ? content.slice(0, firstHeading.index).trim() : '';
        if (prelude) {
            errors.push({
                rule: 'P1',
                msg: 'structured solution has unlabeled content before its first IPEE heading; begin at the first retained heading and put the direct result inside EXECUTE',
                excerpt: prelude.replace(/\s+/g, ' ').slice(0, 80)
            });
        }
        const labels = headings.map(match => (match[1] || match[3]).toUpperCase());
        if (
            labels.length !== COMPLETE_IPEE.length ||
            labels.some((label, index) => label !== COMPLETE_IPEE[index])
        ) {
            errors.push({
                rule: 'P1',
                msg: `problem solution must use the complete ordered IPEE sequence (${COMPLETE_IPEE.join(' → ')}); found ${labels.join(' → ') || 'no recognized IPEE headings'}`,
                excerpt: content.replace(/\s+/g, ' ').slice(0, 80)
            });
        }
    }

    return errors;
}
