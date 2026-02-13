# Procedural Design — Interactive Web Experience

An exhaustive interactive web experience capturing every theme, idea, and example from the **Procedural Design: Design for & with AI** presentation (First Draft, 2019).

> *"Design the machine that designs the design."*

## Live Experience

Open `index.html` in any modern browser. No build step, no dependencies, no server required.

**Navigation:** Scroll, click the side dots (grouped by theme), or use keyboard arrows (Up/Down).

## Sections (21 total)

### Opening
| # | Section | Interactive Element |
|---|---------|-------------------|
| 1 | **Hero** | Flow-field particle system (1200 particles, simplex noise). Particles orbit your cursor. |
| 2 | **Intro** | "Design the machine that designs the design" — core thesis. |
| 3 | **Themes** | Four-card overview of the presentation's themes. |

### Theme 1: Human in the Loop
| # | Section | Interactive Element |
|---|---------|-------------------|
| 4 | **Spider-Verse Shading** | Draw strokes, system adds comic-style cross-hatching and ink marks. "Artist demonstrates intent, AI fills in-betweens." |
| 5 | **Firewatch Color/Tone** | Layered landscape with time-of-day slider. Full palette shifts procedurally — dawn pinks to night navy. Parallax on hover. |
| 6 | **Style Transfer** | One procedural composition rendered in 6 styles simultaneously: wireframe, watercolor, oil paint, pixel art, comic, woodcut. |

### Theme 2: Exploration at Scale
| # | Section | Interactive Element |
|---|---------|-------------------|
| 7 | **Planets** | Procedural planet generator. 8 types, sphere-mapped Perlin noise, atmosphere, rings. "~5 devs → 18 quintillion planets." |
| 8 | **Exploration Grid** | 4x4 generative design grid, parameter sliders, A-to-B interpolation, exploration mode diagrams. |
| 9 | **Layout Generation** | Procedural page layouts on a 12-column grid. Presets: magazine, blog, dashboard, portfolio. |
| 10 | **Variable Font** | Bezier letterforms with 4 axes (weight, width, optical size, slant). Design-space grid visualization. |

### Theme 3: Semantic Manipulation
| # | Section | Interactive Element |
|---|---------|-------------------|
| 11 | **Semantic Faces** | Direct Manipulation (16 handles) vs Semantic Manipulation (4 sliders) controlling the same face. |
| 12 | **Lofi-to-Hifi** | Paint semantic color blocks (sky, water, trees, mountains). System generates textured landscape in real-time. |
| 13 | **Semantic Lighting** | 2D scene with semantic controls: time-of-day, weather, drama, season. Shadows and god rays update automatically. |
| 14 | **Semantic Animation** | Stick figure walk cycle controlled by mood/energy/weight/style sliders vs direct joint parameters. |

### Theme 4: Participatory Design
| # | Section | Interactive Element |
|---|---------|-------------------|
| 15 | **Participatory** | Specification-based → simulation-based design paradigm shift. |
| 16 | **Emergent Agents** | Multi-agent simulation with foragers, builders, scouts. Pheromone trails, flocking, emergent cooperation. |

### More on Procedural
| # | Section | Interactive Element |
|---|---------|-------------------|
| 17 | **Spider Web** | Pixar-inspired cobweb simulation. Click to place anchors, watch virtual spiders weave. |
| 18 | **Parametric Architecture** | Building facade generator. Sliders: curvature, column density, span, height, organic factor. |
| 19 | **ColorBox** | HSL curve editor generating accessible color palettes. WCAG contrast ratios, luminosity sensitivity visualization. |

### Intuitions
| # | Section | Interactive Element |
|---|---------|-------------------|
| 20 | **Animation Spectrum** | 5 stick figures animated by different methods: IK → PFNN → RL+Physics → DeepMimic → RL+IL+Procedural. Trade-off matrix. |
| 21 | **Closing** | "Art challenges technology, and technology inspires the art." |

## Technical Details

- **Zero dependencies** — pure vanilla JavaScript + Canvas API
- **~14,600 lines** of procedural code across 17 JS modules
- **17 interactive sections** — each a standalone module with `init/start/stop/resize` API
- **Lazy loading** — IntersectionObserver activates/deactivates animations based on visibility
- **Responsive** — desktop and tablet with DPR-aware canvas rendering
- **Keyboard navigation** — Arrow Up/Down, Page Up/Down

### File Structure

```
index.html                      # Orchestrator (lazy loading, navigation, theme bridges)
sections/
  hero.js                       # Flow-field particles (simplex noise)
  spiderverse.js                # Comic-style procedural shading
  firewatch.js                  # Procedural color/tone landscapes
  styletransfer.js              # 6-style rendering comparison
  planets.js                    # Procedural planet generator (Perlin, sphere mapping)
  exploration.js                # Generative design grid + interpolation
  layoutgen.js                  # Procedural page layout generator
  variablefont.js               # Variable font axis interpolation
  semantic.js                   # Direct vs Semantic face manipulation
  lofihifi.js                   # Semantic painting → textured landscape
  semanticlighting.js           # Semantic scene lighting controls
  semanticanimation.js          # Semantic character walk cycle
  emergent.js                   # Multi-agent emergent behavior simulation
  spiderweb.js                  # Interactive spider web simulation
  parametricarch.js             # Parametric architecture generator
  colorbox.js                   # Programmatic accessible color palettes
  animspectrum.js               # Animation method comparison spectrum
original-deck/
  Procedural Design (Public).pdf
```

## Origin

Based on a presentation by chriswangux@ exploring procedural generation, AI-augmented creativity, and behavior/environment modeling. References: No Man's Sky, Pixar (spider webs, semantic animation), Sony Animation (Spider-Verse), Campo Santo (Firewatch), Nvidia (GauGAN), Autodesk (generative design, Flame), Promethean AI, OpenAI (emergent behavior), ColorBox.io, Inter variable font, and more.

## Build Process

- **v1.0**: 9 sections, built by 5 parallel AI agents (~5 min)
- **v2.0**: Expanded to 21 sections with 12 new interactive demos, built by 6 parallel AI agents covering every idea from the original deck
