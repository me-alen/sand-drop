// The seabed's rock outcrop. Like castle.ts, all grid access is injected so
// the placement logic can be unit-tested against a plain Map.
//
// One formation is laid down per session. It is filled from its silhouette all
// the way down to the last row, so there is never sand underneath it — the
// whole piece is bedrock connected to the bottom of the world, not a boulder
// balanced on the surface. Shape, width and height are randomised so no two
// sessions get the same rock.
import { hslToPackedColor } from './color';
import {
    MATERIAL_STONE,
    ROCK_EDGE_ROUGHNESS_CELLS,
    ROCK_HUE_MAX,
    ROCK_HUE_MIN,
    ROCK_LIGHTNESS_MAX,
    ROCK_LIGHTNESS_MIN,
    ROCK_MAX_HALF_WIDTH_CELLS,
    ROCK_MAX_PEAK_RATIO,
    ROCK_MIN_HALF_WIDTH_CELLS,
    ROCK_MIN_PEAK_RATIO,
    ROCK_SATURATION
} from './constants';

export const ROCK_SHAPES = ['dome', 'spire', 'ridge'] as const;
export type RockShape = (typeof ROCK_SHAPES)[number];

export type RockContext = {
    cols: number;
    rows: number;
    // Topmost solid row of the terrain in this column, or `rows` if empty.
    surfaceAt: (x: number) => number;
    setCell: (x: number, y: number, color: number) => void;
    random: () => number;
};

export type RockFormation = {
    shape: RockShape;
    centerX: number;
    halfWidth: number;
    peak: number; // cells the summit stands above the sand surface
};

// Height of the silhouette at normalised offset t in [-1, 1], as a fraction of
// the peak. Each shape reads differently from a distance.
export const rockProfile = (shape: RockShape, t: number): number => {
    const a = Math.min(1, Math.abs(t));
    if (shape === 'spire') return Math.pow(1 - a, 1.9); // narrow, tapering pinnacle
    if (shape === 'ridge') return Math.min(1, (1 - a) * 2.6); // broad, flat-topped mesa
    return Math.sqrt(Math.max(0, 1 - a * a)); // dome: rounded boulder
};

const rockColor = (random: () => number, shade: number): number => {
    const mottle = 0.8 + random() * 0.4;
    const lightness = Math.min(
        ROCK_LIGHTNESS_MAX,
        ROCK_LIGHTNESS_MIN + shade * mottle * (ROCK_LIGHTNESS_MAX - ROCK_LIGHTNESS_MIN)
    );
    return hslToPackedColor(
        ROCK_HUE_MIN + random() * (ROCK_HUE_MAX - ROCK_HUE_MIN),
        ROCK_SATURATION,
        lightness,
        MATERIAL_STONE
    );
};

// Picks a formation that fits inside the grid.
export const planRockFormation = (ctx: RockContext): RockFormation => {
    const maxHalf = Math.max(
        ROCK_MIN_HALF_WIDTH_CELLS,
        Math.min(ROCK_MAX_HALF_WIDTH_CELLS, Math.floor(ctx.cols / 4))
    );
    const halfWidth = Math.round(
        ROCK_MIN_HALF_WIDTH_CELLS + ctx.random() * Math.max(0, maxHalf - ROCK_MIN_HALF_WIDTH_CELLS)
    );
    const span = Math.max(1, ctx.cols - 2 * (halfWidth + 1));
    const centerX = halfWidth + 1 + Math.floor(ctx.random() * span);
    const peak = Math.max(
        3,
        Math.round(ctx.rows * (ROCK_MIN_PEAK_RATIO + ctx.random() * (ROCK_MAX_PEAK_RATIO - ROCK_MIN_PEAK_RATIO)))
    );
    return {
        shape: ROCK_SHAPES[Math.min(ROCK_SHAPES.length - 1, Math.floor(ctx.random() * ROCK_SHAPES.length))],
        centerX,
        halfWidth,
        peak
    };
};

// Carves the formation into the grid. Returns the number of cells written.
export const placeRockFormation = (ctx: RockContext, rock: RockFormation): number => {
    const { centerX, halfWidth, peak, shape } = rock;
    let placed = 0;
    // A random walk on top of the ideal profile keeps the outline irregular
    // without the spikiness of independent per-column noise.
    let drift = 0;

    for (let dx = -halfWidth; dx <= halfWidth; dx++) {
        const x = centerX + dx;
        drift += Math.round((ctx.random() - 0.5) * 2);
        drift = Math.max(-ROCK_EDGE_ROUGHNESS_CELLS, Math.min(ROCK_EDGE_ROUGHNESS_CELLS, drift));
        if (x < 0 || x >= ctx.cols) continue;

        const profile = rockProfile(shape, dx / halfWidth);
        const rise = Math.round(peak * profile) + (profile > 0.05 ? drift : 0);
        const surface = ctx.surfaceAt(x);
        // Even the flanks bite into the bed a little, so the rock emerges from
        // the sand instead of sitting in a seam on top of it.
        const top = Math.max(0, Math.min(ctx.rows - 1, surface - Math.max(rise, 1)));

        for (let y = top; y < ctx.rows; y++) {
            const depthShade = 1 - (y - top) / Math.max(1, ctx.rows - top);
            ctx.setCell(x, y, rockColor(ctx.random, 0.45 + depthShade * 0.55));
            placed++;
        }
    }

    return placed;
};

export const scatterRocks = (ctx: RockContext): number =>
    placeRockFormation(ctx, planRockFormation(ctx));
