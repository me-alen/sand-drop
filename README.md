# Sand Drop

Interactive browser-based sand simulation built with React + TypeScript.
Pour grains, build dunes, and set off charged explosions under a starlit sky.

## Live Demo

- [sand-drop.vercel.app](https://sand-drop.vercel.app)

## Features

- Canvas-based falling-sand engine — the whole scene renders as a single
  `<canvas>` backed by a typed-array grid, so performance stays flat no matter
  how much sand piles up
- Real-time pouring with gravity, sliding, and natural pile formation
- Click-and-hold charged explosions (longer hold = bigger blast) with real
  ballistic arcs for the displaced grains
- Explosion juice: flash, expanding shockwaves, sparks, and screen shake
- Charge-up indicator: a breathing glow with inward-contracting energy rings
  and a progress dial
- Automatic collapse of unsupported sand after blasts
- Rainbow mode (smooth hue cycling) and pure-sand mode
- Twinkling starfield over a night-sky gradient
- Randomized dune terrain and a random sand castle on load, plus a Reset button
- Full touch support — playable on phones and tablets
- On-screen grains-per-drop control (also mapped to arrow keys)

## Controls

- **Tap / click / drag**: pour sand
- **Hold on sand**: charge an explosion, release to detonate
- **Arrow Up / Down** or the **− / + pill**: change grains per drop
- **Top-right toggle**: switch `Rainbow` / `Pure Sand`
- **↺ Reset**: regenerate the terrain and castle

## Tech Stack

- React 18
- TypeScript
- Create React App (`react-scripts`)
- Canvas 2D rendering (no per-grain DOM nodes)
- Sass (global styling)

## Project Structure

```text
src/
  app/canvas/
    canvas.tsx              # React wrapper: pointer input, HUD state, engine lifecycle
    engine.ts               # Falling-sand engine: grid, particles, effects, rendering
    color.ts                # HSL -> packed RGBA color helpers
    constants.ts            # Simulation/config constants
    castle.ts               # Castle generation logic
    Hud.tsx                 # Mode toggle, reset, grains-per-drop controls
    InstructionOverlay.tsx  # On-screen instruction UI
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
- `npm run build` - create production build
- `npm test` - run tests
- `npm run eject` - eject CRA config (irreversible)

## Deployment

Production build output is generated in `build/`:

```bash
npm run build
```

Current homepage setting in `package.json` points to:

- `https://sand-drop.vercel.app`
