// Pure underwater-growth logic. Like castle.ts, all grid access is injected so
// the algorithm is unit-testable against a plain Map. The engine calls
// updateFloraColumn on a slow rotating sweep of columns.
//
// A settled water column reads top-to-bottom as [air][water][flora][bed]:
// water pools above the floor, and kelp/coral grow UP from the floor into the
// water. Row 0 is the top of the screen; row numbers increase downward.
import { hslToPackedColor } from './color';
import {
    CORAL_BRANCH_CHANCE,
    CORAL_CLUSTER_SEED_MULTIPLIER,
    CORAL_GROW_CHANCE,
    CORAL_HUES,
    CORAL_LIGHTNESS_MAX,
    CORAL_LIGHTNESS_MIN,
    CORAL_MAX_DEPTH_FRACTION,
    CORAL_PATCH_CHANCE,
    CORAL_PATCH_WIDTH,
    CORAL_SHAPES,
    CORAL_SATURATION,
    CORAL_SEED_CHANCE,
    FLORA_MIN_WATER_DEPTH_CELLS,
    FLORA_SURFACE_HEADROOM_CELLS,
    KELP_GROW_CHANCE,
    KELP_HUE_MAX,
    KELP_HUE_MIN,
    KELP_LIGHTNESS_MAX,
    KELP_LIGHTNESS_MIN,
    KELP_FLOOR_COVERAGE,
    KELP_MAX_DEPTH_FRACTION,
    KELP_MIN_DEPTH_FRACTION,
    KELP_SATURATION,
    KELP_SEED_CHANCE,
    MATERIAL_CORAL,
    MATERIAL_KELP,
    MATERIAL_PACKED_SAND,
    MATERIAL_SAND,
    MATERIAL_STONE,
    MATERIAL_WATER
} from './constants';

export type FloraContext = {
    cols: number;
    rows: number;
    materialAt: (x: number, y: number) => number; // 0 = empty
    setCell: (x: number, y: number, color: number) => void;
    clearCell: (x: number, y: number) => void;
    random: () => number;
};

export type FloraColumnResult = {
    grew: Array<{ x: number; y: number }>;
    died: Array<{ x: number; y: number; material: number }>;
};

export const isFlora = (material: number): boolean =>
    material === MATERIAL_KELP || material === MATERIAL_CORAL;

const isBed = (material: number): boolean =>
    material === MATERIAL_SAND || material === MATERIAL_PACKED_SAND || material === MATERIAL_STONE;

// Deterministic pseudo-random in [0,1) for an integer. Column traits (kelp
// target height, coral hue, coral patches) are derived from this rather than
// ctx.random so they stay fixed across ticks instead of flickering each sweep.
const hashInt = (n: number): number => {
    let h = n | 0;
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// This column's own kelp ceiling, somewhere between the min and max fraction.
const kelpDepthFraction = (col: number): number =>
    KELP_MIN_DEPTH_FRACTION + hashInt(col * 2 + 1) * (KELP_MAX_DEPTH_FRACTION - KELP_MIN_DEPTH_FRACTION);

const coralPatchOf = (col: number): number => Math.floor(col / CORAL_PATCH_WIDTH);

const coralPatchActive = (col: number): boolean =>
    hashInt(coralPatchOf(col) * 2 + 101) < CORAL_PATCH_CHANCE;

// This column's share of the patch silhouette; 0 means it is a deliberate gap
// between pillars.
const coralProfileAt = (col: number): number => {
    const shape = CORAL_SHAPES[Math.floor(hashInt(coralPatchOf(col) * 5 + 23) * CORAL_SHAPES.length) % CORAL_SHAPES.length];
    const p = ((col % CORAL_PATCH_WIDTH) + CORAL_PATCH_WIDTH) % CORAL_PATCH_WIDTH;
    return shape[p % shape.length];
};

// Coral only grows on the solid parts of an active patch's silhouette, which
// keeps reefs as separated clumps covering ~a quarter of the floor.
export const coralAllowedInColumn = (col: number): boolean =>
    coralPatchActive(col) && coralProfileAt(col) > 0;

// Share of the floor coral actually ends up on: active patches, thinned by the
// gap columns in each silhouette.
const CORAL_SHAPE_FILL =
    CORAL_SHAPES.reduce((sum, shape) => sum + shape.filter((v) => v > 0).length / shape.length, 0) /
    CORAL_SHAPES.length;
const CORAL_COVERAGE = CORAL_PATCH_CHANCE * CORAL_SHAPE_FILL;

// Kelp claims KELP_FLOOR_COVERAGE of the whole bed. Since it can only use the
// columns coral left free, the threshold is scaled up by that share so the
// final figure lands on the constant rather than under it.
export const kelpAllowedInColumn = (col: number): boolean => {
    if (coralAllowedInColumn(col)) return false;
    const free = Math.max(0.01, 1 - CORAL_COVERAGE);
    return hashInt(col * 7 + 31) < Math.min(1, KELP_FLOOR_COVERAGE / free);
};

// One hue per patch (not per column) so a clump is a single vibrant colour
// and neighbouring clumps differ.
const coralHueForColumn = (col: number): number =>
    CORAL_HUES[Math.floor(hashInt(coralPatchOf(col) * 3 + 7) * CORAL_HUES.length) % CORAL_HUES.length];

export const kelpColor = (random: () => number): number =>
    hslToPackedColor(
        KELP_HUE_MIN + random() * (KELP_HUE_MAX - KELP_HUE_MIN),
        KELP_SATURATION,
        KELP_LIGHTNESS_MIN + random() * (KELP_LIGHTNESS_MAX - KELP_LIGHTNESS_MIN),
        MATERIAL_KELP
    );

export const coralColor = (hue: number, random: () => number): number =>
    hslToPackedColor(
        hue,
        CORAL_SATURATION,
        CORAL_LIGHTNESS_MIN + random() * (CORAL_LIGHTNESS_MAX - CORAL_LIGHTNESS_MIN),
        MATERIAL_CORAL
    );

export const updateFloraColumn = (ctx: FloraContext, col: number): FloraColumnResult => {
    const grew: FloraColumnResult['grew'] = [];
    const died: FloraColumnResult['died'] = [];
    const { rows, cols } = ctx;

    // -1 marks out of bounds; treated as a solid floor/wall for support checks.
    const matAt = (x: number, y: number): number =>
        x < 0 || x >= cols || y < 0 || y >= rows ? -1 : ctx.materialAt(x, y);
    const mat = (y: number): number => matAt(col, y);

    // Descend the settled profile: [air] [water] [flora] [bed].
    let y = 0;
    while (y < rows && mat(y) === 0) y++;
    const waterTop = mat(y) === MATERIAL_WATER ? y : -1;
    while (y < rows && mat(y) === MATERIAL_WATER) y++;
    let floraStart = y < rows && isFlora(mat(y)) ? y : -1;
    const floraMaterial = floraStart === -1 ? 0 : mat(floraStart);
    while (y < rows && isFlora(mat(y))) y++;
    const floraEnd = floraStart === -1 ? -1 : y - 1;
    const bedY = y; // first cell below the flora run (or below the water if no flora)
    const bedMat = mat(bedY);
    // depth = distance from the water surface down to the floor (water + flora).
    const depth = waterTop === -1 ? 0 : bedY - waterTop;

    // ---- Cull: unsupported run (support was erased/blasted out from under it).
    if (floraStart !== -1) {
        const supported = bedMat === -1 || isBed(bedMat) || isFlora(bedMat);
        if (!supported) {
            for (let fy = floraStart; fy <= floraEnd; fy++) {
                ctx.clearCell(col, fy);
                died.push({ x: col, y: fy, material: floraMaterial });
            }
            return { grew, died };
        }

        // ---- Cull: exposed tip (water drained away above it). Kill top-down
        // until the tip is under water again; stop if sand has entombed it.
        while (floraStart <= floraEnd) {
            const above = mat(floraStart - 1);
            if (above === MATERIAL_WATER) break; // submerged — healthy
            if (above !== 0) break; // solid above (fossilized under sand) — leave it
            ctx.clearCell(col, floraStart);
            died.push({ x: col, y: floraStart, material: floraMaterial });
            floraStart++;
        }
        if (floraStart > floraEnd) return { grew, died }; // whole run exposed and gone
    }

    // ---- Seed: bare, deep-enough pool on a solid floor.
    if (floraStart === -1) {
        if (waterTop === -1 || depth < FLORA_MIN_WATER_DEPTH_CELLS || !isBed(bedMat)) {
            return { grew, died };
        }
        const seedY = bedY - 1; // one cell above the floor, inside the water
        if (mat(seedY) !== MATERIAL_WATER) return { grew, died };

        // A column belongs to either a coral patch or the kelp bed, never both,
        // so reef clumps stay solid instead of being split by stray stalks.
        const roll = ctx.random();
        if (coralAllowedInColumn(col)) {
            const nearCoral =
                matAt(col - 1, seedY) === MATERIAL_CORAL || matAt(col + 1, seedY) === MATERIAL_CORAL;
            const coralChance = CORAL_SEED_CHANCE * (nearCoral ? CORAL_CLUSTER_SEED_MULTIPLIER : 1);
            if (roll < coralChance) {
                ctx.setCell(col, seedY, coralColor(coralHueForColumn(col), ctx.random));
                grew.push({ x: col, y: seedY });
            }
        } else if (kelpAllowedInColumn(col) && roll < KELP_SEED_CHANCE) {
            ctx.setCell(col, seedY, kelpColor(ctx.random));
            grew.push({ x: col, y: seedY });
        }
        return { grew, died };
    }

    // ---- Grow: extend an existing, submerged run within its depth cap.
    const height = floraEnd - floraStart + 1;
    const isKelp = floraMaterial === MATERIAL_KELP;
    const cap = isKelp
        ? Math.floor(depth * kelpDepthFraction(col))
        : Math.max(1, Math.floor(depth * CORAL_MAX_DEPTH_FRACTION * coralProfileAt(col)));
    const growChance = isKelp ? KELP_GROW_CHANCE : CORAL_GROW_CHANCE;

    if (height >= cap || ctx.random() >= growChance) return { grew, died };

    // Coral spreads sideways into a supported, submerged water cell to form clumps.
    if (!isKelp && ctx.random() < CORAL_BRANCH_CHANCE) {
        const dir = ctx.random() < 0.5 ? -1 : 1;
        const nx = col + dir;
        const ny = floraStart;
        const belowNeighbor = matAt(nx, ny + 1);
        const supported = belowNeighbor === MATERIAL_CORAL || isBed(belowNeighbor);
        if (coralAllowedInColumn(nx) && ny > waterTop && matAt(nx, ny) === MATERIAL_WATER && supported) {
            ctx.setCell(nx, ny, coralColor(coralHueForColumn(nx), ctx.random));
            grew.push({ x: nx, y: ny });
            return { grew, died };
        }
    }

    // Grow straight up — only into water, never past the surface headroom.
    const tipY = floraStart - 1;
    if (tipY > waterTop + FLORA_SURFACE_HEADROOM_CELLS - 1 && mat(tipY) === MATERIAL_WATER) {
        const color = isKelp
            ? kelpColor(ctx.random)
            : coralColor(coralHueForColumn(col), ctx.random);
        ctx.setCell(col, tipY, color);
        grew.push({ x: col, y: tipY });
    }

    return { grew, died };
};
