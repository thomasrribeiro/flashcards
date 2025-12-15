# Mathematics Flashcard Writing Guide

> **Purpose**: This guide provides mathematics-specific strategies for creating highly effective spaced repetition flashcards, covering all levels from prealgebra through advanced mathematics.

> **Foundation**: Based on cognitive science research, including Michael Nielsen's work on SRS for mathematics, Doug Rohrer's interleaved practice studies, and established principles of mathematical pedagogy.

---

## Why SRS Works for Mathematics

**Research findings**:
- **Active recall** is 3-4x more effective than re-reading for mathematical concepts
- **Interleaved practice** improves mathematics learning by ~30% over blocked practice (Rohrer et al., 2015, 2019)
- **Spaced repetition** of computation improves long-term retention (Rohrer & Taylor, 2006)
- **Procedural fluency** requires practice with actual numbers, not just abstract variables (Kilpatrick et al., 2001)

**The key insight**: SRS is a *complement* to mathematical problem-solving, not a replacement. Use flashcards to:
- Anchor definitions, theorems, and formulas
- Reinforce procedural steps
- Build intuition through varied examples
- Maintain fluency over time

You still need to sit down, struggle with problems, and work through concepts on paper. Flashcards help you remember what you've learned.

---

## Core Principles for Math Flashcards

### 1. The i+1 Principle

Each flashcard should add **only ONE new piece** of knowledge to what you already know. This mirrors Stephen Krashen's Input Hypothesis: `i` is your prior knowledge, `+1` is the new piece.

❌ **Bad** (too many new concepts):
```markdown
C: The [Fundamental Theorem of Calculus] states that if $F$ is an antiderivative of $f$ on $[a,b]$, then $\int_a^b f(x)\,dx = F(b) - F(a)$.
```
**Problem**: Assumes understanding of "antiderivative", "continuous", definite integral notation, and evaluation—all at once.

✅ **Good** (build up):
```markdown
# First establish prerequisites:
C: An [antiderivative] of $f(x)$ is a function $F(x)$ such that $F'(x) = f(x)$.

C: The definite integral $\int_a^b f(x)\,dx$ represents the [signed area] under $f(x)$ from $x=a$ to $x=b$.

# THEN introduce the theorem:
Q: What does the Fundamental Theorem of Calculus (Part 2) tell us?
A: If $F$ is any antiderivative of $f$, then $\int_a^b f(x)\,dx = F(b) - F(a)$. This connects differentiation and integration.
```

### 2. Atomicity: One Concept Per Card

Break complex ideas into the smallest independently testable units.

**Test**: Can you answer without thinking "it depends" or "which part?" If not, split it.

### 3. Definitions Before Applications

Always establish definitions before using them in proofs or applications. Within a flashcard file, concepts must appear in learning order.

### 4. Multiple Representations

Mathematical understanding deepens when you connect:
- **Numeric** (concrete examples with numbers)
- **Symbolic** (algebraic expressions)
- **Graphical** (visual representations)
- **Verbal** (plain language explanations)

Create cards that translate between representations:
```markdown
Q: If $f(x) = x^2$, what does the graph look like?
A: Upward-opening parabola with vertex at origin, symmetric about y-axis.

Q: A parabola opens downward with vertex at $(2, 5)$. What's a possible equation?
A: $f(x) = -(x-2)^2 + 5$ or any negative leading coefficient with vertex form.
```

---

## Numerical vs Variable Problems

Unlike physics (where methodology transfer is paramount), mathematics often requires **drilling with actual numbers** for procedural fluency.

### When to Use Numerical Values

✅ Use numbers for:
- **Arithmetic fluency**: multiplication tables, fraction operations, decimal conversions
- **Procedural practice**: long division, polynomial division, matrix operations
- **Pattern recognition**: seeing that $3^2 + 4^2 = 5^2$ before learning Pythagorean theorem
- **Building intuition**: "What's $\sin(30°)$?" builds faster recall than "What's $\sin(\theta)$ for small angles?"

**Example** (prealgebra drilling):
```markdown
P: Calculate: $\frac{3}{4} + \frac{2}{5}$

S:
**IDENTIFY**: Fraction addition with unlike denominators

**PLAN**: Find LCD, convert fractions, add numerators

**EXECUTE**:
1. LCD of 4 and 5 is 20
2. $\frac{3}{4} = \frac{15}{20}$ and $\frac{2}{5} = \frac{8}{20}$
3. $\frac{15}{20} + \frac{8}{20} = \frac{23}{20} = 1\frac{3}{20}$

**EVALUATE**: Check by converting to decimals: $0.75 + 0.4 = 1.15 = \frac{23}{20}$ ✓
```

### When to Use Variables

✅ Use variables for:
- **Generalizable methodology**: proof techniques, algorithm design
- **Algebraic manipulation**: factoring patterns, identity verification
- **Theorem statements**: definitions that apply universally
- **Advanced topics**: where specific numbers are rarely meaningful

**Example** (algebraic methodology):
```markdown
P: How do you factor a difference of squares $a^2 - b^2$?

S:
**IDENTIFY**: Difference of squares pattern

**PLAN**: Apply the factoring identity

**EXECUTE**: $a^2 - b^2 = (a+b)(a-b)$

**EVALUATE**:
- Expand to verify: $(a+b)(a-b) = a^2 - ab + ab - b^2 = a^2 - b^2$ ✓
- Example: $x^2 - 9 = (x+3)(x-3)$
```

### Mixed Approach (Often Best)

Show the general pattern, then reinforce with specific examples:
```markdown
C: The quadratic formula gives solutions to $ax^2 + bx + c = 0$ as $x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$.

P: Solve $2x^2 + 5x - 3 = 0$ using the quadratic formula.

S:
**IDENTIFY**: Quadratic equation, use quadratic formula

**PLAN**: $a=2$, $b=5$, $c=-3$, apply formula

**EXECUTE**:
$x = \frac{-5 \pm \sqrt{25 - 4(2)(-3)}}{4} = \frac{-5 \pm \sqrt{49}}{4} = \frac{-5 \pm 7}{4}$

So $x = \frac{2}{4} = \frac{1}{2}$ or $x = \frac{-12}{4} = -3$

**EVALUATE**: Check by substitution or factoring: $2x^2 + 5x - 3 = (2x-1)(x+3)$ ✓
```

---

## Interleaved Practice

Research by Doug Rohrer and colleagues shows that **interleaving** problem types improves learning by ~30% compared to blocked practice.

### What is Interleaving?

Instead of practicing 20 fraction problems, then 20 percent problems, then 20 decimal problems (blocked), you mix them within a session (interleaved).

### Why It Works

- Forces you to **identify** the problem type before solving
- Strengthens **discrimination** between similar-looking problems
- Better mimics real tests and applications
- Prevents false confidence from pattern-matching

### Implications for Flashcard Decks

When creating flashcard files, **don't group all similar problems together**. Instead:

```markdown
# GOOD - Interleaved within a section:

## Operations Practice

P: Simplify: $\frac{2}{3} \times \frac{5}{7}$
S: [multiplication solution]

Q: What is 15% of 80?
A: $0.15 \times 80 = 12$

P: Convert $0.375$ to a fraction.
S: [conversion solution]

P: Simplify: $\frac{3}{4} \div \frac{2}{5}$
S: [division solution]

Q: If a price increases from $40 to $52, what is the percent increase?
A: $\frac{52-40}{40} = \frac{12}{40} = 0.30 = 30\%$
```

---

## Creating Cards for Proofs & Theorems

Based on Michael Nielsen's essay "Using spaced repetition systems to see through a piece of mathematics":

### Don't Copy-Paste Proofs

❌ **Common mistake**: Copy a textbook proof verbatim and try to memorize it line by line.

**Problems**:
- Textbook proofs are often long and don't break into sub-theorems
- They assume specific background that may not match yours
- Memorizing prose ≠ understanding structure

### The Three-Phase Approach

**Phase 1: Iterative Grazing**
- Read the proof multiple times
- Create cards for individual observations and connections
- Make cards as atomic as possible
- Look for multiple ways to think about the same idea

**Phase 2: Forcing Questions**
- Distill the proof to its essence
- Create a card that "forces" you to reconstruct the key insight
- Ask: "What's the one thing that makes this proof work?"

**Phase 3: Pushing Boundaries**
- What happens if we change an assumption?
- Can we weaken the conditions?
- Are there alternative proofs?

### Example: Proving $\sqrt{2}$ is Irrational

**Phase 1 cards** (atomic observations):
```markdown
Q: What proof technique is used to show $\sqrt{2}$ is irrational?
A: Proof by contradiction. Assume $\sqrt{2} = \frac{p}{q}$ in lowest terms, derive contradiction.

Q: In the proof that $\sqrt{2}$ is irrational, after assuming $\sqrt{2} = \frac{p}{q}$, what do we derive first?
A: Squaring both sides: $2 = \frac{p^2}{q^2}$, so $p^2 = 2q^2$.

Q: If $p^2 = 2q^2$, what does this tell us about $p$?
A: $p^2$ is even, therefore $p$ is even (since odd² = odd).

Q: If $p$ is even, say $p = 2k$, what does $p^2 = 2q^2$ become?
A: $(2k)^2 = 2q^2$ → $4k^2 = 2q^2$ → $2k^2 = q^2$, so $q$ is also even.
```

**Phase 2 card** (forcing question):
```markdown
Q: What is the key contradiction in the proof that $\sqrt{2}$ is irrational?
A: Both $p$ and $q$ are even, contradicting the assumption that $\frac{p}{q}$ was in lowest terms.
```

**Phase 3 cards** (pushing boundaries):
```markdown
Q: Does the same proof technique work for $\sqrt{3}$?
A: Yes. If $p^2 = 3q^2$, then $3|p^2$ so $3|p$. Let $p=3k$, then $3k^2 = q^2$, so $3|q$. Contradiction.

Q: For which $n$ does the proof that $\sqrt{n}$ is irrational work directly?
A: For any prime $n$, and more generally for $n$ that is not a perfect square.
```

---

## Mathematical Domains with Examples

### Foundational Mathematics

#### Prealgebra

Focus on **numerical fluency**. Use actual numbers extensively.

```markdown
# Fractions
C: To add fractions with unlike denominators, first find the [LCD (least common denominator)], convert each fraction, then add numerators.

P: Calculate: $\frac{5}{6} - \frac{3}{8}$

S:
**IDENTIFY**: Fraction subtraction, unlike denominators

**EXECUTE**:
1. LCD of 6 and 8 is 24
2. $\frac{5}{6} = \frac{20}{24}$, $\frac{3}{8} = \frac{9}{24}$
3. $\frac{20}{24} - \frac{9}{24} = \frac{11}{24}$

**EVALUATE**: Cannot simplify (11 is prime) ✓

# Percents
Q: What is the relationship between $\frac{1}{4}$, 0.25, and 25%?
A: They are all equal. $\frac{1}{4} = 1 \div 4 = 0.25 = 25\%$

P: A shirt originally costs $45. It's on sale for 20% off. What's the sale price?

S:
**EXECUTE**:
- Discount: $45 \times 0.20 = $9
- Sale price: $45 - $9 = $36
- OR directly: $45 \times 0.80 = $36

# Integers
C: When multiplying integers: positive × positive = [positive], negative × negative = [positive], positive × negative = [negative].

P: Calculate: $(-3) \times (-7) \times 2$

S:
**EXECUTE**:
- $(-3) \times (-7) = 21$ (negative × negative = positive)
- $21 \times 2 = 42$
```

#### Elementary Algebra

Balance computation with symbolic manipulation:

```markdown
# Solving equations
P: Solve for $x$: $3(x - 4) = 2x + 5$

S:
**EXECUTE**:
1. Distribute: $3x - 12 = 2x + 5$
2. Subtract $2x$: $x - 12 = 5$
3. Add 12: $x = 17$

**EVALUATE**: Check: $3(17-4) = 3(13) = 39$ and $2(17)+5 = 39$ ✓

# Factoring patterns
C: A perfect square trinomial has the form $a^2 + 2ab + b^2 = [(a+b)^2]$ or $a^2 - 2ab + b^2 = [(a-b)^2]$.

Q: How do you recognize a perfect square trinomial?
A: First and last terms are perfect squares, middle term is twice the product of their square roots.

P: Factor: $x^2 - 10x + 25$

S:
**IDENTIFY**: Check for perfect square trinomial
- $x^2$ is $(x)^2$ ✓
- $25$ is $(5)^2$ ✓
- $-10x = -2(x)(5)$ ✓

**EXECUTE**: $x^2 - 10x + 25 = (x-5)^2$
```

#### Geometry

Combine definitions, visual intuition, and proofs:

```markdown
# Definitions
C: Two angles are [supplementary] if they sum to 180°.

C: Two angles are [complementary] if they sum to 90°.

# Theorem cards
Q: What is the Triangle Angle Sum Theorem?
A: The sum of interior angles in any triangle is 180°.

Q: Why does the Triangle Angle Sum Theorem hold? (Key insight)
A: Draw a line through one vertex parallel to the opposite side. Alternate interior angles show the three angles form a straight line (180°).

# Problem-solving
P: In triangle ABC, angle A = 50° and angle B = 65°. Find angle C.

S:
**IDENTIFY**: Triangle angle sum

**EXECUTE**: $C = 180° - 50° - 65° = 65°$

**EVALUATE**: $50° + 65° + 65° = 180°$ ✓ (Also note: isosceles triangle since B = C)
```

### Intermediate Mathematics

#### Trigonometry

```markdown
# Unit circle values
C: $\sin(30°) = \sin(\frac{\pi}{6}) = [\frac{1}{2}]$

C: $\cos(45°) = \cos(\frac{\pi}{4}) = [\frac{\sqrt{2}}{2}]$

# Identities
C: The Pythagorean identity: $\sin^2\theta + \cos^2\theta = [1]$

Q: Derive $\tan^2\theta + 1 = \sec^2\theta$ from the Pythagorean identity.
A: Divide $\sin^2\theta + \cos^2\theta = 1$ by $\cos^2\theta$: $\frac{\sin^2\theta}{\cos^2\theta} + 1 = \frac{1}{\cos^2\theta}$, giving $\tan^2\theta + 1 = \sec^2\theta$.

# Applications
P: A ladder 10 ft long leans against a wall at a 65° angle with the ground. How high up the wall does it reach?

S:
**IDENTIFY**: Right triangle, finding opposite side

**PLAN**: $\sin(65°) = \frac{\text{height}}{10}$

**EXECUTE**: height $= 10 \sin(65°) \approx 10(0.906) \approx 9.06$ ft

**EVALUATE**: Less than 10 ft (hypotenuse) ✓, reasonable for 65° angle ✓
```

#### Precalculus

```markdown
# Functions
C: A function $f$ is [one-to-one (injective)] if $f(a) = f(b)$ implies $a = b$.

Q: How do you test if a function is one-to-one graphically?
A: Horizontal line test: If every horizontal line intersects the graph at most once, the function is one-to-one.

# Limits intuition
Q: What does $\lim_{x \to a} f(x) = L$ mean intuitively?
A: As $x$ gets arbitrarily close to $a$ (but not equal to $a$), $f(x)$ gets arbitrarily close to $L$.

P: Evaluate: $\lim_{x \to 3} \frac{x^2 - 9}{x - 3}$

S:
**IDENTIFY**: Indeterminate form $\frac{0}{0}$, need to simplify

**EXECUTE**:
$\frac{x^2 - 9}{x - 3} = \frac{(x+3)(x-3)}{x-3} = x + 3$ (for $x \neq 3$)

So $\lim_{x \to 3} (x + 3) = 6$

**EVALUATE**: The original function has a hole at $x=3$, but the limit exists.
```

### Calculus Sequence

#### Differential Calculus

```markdown
# Definitions
C: The derivative of $f$ at $a$ is defined as $f'(a) = \lim_{h \to 0} [\frac{f(a+h) - f(a)}{h}]$, if this limit exists.

Q: What does the derivative $f'(a)$ represent geometrically?
A: The slope of the tangent line to the graph of $f$ at the point $(a, f(a))$.

# Derivative rules
C: Power rule: $\frac{d}{dx}[x^n] = [nx^{n-1}]$

C: Product rule: $\frac{d}{dx}[f \cdot g] = [f' \cdot g + f \cdot g']$

C: Chain rule: $\frac{d}{dx}[f(g(x))] = [f'(g(x)) \cdot g'(x)]$

# Computation
P: Find $\frac{d}{dx}[\sin(x^2)]$

S:
**IDENTIFY**: Chain rule needed (composition)

**EXECUTE**:
- Outer: $\sin(u)$, derivative: $\cos(u)$
- Inner: $u = x^2$, derivative: $2x$
- Result: $\cos(x^2) \cdot 2x = 2x\cos(x^2)$

# Applications
P: Find the equation of the tangent line to $f(x) = x^3$ at $x = 2$.

S:
**PLAN**: Need point $(2, f(2))$ and slope $f'(2)$

**EXECUTE**:
- $f(2) = 8$, so point is $(2, 8)$
- $f'(x) = 3x^2$, so $f'(2) = 12$
- Tangent line: $y - 8 = 12(x - 2)$ or $y = 12x - 16$
```

#### Integral Calculus

```markdown
# Fundamental Theorem
Q: State the Fundamental Theorem of Calculus (Part 1).
A: If $f$ is continuous on $[a,b]$ and $F(x) = \int_a^x f(t)\,dt$, then $F'(x) = f(x)$.

Q: State the Fundamental Theorem of Calculus (Part 2).
A: If $F$ is any antiderivative of $f$ on $[a,b]$, then $\int_a^b f(x)\,dx = F(b) - F(a)$.

# Integration techniques
P: Evaluate: $\int x \cos(x)\,dx$

S:
**IDENTIFY**: Integration by parts (product of $x$ and trig function)

**PLAN**: Let $u = x$, $dv = \cos(x)\,dx$

**EXECUTE**:
- $u = x$, $du = dx$
- $dv = \cos(x)\,dx$, $v = \sin(x)$
- $\int x\cos(x)\,dx = x\sin(x) - \int \sin(x)\,dx = x\sin(x) + \cos(x) + C$

**EVALUATE**: Differentiate to check: $\frac{d}{dx}[x\sin(x) + \cos(x)] = \sin(x) + x\cos(x) - \sin(x) = x\cos(x)$ ✓
```

### Linear Algebra

```markdown
# Definitions
C: A set of vectors $\{v_1, \ldots, v_n\}$ is [linearly independent] if $c_1v_1 + \cdots + c_nv_n = 0$ implies all $c_i = 0$.

Q: What is the geometric interpretation of linear independence for two vectors?
A: Neither vector is a scalar multiple of the other; they don't lie on the same line through the origin.

# Matrix operations
C: Matrix multiplication $(AB)_{ij} = $ [sum of (row $i$ of $A$) times (column $j$ of $B$)], i.e., $\sum_k a_{ik}b_{kj}$.

Q: Why is matrix multiplication not commutative in general?
A: The dimensions may not allow $BA$ even when $AB$ exists. Even when both exist, row-column dot products differ.

# Eigenvalues
C: $\lambda$ is an eigenvalue of $A$ if there exists nonzero $v$ such that $[Av = \lambda v]$.

P: Find the eigenvalues of $A = \begin{pmatrix} 3 & 1 \\ 0 & 2 \end{pmatrix}$.

S:
**IDENTIFY**: Find eigenvalues via characteristic equation

**EXECUTE**:
$\det(A - \lambda I) = \det\begin{pmatrix} 3-\lambda & 1 \\ 0 & 2-\lambda \end{pmatrix} = (3-\lambda)(2-\lambda) = 0$

Eigenvalues: $\lambda = 3$ and $\lambda = 2$

**EVALUATE**: Triangular matrix → eigenvalues are diagonal entries ✓
```

### Discrete Mathematics

#### Set Theory

```markdown
C: $A \cup B$ (union) contains elements in [$A$ or $B$ (or both)].

C: $A \cap B$ (intersection) contains elements in [both $A$ and $B$].

Q: What is De Morgan's Law for sets?
A: $(A \cup B)^c = A^c \cap B^c$ and $(A \cap B)^c = A^c \cup B^c$

# Cardinality
C: Two sets have the same cardinality if there exists a [bijection] between them.

Q: Why is $|\mathbb{N}| = |\mathbb{Z}|$ even though $\mathbb{Z}$ seems "twice as large"?
A: The bijection $f(n) = \begin{cases} n/2 & n \text{ even} \\ -(n+1)/2 & n \text{ odd} \end{cases}$ maps $\mathbb{N} \to \mathbb{Z}$: $(0,1,2,3,4,...) \mapsto (0,-1,1,-2,2,...)$
```

#### Combinatorics

```markdown
C: The number of permutations of $n$ objects is $[n!]$.

C: The number of ways to choose $k$ objects from $n$ (order doesn't matter) is $\binom{n}{k} = [\frac{n!}{k!(n-k)!}]$.

Q: What's the difference between permutations and combinations?
A: Permutations count arrangements (order matters): $P(n,k) = \frac{n!}{(n-k)!}$. Combinations count selections (order doesn't matter): $C(n,k) = \frac{n!}{k!(n-k)!}$.

P: How many 5-card hands contain exactly 2 aces?

S:
**IDENTIFY**: Combination problem

**EXECUTE**:
- Choose 2 aces from 4: $\binom{4}{2} = 6$
- Choose 3 non-aces from 48: $\binom{48}{3} = 17296$
- Total: $6 \times 17296 = 103776$
```

#### Number Theory

```markdown
C: $a \equiv b \pmod{n}$ means $n$ divides $[a - b]$, i.e., $a$ and $b$ have the same remainder when divided by $n$.

Q: What is Fermat's Little Theorem?
A: If $p$ is prime and $\gcd(a, p) = 1$, then $a^{p-1} \equiv 1 \pmod{p}$.

P: Find $7^{100} \pmod{13}$.

S:
**IDENTIFY**: Use Fermat's Little Theorem since 13 is prime

**EXECUTE**:
- By FLT: $7^{12} \equiv 1 \pmod{13}$
- $100 = 12 \times 8 + 4$
- So $7^{100} = (7^{12})^8 \cdot 7^4 \equiv 1^8 \cdot 7^4 \equiv 7^4 \pmod{13}$
- $7^2 = 49 \equiv 10 \pmod{13}$
- $7^4 = 100 \equiv 9 \pmod{13}$
```

### Probability & Statistics

```markdown
# Probability axioms
C: For any event $A$, $[0] \leq P(A) \leq [1]$.

C: Addition rule for mutually exclusive events: $P(A \cup B) = [P(A) + P(B)]$.

# Bayes' Theorem
C: Bayes' Theorem: $P(A|B) = [\frac{P(B|A) \cdot P(A)}{P(B)}]$

P: A test is 95% accurate (positive if disease, negative if healthy). Disease prevalence is 1%. If you test positive, what's the probability you have the disease?

S:
**IDENTIFY**: Bayes' Theorem problem

**PLAN**:
- $P(D) = 0.01$ (prior)
- $P(+|D) = 0.95$ (sensitivity)
- $P(+|D^c) = 0.05$ (false positive rate)

**EXECUTE**:
$P(D|+) = \frac{P(+|D)P(D)}{P(+|D)P(D) + P(+|D^c)P(D^c)}$
$= \frac{0.95 \times 0.01}{0.95 \times 0.01 + 0.05 \times 0.99} = \frac{0.0095}{0.0095 + 0.0495} \approx 0.161$

**EVALUATE**: Only ~16%! Base rate fallacy: low prevalence means most positives are false positives.
```

### Abstract Algebra

```markdown
# Group theory
C: A [group] is a set $G$ with operation $\cdot$ satisfying: closure, associativity, identity element, and inverse elements.

Q: Why isn't $(\mathbb{Z}, -)$ a group?
A: Subtraction is not associative: $(a - b) - c \neq a - (b - c)$ in general.

C: A group is [abelian] if $a \cdot b = b \cdot a$ for all $a, b$.

# Homomorphisms
C: A group homomorphism $\phi: G \to H$ preserves the operation: $\phi(ab) = [\phi(a)\phi(b)]$.

Q: What is the kernel of a homomorphism $\phi: G \to H$?
A: $\ker(\phi) = \{g \in G : \phi(g) = e_H\}$, the set of elements mapping to the identity.
```

### Real Analysis

```markdown
# Sequences
C: A sequence $(a_n)$ converges to $L$ if for every $\epsilon > 0$, there exists $N$ such that $n > N$ implies $[|a_n - L| < \epsilon]$.

Q: What's the intuition behind the $\epsilon$-$N$ definition of convergence?
A: No matter how small a tolerance $\epsilon$ you specify, eventually (after some $N$) all terms stay within that tolerance of $L$.

# Continuity
C: $f$ is continuous at $a$ if $\lim_{x \to a} f(x) = [f(a)]$.

Q: Give an example of a function continuous everywhere but differentiable nowhere.
A: The Weierstrass function: $f(x) = \sum_{n=0}^{\infty} a^n \cos(b^n \pi x)$ where $0 < a < 1$, $b$ is odd, and $ab > 1 + \frac{3\pi}{2}$.
```

### Topology

```markdown
# Basic definitions
C: A set $U$ is [open] in a topological space if for every $x \in U$, there exists a neighborhood of $x$ contained in $U$.

C: A set is [closed] if its complement is open.

Q: Can a set be both open and closed?
A: Yes! The empty set and the whole space are always both. In a disconnected space, there can be others.

# Continuity (topological)
Q: How is continuity defined topologically (without limits)?
A: $f: X \to Y$ is continuous if the preimage of every open set in $Y$ is open in $X$.

# Compactness
C: A space is [compact] if every open cover has a finite subcover.

Q: What is the Heine-Borel theorem?
A: In $\mathbb{R}^n$, a set is compact if and only if it is closed and bounded.
```

---

## IPEE Framework for Mathematics

The IPEE framework adapts to both computational and proof-based problems:

### For Computational Problems

```markdown
P: Simplify: $\frac{x^2 - 4}{x^2 + 4x + 4}$

S:
**IDENTIFY**: Rational expression simplification, look for common factors

**PLAN**: Factor numerator and denominator completely

**EXECUTE**:
- Numerator: $x^2 - 4 = (x+2)(x-2)$ (difference of squares)
- Denominator: $x^2 + 4x + 4 = (x+2)^2$ (perfect square)
- Simplify: $\frac{(x+2)(x-2)}{(x+2)^2} = \frac{x-2}{x+2}$ (for $x \neq -2$)

**EVALUATE**: The original is undefined at $x = -2$; the simplified form preserves this.
```

### For Proof-Based Problems

```markdown
P: Prove that if $n^2$ is even, then $n$ is even.

S:
**IDENTIFY**: Direct proof would require analyzing all cases; try contrapositive

**PLAN**: Contrapositive: "If $n$ is odd, then $n^2$ is odd"

**EXECUTE**:
1. Assume $n$ is odd: $n = 2k + 1$ for some integer $k$
2. Then $n^2 = (2k+1)^2 = 4k^2 + 4k + 1 = 2(2k^2 + 2k) + 1$
3. This is of the form $2m + 1$, so $n^2$ is odd

**EVALUATE**: Contrapositive proven, therefore original statement is true.
```

---

## Common Pitfalls in Math Flashcards

### 1. Copy-Pasting Textbook Proofs

❌ Don't copy a proof verbatim and try to memorize it.

✅ Break it into atomic observations. Understand each step. Create "why this step?" cards.

### 2. Skipping Definitions

❌ Don't use terms before defining them.

✅ Always establish definitions before using them in theorems or problems.

### 3. Blocked Practice

❌ Don't put all similar problems together.

✅ Interleave problem types for better discrimination and retention.

### 4. Memorizing Without Understanding

❌ Don't memorize formulas without knowing when/why to use them.

✅ Create "when do you use this?" and "why does this work?" cards.

### 5. Cards Too Complex

❌ Don't test multiple concepts in one card.

✅ Apply the atomicity principle: one concept per card.

### 6. Ignoring Multiple Representations

❌ Don't only practice algebraic manipulation.

✅ Connect numeric, symbolic, graphical, and verbal representations.

---

## Converting Worked Examples to Cards

When converting textbook examples to flashcards:

1. **Don't copy the whole example as one card**
2. **Create multiple atomic cards**:
   - "What's the first step for this problem type?"
   - "Why do we use this approach?"
   - "What's the key insight?"
   - Individual computational steps (if drilling fluency)

**Example textbook problem**: "Solve $\int \frac{1}{x^2 - 1}\,dx$"

**Cards to create**:
```markdown
Q: What technique do you use for $\int \frac{1}{x^2 - 1}\,dx$?
A: Partial fractions. Factor denominator: $x^2 - 1 = (x-1)(x+1)$.

Q: In partial fractions, how do you decompose $\frac{1}{(x-1)(x+1)}$?
A: $\frac{1}{(x-1)(x+1)} = \frac{A}{x-1} + \frac{B}{x+1}$ for constants $A$, $B$ to be determined.

P: Find $A$ and $B$ if $\frac{1}{(x-1)(x+1)} = \frac{A}{x-1} + \frac{B}{x+1}$.

S:
Multiply both sides by $(x-1)(x+1)$:
$1 = A(x+1) + B(x-1)$

Set $x = 1$: $1 = 2A$, so $A = \frac{1}{2}$
Set $x = -1$: $1 = -2B$, so $B = -\frac{1}{2}$

P: Evaluate $\int \frac{1}{x^2-1}\,dx$ using partial fractions.

S:
$\int \frac{1}{x^2-1}\,dx = \int \left(\frac{1/2}{x-1} - \frac{1/2}{x+1}\right)\,dx$
$= \frac{1}{2}\ln|x-1| - \frac{1}{2}\ln|x+1| + C = \frac{1}{2}\ln\left|\frac{x-1}{x+1}\right| + C$
```

---

## References

- Nielsen, M. (2019). "Using spaced repetition systems to see through a piece of mathematics." http://cognitivemedium.com/srs-mathematics
- Rohrer, D., Dedrick, R. F., & Stershic, S. (2015). "Interleaved practice improves mathematics learning." *Journal of Educational Psychology*, 107(3), 900-908.
- Rohrer, D., & Taylor, K. (2006). "The effects of overlearning and distributed practice on the retention of mathematics knowledge." *Applied Cognitive Psychology*, 20(9), 1209-1224.
- Kilpatrick, J., Swafford, J., & Findell, B. (Eds.). (2001). *Adding It Up: Helping Children Learn Mathematics*. National Academies Press.
- Zelko, J. (2023). "Making Math Flashcards Using Spaced Repetition Systems." https://jacobzelko.com/01072023041127-making-math-anki/

---

**Last updated**: 2025-12-14
**Scope**: All mathematics from prealgebra through graduate-level topics
**Topics covered**: Arithmetic, Algebra, Geometry, Trigonometry, Calculus, Linear Algebra, Discrete Math, Probability & Statistics, Abstract Algebra, Real Analysis, Topology
**Format**: Designed for FSRS spaced repetition algorithm
