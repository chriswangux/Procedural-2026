# Process Journal: Building "Procedural Design" Interactive Experience

*A reflective account of transforming a presentation deck into a 21-section interactive web experience.*

---

## The Starting Point

The source material was a Google Slides presentation titled **"Procedural Design: Design for & with AI"** (2019), created by a designer on an assistant team. The deck explores procedural generation, AI-augmented creativity, and the philosophy of "designing the machine that designs the design." It spans four themes and draws from examples across games (No Man's Sky, Firewatch), film (Pixar, Sony Animation), design tools (Autodesk, Adobe), and AI research (OpenAI, Nvidia).

The challenge: take a linear slide deck of 80+ slides and transform it into something that *embodies* its own ideas — an interactive, participatory experience rather than a passive reading.

---

## Phase 1: Extracting the Source Material

**Prompt:** "Can you read all the slides from this Google Slides?"

**What happened:** Multiple approaches were tried to access Google Slides programmatically — the published version, export URLs, the embed endpoint. Partial content came through (slides 1-10), but the remainder was encoded inside JavaScript data structures that resisted clean extraction.

**Decision point:** Rather than spending more time on brittle parsing, asked the user to export the deck as PDF. They did.

**Outcome:** Successfully extracted all 644 lines of text content via `pdftotext`, revealing the full structure of the deck — every section heading, every reference, every idea. This became the canonical source document for everything that followed.

**Lesson:** Sometimes the fastest path to completeness is to ask for a format change rather than engineer around a format limitation.

---

## Phase 2: First Build — The Prototype (v1.0)

**Prompt:** "Make a worldclass top quality interactive web experience to capture the themes and ideas from this deck. Use agent teams and subagents."

### Methodology

Rather than building sequentially (section 1, then section 2, then section 3...), the work was organized as a parallel agent team with 5 builders, each responsible for one interactive section. This mirrored the deck's own theme of "multi-threaded, real-time exploration" versus "linear, single-threaded" work.

Each agent received:
- A detailed spec of what their section should demonstrate
- A strict module interface pattern (init / start / stop / resize)
- The shared visual language (dark backgrounds, accent colors, smooth interactions)

### What the agents built

- A **particle flow-field hero section** responding to cursor movement
- A **procedural planet generator** (inspired by No Man's Sky)
- An **interactive spider web simulation** (inspired by Pixar's procedural tools)
- A **direct-vs-semantic manipulation face editor**
- A **generative design grid** with interpolation controls

### Assembly

A lead agent assembled everything into a single HTML orchestrator with lazy-loading via IntersectionObserver. Each module's init/start/stop/resize contract made this integration trivial — any agent's output plugged into the same framework.

### Outcome

9 sections, 5 interactive demos, approximately 5,500 lines of code. Deployed to GitHub Pages as a working site.

---

## Phase 3: The Expansion Realization

**Prompt:** "I love it... however you only captured a few specific ideas. Were you able to see more ideas from the original deck? If so, I'd like you to be exhaustive."

### The gap analysis

The v1 build had captured the 4 high-level themes but only about 5 of the roughly 25 specific ideas and examples from the deck. Many references were absent:

- Spider-Verse's procedural shading language
- Firewatch's parametric color systems
- GauGAN's lo-fi-to-hi-fi pipeline
- Semantic lighting and scene understanding
- Emergent multi-agent behavior
- Parametric architecture (Zaha Hadid-style)
- Accessible color generation (ColorBox)
- The full animation spectrum (from inverse kinematics to reinforcement learning + imitation)

### Planning approach

A systematic audit was done of every slide, cataloging each distinct idea. Twelve new interactive sections were designed to fill the gaps. Related ideas were grouped together — for example, Semantic Animation + Rigging + Motion became a single unified section rather than three thin ones.

This grouping decision was important. It meant each section had enough conceptual weight to justify a full interactive demo, rather than spreading ideas too thin.

---

## Phase 4: Saving the First Version

**Prompt:** "Before you start on the next phase, I want to make sure we have a save of this first version."

**Decision:** Created `git tag v1.0` — a permanent snapshot the user could always return to.

This is an underappreciated practice. Before doing major expansions on working software, always create a named checkpoint. The cost is zero, and the safety net it provides is invaluable. If the expansion had gone badly, v1.0 was always there.

---

## Phase 5: The Full Build (v2.0)

### Agent team structure

The build scaled up to 6 parallel builder agents, each handling 2-3 related sections:

| Agent | Responsibility | Sections |
|-------|---------------|----------|
| 1 | Artistic rendering | Spider-Verse, Firewatch, Style Transfer |
| 2 | Design tools | Layout Generation, Variable Fonts |
| 3 | Scene rendering | Lo-fi-to-Hi-fi, Semantic Lighting |
| 4 | Character animation | Semantic Walk Cycle, Animation Spectrum |
| 5 | Complex simulation | Emergent Multi-Agent |
| 6 | Generative systems | Parametric Architecture, ColorBox Color |

### Why this grouping

Agents building related sections could maintain consistent visual language, share patterns (the animation agents share skeleton rendering logic), and produce more cohesive results. An agent working on both "Walk Cycle" and "Animation Spectrum" naturally makes them feel like they belong together — because the builder understands both contexts.

This is a form of **locality of reference** applied to creative work. Keep related decisions close together, and the results will be more coherent.

### Assembly and integration

After all agents completed (approximately 3 minutes of parallel execution), the orchestrator HTML was rewritten with the full 21-section flow. New additions:

- **Theme bridge headers** between groups, giving the experience a narrative arc
- **Expanded navigation dots** with theme-based grouping (not just a flat list)
- **Error handling** for module initialization, so a failure in one section does not cascade

### Outcome

21 sections, 17 interactive demos, approximately 14,600 lines of code. Tagged as v2.0.

---

## Reflections on Methodology

### What worked well

**Parallel agent teams dramatically accelerated the build.** Twelve sections built simultaneously instead of sequentially. The total wall-clock time was roughly the time of the slowest single section, not the sum of all sections.

**The strict module pattern made integration trivial.** By enforcing the same interface contract (init / start / stop / resize) across all agents, any output could plug into the orchestrator without custom integration code. This is the same principle behind Unix pipes or React component interfaces — agree on the shape, and composition becomes easy.

**Lazy loading kept performance manageable.** With 17 interactive canvases, loading and running everything at once would have been untenable. IntersectionObserver-based activation meant only visible sections consumed resources.

**Version tagging before major changes provided a safety net.** Knowing v1.0 was preserved made the expansion a low-risk endeavor.

### What the process reveals

The meta-connection between *how* this was built and *what* the deck talks about is hard to ignore:

- **Human in the Loop:** The user directed the creative vision and made the key editorial decisions (which ideas matter, when to expand, when to save). The AI agents handled implementation details.
- **Exploration at Scale:** Six agents explored different design spaces simultaneously, each producing interactive interpretations of abstract concepts.
- **Procedural, not manual:** Every section is generated from parameters and rules, not hand-crafted pixels. The planet generator uses noise functions. The spider web uses physics simulation. The architecture uses parametric curves. The medium matches the message.
- **Participatory:** The interactive demos let viewers participate in the ideas rather than just read about them. You do not read about flow fields — you move your cursor and see them respond.

### The cost of exhaustiveness

The expansion from 5 to 17 interactive demos (v1 to v2) was a deliberate choice by the user. The v1 was complete and functional — it told the story. The v2 tells the *full* story, with every reference from the original deck given its own interactive moment.

This is a design tradeoff. More sections means more to explore, but also more to maintain, more to load, and a longer scroll. The theme bridge headers and grouped navigation help manage this complexity, but the decision to be exhaustive is a philosophical one — this experience is a reference work, not a quick read.

---

## Final Statistics

| Metric | v1.0 | v2.0 |
|--------|------|------|
| Total sections | 9 | 21 |
| Interactive demos | 5 | 17 |
| Lines of code | ~5,500 | ~14,600 |
| Builder agents | 5 | 6 (phase 2) |
| Total agents involved | 6 | 11 (across both phases) |
| Source material | 644 lines of extracted text | Same |

From a PDF export to a live 21-section interactive web experience with 14,600 lines of code, built by 11 AI agents coordinated in two team phases. The entire process — from first slide extraction to final deployment — was a demonstration of the very ideas the deck set out to explore.

---

## Phase 3: Polish & Accessibility (v2.0 → v2.1)

After the exhaustive build, a refinement phase addressed usability and visual polish through iterative user feedback.

### The Accessibility Pass

The user noticed that many text labels were hard to read against the dark background. A systematic audit revealed widespread contrast issues — text alpha values of 0.15–0.35 produced contrast ratios well below WCAG AA minimums.

**Approach:** Spawned 4 parallel accessibility agents, each responsible for a group of files. They audited every `fillStyle`/`color` value used for text and bumped low-contrast values to meet WCAG AA (4.5:1 for normal text, 3:1 for large text). 70 fixes across all 18 files, while carefully preserving decorative elements (glows, backgrounds, particle effects).

**Key lesson:** Dark themes are beautiful but demand vigilance on text contrast. Alpha values that "look fine" on a bright monitor often fail on dimmer screens or in ambient light.

### Interaction Refinements

Several rounds of focused feedback improved specific interactions:

- **Exploration modes**: Made taller (260px → 480px) and clickable — users can now pin a mode or let it auto-cycle. Replaced rigid bounding boxes with a playful animated wavy underline.
- **Style transfer**: Fixed a bug where cards grew ~1px per click due to subpixel rounding in canvas sizing.
- **Multi-threaded tree**: Expanded from 50% to 88% of canvas width with a third generation of branches, matching the visual scale of the other exploration modes.

### Reflections on the Polish Phase

This phase was fundamentally different from the build phases. Instead of parallel construction, it was iterative refinement driven by visual feedback. The user spotted issues that no amount of automated testing would catch — aesthetic choices (bounding box vs underline), proportional feel (tree too narrow), and real-world readability (text too dim).

This mirrors the deck's "Human in the Loop" theme perfectly: the AI built the system, but the human directed the refinement through taste and judgment.

---

## Phase 4: The Intellectual Heart — Rebuilding the Intuitions Section

The most intellectually interesting part of the deck wasn't the demos — it was the story on pages 131+. The user's "Intuitions" section traced how character animation evolved through the same paradigm shifts as the broader AI field.

### The Thesis

Both Computer Graphics and AI independently discovered the same fundamental insight: **the breakthrough isn't pure supervised learning or pure RL — it's combining RL with human-aligned constraints.**

In CG, this was DeepMimic (2018): RL + reference motion capture data as reward. In AI, this was RLHF/ChatGPT (2022): RL + human preference data as reward. The CG field arguably discovered this formula 4 years earlier.

### The Challenge

The user explicitly asked: "I'm not a researcher, so challenge my thoughts and improve them." This led to a research phase that:
- Confirmed the parallel is fundamentally sound
- Corrected minor timeline details (DeepMind's locomotion paper was 2017, not later)
- Suggested adding AlphaStar and the "emergence" parallel (emergent locomotion ↔ emergent LLM capabilities)
- Strengthened the thesis by noting the 2017 simultaneity — both fields hit the "RL learns from self-play" milestone in the same year

### The Rebuild

The existing `animspectrum.js` (5 stick figures in a row) was replaced with a rich 6-step narrative that tells the story with animated demos, trade-off analysis, and a dual timeline showing CG and AI milestones side-by-side. Step 5 is the dramatic highlight — where both timelines converge on the same insight.

This section became the intellectual centerpiece of the entire experience. It's no longer just a demo — it's an argument.

---

## Updated Statistics

| Metric | v1.0 | v2.0 | v2.1 |
|--------|------|------|------|
| Sections | 9 | 21 | 21 |
| Interactive demos | 5 | 17 | 17 |
| Lines of code | ~5,500 | ~14,600 | ~14,850 |
| Builder agents | 5 | 6 | — |
| Polish agents | — | — | 4 (accessibility) |
| Total agents | 6 | 11 | 15 |
| Accessibility | Unchecked | Unchecked | WCAG AA |
| Git tags | — | v1.0, v2.0 | v1.0, v2.0, v2.1 |
