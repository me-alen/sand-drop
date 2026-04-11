# Sand Drop

Interactive browser-based sand simulation built with React + TypeScript.  
Drop grains, create pile explosions, and switch between vibrant and pure sand visuals.

## Live Demo

- [sand-drop.vercel.app](https://sand-drop.vercel.app)

## Features

- Real-time sand dropping with gravity + slide behavior
- Smooth color cycling mode for dropped grains
- Pure sand mode with natural sand tones
- Click-and-hold charged explosions (bigger hold = bigger blast)
- Parabolic explosion trajectories with momentum-aware settling
- Automatic collapse of unsupported grains after blasts
- Randomized base sand terrain on load
- Random sand castle generation at startup
- Keyboard control for grain amount per drop

## Controls

- **Click / drag**: drop sand
- **Arrow Up**: increase grains per drop
- **Arrow Down**: decrease grains per drop
- **Hold click on an existing pile**: charge explosion
- **Release after hold**: trigger explosion
- **Top-right mode toggle**: switch `Colored` / `Pure Sand`

## Tech Stack

- React 18
- TypeScript
- Create React App (`react-scripts`)
- Sass (minimal global styling)

## Project Structure

```text
src/
  app/canvas/
    canvas.tsx              # Main simulation orchestration
    constants.ts            # Simulation/config constants
    types.ts                # Shared type definitions
    castle.ts               # Castle generation logic
    ModeToggle.tsx          # UI toggle component
    ChargePreviewRing.tsx   # Explosion charge indicator
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

## Notes

- If the favicon looks stale after updates, hard refresh (`Cmd+Shift+R`) to clear browser icon cache.
- Browserslist warning can be updated with:

```bash
npx update-browserslist-db@latest
```
