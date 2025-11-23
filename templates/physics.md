# Physics Flashcard Writing Guide

> **Universal Principles**: See [general.md](general.md) for core SRS principles and card formats.

> **Purpose**: This guide covers physics-specific strategies for creating effective spaced repetition flashcards.

---

## The ISEE Problem-Solving Framework

From *University Physics* (Young & Freedman, 15th Edition), all physics problem-solving follows **ISEE**:

### **1. IDENTIFY**
- What physics concepts apply?
- What type of problem is this? (kinematics, dynamics, energy, waves, etc.)
- What are the "signal words" that indicate this approach?

### **2. SET UP**
- List all knowns with symbols and values
- Clearly state the unknown(s)
- Choose relevant equations and explain **WHY** they apply
- Draw diagrams (free-body, circuit, ray, energy, etc.)

### **3. EXECUTE**
- Solve algebraically first (when possible)
- Substitute numerical values with units
- Calculate step-by-step

### **4. EVALUATE**
- Check units via dimensional analysis
- Verify signs and directions make physical sense
- Is the magnitude reasonable?

**Use this framework in all P:/S: problem cards.**

---

## Common Physics Topics

### **Mechanics**

#### **1. Kinematics**
**IDENTIFY signals**: "constant acceleration", "uniformly", "from rest", "projectile", "circular motion"

**Key equations (1D constant acceleration)**:
- $v = v_0 + at$
- $x = x_0 + v_0t + \frac{1}{2}at^2$
- $v^2 = v_0^2 + 2a(x - x_0)$
- $x = x_0 + \frac{1}{2}(v_0 + v)t$

**Decision tree**: Which equation?
- Know $t$, need $x$? → $x = x_0 + v_0t + \frac{1}{2}at^2$
- NO time given/needed? → $v^2 = v_0^2 + 2a\Delta x$

**Common pitfalls**:
- Forgetting to square velocity in $v^2$ equation
- Sign errors (acceleration opposite to velocity when slowing)
- Confusing $x$ (position) with $\Delta x$ (displacement)

#### **2. Dynamics (Newton's Laws)**
**IDENTIFY signals**: "force", "push", "pull", "tension", "friction", "normal"

**Key approach**: Free-body diagrams + $\sum \vec{F} = m\vec{a}$

**SET UP checklist**:
1. Draw free-body diagram (ALL forces on ONE object)
2. Choose coordinate system (align with acceleration)
3. Resolve forces into components
4. Apply $\sum F_x = ma_x$ and $\sum F_y = ma_y$ separately

**Common force types**:
- Weight: $\vec{w} = m\vec{g}$ (always down, magnitude $mg$)
- Normal: $\vec{n}$ (perpendicular to surface)
- Tension: $\vec{T}$ (along rope/string)
- Friction: $f_k = \mu_k n$ (kinetic), $f_s \leq \mu_s n$ (static)

**Common pitfalls**:
- Including $ma$ as a force (it's NOT a force!)
- Assuming $n = mg$ (only true on horizontal surface with no vertical acceleration)
- Wrong friction: $f \neq \mu mg$ in general (it's $f = \mu n$)

#### **3. Energy and Work**
**IDENTIFY signals**: "frictionless", "height", "spring", "speed at bottom"

**Key decision**:
- **Only conservative forces** (gravity, springs)? → Use $E_i = E_f$
- **Non-conservative forces** (friction, drag)? → Use $W_{nc} = \Delta E$

**Energy types**:
- Kinetic: $K = \frac{1}{2}mv^2$
- Gravitational: $U_g = mgy$
- Elastic: $U_s = \frac{1}{2}kx^2$

**Common pitfalls**:
- Using energy conservation when friction is present
- Forgetting to square velocity
- Sign errors in $\Delta U_g$

#### **4. Circular Motion**
**IDENTIFY signals**: "circular path", "radius", "revolves", "centripetal"

**Key concept**: Acceleration toward center required

**Centripetal acceleration**: $a_c = \frac{v^2}{r}$ (toward center)

**Common pitfall**: Treating centripetal as a separate force (it's the NET inward force)

---

### **Electricity & Magnetism**

#### **1. Electrostatics**
**IDENTIFY signals**: "charge", "electric field", "potential", "capacitor"

**Key equations**:
- Coulomb's law: $F = k\frac{|q_1q_2|}{r^2}$
- Electric field: $\vec{E} = \frac{\vec{F}}{q}$
- Potential: $V = \frac{U}{q}$

**Common pitfalls**:
- Confusing field $\vec{E}$ with potential $V$
- Sign errors with charges
- Forgetting $1/r^2$ vs $1/r$ dependencies

#### **2. Circuits**
**IDENTIFY signals**: "resistor", "battery", "current", "voltage", "power"

**Key laws**:
- Ohm's law: $V = IR$
- Kirchhoff's voltage: $\sum V = 0$ (loop)
- Kirchhoff's current: $\sum I = 0$ (junction)

**Common pitfalls**:
- Series vs parallel rules
- Power in resistor: $P = I^2R = V^2/R$ (not $P = VI$ for resistor!)

---

### **Waves & Optics**

#### **Wave Motion**
**IDENTIFY signals**: "wavelength", "frequency", "amplitude", "interference"

**Key relationships**:
- $v = f\lambda$ (wave speed)
- $f = 1/T$ (frequency and period)

#### **Geometric Optics**
**IDENTIFY signals**: "mirror", "lens", "focal length", "image"

**Key equations**:
- Mirror/lens equation: $\frac{1}{f} = \frac{1}{d_o} + \frac{1}{d_i}$
- Magnification: $m = -\frac{d_i}{d_o} = \frac{h_i}{h_o}$

**Common pitfalls**:
- Sign conventions (real vs virtual)
- Upright vs inverted images

---

### **Modern Physics**

#### **Quantum & Relativity**
**IDENTIFY signals**: "photon", "energy levels", "relativistic", "time dilation"

**Key concepts**:
- Photon energy: $E = hf = \frac{hc}{\lambda}$
- De Broglie: $\lambda = \frac{h}{p}$
- Time dilation: $\Delta t = \gamma \Delta t_0$

---

## Flashcard Strategy for Physics

### **Conceptual Before Computational**
Always create understanding cards before calculation cards.

**Recommended order**:
1. **Definition/concept** (C: or Q:/A:)
2. **"Why" or "when to use"** (Q:/A:)
3. **Formula** (C:)
4. **Simple calculation** (P:/S: compact)
5. **Complex multi-step** (P:/S: full ISEE)

**Example progression**:
```markdown
# Step 1: Concept
Q: What is the difference between speed and velocity?
A: Speed is scalar (magnitude only), velocity is vector (magnitude + direction).

# Step 2: Application
Q: Can an object have constant speed but changing velocity?
A: Yes! If direction changes (e.g., circular motion at constant speed).

# Step 3: Formula
C: Average velocity is defined as $\bar{v} = $ [$\frac{\Delta x}{\Delta t}$].

# Step 4: Simple problem
P: An object moves from x = 2 m to x = 7 m in 5 s. What is average velocity?
S: $\bar{v} = \frac{7-2}{5} = 1.0$ m/s

# Step 5: Complex problem
[Multi-step kinematics with full ISEE]
```

---

## Common Physics Notation

- **Vectors**: $\vec{v}$, $\vec{a}$, $\vec{F}$ (arrow) or **bold v, a, F**
- **Magnitudes**: $v$, $a$, $F$ (no arrow)
- **Unit vectors**: $\hat{i}$, $\hat{j}$, $\hat{k}$ or $\hat{x}$, $\hat{y}$, $\hat{z}$
- **Change**: $\Delta x = x_f - x_i$
- **Derivatives**: $\frac{dx}{dt}$ or $\dot{x}$
- **Components**: $F_x$, $F_y$, $F_z$

---

## Formula Cards Best Practices

### **Bad Formula Card**:
```markdown
C: Newton's second law is [$F = ma$].
```

### **Good Formula Cards**:
```markdown
# Understanding first
Q: What does Newton's second law tell us?
A: Net force causes acceleration proportional to mass: more force → more acceleration, more mass → less acceleration.

# Formula
C: Newton's second law: $\sum \vec{F} = $ [$m\vec{a}$] (net force equals mass times acceleration).

# Application
Q: When would you use Newton's second law?
A: To find acceleration given forces, or to find required force for desired acceleration, or to analyze force components.

# Problem
P: A 5 kg object has net force 15 N. What is its acceleration?
S:
**IDENTIFY**: Newton's second law
**SET UP**: $m = 5$ kg, $F = 15$ N, find $a$ using $F = ma$
**EXECUTE**: $a = F/m = 15/5 = 3$ m/s²
**EVALUATE**: Units ✓, positive ✓, reasonable ✓
```

---

## Unit Analysis Cards

Physics is all about units! Create cards that test dimensional understanding:

```markdown
Q: What are the SI units of force?
A: Newton (N), equivalent to kg⋅m/s²

Q: Derive the units of force from F = ma.
A: [kg][m/s²] = kg⋅m/s² ≡ N

Q: Why does kinetic energy have units of Joules?
A: $K = \frac{1}{2}mv^2$ → [kg][m/s]² = kg⋅m²/s² ≡ J
```

---

## Common Physics Pitfalls

### **1. Sign Errors**
- Vectors have direction! $\vec{v}$ can be negative
- Free fall: $a = -g$ (downward) or $a = +g$ (choose convention)
- Work by friction: usually negative (opposes motion)

### **2. Confusing Similar Quantities**
- Position $x$ vs displacement $\Delta x$
- Speed $v$ vs velocity $\vec{v}$
- Distance vs displacement
- Mass $m$ vs weight $W = mg$

### **3. Formula Misapplication**
- Using $v = v_0 + at$ when acceleration isn't constant
- Using energy conservation when friction is present
- Assuming $n = mg$ on all surfaces

### **4. Missing Units**
- Always include units in final answer
- Check dimensional consistency
- Use unit analysis to catch errors

---

## Example Problem Card (Full ISEE)

```markdown
P: A 2.0 kg block slides down a frictionless 30° incline from rest. After sliding 5.0 m along the incline, what is its speed?

S:
**IDENTIFY**: Energy conservation problem (frictionless → no non-conservative work)

**SET UP**:
- Known: $m = 2.0$ kg, $\theta = 30°$, $d = 5.0$ m along incline, $v_0 = 0$
- Unknown: $v$ (speed at bottom)
- Approach: $E_i = E_f$ → $U_{g,i} + K_i = U_{g,f} + K_f$
- Height drop: $h = d\sin\theta = 5.0 \sin 30° = 2.5$ m

**EXECUTE**:
$$mgh + 0 = 0 + \frac{1}{2}mv^2$$
$$gh = \frac{1}{2}v^2$$
$$v = \sqrt{2gh} = \sqrt{2(9.8)(2.5)} = \sqrt{49} = 7.0 \text{ m/s}$$

**EVALUATE**:
- Units: m/s ✓
- Sign: Positive (speed is always positive) ✓
- Magnitude: ~7 m/s after dropping 2.5 m seems reasonable ✓
- Check: Mass canceled (correct for frictionless energy problem)
- Alternative: Could solve with kinematics $a = g\sin\theta$ (would get same answer)
```

---

## Cross-Topic Integration

Physics topics are interconnected. Create cards that bridge concepts:

```markdown
Q: How are circular motion and energy related?
A: Centripetal force does no work (perpendicular to motion), so kinetic energy is constant in uniform circular motion.

Q: How does Newton's third law apply to tension forces?
A: Rope pulls on both objects with equal magnitude tension (action-reaction pair).

Q: What's the connection between electric potential and electric field?
A: Electric field is the negative gradient of potential: $\vec{E} = -\nabla V$, or in 1D: $E_x = -\frac{dV}{dx}$.
```

---

## Resources

- **Textbook**: *University Physics* (Young & Freedman, 15th Ed.)
- **Problem-Solving**: "To the Student: How to Succeed in Physics" (textbook preamble)
- **Universal SRS**: [FLASHCARD_GUIDE.md](FLASHCARD_GUIDE.md)
- **Physics pedagogy**: ISEE framework from textbook worked examples

---

**Last updated**: 2025-11-22
**Scope**: All physics subjects (mechanics, E&M, waves, modern physics)
**Format**: Designed for spaced repetition flashcard systems
