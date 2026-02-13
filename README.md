# Procedural Design — Interactive Web Experience

An interactive web experience capturing the themes and ideas from the **Procedural Design: Design for & with AI** presentation (First Draft, 2019).

> *"Design the machine that designs the design."*

## Live Experience

Open `index.html` in any modern browser. No build step, no dependencies, no server required.

**Navigation:** Scroll, click the side dots, or use keyboard arrows (Up/Down).

## Sections

| # | Section | Interactive Element |
|---|---------|-------------------|
| 1 | **Hero** | Flow-field particle system (1200 particles, simplex noise). Particles orbit your cursor — a metaphor for human-in-the-loop. |
| 2 | **Intro** | "Design the machine that designs the design" — core thesis and procedural definition. |
| 3 | **Themes** | Four-card overview: Human in the Loop, Exploration at Scale, Semantic Manipulation, Participatory Design. |
| 4 | **Planets** | Procedural planet generator. 8 planet types, sphere-mapped Perlin noise, atmosphere glow, rings. Shows "~5 devs to 18 quintillion planets." Enter a seed or generate random worlds. |
| 5 | **Spider Web** | Pixar-inspired cobweb simulation. Click to place anchors, watch virtual spiders weave. Sliders for density, tension, speed. |
| 6 | **Semantic Manipulation** | Split-view comparing Direct Manipulation (1982) vs Semantic Manipulation (2019). Drag 16 handles on the left vs move 4 semantic sliders on the right to shape the same face. |
| 7 | **Exploration at Scale** | 4x4 generative design grid with parameter sliders, A-to-B interpolation, and animated exploration mode diagrams (linear, multi-threaded, agentive). |
| 8 | **Participatory Design** | Specification-based vs simulation-based design paradigm shift. |
| 9 | **Closing** | "Art challenges technology, and technology inspires the art." |

## Technical Details

- **Zero dependencies** — pure vanilla JavaScript + Canvas API
- **~5,500 lines** of hand-written procedural code across 6 files
- **Performance optimized** — IntersectionObserver activates/deactivates section animations based on visibility
- **Responsive** — works on desktop and tablet with DPR-aware canvas rendering
- **Keyboard navigation** — Arrow Up/Down, Page Up/Down

### File Structure

```
index.html                    # Main assembled experience (orchestrator + styles)
sections/
  hero.js                     # Flow-field particle system (simplex noise)
  planets.js                  # Procedural planet generator (Perlin noise, sphere mapping)
  spiderweb.js                # Interactive spider web simulation (agent-based)
  semantic.js                 # Direct vs Semantic manipulation demo
  exploration.js              # Generative design grid + interpolation + modes
original-deck/
  Procedural Design (Public).pdf   # Source presentation
```

### Key Algorithms

- **Simplex/Perlin noise** with Fractal Brownian Motion (up to 6 octaves) for organic terrain, flow fields, and surface textures
- **Sphere-mapped UV projection** with bilinear texture sampling for planet rendering
- **Agent-based simulation** for spider web weaving (path following, thread building phases)
- **Catenary approximation** for physics-based thread sag
- **Parametric design system** with seeded PRNG for deterministic, reproducible generative patterns

## Origin

Based on a presentation by chriswangux@ exploring procedural generation, AI-augmented creativity, and behavior/environment modeling. Examples drawn from No Man's Sky, Pixar (spider webs, semantic animation), Sony Animation (Spider-Verse), Autodesk generative design, and more.

## Build Process

This experience was built using Claude Code with a team of 5 parallel AI agents, each responsible for one interactive section, coordinated by a lead agent that assembled the final experience. Total build time: ~5 minutes.
