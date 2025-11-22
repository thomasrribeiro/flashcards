# Effective Flashcard Writing Guide for Spaced Repetition

> **Purpose**: This document provides research-based guidelines for creating effective flashcards across all subjects. Subject-specific repositories should reference this document and add domain-specific guidance.

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

### P:/S: Problem and Solution Roadmap (NEW)

**Use for**: Multi-step problem-solving, calculations, quantitative reasoning

**Framework**: **ISEE** (Identify, Set Up, Execute, Evaluate)

**Full syntax** (for complex problems):
```markdown
P: [Problem statement with specific values and clear question]

S:
**IDENTIFY**: [Problem type and key concepts that apply]

**SET UP**:
- Known: [List given quantities with symbols and values]
- Unknown: [What you're solving for]
- Equations: [Relevant formulas and WHY they apply to this problem]

**EXECUTE**:
- [Step-by-step algebraic solution]
- [Substitute numbers]
- [Final numerical answer with units]

**EVALUATE**:
- Units: [Dimensional analysis - do units work out?]
- Sign/direction: [Physical interpretation of sign]
- Reasonableness: [Does the magnitude make sense?]
```

**Compact syntax** (for simple problems):
```markdown
P: [Simple question]

S: [Direct answer with brief justification]
```

**Examples**:

**Complex problem**:
```markdown
P: A car accelerates uniformly from rest to 25 m/s in 5.0 seconds. How far does it travel during this time?

S:
**IDENTIFY**: Constant acceleration kinematics problem, need displacement

**SET UP**:
- Known: $v_0 = 0$ (from rest), $v = 25$ m/s, $t = 5.0$ s
- Unknown: $\Delta x$ (displacement)
- Equation: $\Delta x = v_0 t + \frac{1}{2}at^2$ (relates displacement, time, acceleration)
- Also need: $a = \frac{v - v_0}{t}$ to find acceleration first

**EXECUTE**:
$$a = \frac{25 - 0}{5.0} = 5.0 \text{ m/s}^2$$
$$\Delta x = 0 + \frac{1}{2}(5.0)(5.0)^2 = \frac{1}{2}(5.0)(25) = 62.5 \text{ m}$$

**EVALUATE**:
- Units: m ✓ (correct for displacement)
- Sign: Positive (forward motion) ✓
- Reasonableness: ~60m in 5s at increasing speed seems correct (average ~12 m/s over 5s ≈ 60m) ✓
```

**Simple problem**:
```markdown
P: What is the SI unit of energy?

S: Joule (J), defined as $1 \text{ J} = 1 \text{ kg⋅m}^2\text{/s}^2$
```

**Formula application**:
```markdown
P: You know initial and final velocities and displacement, but not time. Which kinematic equation should you use?

S: $v^2 = v_0^2 + 2a\Delta x$
**Why**: This equation relates $v$, $v_0$, $a$, and $\Delta x$ without involving time $t$.
```

---

## Subject-Specific Guidelines

Each subject repository should have its own `CLAUDE.md` that:
1. References this global guide
2. Provides subject-specific problem categorization
3. Documents domain-specific flashcard strategies
4. Lists common pitfalls for that subject
5. Provides exemplary flashcards

**Example structure** (see physics repos for implementation):
```markdown
# Flashcard Guide - [Subject Name]

> **Global Reference**: See [FLASHCARD_GUIDE.md](path/to/flashcards/FLASHCARD_GUIDE.md) for universal SRS principles.

## Subject-Specific Problem Types
[Categorize problems by type, with IDENTIFY signals]

## Key Concepts Hierarchy
[Order topics from foundational to advanced]

## Common Pitfalls
[Document frequent errors]

## Figure References
[List extracted figures and when to use them]

## Example Flashcards
[3-5 exemplary cards demonstrating best practices]
```

---

## PDF Figure Integration

### Extraction Methods

**Option A: Automated** (recommended for large projects)

Use the provided `extract_figures.py` script in the flashcards repository:

```bash
# Install dependencies (one-time setup)
pip install pdf2image pillow
brew install poppler  # macOS only

# Extract figures from a PDF
cd /path/to/your/subject-repo
python3 /Users/thomasribeiro/code/flashcards/extract_figures.py \
  --pdf public/sources/chapter_1.pdf \
  --output public/figures/chapter_1/

# Higher resolution (600 DPI)
python3 /Users/thomasribeiro/code/flashcards/extract_figures.py \
  --pdf public/sources/chapter_2.pdf \
  --output public/figures/chapter_2/ \
  --dpi 600
```

The script extracts all pages as images. You'll then need to:
1. Review extracted pages
2. Crop specific figures you need (using Preview, GIMP, or ImageMagick)
3. Rename to descriptive names (e.g., `fig_1_5.png`, `vector_addition.png`)
4. Delete unused full-page extractions

**Option B: Manual screenshots**
- Use system screenshot tool (⇧⌘4 on macOS, Snipping Tool on Windows)
- Save directly to `public/figures/[chapter-or-topic-name]/`
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
public/
├── sources/              # Source PDFs
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

### Embedding in Flashcards

**From `flashcards/*.md`**, use relative paths:

```markdown
Q: What does a position vs. time graph look like for constant velocity?

![Position vs time for constant velocity](../public/figures/chapter_2/fig_2_3.png)

A: Straight line with constant positive or negative slope.
```

**Path breakdown**:
- Flashcard location: `flashcards/kinematics.md`
- Figure location: `public/figures/chapter_2/fig_2_3.png`
- Relative path: `../public/figures/chapter_2/fig_2_3.png` (up one level from flashcards/, then into public/)

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

### ❌ Don't Skip the Evaluate Step
```markdown
# BAD: No verification
P: A 5 kg object accelerates at 3 m/s². What is the net force?
S: $F = ma = 5 \times 3 = 15$ N
```

```markdown
# GOOD: Always evaluate
P: A 5 kg object accelerates at 3 m/s². What is the net force?
S:
**IDENTIFY**: Newton's second law problem
**SET UP**: $m = 5$ kg, $a = 3$ m/s², find $F$ using $F = ma$
**EXECUTE**: $F = (5)(3) = 15$ N
**EVALUATE**:
- Units: N = kg⋅m/s² ✓
- Sign: Positive (force in direction of acceleration) ✓
- Magnitude: Reasonable (about the weight of 1.5 kg) ✓
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
- [ ] **Add problem cards**: Use P:/S: with ISEE framework
- [ ] **Include figures**: Extract and embed relevant diagrams
- [ ] **Order by difficulty**: Simple → complex
- [ ] **Review for clarity**: Are cards self-contained?
- [ ] **Test yourself**: Do cards actually work?

---

## References and Resources

- **Effective Spaced Repetition**: https://borretti.me/article/effective-spaced-repetition
- **FSRS Algorithm**: The scheduling algorithm used by this flashcard system
- **Physics Problem-Solving**: *University Physics* (Young & Freedman, 15th Ed.), "To the Student: How to Succeed in Physics by Really Trying"
- **Cognitive Science**: *Make It Stick: The Science of Successful Learning* (Brown, Roediger, McDaniel)

---

## Quick Reference Card Format Syntax

```markdown
# Cloze Deletion
C: Text with [hidden answer] in brackets.

# Question/Answer
Q: Question?
A: Answer.

# Problem/Solution (Full)
P: Problem statement?

S:
**IDENTIFY**: Type and concepts
**SET UP**: Knowns, unknowns, equations
**EXECUTE**: Solution steps
**EVALUATE**: Units, sign, reasonableness

# Problem/Solution (Compact)
P: Simple question?
S: Direct answer with justification
```

---

**Last updated**: 2025-11-22
**For**: Spaced repetition flashcard repositories
