# {DECK_NAME} - Flashcard Writing Guide

> **Purpose**: This guide provides strategies for creating effective spaced repetition flashcards for {DECK_NAME}.

> **Foundation**: Based on cognitive science research, SuperMemo's 20 Rules of Formulating Knowledge, and 2025 spaced repetition best practices.

> **IMPORTANT**: **Read ALL markdown files in the `guides/` directory** before creating flashcards. This directory often contains subject-specific guides (e.g., `physics.md`, `chemistry.md`, `history.md`) that are **complementary to this general.md file**. These subject-specific guides add crucial {DECK_NAME}-specific strategies, common patterns, and pitfalls to avoid that build upon the universal principles described here.


## Card Format Types

- **C: (Cloze)** - Fast for facts, but limited for understanding
- **Q:/A:** - Essential for conceptual depth and "why" questions
- **P:/S:** - Critical for methodology - don't skip procedures!

**Target distribution: Aim for an even distrivtion across all three types**.

### C: Cloze Deletion ⭐ FASTEST TO CREATE

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

**Use for**: Teaching problem-solving **methodology** and **systematic approach**, NOT numerical computation

**⚠️ CRITICAL**: P:/S: cards use **VARIABLES or general principles**, never specific numbers. The goal is to learn reasoning steps and methodology.

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

## ⚠️ CRITICAL: Complete Coverage Required

**DO NOT stop generating cards prematurely.** You must create a comprehensive deck that covers:

✅ **ALL worked examples** - Convert each one to a P:/S: card using the IPEE framework
✅ **ALL end-of-chapter problems** - These are CRITICAL! Scan the PDF for "Problems", "Exercises", or "Practice Questions" sections (usually at the end of chapters) and create P:/S: cards from each problem set
✅ **All key concepts** - Ensure C: and Q:/A: cards cover definitions, formulas, and conceptual understanding

## Technical File Format Requirements

**Formatting Rules**:
- ✅ **DO**: Use LaTeX for ALL math: `$x^2$` (inline), `$$E=mc^2$$` (display)
- ❌ **DON'T**: Add preambles or explanations outside cards
**Output**: Return ONLY the flashcards in valid markdown format - nothing else.

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

- [ ] **Check for subject-specific guide** - Read `[subject].md` if it exists in this directory
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