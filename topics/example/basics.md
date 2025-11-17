# Example Flashcards

This file demonstrates the hashcards Q:/A:/C: format.

## Basic Cards

Q: What is the capital of France?
A: Paris

Q: Who wrote "1984"?
A: George Orwell

---

Q: What is the speed of light?
A: Approximately 299,792,458 meters per second (or about $3 \times 10^8$ m/s)

## Cloze Deletions

C: The [order] of a group is [the cardinality of its underlying set].

C: Better is the sight of the eyes than the wandering of the
desire: this is also vanity and vexation of spirit.

— [Ecclesiastes] [6]:[9]

## LaTeX Math

Q: What is Euler's identity?
A: $$e^{i\pi} + 1 = 0$$

Q: What is the quadratic formula?
A: For $ax^2 + bx + c = 0$, the solutions are:
$$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$

---

C: The derivative of $\sin(x)$ is [$\cos(x)$].

C: The integral of $\frac{1}{x}$ is [$\ln|x| + C$].

## Multi-line Content

Q: List the inner planets of the solar system.
A:

1. Mercury
2. Venus
3. Earth
4. Mars

---

Q: What are the main features of functional programming?
A: Key features include:

- **Immutability**: Data cannot be modified after creation
- **Pure functions**: Same input always produces same output
- **Higher-order functions**: Functions can take other functions as arguments
- **Recursion**: Preferred over iteration

## With TOML Frontmatter

You can also use TOML frontmatter for ordering and tags:

```markdown
---
order = 1
tags = ["example", "basics"]
---

Q: Your question here
A: Your answer here
```
