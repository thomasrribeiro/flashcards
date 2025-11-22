# {SUBJECT_NAME} - Flashcard Writing Guide

> **Universal Principles**: See [general.md](https://github.com/thomasrribeiro/flashcards/blob/main/guides/general.md) for core SRS principles and card formats.

> **Purpose**: This guide covers {SUBJECT_NAME}-specific strategies for creating effective spaced repetition flashcards.

---

## Subject Overview

[Brief description of the subject scope and learning objectives]

---

## Key Topics

### Topic 1: [Topic Name]

**Core concepts**:
- [Concept 1]
- [Concept 2]
- [Concept 3]

**Common terminology**:
- [Term]: [Definition]
- [Term]: [Definition]

**Key relationships**:
- [How concepts relate to each other]

### Topic 2: [Topic Name]

**Core concepts**:
- [Concept 1]
- [Concept 2]

---

## Common Problem Types

### Type 1: [Problem Type Name]

**Identify signals**: [Keywords or phrases that indicate this problem type]

**Key approach**: [General strategy for solving]

**Common pitfalls**:
- [Pitfall 1]
- [Pitfall 2]

### Type 2: [Problem Type Name]

**Identify signals**: [Keywords]

**Key approach**: [Strategy]

---

## Flashcard Strategy for {SUBJECT_NAME}

### Conceptual Before Computational

Always create understanding cards before calculation/application cards.

**Recommended order**:
1. **Definition/concept** (C: or Q:/A:)
2. **"Why" or "when to use"** (Q:/A:)
3. **Formula/process** (C:)
4. **Simple application** (Q:/A: or P:/S: compact)
5. **Complex multi-step** (P:/S: full framework)

**Example progression**:
```markdown
# Step 1: Concept
Q: [Conceptual question about core idea]
A: [Clear, concise answer]

# Step 2: Application
Q: [When/why to use this concept]
A: [Context and reasoning]

# Step 3: Formula/Process
C: [Key formula or process with cloze deletion]

# Step 4: Simple problem
P: [Simple problem]
S: [Brief solution with key steps]

# Step 5: Complex problem
P: [Multi-step problem]
S: [Full solution with methodology]
```

---

## Common Pitfalls

### 1. [Pitfall Category]
- [Specific error 1]
- [Specific error 2]

### 2. [Pitfall Category]
- [Specific error 1]
- [Specific error 2]

---

## Example Flashcards

### Conceptual Understanding
```markdown
Q: [Example conceptual question]
A: [Clear answer with reasoning]
```

### Cloze Deletion
```markdown
C: [Example with [cloze deletion] showing key relationship]
```

### Problem-Solving
```markdown
P: [Example problem with realistic scenario]

S:
**IDENTIFY**: [What type of problem, key concepts]
**SET UP**: [Knowns, unknowns, approach]
**EXECUTE**: [Step-by-step solution]
**EVALUATE**: [Check reasonableness, units, etc.]
```

---

## Figure Integration

Figures are organized by flashcard filename in the `figures/` directory.

### Extracting Figures from PDFs

```bash
# From the flashcards repository, run:
python3 /path/to/flashcards/scripts/extract_figures_from_pdf.py \
  --pdf references/your_textbook.pdf \
  --output figures/topic_name/
```

### Using Figures in Flashcards

Reference figures using relative paths:
```markdown
Q: What does this diagram illustrate?

![Description](../figures/topic_name/diagram_1.png)

A: [Answer explaining the diagram]
```

---

## Cross-Topic Integration

[Subject] topics are interconnected. Create cards that bridge concepts:

```markdown
Q: How does [Topic A] relate to [Topic B]?
A: [Explanation of connection]
```

---

## Resources

- **Textbook**: [Primary textbook reference]
- **Additional materials**: [Other resources]
- **Universal SRS**: [general.md](https://github.com/thomasrribeiro/flashcards/blob/main/guides/general.md)

---

**Last updated**: {DATE}
**Scope**: {SUBJECT_NAME}
**Format**: Designed for spaced repetition flashcard systems
