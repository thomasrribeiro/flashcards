# {DECK_NAME} - Flashcard Writing Guide

> **Purpose**: This guide provides strategies for creating effective spaced repetition flashcards for {DECK_NAME}.

> **Foundation**: Based on cognitive science research, SuperMemo's 20 Rules of Formulating Knowledge, and 2025 spaced repetition best practices.


## Card Format Types

- **C: (Cloze)** - Fast for facts, but limited for understanding
- **Q:/A:** - Essential for conceptual depth and "why" questions
- **P:/S:** - Critical for methodology - don't skip procedures!

### C: Cloze Deletion

**Use for**: Definitions, formulas, relationships, fill-in-the-blank facts

**Why cloze is powerful**:
- Fastest card creation method
- Reduces cognitive load during review
- Forces precise recall
- One sentence can generate multiple cards

**Syntax**: `C: The [answer] is hidden in brackets.`

**Best practices**:
- **Maximum 1-2 deletions per card** (prefer 1)
- Ensure remaining context is sufficient to answer
- Each `[deletion]` creates a separate flashcard
- Don't delete so much that it becomes ambiguous
- ⚠️ **CRITICAL**: Every cloze card MUST contain at least one `[deletion]`. A line starting with `C:` without any brackets will cause a parser error.

**Examples across subjects**:
```markdown
# Literature:
C: Shakespeare's [Hamlet] features a prince seeking revenge for his father's murder.

C: The novel [1984] by George Orwell depicts a totalitarian surveillance state.

# Finance:
C: A [bull market] is characterized by rising prices and investor optimism.

C: The [P/E ratio] compares a company's stock price to its earnings per share.

# Computer Science:
C: A [stack] follows Last-In-First-Out (LIFO) order.

C: Time complexity of binary search is [O(log n)].

# Medicine (careful with similar terms):
C: [Hypertension] means abnormally high blood pressure.

C: [Hypotension] means abnormally low blood pressure.
```

**Multiple deletions** (creates multiple cards):
```markdown
# Linguistics:
C: [Phonemes] are the smallest units of [sound] that distinguish meaning in a language.

# This creates 2 cards testing each deletion separately
```

### Q:/A: Question and Answer

**Use for**: Explanations, "why" questions, procedures, comparisons, application contexts

**Syntax**:
```markdown
Q: Question text here?
A: Answer text here.
```

**Best practices**:
- Make questions **specific and unambiguous**
- Keep answers **concise** (1-4 sentences maximum)
- Use for **conceptual understanding**, not rote memorization
- Ask "why" and "when" to test deeper understanding

**Examples across subjects**:
```markdown
# Political Science:
Q: What is the main difference between a federal and unitary system?
A: Federal divides power between national and state governments (US, Germany). Unitary concentrates power in a central government (UK, France).

# Theatre:
Q: What is the purpose of a proscenium arch?
A: Frames the stage like a picture, separating audience from performers and defining the viewing area.

# Chemistry:
Q: Why does ice float on water?
A: Water expands when freezing - hydrogen bonds create an open hexagonal crystal structure less dense than liquid water.

# Mathematics:
Q: When do you use integration by parts?
A: When integrating a product of two functions, especially when one simplifies upon differentiation (like ln(x), x^n with trig/exp).

# Sociology:
Q: What's the difference between cultural assimilation and acculturation?
A: Assimilation: minority culture fully adopts dominant culture. Acculturation: borrowing elements while maintaining distinct identity.
```

### P:/S: Problem and Solution Roadmap

**Use for**: Teaching problem-solving **methodology** and **systematic approach** using the IPEE framework.

**When to use numerical values vs variables:**
- **Numerical values**: For drilling procedural fluency (arithmetic, computation practice)
- **Variables**: For teaching generalizable methodology and reasoning patterns

**Framework**: **IPEE (Identify, Plan, Execute, Evaluate)** - universal framework for ALL subjects

**IPEE applies to every subject** - only the content changes, not the structure:
- **IDENTIFY**: What type of problem/question is this?
- **PLAN**: What approach, method, or framework will you use?
- **EXECUTE**: Step-by-step solution/analysis
- **EVALUATE**: Check your answer/conclusion for reasonableness

**Examples across subjects**:

**Mathematics**:
```markdown
P: How do you determine if a function $f(x)$ is continuous at a point $x = a$?

S:
**IDENTIFY**: Continuity definition problem

**PLAN**:
- Need three conditions to be satisfied
- Function must be defined at $a$

**EXECUTE**:
1. Check $f(a)$ exists (function is defined at $a$)
2. Check $\lim_{x \to a} f(x)$ exists (limit exists)
3. Check $\lim_{x \to a} f(x) = f(a)$ (limit equals function value)

**EVALUATE**:
- All three conditions must hold simultaneously
- If any fails, function is discontinuous at $a$
- Common discontinuities: removable, jump, infinite
```

**History/Humanities**:
```markdown
P: How do you analyze the causes of a historical event like the French Revolution?

S:
**IDENTIFY**: Historical causation analysis - French Revolution (1789)

**PLAN**: Categorize causes by type (political, economic, social)
- Political: Absolute monarchy, weak king (Louis XVI), Enlightenment ideas
- Economic: National bankruptcy, unfair taxation, bread shortages
- Social: Estates system, rising bourgeoisie, peasant grievances

**EXECUTE**: Analyze how factors interrelated
1. Economic crisis → calling Estates-General → political crisis
2. Enlightenment ideas provided intellectual framework for change
3. Social tensions amplified by economic hardship

**EVALUATE**: Multiple interconnected causes, no single trigger
- Structural factors (Ancien Régime, inequality) created conditions
- Immediate triggers (fiscal crisis, harvest failures) sparked action
```

**Computer Science**:
```markdown
P: How do you choose between a hash table and a binary search tree for a data structure?

S:
**IDENTIFY**: Data structure selection problem

**PLAN**: Compare based on requirements
- Operations needed: search, insert, delete, range queries, ordering?
- Performance requirements and memory constraints

**EXECUTE**: Compare characteristics
1. Hash Table: O(1) average operations, no ordering, more memory
2. BST (balanced): O(log n) operations, maintains ordering, less memory
3. Decision: Hash table for fast lookups without ordering; BST for ordered data/range queries

**EVALUATE**: Consider worst-case scenarios
- Hash collisions can degrade hash table to O(n)
- Unbalanced BST can degrade to O(n)
- Balanced BST (AVL, Red-Black) guarantees O(log n)
```

**Law**:
```markdown
P: How do you analyze a contracts problem?

S:
**IDENTIFY**: Contract formation issue - is there a valid enforceable contract?

**PLAN**: Apply contract formation elements
- Offer (definite terms)
- Acceptance (mirror image or UCC 2-207)
- Consideration (bargained-for exchange)
- Capacity (legal ability to contract)
- Legality (lawful purpose)

**EXECUTE**: Test each element
1. Identify the offer: What were the specific terms?
2. Find acceptance: Did offeree agree to exact terms?
3. Find consideration: What did each party give/promise?
4. Check capacity: Were parties competent adults?
5. Verify legality: Was the purpose lawful?

**EVALUATE**: Determine validity
- If all elements present: Valid contract
- If any element missing: No contract (identify which failed)
- Consider defenses (fraud, duress, mistake) if applicable
```

**Economics**:
```markdown
P: How do you determine the effect of a price ceiling on market equilibrium?

S:
**IDENTIFY**: Price control analysis (ceiling = maximum legal price)

**PLAN**:
- Market equilibrium: $P_e$ (equilibrium price), $Q_e$ (equilibrium quantity)
- Price ceiling: $P_c < P_e$ (binding) or $P_c > P_e$ (non-binding)

**EXECUTE**:
If $P_c < P_e$ (binding):
1. At $P_c$: quantity demanded $Q_d > Q_e$
2. At $P_c$: quantity supplied $Q_s < Q_e$
3. Result: shortage = $Q_d - Q_s$
4. Actual quantity traded: $\min(Q_d, Q_s) = Q_s$ (limited by supply)

**EVALUATE**:
- Consumer surplus: some gain (lower price), some lose (can't buy)
- Producer surplus: decreases (lower price, lower quantity)
- Deadweight loss: $\frac{1}{2}(Q_e - Q_s)(P_d - P_s)$
- Non-price rationing emerges (queues, favoritism, black markets)
```

### Figure and Diagram Cards

**When source material contains figures, diagrams, or visual elements**, create cards that encode visual understanding. Research on dual-coding theory shows that combining verbal and visual information significantly improves retention.

**Types of figure-based cards:**

1. **Description cards** - Ask learner to describe key features of a referenced figure
2. **Interpretation cards** - Test understanding of what the visual represents
3. **Prediction cards** - Given partial visual information, what follows?

**How to include figures in cards:**

⚠️ **CRITICAL**: Images must be placed AFTER the Q: or P: line (not before) to display with the question. Use markdown image syntax.

```markdown
# Image displayed WITH the question (correct):
Q: What forces act on the block on this inclined plane?

![Free body diagram](../sources/chapter_2/figures/free-body-diagram.png)

A: Weight ($mg$) pointing straight down, normal force ($N$) perpendicular to surface, and friction ($f$) parallel to surface opposing motion.

Q: What does the slope of this position-time graph represent?

![Position-time graph](../sources/chapter_3/figures/position-time-graph.png)

A: Velocity. Steeper slope = faster motion; horizontal line = stationary; negative slope = moving backward.
```

❌ **DON'T** put images BEFORE the Q: line - they won't display with the card:
```markdown
# WRONG - image won't show with question:
![Diagram](../sources/example/figures/diagram.png)

Q: What does this diagram show?
A: ...
```

**Best practices for figure cards:**
- ✅ **DO**: Describe what to look for ("the slope", "the intersection point", "the shaded region")
- ✅ **DO**: Ask about relationships shown visually ("How does X change as Y increases?")
- ✅ **DO**: Test graph/diagram literacy ("What does this axis represent?")
- ✅ **DO**: Create "translate between representations" cards (graph ↔ equation ↔ words)
- ❌ **DON'T**: Ask questions answerable without looking at the figure
- ❌ **DON'T**: Reference figures that aren't essential to understanding

**Examples across subjects:**
```markdown
# Economics - supply/demand graph:
Q: In a supply-demand diagram, what happens to equilibrium when demand shifts right?
A: Price increases, quantity increases. The new intersection point is up and to the right.

# Biology - cell diagram:
Q: Looking at the cell membrane diagram, why is it called a "fluid mosaic"?
A: "Fluid" because phospholipids move laterally; "mosaic" because proteins are scattered throughout like tiles.

# Chemistry - orbital diagram:
Q: In the molecular orbital diagram for O₂, why is oxygen paramagnetic?
A: Two unpaired electrons in the π* antibonding orbitals (visible as single arrows in separate orbitals).

# History - map:
Q: Examining the map of trade routes, why did Constantinople's location make it wealthy?
A: Controlled the strait between Europe and Asia; all east-west trade by land or sea passed through.
```

**Representational translation cards** (especially valuable):
```markdown
# Physics - connect representations:
Q: If a velocity-time graph shows a horizontal line above the x-axis, what does the corresponding position-time graph look like?
A: A straight line with positive slope (constant positive velocity = position increasing linearly).

Q: The equation $x(t) = 5 + 3t - 2t^2$ describes motion. Sketch the shape of the position-time graph.
A: Downward-opening parabola (negative $t^2$ coefficient), starting at $x=5$, rising briefly then falling.
```

### Using Figures Effectively

**Aim to include a figure in most cards.** Visual aids dramatically improve retention - research shows images can increase recall by 65% compared to text alone.

#### Figure Naming

Figures use descriptive names:
- Single figures: `addition-example.png`, `number-line.png`, `force-diagram.png`
- Multi-part figures: common prefix + `-1`, `-2` suffix: `base-10-blocks-1.png`, `base-10-blocks-2.png`

**Multi-part figures:** When figures share a common prefix with `-1`, `-2` suffixes (e.g., `base-10-blocks-1.png` and `base-10-blocks-2.png`), these are parts of the same figure and should be included together on the same card.

#### Active Figure Selection

For each card you create:
1. **Scan the figure list** for relevant images
2. **Read figures** to verify they match your card's content
3. **Include liberally** - when in doubt, include the figure

#### Figure Placement

**Place figures BEFORE the answer/solution to provide visual context for thinking:**

- **Q/A cards**: Place figure RIGHT AFTER the question (before `A:`) so the learner sees it while thinking
- **Problem cards**: Place figure RIGHT AFTER `P:` (before `S:`) so it's part of the problem statement
- **Cloze cards**: Place figure after the cloze text (since there's no separate answer section)

**Examples:**
```markdown
# Q/A - figure appears BEFORE answer:
Q: What forces act on the block?

![Free body diagram](../sources/chapter_1/figures/free-body-diagram.png)

A: Weight pointing down, normal force perpendicular to surface...

# P/S - figure appears WITH problem:
P: Add: $43 + 26$

![Addition with regrouping](../sources/chapter_1/figures/addition-with-regrouping.png)

S:
**IDENTIFY**: Two-digit addition with carrying
...
```

**Why:** When reviewing, the figure should be visible WHILE thinking about the answer, not revealed afterward.

#### Reusing Figures

The same figure can appear in multiple related cards - this reinforces visual learning. Don't hesitate to reference a figure in several cards if it's relevant to each.

### Using the Figure Catalog

When a **Figure Catalog** is provided below the guides, it contains pre-analyzed metadata for each figure:

| Field | Description |
|-------|-------------|
| **Type** | `worked_example`, `diagram`, `table`, `concept_illustration`, or `decorative` |
| **Shows** | Comprehensive description including specific values/data |
| **Use as** | Suggested card type |

**Workflow for each figure type:**

1. **`worked_example`**: Create P:/S: card using the content from the description
   - The "Shows" field contains the specific problem/values to use
   - Your solution steps should match what the figure shows

2. **`diagram`/`concept_illustration`**: Create Q:/A: or C: card
   - Ask about what the visual represents
   - Test understanding of the concept shown

3. **`table`/`chart`**: Create Q:/A: card
   - Ask about interpreting or recalling the data

4. **`decorative`**: Skip entirely (chapter headers, stock photos)

**Example:**
If the catalog shows:
```
### addition-carrying.png
- Type: worked_example
- Shows: Step-by-step addition showing 1,683 + 479 = 2,162 with carrying
- Use as: P:/S: card for multi-digit addition
```

Create:
```markdown
P: Add: $1,683 + 479$

![Addition with carrying](../sources/<source_name>/figures/addition-carrying.png)

S:
**IDENTIFY**: Multi-digit addition with carrying
**EXECUTE**:
- Ones: 3 + 9 = 12, write 2 carry 1
- Tens: 8 + 7 + 1 = 16, write 6 carry 1
- Hundreds: 6 + 4 + 1 = 11, write 1 carry 1
- Thousands: 1 + 0 + 1 = 2
**EVALUATE**: $1,683 + 479 = 2,162$ ✓
```

**The catalog's Shows field is the source of truth for worked examples.**

## ⚠️ CRITICAL: Complete Coverage Required

**DO NOT stop generating cards prematurely.** You must create a comprehensive deck that covers:

✅ **ALL sections from source material** - Skipping sections creates knowledge gaps!
✅ **ALL worked examples** - Convert each one to a P:/S: card using the IPEE framework
✅ **ALL end-of-chapter problems** - These are CRITICAL! Scan the for "Problems", "Exercises", or "Practice Questions" sections (usually at the end of chapters) and create P:/S: cards from each problem set
✅ **All key concepts** - Ensure C: and Q:/A: cards cover definitions, formulas, and conceptual understanding

**⚠️ Section Coverage Check**: Before finishing, verify you've covered ALL sections in the source document. Missing sections = incomplete learning.

## Flashcard Continuity & Sequential Learning

**Within-file continuity**: Flashcards must build sequentially. **Define concepts before referencing them.**

❌ **Bad example** (assumes knowledge not yet introduced):
```markdown
Q: Why doesn't a feather and a cannonball falling at different rates in air disprove Galileo's theory?
A: Galileo's theory has a range of validity: it applies only when air resistance is negligible compared to weight. The feather is outside this range.
```
**Problem**: References "Galileo's theory" without ever explaining what it is!

✅ **Good example** (builds sequentially):
```markdown
# First, define the concept:
C: Galileo's theory of falling objects states that [all objects fall at the same rate] in the absence of air resistance.

Q: What is the range of validity for Galileo's falling object theory?
A: It applies only when air resistance and buoyancy are much smaller than the weight. Light objects with high air resistance (feathers, parachutes) are outside this range.

# THEN ask application questions:
Q: Why doesn't a feather and a cannonball falling at different rates in air disprove Galileo's theory?
A: Galileo's theory has a range of validity: it applies only when air resistance is negligible compared to weight. The feather is outside this range.
```

**Rule**: Before ANY flashcard references a concept, that concept must appear in an earlier flashcard in the same file.

### Cross-File Prerequisites

When prerequisite flashcards are provided (in the `<prerequisite_flashcards>` section), you may freely reference concepts covered in those files without re-explaining them.

**How prerequisites work:**
- Prerequisites are loaded automatically from local files or remote GitHub repositories
- They are **ordered by depth**: most foundational concepts appear first
- Chained dependencies are resolved recursively (if chapter_2.md depends on chapter_1.md, both are loaded)
- Each prerequisite file's content is included so you can see exactly what concepts are already covered

**Guidelines for using prerequisites:**
- ✅ Assume the reader has **mastered** all prerequisite content
- ✅ Reference prerequisite concepts naturally (e.g., "Using the definition of momentum...")
- ✅ Build on established foundations without repeating them
- ✅ Introduce **new connections** between prerequisite concepts and new material
- ✅ Use prerequisite terminology directly without re-defining it
- ❌ Do NOT repeat definitions already covered in prerequisites
- ❌ Do NOT re-explain foundational concepts (they're in the prerequisites)
- ❌ Do NOT create "review" cards for prerequisite material

**Example - WITHOUT prerequisites:**
```markdown
# Must define momentum first (no prerequisites available):
C: [Momentum] is defined as $\vec{p} = m\vec{v}$, where $m$ is mass and $\vec{v}$ is velocity.

Q: What is the SI unit of momentum?
A: kg·m/s (kilogram meters per second)

# THEN you can build on it:
Q: How does the impulse-momentum theorem relate force to momentum change?
A: The impulse (force × time) equals the change in momentum: $\vec{J} = \Delta\vec{p} = \vec{F}\Delta t$
```

**Example - WITH prerequisites (chapter_1.md already defines momentum):**
```markdown
# Skip the definition - go straight to new material:
Q: How does the impulse-momentum theorem relate force to momentum change?
A: The impulse (force × time) equals the change in momentum: $\vec{J} = \Delta\vec{p} = \vec{F}\Delta t$

Q: Why is impulse useful for analyzing collisions?
A: During collisions, force varies rapidly, but impulse ($\int \vec{F}\,dt$) equals the total momentum change regardless of the force profile.
```

**Scanning prerequisites for covered concepts:**
Before creating cards, scan the `<prerequisite_flashcards>` section to identify:
1. **Definitions** already established (don't repeat these)
2. **Formulas** already introduced (can reference without derivation)
3. **Concepts** you can build upon (create connections, not repetitions)
4. **Terminology** you can use directly (no need to define again)

## Technical File Format Requirements

**File Organization**:
- ✅ **DO**: Use markdown headers to organize sections
  - `# Chapter Title` or `# Topic Name` as the main header
  - `## Section Name` to group related flashcards
  - **NUMBER your subheaders** to match source material sections (e.g., `## 1.2 Place Value` not just `## Place Value`)
  - Headers provide visual structure WITHOUT interfering with flashcard parsing
- ✅ **DO**: Use LaTeX for ALL math: `$x^2$` (inline), `$$E=mc^2$$` (display)

**Example header structure:**
```markdown
# Chapter 3: Fractions

## 3.1 Introduction to Fractions

C: A [fraction] represents a part of a whole...

## 3.2 Equivalent Fractions

Q: When are two fractions equivalent?
A: When they represent the same value...
```

**Critical Output Rules**:
- ❌ **DON'T**: Add preambles, introductions, or explanations before flashcards
- ❌ **DON'T**: Write "Now I'll create...", "Here are...", "I've created...", etc.
- ❌ **DON'T**: Add summaries, statistics, or commentary at the end
- ❌ **DON'T**: Use `---` separators between cards. Just use blank lines.
- ✅ **DO**: Start IMMEDIATELY with the chapter/topic header followed by flashcards
- ✅ **DO**: End with the last flashcard - no trailing text
- ✅ **DO**: Use `## Section Name` headers to organize cards by topic

**Output**: Return ONLY the flashcards organized with markdown headers - nothing else.

## Core Principles (Research-Based)

### 1. **Understand Before You Memorize** ⚠️ CRITICAL
Material learned without understanding has near-zero practical value and wastes study time.

**Build the big picture first:**
- Read overview/introduction chapters before details
- Understand WHY concepts matter before WHAT they are
- If you can't explain it simply, you don't understand it yet

✅ **Create "why" cards before "what" cards:**
```markdown
# History example:
Q: Why did the Treaty of Versailles contribute to World War II?
A: Harsh reparations and territorial losses humiliated Germany, creating economic hardship and resentment that enabled Hitler's rise to power.

# THEN create the fact card:
C: The Treaty of Versailles was signed in [1919], ending World War I.

# Philosophy example:
Q: Why is Descartes' "I think, therefore I am" considered foundational?
A: It's the first principle that survives radical skepticism - even if everything else is doubted, the act of doubting proves the doubter exists.

# THEN:
C: Descartes' foundational principle is ["Cogito, ergo sum"] ("I think, therefore I am").
```

**Anticipation questions (pretesting):**
Research shows that attempting to answer a question *before* learning the material improves later retention—even when the initial answer is wrong. Before introducing a complex derivation, proof, or multi-step explanation, add a Q:/A: card that asks the learner to **predict** the approach or result.

```markdown
# Before a derivation - ask learner to anticipate:
Q: Before deriving kinetic energy, predict: if you double an object's speed, how should its kinetic energy change?
A: It should quadruple (energy goes as $v^2$, so $2^2 = 4$).

# Before a proof - prime the reasoning:
Q: To prove the Pythagorean theorem, what geometric insight might help?
A: Arrange four identical right triangles around a square; compare areas to show $a^2 + b^2 = c^2$.

# Before explaining a phenomenon:
Q: Why might hot air rise? Predict before reading the explanation.
A: Hot air is less dense than cold air, so buoyancy pushes it upward (like a bubble in water).
```

**When to use anticipation questions:**
- Before dense derivations or proofs
- Before explaining counterintuitive results
- Before multi-step problem-solving methods
- When the source material builds toward a "reveal"

**Why it works:** Generating a prediction—even an incorrect one—creates a "knowledge gap" that the brain actively tries to fill. The subsequent explanation sticks better because it resolves that gap.

### 2. **Minimum Information Principle** 🎯
**Keep cards EXTREMELY simple.** One card should test ONE atomic piece of knowledge.

**Rule**: If a card seems complex, split it into 5-10 simpler sub-cards.

❌ **Bad** (too much information):
```markdown
# Biology - too complex:
C: Mitochondria are [the powerhouse of the cell], have [their own DNA], contain [cristae for increased surface area], and produce [ATP through oxidative phosphorylation].
```

✅ **Good** (atomic cards):
```markdown
C: Mitochondria are called the [powerhouse of the cell] because they produce most cellular ATP.

C: Mitochondria contain their own [DNA], inherited maternally.

C: The inner mitochondrial membrane folds into structures called [cristae].

Q: Why do mitochondria have cristae?
A: To increase surface area for ATP production via electron transport chain.
```

**Why it works**: Simpler cards are easier to schedule, faster to review, and have lower failure rates.

### 3. **Build on the Basics**
**Master fundamentals first.** Don't skip "obvious" foundational concepts.

✅ **Examples across subjects**:
```markdown
# Economics - don't skip basics:
Q: What is the fundamental economic problem?
A: Scarcity - unlimited wants but limited resources.

Q: What is opportunity cost?
A: The value of the next-best alternative given up when making a choice.

# Computer Science:
Q: What is an algorithm?
A: A step-by-step procedure for solving a problem or performing a computation.

C: An algorithm has three requirements: [definiteness], [effectiveness], and [finiteness].

# Law:
Q: What is the burden of proof in criminal vs civil cases?
A: Criminal: "beyond reasonable doubt" (very high). Civil: "preponderance of evidence" (more likely than not).
```

### 4. **Atomicity: One Concept Per Card**
Break complex ideas into the smallest independently testable units.

**Test**: Can you answer this card without thinking "it depends" or "which part?" If yes, it's atomic enough.

### 5. **Combat Interference** 🧠
Similar cards cause confusion and high failure rates. When two cards interfere:

**Strategies**:
- Add vivid, contrasting examples
- Use emotional or personal connections
- Add context cues (prefixes, categories)
- Use mnemonic devices
- Consider deleting one card if interference persists

❌ **High interference**:
```markdown
# Psychology - confusing similar concepts:
Q: What is classical conditioning?
A: Learning through association.

Q: What is operant conditioning?
A: Learning through consequences.
```

✅ **Reduced interference** (add distinguishing context):
```markdown
Q: What is classical conditioning (Pavlov's dogs)?
A: Learning through ASSOCIATION - a neutral stimulus becomes associated with a natural response (bell → salivation).

Q: What is operant conditioning (Skinner's rats)?
A: Learning through CONSEQUENCES - behavior strengthened by rewards or weakened by punishments (lever press → food).

# Even better: Add vivid examples
Q: What's a classic example of classical conditioning?
A: Pavlov's dogs: bell (neutral) + food (natural stimulus) → bell alone causes salivation.

Q: What's a classic example of operant conditioning?
A: Skinner box: rat presses lever (behavior) → gets food (reward) → presses more often.
```

### 6. **Optimize Wording**
**Trim ruthlessly.** Remove every unnecessary word like reducing a mathematical equation.

❌ **Wordy**:
```markdown
Q: In the context of Renaissance art during the 14th-16th centuries in Europe, what technique did artists develop for creating the illusion of three-dimensional depth on two-dimensional surfaces?
A: Perspective
```

✅ **Optimized**:
```markdown
Q: What Renaissance technique creates the illusion of 3D depth on 2D surfaces?
A: Linear perspective (vanishing point)
```

### 7. **Use Context Cues to Simplify**
Add prefixes or categories to provide context without lengthy wording.

✅ **Examples**:
```markdown
# Instead of: "In organic chemistry, what functional group is -OH?"
ochem: Q: What functional group is -OH?
A: Hydroxyl group (alcohols)

# Instead of: "In contract law, what is consideration?"
contracts: Q: What is consideration?
A: Something of value exchanged by both parties (makes contract binding)

# Instead of: "In music theory, what is a dominant chord?"
theory: Q: What is the V chord called?
A: Dominant chord (creates tension, wants to resolve to I)
```

### 8. **Define All Variables in Mathematical Expressions** ⚠️ CRITICAL
**Every mathematical formula must explicitly define what each variable represents.** Never assume the student will infer variable meanings, even if they seem "obvious."

❌ **Bad** (undefined variables):
```markdown
# Physics - assumes x_1, x_2 are understood:
C: [Displacement] is the change in position of a particle, defined as $\Delta x = x_2 - x_1$.

# Economics - assumes P, Q are understood:
C: [Consumer surplus] is the area between demand curve and price: $\frac{1}{2}(P_{\text{max}} - P)(Q)$.

# Statistics - assumes μ, σ are understood:
C: The [z-score] formula is $z = \frac{x - \mu}{\sigma}$.
```

✅ **Good** (all variables defined):
```markdown
# Physics - explicitly defines each variable:
C: [Displacement] is the change in position of a particle, defined as $\Delta x = x_2 - x_1$, where $x_2$ is the final position and $x_1$ is the initial position.

# Economics - defines all terms:
C: [Consumer surplus] is the area between the demand curve and market price: $\frac{1}{2}(P_{\text{max}} - P)(Q)$, where $P_{\text{max}}$ is the maximum willingness to pay, $P$ is market price, and $Q$ is quantity purchased.

# Statistics - complete definition:
C: The [z-score] measures how many standard deviations a value is from the mean: $z = \frac{x - \mu}{\sigma}$, where $x$ is the data point, $\mu$ is the population mean, and $\sigma$ is the population standard deviation.
```

**Why this matters:**
- Mathematical notation varies across textbooks and disciplines
- Students often forget subscript meanings ($x_1$ vs $x_2$, $v_i$ vs $v_f$)
- Defining variables reinforces conceptual understanding, not just symbol manipulation
- Prevents card ambiguity that causes review frustration

**Rule**: If a formula contains ANY variables, symbols, or subscripts, the card must define what they represent.

---

## Advanced Principles from Research

### Two-Way Testing (Bidirectional Cards)
**Create inverse cards to test relationships from both directions.**

✅ **Examples**:
```markdown
# Biology - Forward and reverse:
Q: What molecule carries genetic information in cells?
A: DNA (deoxyribonucleic acid)

Q: What is the function of DNA?
A: Stores and transmits genetic information

# Art History:
Q: Who painted "Starry Night"?
A: Vincent van Gogh (1889)

Q: What is Vincent van Gogh's most famous painting?
A: Starry Night (1889, swirling night sky)

# Programming:
Q: What design pattern separates data from presentation?
A: Model-View-Controller (MVC)

Q: What are the three components of MVC?
A: Model (data), View (presentation), Controller (logic)
```

### Avoid Sets and Enumerations ⚠️
**Don't ask for unordered lists.**

❌ **Bad**:
```markdown
Q: List the seven continents.
A: Africa, Antarctica, Asia, Australia, Europe, North America, South America
```

✅ **Good** (individual cards with mnemonics or context):
```markdown
C: The seven continents are [Africa], [Antarctica], [Asia], [Australia], [Europe], [North America], and [South America].

# Or use mnemonic:
C: Mnemonic for continents: [A]unt [A]nnie [A]te [A]sparagus [E]very [N]oon [S]aturday

# Or create geographical cards:
Q: Which continent is entirely in the Southern Hemisphere and has no permanent population?
A: Antarctica

Q: Which continent contains the most countries?
A: Africa (54 countries)
```

**For sequences**, use overlapping cloze deletions:
```markdown
# Scientific method:
C: Scientific method: [Observe] → Hypothesize → Experiment → Analyze → Conclude

C: Scientific method: Observe → [Hypothesize] → Experiment → Analyze → Conclude

C: Scientific method: Observe → Hypothesize → [Experiment] → Analyze → Conclude
```

### Redundancy Does NOT Contradict Minimum Information
**Create multiple cards for the same concept from different angles.**

✅ **Examples**:
```markdown
# Philosophy - same concept, different angles:
C: [Utilitarianism] judges actions by their consequences (greatest good for greatest number).

Q: What ethical theory judges actions solely by outcomes?
A: Consequentialism (utilitarianism is the most common form)

Q: How does utilitarianism differ from deontology?
A: Utilitarianism focuses on outcomes/consequences. Deontology focuses on duties/rules regardless of outcomes.

Q: What's a criticism of pure utilitarianism?
A: Can justify harming individuals for collective benefit (tyranny of the majority)
```

## Implementation Checklist

When creating flashcards for a new topic:

- [ ] **Understand first** - Read, comprehend, explain to yourself
- [ ] **Build the basics** - Create foundational concept cards even if "obvious"
- [ ] **Identify key concepts** - What are the 3-5 core ideas?
- [ ] **Break into atoms** - One testable concept per card
- [ ] **Create "why" cards** - Understanding before facts
- [ ] **Add "when to use" cards** - Application context
- [ ] **Create formulas/definitions** - Use cloze deletion for speed
- [ ] **Add two-way cards** - Test relationships bidirectionally
- [ ] **Create methodology cards** - P:/S: for systematic problem-solving
- [ ] **Optimize wording** - Trim every unnecessary word
- [ ] **Check for interference** - Similar cards? Add distinguishing context

**Last updated**: {DATE}
**Scope**: {DECK_NAME}
**Format**: Optimized for FSRS spaced repetition algorithm