/**
 * Hashcards-compatible markdown parser for Q:/A:/C: format
 * Based on hashcards/src/parser.rs
 */

const State = {
    INITIAL: 'initial',
    READING_QUESTION: 'reading_question',
    READING_ANSWER: 'reading_answer',
    READING_CLOZE: 'reading_cloze'
};

const LineType = {
    START_QUESTION: 'start_question',
    START_ANSWER: 'start_answer',
    START_CLOZE: 'start_cloze',
    SEPARATOR: 'separator',
    TEXT: 'text'
};

class ParserError extends Error {
    constructor(message, filePath, lineNum) {
        super(`${message} Location: ${filePath}:${lineNum + 1}`);
        this.filePath = filePath;
        this.lineNum = lineNum;
    }
}

/**
 * Extract TOML frontmatter from markdown text
 * Returns [metadata, contentWithoutFrontmatter]
 */
function extractFrontmatter(text) {
    const lines = text.split('\n');

    // Check if file starts with frontmatter delimiter
    if (lines.length === 0 || lines[0].trim() !== '---') {
        return [{ order: null, tags: [] }, text];
    }

    // Find closing delimiter
    let closingIdx = -1;
    const frontmatterLines = [];

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            closingIdx = i;
            break;
        }
        frontmatterLines.push(lines[i]);
    }

    if (closingIdx === -1) {
        throw new Error("Frontmatter opening '---' found but no closing '---'");
    }

    // Parse TOML (simple key=value format)
    const metadata = {
        order: null,
        tags: []
    };
    const frontmatterStr = frontmatterLines.join('\n');

    // Parse order (numeric)
    const orderMatch = frontmatterStr.match(/order\s*=\s*(\d+)/);
    if (orderMatch) {
        metadata.order = parseInt(orderMatch[1], 10);
    }

    // Parse tags (array)
    const tagsMatch = frontmatterStr.match(/tags\s*=\s*\[(.*?)\]/);
    if (tagsMatch) {
        metadata.tags = tagsMatch[1]
            .split(',')
            .map(t => t.trim().replace(/"/g, ''))
            .filter(t => t.length > 0);
    }

    // Return content after frontmatter
    const content = lines.slice(closingIdx + 1).join('\n');
    return [metadata, content];
}

/**
 * Classify a line into its type
 */
function readLine(line) {
    if (line.startsWith('Q:')) {
        return { type: LineType.START_QUESTION, text: line.slice(2).trim() };
    } else if (line.startsWith('A:')) {
        return { type: LineType.START_ANSWER, text: line.slice(2).trim() };
    } else if (line.startsWith('C:')) {
        return { type: LineType.START_CLOZE, text: line.slice(2).trim() };
    } else if (line.trim() === '---') {
        return { type: LineType.SEPARATOR, text: '' };
    } else {
        return { type: LineType.TEXT, text: line };
    }
}

/**
 * Parse cloze cards from text with cloze deletions
 * Returns array of cloze cards
 */
function parseClozeCards(text, deckName, filePath, startLine, endLine) {
    text = text.trim();

    // Build clean text without brackets (but keep image brackets)
    const cleanTextBytes = [];
    let imageMode = false;
    const textBytes = new TextEncoder().encode(text);

    for (let i = 0; i < textBytes.length; i++) {
        const byte = textBytes[i];

        if (byte === 91) { // '['
            if (imageMode) {
                cleanTextBytes.push(byte);
            }
        } else if (byte === 93) { // ']'
            if (imageMode) {
                imageMode = false;
                cleanTextBytes.push(byte);
            }
        } else if (byte === 33) { // '!'
            if (!imageMode) {
                // Check if next byte is '['
                if (i + 1 < textBytes.length && textBytes[i + 1] === 91) {
                    imageMode = true;
                }
            }
            cleanTextBytes.push(byte);
        } else {
            cleanTextBytes.push(byte);
        }
    }

    const cleanText = new TextDecoder().decode(new Uint8Array(cleanTextBytes));

    // Find all cloze deletions
    const deletions = [];
    let start = null;
    let index = 0;
    imageMode = false;

    for (let i = 0; i < textBytes.length; i++) {
        const byte = textBytes[i];

        if (byte === 91) { // '['
            if (imageMode) {
                index += 1;
            } else {
                start = index;
            }
        } else if (byte === 93) { // ']'
            if (imageMode) {
                imageMode = false;
                index += 1;
            } else if (start !== null) {
                const end = index;
                deletions.push({ start, end: end - 1 });
                start = null;
            }
        } else if (byte === 33) { // '!'
            if (!imageMode) {
                if (i + 1 < textBytes.length && textBytes[i + 1] === 91) {
                    imageMode = true;
                }
            }
            index += 1;
        } else {
            index += 1;
        }
    }

    if (deletions.length === 0) {
        throw new ParserError(
            'Cloze card must contain at least one cloze deletion.',
            filePath,
            startLine
        );
    }

    // Create one card per deletion
    return deletions.map(({ start, end }) => ({
        type: 'cloze',
        deckName,
        filePath,
        range: [startLine, endLine],
        content: {
            text: cleanText,
            start,
            end
        }
    }));
}

/**
 * Parser class matching hashcards parser.rs
 */
export class Parser {
    constructor(deckName, filePath) {
        this.deckName = deckName;
        this.filePath = filePath;
    }

    /**
     * Parse all cards in the given text
     */
    parse(text) {
        const cards = [];
        let state = { type: State.INITIAL };
        const lines = text.split('\n');
        const lastLine = lines.length === 0 ? 0 : lines.length - 1;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = readLine(lines[lineNum]);
            state = this.parseLine(state, line, lineNum, cards);
        }

        this.finalize(state, lastLine, cards);

        // Remove duplicates by hash
        const seen = new Set();
        return cards.filter(card => {
            const hash = this.hashCard(card);
            if (seen.has(hash)) {
                return false;
            }
            seen.add(hash);
            return true;
        });
    }

    parseLine(state, line, lineNum, cards) {
        switch (state.type) {
            case State.INITIAL:
                return this.parseInitial(line, lineNum);

            case State.READING_QUESTION:
                return this.parseReadingQuestion(state, line, lineNum, cards);

            case State.READING_ANSWER:
                return this.parseReadingAnswer(state, line, lineNum, cards);

            case State.READING_CLOZE:
                return this.parseReadingCloze(state, line, lineNum, cards);

            default:
                throw new Error(`Unknown state: ${state.type}`);
        }
    }

    parseInitial(line, lineNum) {
        switch (line.type) {
            case LineType.START_QUESTION:
                return {
                    type: State.READING_QUESTION,
                    question: line.text,
                    startLine: lineNum
                };

            case LineType.START_ANSWER:
                throw new ParserError(
                    'Found answer tag without a question.',
                    this.filePath,
                    lineNum
                );

            case LineType.START_CLOZE:
                return {
                    type: State.READING_CLOZE,
                    text: line.text,
                    startLine: lineNum
                };

            case LineType.SEPARATOR:
            case LineType.TEXT:
                return { type: State.INITIAL };
        }
    }

    parseReadingQuestion(state, line, lineNum, cards) {
        switch (line.type) {
            case LineType.START_QUESTION:
                throw new ParserError(
                    'New question without answer.',
                    this.filePath,
                    lineNum
                );

            case LineType.START_ANSWER:
                return {
                    type: State.READING_ANSWER,
                    question: state.question,
                    answer: line.text,
                    startLine: state.startLine
                };

            case LineType.START_CLOZE:
                throw new ParserError(
                    'Found cloze tag while reading a question.',
                    this.filePath,
                    lineNum
                );

            case LineType.SEPARATOR:
                throw new ParserError(
                    'Found flashcard separator while reading a question.',
                    this.filePath,
                    lineNum
                );

            case LineType.TEXT:
                return {
                    ...state,
                    question: state.question + '\n' + line.text
                };
        }
    }

    parseReadingAnswer(state, line, lineNum, cards) {
        switch (line.type) {
            case LineType.START_QUESTION:
                // Finalize previous card
                cards.push({
                    type: 'basic',
                    deckName: this.deckName,
                    filePath: this.filePath,
                    range: [state.startLine, lineNum],
                    content: {
                        question: state.question.trim(),
                        answer: state.answer.trim()
                    }
                });
                // Start new question
                return {
                    type: State.READING_QUESTION,
                    question: line.text,
                    startLine: lineNum
                };

            case LineType.START_ANSWER:
                throw new ParserError(
                    'Found answer tag while reading an answer.',
                    this.filePath,
                    lineNum
                );

            case LineType.START_CLOZE:
                // Finalize previous card
                cards.push({
                    type: 'basic',
                    deckName: this.deckName,
                    filePath: this.filePath,
                    range: [state.startLine, lineNum],
                    content: {
                        question: state.question.trim(),
                        answer: state.answer.trim()
                    }
                });
                // Start reading cloze card
                return {
                    type: State.READING_CLOZE,
                    text: line.text,
                    startLine: lineNum
                };

            case LineType.SEPARATOR:
                // Finalize current card
                cards.push({
                    type: 'basic',
                    deckName: this.deckName,
                    filePath: this.filePath,
                    range: [state.startLine, lineNum],
                    content: {
                        question: state.question.trim(),
                        answer: state.answer.trim()
                    }
                });
                return { type: State.INITIAL };

            case LineType.TEXT:
                return {
                    ...state,
                    answer: state.answer + '\n' + line.text
                };
        }
    }

    parseReadingCloze(state, line, lineNum, cards) {
        switch (line.type) {
            case LineType.START_QUESTION:
                // Finalize previous cloze card
                const clozeCards1 = parseClozeCards(
                    state.text,
                    this.deckName,
                    this.filePath,
                    state.startLine,
                    lineNum
                );
                cards.push(...clozeCards1);
                // Start new question
                return {
                    type: State.READING_QUESTION,
                    question: line.text,
                    startLine: lineNum
                };

            case LineType.START_ANSWER:
                throw new ParserError(
                    'Found answer tag while reading a cloze card.',
                    this.filePath,
                    lineNum
                );

            case LineType.START_CLOZE:
                // Finalize previous cloze card
                const clozeCards2 = parseClozeCards(
                    state.text,
                    this.deckName,
                    this.filePath,
                    state.startLine,
                    lineNum
                );
                cards.push(...clozeCards2);
                // Start new cloze card
                return {
                    type: State.READING_CLOZE,
                    text: line.text,
                    startLine: lineNum
                };

            case LineType.SEPARATOR:
                // Finalize current cloze card
                const clozeCards3 = parseClozeCards(
                    state.text,
                    this.deckName,
                    this.filePath,
                    state.startLine,
                    lineNum
                );
                cards.push(...clozeCards3);
                return { type: State.INITIAL };

            case LineType.TEXT:
                return {
                    ...state,
                    text: state.text + '\n' + line.text
                };
        }
    }

    finalize(state, lastLine, cards) {
        switch (state.type) {
            case State.INITIAL:
                return;

            case State.READING_QUESTION:
                throw new ParserError(
                    'File ended while reading a question without answer.',
                    this.filePath,
                    lastLine
                );

            case State.READING_ANSWER:
                cards.push({
                    type: 'basic',
                    deckName: this.deckName,
                    filePath: this.filePath,
                    range: [state.startLine, lastLine],
                    content: {
                        question: state.question.trim(),
                        answer: state.answer.trim()
                    }
                });
                return;

            case State.READING_CLOZE:
                const clozeCards = parseClozeCards(
                    state.text,
                    this.deckName,
                    this.filePath,
                    state.startLine,
                    lastLine
                );
                cards.push(...clozeCards);
                return;
        }
    }

    hashCard(card) {
        // Simple hash for deduplication (will use BLAKE3 in hasher.js)
        if (card.type === 'basic') {
            return `basic:${card.content.question}:${card.content.answer}`;
        } else {
            return `cloze:${card.content.text}:${card.content.start}:${card.content.end}`;
        }
    }
}

/**
 * Parse a deck from markdown file content
 * Returns { cards, metadata }
 */
export function parseDeck(content, fileName) {
    const [metadata, text] = extractFrontmatter(content);
    const deckName = metadata.name || fileName.replace(/\.md$/, '');
    const parser = new Parser(deckName, fileName);
    const cards = parser.parse(text);

    return {
        cards,
        metadata: {
            ...metadata,
            deckName,
            fileName
        }
    };
}
