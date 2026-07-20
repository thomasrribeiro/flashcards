const CURRICULUM_PATH = 'data/curriculum.json';
let curriculumPromise = null;

export async function loadCurriculumIndex(baseUrl = import.meta.env.BASE_URL) {
    if (!curriculumPromise) {
        curriculumPromise = fetch(`${baseUrl}${CURRICULUM_PATH}`)
            .then(response => {
                if (!response.ok) throw new Error(`Curriculum index unavailable (${response.status})`);
                return response.json();
            })
            .then(index => {
                if (Number(index?.schema_version) < 2 || !Array.isArray(index?.decks)) {
                    throw new Error('Curriculum index uses an unsupported schema');
                }
                return index;
            });
    }
    return curriculumPromise;
}

export function curriculumMaps(index) {
    const decks = new Map((index?.decks || []).map(deck => [deck.id, deck]));
    const chapters = new Map();
    for (const deck of decks.values()) {
        for (const chapter of deck.chapters || []) {
            chapters.set(`${deck.id}#${chapter.id}`, { ...chapter, deckId: deck.id });
        }
    }
    return { decks, chapters };
}

export function deckPrerequisiteClosure(index, targetId) {
    const { decks } = curriculumMaps(index);
    const visited = new Set();
    const ordered = [];
    const visit = id => {
        const deck = decks.get(id);
        if (!deck) return;
        for (const prerequisite of deck.prerequisites || []) {
            if (visited.has(prerequisite)) continue;
            visit(prerequisite);
            visited.add(prerequisite);
            if (decks.has(prerequisite)) ordered.push(prerequisite);
        }
    };
    visit(targetId);
    return ordered;
}

function localChapterDependencies(chapter, deckId) {
    return (chapter?.resolved_dependencies || [])
        .filter(detail => detail.kind === 'chapter' || detail.kind === 'concept')
        .map(detail => detail.resolved)
        .filter(Boolean)
        .map(chapterId => `${deckId}#${chapterId}`);
}

export function chapterPrerequisiteClosure(index, targetDeckId, targetChapterId) {
    const { chapters } = curriculumMaps(index);
    const target = chapters.get(`${targetDeckId}#${targetChapterId}`);
    if (!target) return [];

    const requested = (target.resolved_dependencies || [])
        .filter(detail => detail.kind === 'external-concept')
        .map(detail => detail.resolved)
        .filter(Boolean);
    const visited = new Set();
    const ordered = [];
    const visit = key => {
        const chapter = chapters.get(key);
        if (!chapter || visited.has(key)) return;
        visited.add(key);
        for (const dependency of localChapterDependencies(chapter, chapter.deckId)) visit(dependency);
        ordered.push(key);
    };
    requested.forEach(visit);
    return ordered;
}

export function dependencyPlan(index, targetDeckId, targetChapterId = null) {
    const { decks, chapters } = curriculumMaps(index);
    const requiredDeckIds = deckPrerequisiteClosure(index, targetDeckId);
    const exactChapterIds = targetChapterId
        ? chapterPrerequisiteClosure(index, targetDeckId, targetChapterId)
        : [];
    const exactDecks = new Set(exactChapterIds.map(key => key.slice(0, key.indexOf('#'))));
    const wholeDeckIds = requiredDeckIds.filter(id => !exactDecks.has(id));
    return {
        target: decks.get(targetDeckId) || null,
        requiredDecks: requiredDeckIds.map(id => decks.get(id)).filter(Boolean),
        wholeDecks: wholeDeckIds.map(id => decks.get(id)).filter(Boolean),
        exactChapters: exactChapterIds.map(key => chapters.get(key)).filter(Boolean),
        missingDecks: requiredDeckIds
            .map(id => decks.get(id))
            .filter(deck => deck && !deck.repository?.configured),
        recommendedDecks: (decks.get(targetDeckId)?.recommended_after || [])
            .map(id => decks.get(id))
            .filter(Boolean)
    };
}

export function chapterForFile(index, deckId, file) {
    const deck = curriculumMaps(index).decks.get(deckId);
    return (deck?.chapters || []).find(chapter => chapter.file === file) || null;
}

export function curriculumDeckRows(index, { subject = null, query = '' } = {}) {
    const term = query.trim().toLowerCase();
    return (index?.decks || [])
        .filter(deck => !subject || deck.subject === subject)
        .filter(deck => !term
            || deck.id.toLowerCase().includes(term)
            || String(deck.description || '').toLowerCase().includes(term))
        .sort((a, b) =>
            a.subject.localeCompare(b.subject)
            || Number(a.order || 0) - Number(b.order || 0)
            || a.deck.localeCompare(b.deck));
}
