# {SUBJECT_NAME} - Flashcard Writing Guide

> **Purpose**: This guide covers {SUBJECT_NAME}-specific strategies for creating effective spaced repetition flashcards, building on universal SRS principles.

---

## Core Principles (Research-Based)

### 1. Atomicity
**One concept per card**. Break complex ideas into the smallest testable units.

❌ **Bad**:
```markdown
C: Newton's laws state that [objects at rest stay at rest], [F=ma], and [every action has an equal and opposite reaction].
```

✅ **Good**:
```markdown
C: Newton's first law: An object at rest [stays at rest] unless acted upon by a [net external force].

C: Newton's second law states that $\vec{F} = $ [$m\vec{a}$].

C: Newton's third law: For every action there is an [equal and opposite] reaction.
```

### 2. Two-Way Testing
Create inverse cards for relationships to test understanding from multiple directions.

✅ **Example**:
```markdown
Q: What causes acceleration according to Newton's second law?
A: Net force. ($\vec{F} = m\vec{a}$)

Q: What is the effect of applying a net force to an object?
A: The object accelerates in the direction of the force. ($\vec{F} = m\vec{a}$)
```

### 3. Multiple Perspectives
Test the same concept from different angles: conceptual → computational → application.

✅ **Progression**:
```markdown
# Level 1: Definition
Q: What is Newton's second law?
A: The net force on an object equals its mass times its acceleration: $\vec{F} = m\vec{a}$

# Level 2: Conceptual
Q: If you double the force on an object while keeping mass constant, what happens to acceleration?
A: Acceleration doubles (linear relationship from F = ma)

# Level 3: Application
P: A 2.0 kg object experiences a net force of 10 N. What is its acceleration?
S: $a = F/m = 10/2.0 = 5.0$ m/s²
```

### 4. Context-Rich Questions
Cards should be self-contained and unambiguous.

❌ **Bad**: `Q: What is it? A: Force`

✅ **Good**: `Q: What is the SI unit of force? A: Newton (N)`

### 5. Understand Before Memorizing
Never create flashcards for material you don't understand. If you can't explain **why**, you don't truly understand it.

**Create "why" cards before "what" cards:**
```markdown
Q: Why do we use free-body diagrams?
A: To isolate a single object and visualize all forces acting on it, making it easier to correctly apply Newton's laws.

C: A free-body diagram shows all [forces] acting on a [single isolated object].
```

---

## Card Format Types

### C: Cloze Deletion

**Use for**: Definitions, formulas, fill-in-the-blank facts

**Syntax**: `C: The [answer] is hidden in brackets.`

**Best practices**:
- Maximum 1-2 deletions per card (prefer 1)
- Ensure remaining context is sufficient to answer
- Each `[deletion]` creates a separate flashcard

**Examples**:
```markdown
C: The SI unit of force is the [Newton (N)].

C: Newton's second law: $\vec{F} = $ [$m\vec{a}$]

C: A vector has both [magnitude] and [direction].
```

**Multiple deletions** (creates 2 cards):
```markdown
C: The [dot product] $\vec{A} \cdot \vec{B}$ yields a [scalar], while the [cross product] $\vec{A} \times \vec{B}$ yields a [vector].
```
This creates:
- Card 1: "The **[?]** $\vec{A} \cdot \vec{B}$ yields a scalar..."
- Card 2: "The dot product $\vec{A} \cdot \vec{B}$ yields a **[?]**..."
- Card 3: "...while the **[?]** $\vec{A} \times \vec{B}$ yields a vector."
- Card 4: "...cross product $\vec{A} \times \vec{B}$ yields a **[?]**."

---

### Q:/A: Question and Answer

**Use for**: Explanations, procedures, "why" questions, comparisons

**Syntax**:
```markdown
Q: Question text here?
A: Answer text here.
```

**Best practices**:
- Make questions specific and unambiguous
- Keep answers concise (2-4 sentences maximum)
- Use for conceptual understanding, not rote memorization

**Examples**:
```markdown
Q: Why do we use significant figures in physics?
A: To communicate the precision of a measurement. The number of significant figures indicates the uncertainty in the last digit.

Q: When do you use $v^2 = v_0^2 + 2a\Delta x$ instead of $v = v_0 + at$?
A: When you know/need displacement but don't have/need time information.

Q: What's the difference between speed and velocity?
A: Speed is a scalar (magnitude only), while velocity is a vector (magnitude and direction). An object can have constant speed but changing velocity if its direction changes.
```

---

### P:/S: Problem and Solution Roadmap

**Use for**: Teaching problem-solving **methodology** and **approach**, not numerical computation

**IMPORTANT**: P:/S: cards should use **variables only**, no specific numerical values. The goal is to learn the approach and reasoning steps, not to practice arithmetic.

**Framework**: **ISAE** (Identify, Set Up, Approach, Evaluate)

**Syntax**:
```markdown
P: [Problem statement using variables, not numbers]

S:
**IDENTIFY**: [Problem type and key concepts that apply]

**SET UP**:
- Known: [List given quantities as variables]
- Unknown: [What you're solving for]

**APPROACH**:
- [Step-by-step reasoning and strategy]
- [Which formulas to use and WHY]
- [Order of operations]

**EVALUATE**:
- Units: [Dimensional analysis]
- Sign/direction: [Physical interpretation]
- Limiting cases: [What happens in special cases?]
```

**Examples**:

**Methodology-focused problem**:
```markdown
P: A car accelerates uniformly from rest to final velocity $v$ in time $t$. How do you find the distance traveled?

S:
**IDENTIFY**: Constant acceleration kinematics problem

**SET UP**:
- Known: $v_0$, $v$, $t$
- Unknown: $\Delta x$

**APPROACH**:
1. Need acceleration first: $a = \frac{v - v_0}{t}$
2. Apply displacement equation: $\Delta x = v_0 t + \frac{1}{2}at^2$
3. Substitute acceleration: $\Delta x = v_0 t + \frac{1}{2}\left(\frac{v - v_0}{t}\right)t^2$
4. Simplify: $\Delta x = v_0 t + \frac{1}{2}(v - v_0)t = \frac{1}{2}(v_0 + v)t$

**EVALUATE**:
- Units: $[v][t] = \text{distance}$ ✓
- Limiting case: If $v_0 = 0$, reduces to $\Delta x = \frac{1}{2}vt$ (average velocity × time) ✓
- Sign: Positive if $v > v_0$ (forward motion) ✓
```

**Equation selection**:
```markdown
P: You know initial velocity, final velocity, and displacement, but not time. Which kinematic equation should you use and why?

S:
**IDENTIFY**: Kinematics equation selection problem

**SET UP**:
- Known: $v_0$, $v$, $\Delta x$
- Unknown: Could be $a$ or other quantities
- Missing: $t$ (time)

**APPROACH**:
Use $v^2 = v_0^2 + 2a\Delta x$ because:
- It relates all four quantities we care about: $v$, $v_0$, $a$, $\Delta x$
- It does NOT involve $t$, which we don't know
- Other equations like $v = v_0 + at$ require knowing $t$

**EVALUATE**:
- Check: All known variables appear, unknown doesn't require $t$ ✓
- Alternative: Could find $t$ first using other equations, but this is more direct
```

**Conceptual approach**:
```markdown
P: How do you determine the net force on an object when multiple forces act at different angles?

S:
**IDENTIFY**: Vector addition problem using Newton's second law

**SET UP**:
- Known: Multiple force vectors $\vec{F}_1, \vec{F}_2, ...$
- Unknown: Net force $\vec{F}_{\text{net}}$

**APPROACH**:
1. Resolve each force into components: $F_{ix}$, $F_{iy}$
2. Sum components separately: $F_{\text{net},x} = \sum F_{ix}$, $F_{\text{net},y} = \sum F_{iy}$
3. Find magnitude: $|\vec{F}_{\text{net}}| = \sqrt{F_{\text{net},x}^2 + F_{\text{net},y}^2}$
4. Find direction: $\theta = \arctan\left(\frac{F_{\text{net},y}}{F_{\text{net},x}}\right)$

**EVALUATE**:
- Units: All forces have same units ✓
- Limiting case: If all forces along same axis, reduces to simple addition ✓
- Sign: Direction matters (positive/negative indicates orientation)
```

---

## Subject-Specific Guidance

### Subject Overview

[Brief description of the subject scope and learning objectives]

### Key Topics

#### Topic 1: [Topic Name]

**Core concepts**:
- [Concept 1]
- [Concept 2]
- [Concept 3]

**Common terminology**:
- [Term]: [Definition]
- [Term]: [Definition]

**Key relationships**:
- [How concepts relate to each other]

#### Topic 2: [Topic Name]

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

**Automated extraction** (recommended for large projects):

```bash
# Install dependencies (one-time setup)
pip install pdf2image pillow
brew install poppler  # macOS only

# Extract figures from a PDF
cd /path/to/your/subject-repo
python3 scripts/extract_figures_from_pdf.py \
  --pdf references/chapter_1.pdf \
  --output figures/chapter_1/

# Higher resolution (600 DPI)
python3 scripts/extract_figures_from_pdf.py \
  --pdf references/chapter_2.pdf \
  --output figures/chapter_2/ \
  --dpi 600
```

The script extracts all pages as images. You'll then need to:
1. Review extracted pages
2. Crop specific figures you need (using Preview, GIMP, or ImageMagick)
3. Rename to descriptive names (e.g., `fig_1_5.png`, `vector_addition.png`)
4. Delete unused full-page extractions

**Manual screenshots**:
- Use system screenshot tool (⇧⌘4 on macOS, Snipping Tool on Windows)
- Save directly to `figures/[chapter-or-topic-name]/`
- Follow naming convention below

### Naming Convention

```
fig_[chapter]_[figure-number].png
```

**Examples**:
- `fig_1_5.png` → Chapter 1, Figure 1.5
- `fig_3_12.png` → Chapter 3, Figure 3.12
- `vector_addition.png` → Descriptive name for custom diagram

### Folder Structure

```
├── references/           # Source PDFs
│   ├── chapter_1.pdf
│   └── chapter_2.pdf
└── figures/              # Extracted images
    ├── chapter_1/
    │   ├── fig_1_5.png
    │   ├── fig_1_7.png
    │   └── fig_1_19.png
    ├── chapter_2/
    │   ├── fig_2_1.png
    │   └── fig_2_15.png
    └── custom_diagrams/
        └── free_body_example.png
```

### Using Figures in Flashcards

Reference figures using relative paths:

```markdown
Q: What does this diagram illustrate?

![Description](../figures/topic_name/diagram_1.png)

A: [Answer explaining the diagram]
```

**Path breakdown**:
- Flashcard location: `flashcards/kinematics.md`
- Figure location: `figures/chapter_2/fig_2_3.png`
- Relative path: `../figures/chapter_2/fig_2_3.png` (up one level from flashcards/, then into figures/)

---

## Anti-Patterns (What NOT to Do)

### ❌ Don't Create Mega-Cards
```markdown
# BAD: Too many concepts in one card
C: Kinematic equations for constant acceleration are [$v = v_0 + at$], [$x = x_0 + v_0t + \frac{1}{2}at^2$], [$v^2 = v_0^2 + 2a(x-x_0)$], and [$x = x_0 + \frac{1}{2}(v_0 + v)t$].
```

**Fix**: Create 4 separate cards, one for each equation, plus "when to use" cards for each.

### ❌ Don't Memorize Without Understanding
```markdown
# BAD: Rote memorization without context
C: The formula for centripetal acceleration is [$a_c = v^2/r$].
```

**Fix**: Add understanding first:
```markdown
# GOOD: Understanding before formula
Q: Why does circular motion require acceleration even at constant speed?
A: Because velocity is a vector (includes direction), changing direction means velocity is changing, which requires acceleration.

C: Centripetal acceleration points [toward the center] of the circular path.

C: The magnitude of centripetal acceleration is $a_c = $ [$v^2/r$].

Q: Why does centripetal acceleration increase with speed squared?
A: Higher speed means greater change in velocity direction per unit time, requiring larger inward force/acceleration. The squared relationship comes from the geometry of circular motion.
```

### ❌ Don't Use Ambiguous Context
```markdown
# BAD: No context
Q: What is the value?
A: 9.8 m/s²
```

```markdown
# GOOD: Clear and specific
Q: What is the magnitude of gravitational acceleration near Earth's surface?
A: Approximately 9.8 m/s² (or 10 m/s² for rough estimates)
```

### ❌ Don't Use Numbers in P:/S: Cards
```markdown
# BAD: Uses specific numbers (this is just arithmetic practice)
P: A 5 kg object accelerates at 3 m/s². What is the net force?
S: $F = ma = 5 \times 3 = 15$ N
```

```markdown
# GOOD: Uses variables (teaches the approach)
P: How do you find the net force on an object given its mass and acceleration?
S:
**IDENTIFY**: Newton's second law application
**SET UP**: Known: mass $m$, acceleration $a$. Unknown: force $F$
**APPROACH**: Apply $F = ma$ directly
**EVALUATE**:
- Units: $[\text{kg}][\text{m/s}^2] = \text{N}$ ✓
- Sign: Force direction matches acceleration direction
- Limiting case: If $a = 0$, then $F = 0$ (no net force) ✓
```

---

## Cross-Topic Integration

{SUBJECT_NAME} topics are interconnected. Create cards that bridge concepts:

```markdown
Q: How does [Topic A] relate to [Topic B]?
A: [Explanation of connection]
```

---

## Implementation Checklist

When creating flashcards for a new topic:

- [ ] **Understand first**: Read and comprehend the material
- [ ] **Identify key concepts**: What are the essential ideas?
- [ ] **Break into atoms**: One concept per card
- [ ] **Create conceptual cards first**: Understanding before formulas
- [ ] **Add two-way cards**: Test relationships bidirectionally
- [ ] **Add application cards**: "When do you use this?"
- [ ] **Add problem cards**: Use P:/S: with ISAE framework (methodology, not numbers)
- [ ] **Include figures**: Extract and embed relevant diagrams
- [ ] **Order by difficulty**: Simple → complex
- [ ] **Review for clarity**: Are cards self-contained?
- [ ] **Test yourself**: Do cards actually work?

---

## Resources

- **Textbook**: [Primary textbook reference]
- **Additional materials**: [Other resources]
- **Effective Spaced Repetition**: https://borretti.me/article/effective-spaced-repetition
- **FSRS Algorithm**: The scheduling algorithm used by this flashcard system
- **Cognitive Science**: *Make It Stick: The Science of Successful Learning* (Brown, Roediger, McDaniel)

---

## Quick Reference Card Format Syntax

```markdown
# Cloze Deletion
C: Text with [hidden answer] in brackets.

# Question/Answer
Q: Question?
A: Answer.

# Problem/Solution (methodology-focused, use variables not numbers)
P: Problem statement with variables?

S:
**IDENTIFY**: Type and concepts
**SET UP**: Known variables, unknown variable
**APPROACH**: Step-by-step reasoning and formulas
**EVALUATE**: Units, sign, limiting cases
```

---

**Last updated**: {DATE}
**Scope**: {SUBJECT_NAME}
**Format**: Designed for spaced repetition flashcard systems
