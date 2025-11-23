# Physics Flashcard Writing Guide

> **Purpose**: This guide provides physics-specific strategies for creating highly effective spaced repetition flashcards. For universal SRS principles and card formats, see [CLAUDE.md](CLAUDE.md).

> **Foundation**: Based on physics education research (PER), active recall studies, and proven problem-solving frameworks.

---

## Why Physics Flashcards Work

**Research findings** (Physics Education Research, 2025):
- **Active recall** is 3-4x more effective than re-reading for physics concepts
- **Spaced repetition** with retrieval practice improves problem-solving performance
- **Conceptual understanding BEFORE formulas** leads to better transfer and retention
- Students who use retrieval practice remember **80% vs 35%** without it

**The key**: Physics is NOT just memorizing formulas - it's about understanding **when**, **why**, and **how** to apply concepts. Your flashcards should reflect this.

---

## The ISAE Problem-Solving Framework

All physics problem-solving follows the **ISAE** framework:

### **1. IDENTIFY**
- What physics concepts apply?
- What type of problem is this? (kinematics, dynamics, energy, waves, etc.)
- What are the "signal words" that indicate this approach?

### **2. SET UP**
- List all knowns with symbols (use variables, not numbers)
- Clearly state the unknown(s)
- Choose relevant equations and explain **WHY** they apply
- Draw diagrams (free-body, circuit, ray, energy, etc.)

### **3. APPROACH**
- Solve algebraically using variables
- Show reasoning and methodology step-by-step
- Focus on **why** each step follows, not just computation

### **4. EVALUATE**
- Check units via dimensional analysis
- Verify signs and directions make physical sense
- Test limiting cases (e.g., what if mass → 0?)
- Does the formula structure make sense?

**IMPORTANT**: Use this framework in all P:/S: problem cards with **variables only**, no numerical values. The goal is to learn methodology, not arithmetic.

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

#### **5. Oscillations and Simple Harmonic Motion (SHM)**
**IDENTIFY signals**: "spring", "pendulum", "oscillates", "periodic", "restoring force"

**Key equations**:
- Hooke's law: $F = -kx$ (restoring force proportional to displacement)
- Angular frequency: $\omega = \sqrt{\frac{k}{m}}$ (mass-spring) or $\omega = \sqrt{\frac{g}{L}}$ (simple pendulum)
- Position: $x(t) = A\cos(\omega t + \phi)$
- Velocity: $v(t) = -A\omega\sin(\omega t + \phi)$
- Energy: $E = \frac{1}{2}kA^2$ (constant in ideal SHM)

**Common pitfalls**:
- Confusing $\omega$ (angular frequency, rad/s) with $f$ (frequency, Hz): $\omega = 2\pi f$
- Forgetting negative sign in restoring force
- Assuming pendulum formula works for large angles (small angle approximation required)

#### **6. Rotational Motion**
**IDENTIFY signals**: "rotates", "torque", "angular velocity", "moment of inertia", "spinning"

**Key analogies** (linear → rotational):
- Position $x$ → Angle $\theta$
- Velocity $v$ → Angular velocity $\omega$
- Acceleration $a$ → Angular acceleration $\alpha$
- Mass $m$ → Moment of inertia $I$
- Force $F$ → Torque $\tau$
- Momentum $p$ → Angular momentum $L$

**Key equations**:
- Torque: $\tau = r F \sin\theta = I\alpha$
- Rotational kinetic energy: $K_{rot} = \frac{1}{2}I\omega^2$
- Angular momentum: $L = I\omega$ (conservation: $L_i = L_f$ if no external torque)
- Rolling condition: $v_{cm} = R\omega$ (no slipping)

**Common moments of inertia**:
- Point mass: $I = mr^2$
- Solid cylinder/disk (axis through center): $I = \frac{1}{2}MR^2$
- Solid sphere: $I = \frac{2}{5}MR^2$
- Thin rod (axis through center): $I = \frac{1}{12}ML^2$

**Common pitfalls**:
- Using $F = ma$ instead of $\tau = I\alpha$ for rotation
- Forgetting parallel axis theorem: $I = I_{cm} + Md^2$
- Not using total kinetic energy for rolling objects: $K_{total} = K_{trans} + K_{rot}$

#### **7. Gravitation**
**IDENTIFY signals**: "orbit", "satellite", "planetary", "gravitational field"

**Key equations**:
- Newton's law of gravitation: $F = G\frac{m_1 m_2}{r^2}$
- Gravitational potential energy: $U = -G\frac{m_1 m_2}{r}$ (zero at infinity)
- Orbital speed: $v = \sqrt{\frac{GM}{r}}$
- Escape velocity: $v_{esc} = \sqrt{\frac{2GM}{R}}$

**Kepler's laws**:
1. Orbits are ellipses with the sun at one focus
2. Equal areas swept in equal times
3. $T^2 \propto r^3$ (period squared proportional to radius cubed)

**Common pitfalls**:
- Using $U = mgh$ for large distances (only valid near Earth's surface)
- Confusing orbital radius $r$ with planet radius $R$
- Sign errors in potential energy (gravitational PE is negative!)

#### **8. Momentum and Collisions**
**IDENTIFY signals**: "collision", "explosion", "recoil", "impulse"

**Key principles**:
- Momentum conservation: $\vec{p}_{total,i} = \vec{p}_{total,f}$ (isolated system)
- Impulse: $\vec{J} = \Delta \vec{p} = \int \vec{F}\,dt$
- Elastic collision: both momentum and kinetic energy conserved
- Inelastic collision: only momentum conserved

**Collision types**:
- **Perfectly elastic**: $v_1' - v_2' = -(v_1 - v_2)$ (relative velocity reverses)
- **Perfectly inelastic**: Objects stick together, maximum KE lost
- **General inelastic**: Some KE lost, objects separate

**Common pitfalls**:
- Assuming energy is conserved in all collisions (only elastic!)
- Vector nature of momentum (must use components)
- Forgetting that momentum is conserved even when KE is not

#### **9. Analytical Mechanics (Advanced)**
**IDENTIFY signals**: "Lagrangian", "generalized coordinates", "principle of least action", "Hamiltonian"

**Lagrangian mechanics**:
- Lagrangian: $\mathcal{L} = T - V$ (kinetic minus potential energy)
- Euler-Lagrange equation: $\frac{d}{dt}\frac{\partial \mathcal{L}}{\partial \dot{q}_i} - \frac{\partial \mathcal{L}}{\partial q_i} = 0$
- Advantages: Works with any coordinate system, automatically handles constraints

**Hamiltonian mechanics**:
- Hamiltonian: $\mathcal{H} = T + V$ (total energy, when constraints are time-independent)
- Canonical momentum: $p_i = \frac{\partial \mathcal{L}}{\partial \dot{q}_i}$
- Hamilton's equations: $\dot{q}_i = \frac{\partial \mathcal{H}}{\partial p_i}$, $\dot{p}_i = -\frac{\partial \mathcal{H}}{\partial q_i}$

**When to use**:
- Systems with constraints (pendulums, rolling objects)
- Non-Cartesian coordinates (spherical, cylindrical)
- Advanced mechanics and quantum theory foundations

**Common pitfalls**:
- Confusing $\mathcal{L} = T - V$ with $\mathcal{H} = T + V$
- Not recognizing cyclic coordinates (lead to conservation laws)
- Forgetting to check if potential is velocity-dependent

---

### **Thermodynamics & Statistical Mechanics**

#### **1. Temperature and Heat**
**IDENTIFY signals**: "temperature", "heat transfer", "thermal equilibrium", "specific heat"

**Key concepts**:
- Temperature: Average kinetic energy of molecules
- Heat: Energy transfer due to temperature difference
- Thermal equilibrium: No net heat flow (zeroth law)

**Heat transfer**:
- Conduction: $Q = kA\frac{\Delta T}{L}t$ (Fourier's law)
- Convection: Fluid motion transfers heat
- Radiation: $P = \sigma A T^4$ (Stefan-Boltzmann law)

**Specific heat**: $Q = mc\Delta T$
**Latent heat**: $Q = mL$ (phase change at constant temperature)

#### **2. Laws of Thermodynamics**
**IDENTIFY signals**: "first law", "second law", "entropy", "heat engine", "reversible"

**First law**: $\Delta U = Q - W$ (energy conservation)
- $\Delta U$: Change in internal energy
- $Q$: Heat added to system (positive if absorbed)
- $W$: Work done by system (positive if expansion)

**Second law**: Entropy of isolated system never decreases
- Heat flows spontaneously from hot to cold (never reverse without work)
- No heat engine can be 100% efficient
- Carnot efficiency: $\eta_{Carnot} = 1 - \frac{T_C}{T_H}$ (maximum possible)

**Third law**: Entropy approaches constant as $T \to 0$

**Common pitfalls**:
- Sign conventions for $Q$ and $W$ (different textbooks vary!)
- Confusing efficiency $\eta = \frac{W}{Q_H}$ with coefficient of performance (refrigerators)
- Assuming reversible processes in real systems (idealization)

#### **3. Thermodynamic Processes**
**IDENTIFY signals**: "isothermal", "adiabatic", "isobaric", "isochoric"

**Ideal gas law**: $PV = nRT$

**Process types**:
- **Isothermal** ($\Delta T = 0$): $PV = $ constant, $\Delta U = 0$, $Q = W$
- **Adiabatic** ($Q = 0$): $PV^\gamma = $ constant, $\Delta U = -W$
- **Isobaric** ($\Delta P = 0$): $W = P\Delta V$
- **Isochoric** ($\Delta V = 0$): $W = 0$, $\Delta U = Q$

**First law for ideal gas**: $\Delta U = nC_V\Delta T$ (depends only on temperature)

**Common pitfalls**:
- Using $PV = $ constant for adiabatic (wrong! it's $PV^\gamma$)
- Forgetting $\gamma = C_P/C_V$ depends on gas type (monoatomic: 5/3, diatomic: 7/5)
- Confusing work by gas (positive) with work on gas (negative)

#### **4. Entropy and Statistical Mechanics**
**IDENTIFY signals**: "entropy", "microstates", "multiplicity", "Boltzmann distribution"

**Entropy definitions**:
- Thermodynamic: $dS = \frac{dQ_{rev}}{T}$
- Statistical: $S = k_B \ln \Omega$ (Boltzmann, $\Omega$ = number of microstates)

**Boltzmann distribution**: $P(E) \propto e^{-E/k_B T}$
- Probability of state with energy $E$ at temperature $T$
- Foundation of statistical mechanics

**Partition function**: $Z = \sum_i e^{-E_i/k_B T}$
- All thermodynamic quantities derivable from $Z$
- $F = -k_B T \ln Z$ (Helmholtz free energy)

**Ensembles**:
- **Microcanonical**: Isolated system (fixed $N$, $V$, $E$)
- **Canonical**: Constant temperature (fixed $N$, $V$, $T$)
- **Grand canonical**: Variable particle number (fixed $\mu$, $V$, $T$)

**Common pitfalls**:
- Confusing entropy (measure of disorder) with energy
- Forgetting that $\Omega$ counts microstates, not macrostates
- Not recognizing when to use canonical vs microcanonical ensemble

---

### **Electricity & Magnetism**

#### **1. Electrostatics**
**IDENTIFY signals**: "charge", "electric field", "potential", "capacitor", "Gauss's law"

**Key equations**:
- Coulomb's law: $F = k\frac{|q_1q_2|}{r^2}$ where $k = \frac{1}{4\pi\epsilon_0}$
- Electric field: $\vec{E} = \frac{\vec{F}}{q}$ (force per unit charge)
- Electric potential: $V = \frac{U}{q}$ and $\vec{E} = -\nabla V$
- Gauss's law: $\oint \vec{E} \cdot d\vec{A} = \frac{Q_{enc}}{\epsilon_0}$

**Capacitance**:
- Definition: $C = \frac{Q}{V}$
- Parallel plate: $C = \epsilon_0 \frac{A}{d}$
- Energy stored: $U = \frac{1}{2}CV^2 = \frac{1}{2}QV = \frac{Q^2}{2C}$
- With dielectric: $C = \kappa C_0$ (increases capacitance)

**Common pitfalls**:
- Confusing field $\vec{E}$ (vector) with potential $V$ (scalar)
- Sign errors with charges (like repels, unlike attracts)
- Forgetting $1/r^2$ (field, force) vs $1/r$ (potential) dependencies
- Using Gauss's law without symmetry (only useful with spherical, cylindrical, planar symmetry)

#### **2. DC Circuits**
**IDENTIFY signals**: "resistor", "battery", "current", "voltage", "power", "EMF"

**Key laws**:
- Ohm's law: $V = IR$
- Kirchhoff's voltage law (KVL): $\sum V = 0$ (around closed loop)
- Kirchhoff's current law (KCL): $\sum I = 0$ (at junction)
- Power: $P = IV = I^2R = \frac{V^2}{R}$

**Resistors in series/parallel**:
- Series: $R_{eq} = R_1 + R_2 + \ldots$ (current same, voltages add)
- Parallel: $\frac{1}{R_{eq}} = \frac{1}{R_1} + \frac{1}{R_2} + \ldots$ (voltage same, currents add)

**Capacitors in series/parallel** (opposite of resistors!):
- Series: $\frac{1}{C_{eq}} = \frac{1}{C_1} + \frac{1}{C_2} + \ldots$
- Parallel: $C_{eq} = C_1 + C_2 + \ldots$

**RC circuits**:
- Charging: $Q(t) = Q_0(1 - e^{-t/RC})$
- Discharging: $Q(t) = Q_0 e^{-t/RC}$
- Time constant: $\tau = RC$

**Common pitfalls**:
- Series vs parallel rules (capacitors are opposite of resistors!)
- Power dissipated: $P = I^2R$ (not $P = IV$ for individual resistor in circuit)
- Forgetting internal resistance of battery

#### **3. Magnetism**
**IDENTIFY signals**: "magnetic field", "current loop", "solenoid", "magnetic force"

**Magnetic force**:
- On moving charge: $\vec{F} = q\vec{v} \times \vec{B}$ (perpendicular to both $\vec{v}$ and $\vec{B}$)
- On current-carrying wire: $\vec{F} = I\vec{L} \times \vec{B}$
- Between parallel wires: $\frac{F}{L} = \frac{\mu_0 I_1 I_2}{2\pi d}$

**Magnetic fields**:
- Biot-Savart law: $d\vec{B} = \frac{\mu_0}{4\pi}\frac{Id\vec{l} \times \hat{r}}{r^2}$
- Long straight wire: $B = \frac{\mu_0 I}{2\pi r}$
- Center of circular loop: $B = \frac{\mu_0 I}{2R}$
- Solenoid: $B = \mu_0 n I$ (inside, $n$ = turns per length)

**Ampère's law**: $\oint \vec{B} \cdot d\vec{l} = \mu_0 I_{enc}$ (with symmetry)

**Common pitfalls**:
- Magnetic force does NO work (always perpendicular to velocity)
- Right-hand rule confusion (thumb = current/velocity, fingers = field, palm = force)
- Forgetting that $\vec{F} = q\vec{v} \times \vec{B}$ gives circular motion (centripetal force)

#### **4. Electromagnetic Induction**
**IDENTIFY signals**: "changing magnetic flux", "induced EMF", "Lenz's law", "inductor"

**Faraday's law**: $\mathcal{E} = -\frac{d\Phi_B}{dt}$ where $\Phi_B = \int \vec{B} \cdot d\vec{A}$

**Lenz's law**: Induced current opposes the change in flux (negative sign in Faraday's law)

**Motional EMF**: $\mathcal{E} = Blv$ (rod of length $l$ moving with velocity $v$ perpendicular to field $B$)

**Inductance**:
- Self-inductance: $\mathcal{E} = -L\frac{dI}{dt}$
- Solenoid: $L = \mu_0 n^2 A l$
- Energy stored: $U = \frac{1}{2}LI^2$

**RL circuits**:
- Current growth: $I(t) = I_0(1 - e^{-t/\tau})$ where $\tau = L/R$
- Current decay: $I(t) = I_0 e^{-t/\tau}$

**Common pitfalls**:
- Sign errors (Lenz's law determines direction of induced current)
- Confusing flux $\Phi_B$ with field $B$
- Forgetting that changing flux can come from changing $B$, changing $A$, or changing angle

#### **5. AC Circuits**
**IDENTIFY signals**: "alternating current", "RMS", "reactance", "impedance", "resonance"

**AC voltage/current**: $V(t) = V_0 \sin(\omega t)$, $I(t) = I_0 \sin(\omega t + \phi)$

**RMS values**: $V_{rms} = \frac{V_0}{\sqrt{2}}$, $I_{rms} = \frac{I_0}{\sqrt{2}}$ (effective values for power)

**Reactance**:
- Capacitive: $X_C = \frac{1}{\omega C}$ (decreases with frequency)
- Inductive: $X_L = \omega L$ (increases with frequency)

**Impedance**: $Z = \sqrt{R^2 + (X_L - X_C)^2}$

**Resonance**: $\omega_0 = \frac{1}{\sqrt{LC}}$ (when $X_L = X_C$, impedance is minimum)

**Power**: $P_{avg} = I_{rms}V_{rms}\cos\phi$ where $\phi$ is phase angle

**Common pitfalls**:
- Using peak values instead of RMS for power calculations
- Forgetting that $X_C$ decreases with frequency (opposite of $X_L$)
- Not using phasor diagrams for phase relationships

#### **6. Maxwell's Equations**
**IDENTIFY signals**: "electromagnetic waves", "displacement current", "speed of light"

**Maxwell's equations** (in vacuum):
1. Gauss's law: $\oint \vec{E} \cdot d\vec{A} = \frac{Q_{enc}}{\epsilon_0}$
2. Gauss's law for magnetism: $\oint \vec{B} \cdot d\vec{A} = 0$ (no magnetic monopoles)
3. Faraday's law: $\oint \vec{E} \cdot d\vec{l} = -\frac{d\Phi_B}{dt}$
4. Ampère-Maxwell law: $\oint \vec{B} \cdot d\vec{l} = \mu_0 I_{enc} + \mu_0\epsilon_0\frac{d\Phi_E}{dt}$

**Displacement current**: $I_d = \epsilon_0 \frac{d\Phi_E}{dt}$ (Maxwell's addition to Ampère's law)

**Electromagnetic waves**:
- Speed in vacuum: $c = \frac{1}{\sqrt{\mu_0\epsilon_0}} = 3 \times 10^8$ m/s
- Relationship: $E = cB$ (in EM wave)
- Energy density: $u = \frac{1}{2}\epsilon_0 E^2 + \frac{1}{2\mu_0}B^2$
- Poynting vector: $\vec{S} = \frac{1}{\mu_0}\vec{E} \times \vec{B}$ (energy flux)

**Common pitfalls**:
- Forgetting displacement current term (crucial for EM wave propagation)
- Not recognizing that Maxwell's equations predict light is an EM wave
- Confusing $\vec{E}$ and $\vec{B}$ in wave (perpendicular to each other and to propagation)

---

### **Waves & Optics**

#### **1. Wave Motion**
**IDENTIFY signals**: "wavelength", "frequency", "amplitude", "interference", "standing wave"

**Wave equation**: $\frac{\partial^2 y}{\partial t^2} = v^2 \frac{\partial^2 y}{\partial x^2}$

**Key relationships**:
- Wave speed: $v = f\lambda = \frac{\lambda}{T}$
- Frequency: $f = 1/T$
- Angular frequency: $\omega = 2\pi f$
- Wave number: $k = \frac{2\pi}{\lambda}$

**Traveling wave**: $y(x,t) = A\sin(kx - \omega t + \phi)$

**Standing waves**: $y(x,t) = 2A\sin(kx)\cos(\omega t)$
- Nodes: Points of zero amplitude
- Antinodes: Points of maximum amplitude
- String fixed at both ends: $\lambda_n = \frac{2L}{n}$ where $n = 1, 2, 3, \ldots$

**Common pitfalls**:
- Confusing $\omega$ (rad/s) with $f$ (Hz)
- Wrong direction: $kx - \omega t$ (moving right), $kx + \omega t$ (moving left)
- Not recognizing boundary conditions determine standing wave frequencies

#### **2. Sound Waves**
**IDENTIFY signals**: "sound", "pressure wave", "decibel", "Doppler", "beats"

**Speed of sound**: $v = \sqrt{\frac{B}{\rho}}$ (bulk modulus over density)

**Intensity**: $I = \frac{P}{A}$ (power per unit area)

**Decibel scale**: $\beta = 10\log_{10}\frac{I}{I_0}$ where $I_0 = 10^{-12}$ W/m² (threshold of hearing)

**Doppler effect**: $f' = f\frac{v \pm v_o}{v \mp v_s}$
- Top signs: observer/source moving toward each other
- Bottom signs: moving apart

**Beats**: $f_{beat} = |f_1 - f_2|$

**Common pitfalls**:
- Doppler sign errors (approaching = higher frequency, receding = lower)
- Confusing intensity ($I \propto A^2$) with amplitude
- Logarithmic nature of decibels (10 dB increase = 10× intensity)

#### **3. Geometric Optics**
**IDENTIFY signals**: "mirror", "lens", "focal length", "image", "ray diagram"

**Mirror/lens equation**: $\frac{1}{f} = \frac{1}{d_o} + \frac{1}{d_i}$

**Magnification**: $m = -\frac{d_i}{d_o} = \frac{h_i}{h_o}$

**Sign conventions**:
- Focal length $f$: positive (converging), negative (diverging)
- Image distance $d_i$: positive (real image), negative (virtual image)
- Magnification $m$: negative (inverted), positive (upright)

**Mirror equation**: $\frac{1}{f} = \frac{2}{R}$ (focal length = half radius of curvature)

**Lensmaker's equation**: $\frac{1}{f} = (n-1)\left(\frac{1}{R_1} - \frac{1}{R_2}\right)$

**Common pitfalls**:
- Sign convention errors (real vs virtual, converging vs diverging)
- Confusing object distance with image distance
- Not using ray diagrams to verify results

#### **4. Physical Optics**
**IDENTIFY signals**: "interference", "diffraction", "double slit", "thin film", "polarization"

**Double-slit interference**:
- Constructive: $d\sin\theta = m\lambda$ where $m = 0, \pm 1, \pm 2, \ldots$
- Destructive: $d\sin\theta = (m + \frac{1}{2})\lambda$
- Fringe spacing: $y = \frac{m\lambda L}{d}$ (on distant screen)

**Single-slit diffraction**:
- Dark fringes: $a\sin\theta = m\lambda$ where $m = \pm 1, \pm 2, \ldots$ (NOT zero!)
- Central maximum width: $\Delta y = \frac{2\lambda L}{a}$

**Thin film interference**:
- Constructive: $2nt = (m + \frac{1}{2})\lambda$ (if one reflection has phase change)
- Destructive: $2nt = m\lambda$
- Phase change on reflection: occurs when light reflects from higher index medium

**Diffraction grating**: $d\sin\theta = m\lambda$ (many slits, very sharp maxima)

**Polarization**:
- Malus's law: $I = I_0\cos^2\theta$
- Brewster's angle: $\tan\theta_B = \frac{n_2}{n_1}$ (reflected light fully polarized)

**Common pitfalls**:
- Single-slit: dark fringes start at $m = 1$, not $m = 0$
- Thin film: forgetting phase change on reflection (depends on indices)
- Polarization: intensity goes as $\cos^2\theta$, not $\cos\theta$

#### **5. Refraction and Dispersion**
**IDENTIFY signals**: "refraction", "Snell's law", "total internal reflection", "prism", "index of refraction"

**Snell's law**: $n_1\sin\theta_1 = n_2\sin\theta_2$

**Index of refraction**: $n = \frac{c}{v}$ (speed of light in vacuum / speed in medium)

**Total internal reflection**: Occurs when $\theta_1 > \theta_c$ where $\sin\theta_c = \frac{n_2}{n_1}$ (only if $n_1 > n_2$)

**Dispersion**: $n(\lambda)$ varies with wavelength (blue light bends more than red)

**Common pitfalls**:
- Total internal reflection only occurs going from high to low index
- Critical angle formula requires $n_1 > n_2$
- Not recognizing that $n$ depends on $\lambda$ (prism separates colors)

---

### **Quantum Mechanics**

#### **1. Wave-Particle Duality**
**IDENTIFY signals**: "photon", "de Broglie", "wave function", "photoelectric effect"

**Photon energy**: $E = hf = \frac{hc}{\lambda}$ where $h = 6.626 \times 10^{-34}$ J·s

**De Broglie wavelength**: $\lambda = \frac{h}{p} = \frac{h}{mv}$ (particles have wave properties)

**Photoelectric effect**:
- $K_{max} = hf - \phi$ where $\phi$ is work function
- Threshold frequency: $f_0 = \frac{\phi}{h}$
- Key: Intensity affects number of photoelectrons, NOT their energy
- Frequency determines maximum kinetic energy

**Compton scattering**: $\lambda' - \lambda = \frac{h}{m_e c}(1 - \cos\theta)$

**Common pitfalls**:
- Confusing photon energy with intensity (intensity ∝ number of photons)
- Not recognizing that de Broglie wavelength applies to ALL particles
- Photoelectric effect: increasing intensity doesn't increase $K_{max}$

#### **2. Schrödinger Equation**
**IDENTIFY signals**: "wave function", "probability density", "Hamiltonian", "eigenstate"

**Time-dependent Schrödinger equation**: $i\hbar\frac{\partial\Psi}{\partial t} = \hat{H}\Psi$

**Time-independent Schrödinger equation**: $\hat{H}\psi = E\psi$ where $\hat{H} = -\frac{\hbar^2}{2m}\nabla^2 + V$

**Probability density**: $P(x) = |\Psi(x,t)|^2$

**Normalization**: $\int_{-\infty}^{\infty}|\Psi|^2 dx = 1$

**Expectation value**: $\langle A \rangle = \int \Psi^* \hat{A} \Psi\, dx$

**Common pitfalls**:
- Confusing $\Psi$ (wave function) with $|\Psi|^2$ (probability density)
- Not normalizing wave functions
- Forgetting that operators don't generally commute

#### **3. Quantum Operators and Measurements**
**IDENTIFY signals**: "commutator", "uncertainty principle", "observable", "eigenvalue"

**Position operator**: $\hat{x}\psi = x\psi$

**Momentum operator**: $\hat{p} = -i\hbar\frac{\partial}{\partial x}$

**Energy operator**: $\hat{E} = i\hbar\frac{\partial}{\partial t}$

**Commutator**: $[\hat{A}, \hat{B}] = \hat{A}\hat{B} - \hat{B}\hat{A}$

**Heisenberg uncertainty principle**:
- Position-momentum: $\Delta x \Delta p \geq \frac{\hbar}{2}$
- Energy-time: $\Delta E \Delta t \geq \frac{\hbar}{2}$

**Measurement**: Measuring observable $\hat{A}$ collapses $\Psi$ to eigenstate with eigenvalue (measured value)

**Common pitfalls**:
- Uncertainty principle is NOT about measurement disturbance (it's fundamental)
- Commuting operators can be measured simultaneously, non-commuting cannot
- Eigenvalues are the only possible measurement outcomes

#### **4. Particle in a Box**
**IDENTIFY signals**: "infinite square well", "particle in a box", "quantized energy"

**Potential**: $V(x) = 0$ for $0 < x < L$, $V(x) = \infty$ elsewhere

**Wave functions**: $\psi_n(x) = \sqrt{\frac{2}{L}}\sin\left(\frac{n\pi x}{L}\right)$ where $n = 1, 2, 3, \ldots$

**Energy levels**: $E_n = \frac{n^2\pi^2\hbar^2}{2mL^2} = \frac{n^2 h^2}{8mL^2}$

**Key results**:
- Energy is quantized ($n$ cannot be zero or continuous)
- Ground state ($n=1$) has nonzero energy (zero-point energy)
- Energy spacing increases with $n$: $E_n \propto n^2$

**Common pitfalls**:
- $n$ starts at 1, not 0 (no zero-energy state)
- Energy goes as $n^2$, not $n$
- Narrower box → higher energies ($E \propto 1/L^2$)

#### **5. Quantum Harmonic Oscillator**
**IDENTIFY signals**: "harmonic oscillator", "ladder operators", "zero-point energy"

**Energy levels**: $E_n = \hbar\omega(n + \frac{1}{2})$ where $n = 0, 1, 2, \ldots$

**Key results**:
- Equally spaced levels (spacing = $\hbar\omega$)
- Zero-point energy: $E_0 = \frac{1}{2}\hbar\omega$ (ground state energy)
- Quantum number $n$ starts at 0

**Ladder operators**:
- Raising: $\hat{a}^\dagger|n\rangle = \sqrt{n+1}|n+1\rangle$
- Lowering: $\hat{a}|n\rangle = \sqrt{n}|n-1\rangle$

**Common pitfalls**:
- Unlike particle in box, harmonic oscillator $n$ starts at 0
- Energy levels equally spaced (not $\propto n^2$)
- Zero-point energy is unavoidable (uncertainty principle)

#### **6. Hydrogen Atom**
**IDENTIFY signals**: "hydrogen atom", "orbital angular momentum", "quantum numbers", "spin"

**Energy levels**: $E_n = -\frac{13.6\text{ eV}}{n^2}$ where $n = 1, 2, 3, \ldots$ (principal quantum number)

**Quantum numbers**:
- Principal: $n = 1, 2, 3, \ldots$ (determines energy)
- Orbital angular momentum: $l = 0, 1, 2, \ldots, n-1$ (s, p, d, f, ...)
- Magnetic: $m_l = -l, -l+1, \ldots, l-1, l$ (z-component of $\vec{L}$)
- Spin: $m_s = \pm\frac{1}{2}$ (intrinsic angular momentum)

**Angular momentum magnitude**: $L = \sqrt{l(l+1)}\hbar$

**Orbital notation**: 1s, 2s, 2p, 3s, 3p, 3d, ... (n followed by letter for l)

**Common pitfalls**:
- Energy depends only on $n$ in hydrogen (not true for multi-electron atoms)
- $l$ ranges from 0 to $n-1$ (not $n$)
- Angular momentum is $\sqrt{l(l+1)}\hbar$, not $l\hbar$

---

### **Special Relativity**

#### **1. Postulates and Lorentz Transformations**
**IDENTIFY signals**: "relativistic", "Lorentz", "reference frame", "invariant"

**Einstein's postulates**:
1. Laws of physics same in all inertial frames
2. Speed of light $c$ is constant in all inertial frames

**Lorentz factor**: $\gamma = \frac{1}{\sqrt{1 - v^2/c^2}}$

**Lorentz transformations**:
- $x' = \gamma(x - vt)$
- $t' = \gamma(t - vx/c^2)$
- $y' = y$, $z' = z$

**Spacetime interval** (invariant): $(\Delta s)^2 = c^2(\Delta t)^2 - (\Delta x)^2 - (\Delta y)^2 - (\Delta z)^2$

**Common pitfalls**:
- Velocities don't add linearly at high speeds
- Simultaneity is relative (events simultaneous in one frame may not be in another)
- Not recognizing which quantities are invariant

#### **2. Time Dilation and Length Contraction**
**IDENTIFY signals**: "time dilation", "proper time", "length contraction", "proper length"

**Time dilation**: $\Delta t = \gamma \Delta t_0$ where $\Delta t_0$ is proper time (measured in rest frame)

**Length contraction**: $L = \frac{L_0}{\gamma}$ where $L_0$ is proper length (measured in rest frame)

**Key concepts**:
- Moving clocks run slow (time dilation)
- Moving objects contract in direction of motion
- Proper time/length: measured in object's rest frame (always shortest/longest)

**Common pitfalls**:
- Confusing proper time (shortest) with dilated time
- Length contraction only in direction of motion (not perpendicular)
- Not identifying which frame is the "rest frame"

#### **3. Relativistic Energy and Momentum**
**IDENTIFY signals**: "rest energy", "relativistic momentum", "mass-energy equivalence"

**Energy-momentum relations**:
- Total energy: $E = \gamma mc^2$
- Rest energy: $E_0 = mc^2$
- Kinetic energy: $K = (\gamma - 1)mc^2$
- Momentum: $\vec{p} = \gamma m\vec{v}$

**Energy-momentum invariant**: $E^2 = (pc)^2 + (mc^2)^2$

**Massless particles** (photons): $E = pc$

**Common pitfalls**:
- $E = mc^2$ is rest energy, not total energy (total is $\gamma mc^2$)
- Classical $K = \frac{1}{2}mv^2$ only valid for $v \ll c$
- Not using invariant $E^2 - (pc)^2 = (mc^2)^2$ for calculations

#### **4. Relativistic Velocity Addition**
**IDENTIFY signals**: "velocity addition", "rapidity"

**Velocity addition**: $v = \frac{v_1 + v_2}{1 + v_1v_2/c^2}$

**Key result**: Nothing can exceed speed of light
- If $v_1 = 0.9c$ and $v_2 = 0.9c$, then $v = 0.994c$, not $1.8c$

**Common pitfalls**:
- Using $v = v_1 + v_2$ for relativistic speeds (wrong!)
- Not recognizing that $c$ is a universal speed limit

---

### **Nuclear & Particle Physics**

#### **1. Nuclear Structure**
**IDENTIFY signals**: "nucleus", "proton", "neutron", "isotope", "binding energy"

**Nuclear notation**: $^A_Z X$ where $A$ = mass number (nucleons), $Z$ = atomic number (protons)

**Binding energy**: $BE = (Zm_p + Nm_n - m_{nucleus})c^2$
- Energy required to disassemble nucleus
- Binding energy per nucleon peaks around iron-56 (most stable)

**Nuclear radius**: $R \approx R_0 A^{1/3}$ where $R_0 \approx 1.2$ fm

**Common pitfalls**:
- Mass defect is positive (nucleus lighter than constituent parts)
- Higher binding energy per nucleon = more stable
- $N$ (neutrons) = $A - Z$, not equal to $Z$ for heavy elements

#### **2. Radioactive Decay**
**IDENTIFY signals**: "half-life", "decay constant", "alpha decay", "beta decay", "gamma decay"

**Decay law**: $N(t) = N_0 e^{-\lambda t}$ where $\lambda$ is decay constant

**Half-life**: $t_{1/2} = \frac{\ln 2}{\lambda} = \frac{0.693}{\lambda}$

**Activity**: $A = \lambda N = \frac{dN}{dt}$ (number of decays per unit time)

**Decay types**:
- **Alpha** ($\alpha$): Nucleus emits $^4_2$He, $A$ decreases by 4, $Z$ decreases by 2
- **Beta minus** ($\beta^-$): Neutron → proton + electron + antineutrino, $Z$ increases by 1
- **Beta plus** ($\beta^+$): Proton → neutron + positron + neutrino, $Z$ decreases by 1
- **Gamma** ($\gamma$): Excited nucleus releases photon, $A$ and $Z$ unchanged

**Common pitfalls**:
- Half-life vs mean lifetime: $\tau = 1/\lambda = t_{1/2}/\ln 2$
- Beta decay changes $Z$ (element changes), alpha decay changes both $A$ and $Z$
- Activity decreases exponentially, proportional to $N(t)$

#### **3. Nuclear Reactions**
**IDENTIFY signals**: "fission", "fusion", "Q-value", "chain reaction"

**Q-value**: $Q = (m_{initial} - m_{final})c^2$ (energy released)
- Positive $Q$: exothermic (releases energy)
- Negative $Q$: endothermic (requires energy)

**Fission**: Heavy nucleus splits into lighter nuclei
- Releases energy because products have higher binding energy per nucleon
- Example: $^{235}$U + n → fission products + neutrons + energy

**Fusion**: Light nuclei combine into heavier nucleus
- Releases energy for elements lighter than iron
- Example: $^2$H + $^3$H → $^4$He + n + 17.6 MeV
- Powers stars

**Common pitfalls**:
- Fission releases energy for heavy elements, fusion for light elements
- Both move toward iron-56 (maximum binding energy per nucleon)
- Conservation laws: energy, momentum, charge, baryon number, lepton number

#### **4. Particle Physics Basics**
**IDENTIFY signals**: "quark", "lepton", "fundamental forces", "Standard Model"

**Fundamental particles**:
- **Quarks**: up, down, charm, strange, top, bottom (6 types, fractional charge)
- **Leptons**: electron, muon, tau, and their neutrinos (6 types)
- **Force carriers**: photon (EM), W/Z bosons (weak), gluons (strong), graviton (gravity)

**Hadrons** (made of quarks):
- **Baryons**: 3 quarks (proton = uud, neutron = udd)
- **Mesons**: quark-antiquark pair (pion = $u\bar{d}$ or $d\bar{u}$)

**Conservation laws**:
- Energy, momentum, angular momentum
- Charge, baryon number, lepton number
- Strangeness (in strong/EM interactions only)

**Common pitfalls**:
- Protons/neutrons are NOT fundamental (made of quarks)
- Photons are force carriers, not matter particles
- Weak force can change quark flavor (but not strong or EM)

---

### **General Relativity & Cosmology (Introductory)**

#### **1. Equivalence Principle and Curved Spacetime**
**IDENTIFY signals**: "general relativity", "equivalence principle", "curved spacetime", "geodesic"

**Equivalence principle**: Gravitational and inertial mass are equivalent
- No local experiment can distinguish between gravity and acceleration
- Gravity is not a force, but curvature of spacetime

**Geodesic**: Path of freely falling object in curved spacetime
- Objects move along "straightest possible" paths in curved space
- Planets orbit because they follow geodesics in curved spacetime around massive objects

**Key concepts**:
- Mass/energy curves spacetime
- Curvature tells matter how to move
- Light also follows geodesics (gravitational lensing)

**Common pitfalls**:
- Gravity is NOT a force in GR (it's geometry)
- Confusing coordinate time with proper time
- Not recognizing that all forms of energy curve spacetime, not just mass

#### **2. Schwarzschild Metric and Black Holes**
**IDENTIFY signals**: "black hole", "event horizon", "Schwarzschild radius", "singularity"

**Schwarzschild radius**: $r_s = \frac{2GM}{c^2}$ (radius of event horizon)

**Event horizon**: Surface at $r = r_s$ where escape velocity equals $c$
- Nothing can escape from inside (not even light)
- One-way boundary (can fall in, can't come out)

**Singularity**: Point at $r = 0$ where curvature becomes infinite

**Time dilation near black hole**: Clocks run slower in stronger gravitational fields

**Common pitfalls**:
- Black holes are NOT "cosmic vacuums" that suck everything in
- Event horizon is not a physical surface (just a mathematical boundary)
- Schwarzschild radius depends on mass only ($r_s \propto M$)

#### **3. Gravitational Waves**
**IDENTIFY signals**: "gravitational waves", "LIGO", "ripples in spacetime", "binary merger"

**Key concepts**:
- Accelerating masses produce ripples in spacetime
- Travel at speed of light
- Carry energy away from source
- Detected by LIGO (2015, first direct detection)

**Sources**: Binary black hole mergers, neutron star mergers, supernovae

**Strain**: $h \sim \frac{GM}{rc^2}\frac{v^2}{c^2}$ (typical strain $\sim 10^{-21}$)

**Common pitfalls**:
- Gravitational waves are NOT density waves (they're spacetime curvature waves)
- Frequency of wave is twice orbital frequency for binary systems
- Detection requires incredibly sensitive interferometers (strain ~ $10^{-21}$)

#### **4. Cosmology Basics**
**IDENTIFY signals**: "expanding universe", "Hubble's law", "redshift", "Big Bang", "cosmic microwave background"

**Hubble's law**: $v = H_0 d$ where $H_0 \approx 70$ km/s/Mpc (Hubble constant)
- Galaxies recede with velocity proportional to distance
- Evidence for expanding universe

**Cosmological redshift**: $z = \frac{\lambda_{observed} - \lambda_{emitted}}{\lambda_{emitted}} = \frac{\Delta \lambda}{\lambda}$
- Light from distant galaxies is redshifted (wavelength stretched)
- Due to expansion of space itself, not Doppler effect

**Cosmic Microwave Background (CMB)**: Thermal radiation from early universe
- Temperature: ~2.7 K (blackbody radiation)
- Evidence for Big Bang theory
- Formed ~380,000 years after Big Bang

**Dark matter and dark energy**:
- Dark matter: ~27% of universe, interacts gravitationally but not electromagnetically
- Dark energy: ~68% of universe, causes accelerated expansion
- Ordinary matter: ~5% of universe

**Common pitfalls**:
- Cosmological redshift is NOT Doppler shift (it's due to space expansion)
- Universe has no center or edge (homogeneous and isotropic on large scales)
- Big Bang is NOT an explosion in space (it's expansion of space itself)

---

### **Condensed Matter Physics (Basics)**

#### **1. Crystal Structure**
**IDENTIFY signals**: "crystal lattice", "unit cell", "Bravais lattice", "Miller indices"

**Key concepts**:
- Periodic arrangement of atoms in solids
- Unit cell: Smallest repeating unit
- Lattice types: Simple cubic, FCC, BCC, etc.

**Miller indices**: Notation for crystal planes (e.g., (100), (111))

**X-ray diffraction**: Bragg's law $n\lambda = 2d\sin\theta$
- Used to determine crystal structure

**Common pitfalls**:
- Not all solids are crystalline (amorphous materials exist)
- Miller indices are reciprocals of intercepts
- Bragg condition requires constructive interference from planes

#### **2. Band Theory (Qualitative)**
**IDENTIFY signals**: "energy bands", "valence band", "conduction band", "band gap", "semiconductor"

**Key concepts**:
- **Conductor**: Overlapping valence and conduction bands (free electron motion)
- **Insulator**: Large band gap (few electrons excited to conduction band)
- **Semiconductor**: Small band gap (conductivity increases with temperature)

**Intrinsic semiconductor**: Pure material (Si, Ge)
**Extrinsic semiconductor**: Doped material
- **n-type**: Extra electrons (donor atoms like P in Si)
- **p-type**: Holes (acceptor atoms like B in Si)

**Common pitfalls**:
- Temperature increases conductivity in semiconductors (opposite of metals)
- Band gap energy determines whether material is conductor/semiconductor/insulator
- Doping changes carrier concentration dramatically

---

## Flashcard Strategy for Physics

### **Conceptual Before Computational**
Always create understanding cards before calculation cards.

**Recommended order**:
1. **Definition/concept** (C: or Q:/A:)
2. **"Why" or "when to use"** (Q:/A:)
3. **Formula** (C:)
4. **Simple methodology** (P:/S: compact)
5. **Complex multi-step** (P:/S: full ISAE)

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

# Step 4: Simple methodology
P: An object moves from position $x_0$ to $x_f$ in time $t$. How do you find average velocity?
S:
**IDENTIFY**: Kinematics - average velocity definition
**SET UP**: Known: $x_0$, $x_f$, $t$. Unknown: $\bar{v}$
**APPROACH**: Use $\bar{v} = \frac{\Delta x}{\Delta t} = \frac{x_f - x_0}{t}$
**EVALUATE**: Units [m]/[s] = [m/s] ✓, sign indicates direction ✓

# Step 5: Complex problem
[Multi-step kinematics with full ISAE]
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

# Problem (methodology-focused)
P: An object of mass $m$ has net force $F$. How do you find its acceleration?
S:
**IDENTIFY**: Newton's second law problem
**SET UP**: Known: $m$, $F$. Unknown: $a$. Use $\sum F = ma$
**APPROACH**: Rearrange to solve for $a$: $a = F/m$
**EVALUATE**: Units [N]/[kg] = [m/s²] ✓, larger force → larger $a$ ✓, larger mass → smaller $a$ ✓
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

## Example Problem Card (Full ISAE)

```markdown
P: A block of mass $m$ slides down a frictionless incline of angle $\theta$ from rest. After sliding a distance $d$ along the incline, how do you find its speed?

S:
**IDENTIFY**: Energy conservation problem (frictionless → no non-conservative work)

**SET UP**:
- Known: $m$, $\theta$, $d$, $v_0 = 0$
- Unknown: $v$ (speed after sliding distance $d$)
- Approach: Use energy conservation $E_i = E_f$ → $U_{g,i} + K_i = U_{g,f} + K_f$
- Height drop: $h = d\sin\theta$

**APPROACH**:
Initial state: $E_i = mgh + 0$ (at rest, so $K_i = 0$)
Final state: $E_f = 0 + \frac{1}{2}mv^2$ (take this as reference level)

Set equal:
$$mgh = \frac{1}{2}mv^2$$

Mass cancels:
$$gh = \frac{1}{2}v^2$$

Solve for $v$:
$$v = \sqrt{2gh} = \sqrt{2gd\sin\theta}$$

**EVALUATE**:
- Units: $\sqrt{[m/s^2][m]} = \sqrt{[m^2/s^2]} = [m/s]$ ✓
- Sign: Speed is always positive ✓
- Limiting cases:
  - If $\theta = 0°$ (flat), then $v = 0$ ✓
  - If $\theta = 90°$ (free fall), then $v = \sqrt{2gd}$ (correct free fall formula) ✓
- Mass independence: $m$ canceled (expected for frictionless energy problem) ✓
- Alternative check: Could solve with kinematics using $a = g\sin\theta$ (would give same result)
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

## Additional Resources

When creating flashcards, consult:
- Your course textbook's problem-solving sections
- Worked examples that demonstrate systematic approaches
- [CLAUDE.md](CLAUDE.md) for universal SRS principles and card formats

---

**Last updated**: 2025-11-22
**Scope**: Comprehensive physics coverage from introductory to advanced undergraduate/early graduate level
**Topics covered**:
- **Classical Mechanics**: Kinematics, dynamics, energy, circular motion, oscillations, rotational motion, gravitation, momentum/collisions, Lagrangian/Hamiltonian mechanics
- **Thermodynamics & Statistical Mechanics**: Temperature, heat transfer, laws of thermodynamics, thermodynamic processes, entropy, Boltzmann distribution, partition functions
- **Electricity & Magnetism**: Electrostatics, DC/AC circuits, magnetism, electromagnetic induction, Maxwell's equations, electromagnetic waves
- **Waves & Optics**: Wave motion, sound, geometric optics, physical optics (interference, diffraction), refraction, polarization
- **Quantum Mechanics**: Wave-particle duality, Schrödinger equation, operators, uncertainty principle, particle in a box, harmonic oscillator, hydrogen atom
- **Special Relativity**: Lorentz transformations, time dilation, length contraction, relativistic energy/momentum, velocity addition
- **Nuclear & Particle Physics**: Nuclear structure, radioactive decay, fission/fusion, fundamental particles, quarks/leptons
- **General Relativity & Cosmology**: Equivalence principle, curved spacetime, black holes, gravitational waves, expanding universe, CMB
- **Condensed Matter**: Crystal structure, band theory, semiconductors

**Format**: Designed for spaced repetition flashcard systems
**Framework**: ISAE (Identify, Set Up, Approach, Evaluate) with variables only
