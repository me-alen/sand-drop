# Pour an Ocean

Interactive browser-based sandbox built with React + TypeScript.
Pour sand, flood it with water, and watch a living seabed take hold — kelp
forests, coral reefs, fish, squid and octopuses — under a sky that runs a full
day and night every five minutes. Build with stone, dig with the eraser, and
set off charged explosions, on desktop or on your phone.

## Live Demo

- [pour-an-ocean.vercel.app](https://pour-an-ocean.vercel.app)

## Features

- Canvas-based falling-sand engine — the whole scene renders as a single
  `<canvas>` backed by a typed-array grid, so performance stays flat no matter
  how much sand piles up
- Materials encoded in the grid's alpha byte:
  - **Sand** — pours, piles, and avalanches when slopes get too steep
  - **Water** — flows sideways, levels out, and gets displaced when sand sinks
    through it
  - **Stone** — paint solid ledges and shelters; immune to explosions
  - **Kelp** and **coral** — grow on their own in standing water
  - **Eraser** — dig tunnels and carve terrain
- A living seabed: flood a deep enough pool and it seeds itself
  - Kelp rises to its own height, up to 80% of the local depth, so the bed has
    a ragged silhouette instead of one flat line
  - Coral builds vibrant pillar clumps — cactus, staghorn and fan silhouettes —
    capped at a quarter of the depth, over about a quarter of the floor
  - Neither ever breaks the surface, and both die back when the water drains
  - Ten species, each with its own habitat: a creature only appears once the
    ocean is wide and deep enough for it, and leaves again if you drain it.
    Fish, clams, starfish and crabs turn up in a puddle; squid and octopuses
    want a proper pool; jellyfish and turtles need real depth; sharks want a
    third of the scene under water; a whale will only show up once more than
    half of it is deep ocean
  - Everything that swims roams the whole body of water rather than pacing
    one spot
  - One large rock outcrop per session, rooted to the bottom, in one of three
    shapes at a random size
- A five-minute day: sunrise, an arcing sun, sunset, then a moon and stars
- Click-and-hold charged explosions with ballistic debris, flash, shockwaves,
  sparks, screen shake — and a charge indicator that gathers energy inward
- Sand castles are packed sand: they stand firm until a blast crumbles them
  into loose grains
- Synthesized sound effects (pour hiss, charge whine, layered boom) via the
  Web Audio API — no audio files, mutable from the HUD
- Haptic feedback on mobile (full charge + detonation)
- Tilt gravity: enable the 📱 toggle on a phone and tip the world sideways
- Crescent moon and sun that arc overhead, a starfield that fades out by day,
  and occasional shooting stars
- Sandbox auto-saves to localStorage and restores on the next visit
- Share button exports a PNG snapshot (native share sheet on mobile)
- Installable PWA with offline support (service worker precaches the app)
- Full touch support with an on-screen material picker and grains-per-drop
  control

## Controls

- **Tap / click / drag**: use the selected brush (sand, water, stone, erase)
- **Hold on solid ground** (sand brush): charge an explosion, release to
  detonate — longer hold, bigger blast
- **Arrow Up / Down** or the **− / + pill**: change grains per drop
- **Top-left**: pick the material brush and the grains-per-drop count
- **Top-right**: mute, tilt gravity (touch devices), share snapshot, reset

## Tech Stack

- React 18 + TypeScript
- Create React App (`react-scripts`)
- Canvas 2D rendering (no per-grain DOM nodes)
- Web Audio API (synthesized sound)
- Workbox service worker (PWA/offline)
- Sass (global styling)

## Project Structure

```text
src/
  app/canvas/
    canvas.tsx              # React wrapper: pointer input, HUD state, engine lifecycle
    engine.ts               # Falling-sand engine: materials, particles, effects, rendering
    audio.ts                # Synthesized Web Audio sound effects + haptics
    storage.ts              # RLE grid persistence + settings (localStorage)
    color.ts                # HSL -> packed RGBA helpers; material byte utilities
    constants.ts            # Simulation/config constants
    castle.ts               # Castle generation logic
    sky.ts                  # Day/night phase, sky gradient, sun and moon arcs
    flora.ts                # Kelp and coral: seeding, growth caps, die-back
    rocks.ts                # The seabed's rock outcrop
    life.ts                 # Aquatic species: habitats, sprites, movement
    Hud.tsx                 # Material picker, counters, toggles
    InstructionOverlay.tsx  # On-screen instruction UI
  service-worker.ts         # Workbox service worker (offline/PWA)
  serviceWorkerRegistration.ts
  App.tsx
  index.tsx
  styles/main.scss
```

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Run development server

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm start` - start development server
- `npm run build` - create production build (includes the service worker)
- `npm test` - run tests
- `npm run eject` - eject CRA config (irreversible)

## Deployment

Production build output is generated in `build/`:

```bash
npm run build
```

Current homepage setting in `package.json` points to:

- `https://pour-an-ocean.vercel.app`
