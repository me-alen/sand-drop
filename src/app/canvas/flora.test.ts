import { hslToPackedColor } from './color';
import {
    MATERIAL_CORAL,
    MATERIAL_KELP,
    MATERIAL_SAND,
    MATERIAL_WATER
} from './constants';
import {
    coralAllowedInColumn,
    coralColor,
    FloraContext,
    isFlora,
    kelpAllowedInColumn,
    kelpColor,
    updateFloraColumn
} from './flora';

// Coverage gates mean a given column may host kelp, coral, or nothing, so
// tests pick a column that actually allows what they are exercising.
const firstColumnWhere = (predicate: (col: number) => boolean): number => {
    for (let c = 0; c < 500; c++) if (predicate(c)) return c;
    throw new Error('no column satisfies the predicate');
};

// Packed colours are little-endian RGBA (0xAABBGGRR); recover the HSL hue.
const hueOf = (packed: number): number => {
    const r = (packed & 0xff) / 255;
    const g = ((packed >>> 8) & 0xff) / 255;
    const b = ((packed >>> 16) & 0xff) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const c = max - min;
    if (c === 0) return 0;
    let h: number;
    if (max === r) h = ((g - b) / c) % 6;
    else if (max === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
    return Math.round((((h * 60) % 360) + 360) % 360);
};

const WATER_CELL = hslToPackedColor(205, 82, 52, MATERIAL_WATER);
const SAND_CELL = hslToPackedColor(40, 100, 55, MATERIAL_SAND);
const CORAL_CELL = coralColor(340, () => 0);

type World = { map: Map<string, number>; cols: number; rows: number };

const makeWorld = (cols = 5, rows = 30): World => ({ map: new Map(), cols, rows });

const makeCtx = (world: World, random: () => number): FloraContext => ({
    cols: world.cols,
    rows: world.rows,
    materialAt: (x, y) => {
        const p = world.map.get(`${x},${y}`);
        return p ? p >>> 24 : 0;
    },
    setCell: (x, y, color) => {
        world.map.set(`${x},${y}`, color);
    },
    clearCell: (x, y) => {
        world.map.delete(`${x},${y}`);
    },
    random
});

const fill = (world: World, col: number, y0: number, y1: number, cell: number): void => {
    for (let y = y0; y <= y1; y++) world.map.set(`${col},${y}`, cell);
};

const floraRows = (world: World, col: number): number[] => {
    const rows: number[] = [];
    for (let y = 0; y < world.rows; y++) {
        const p = world.map.get(`${col},${y}`);
        if (p && isFlora(p >>> 24)) rows.push(y);
    }
    return rows;
};

// Deterministic random driven by a repeating sequence of values.
const scriptedRandom = (seq: number[]): (() => number) => {
    let i = 0;
    return () => seq[i++ % seq.length];
};

describe('flora colours', () => {
    it('tag each material in the alpha byte', () => {
        expect(kelpColor(() => 0) >>> 24).toBe(MATERIAL_KELP);
        expect(coralColor(340, () => 0) >>> 24).toBe(MATERIAL_CORAL);
    });
});

describe('seeding', () => {
    it('seeds one cell above the floor when the pool is deep enough', () => {
        const col = firstColumnWhere(kelpAllowedInColumn);
        const world = makeWorld(col + 3); // water 14..19 (depth 6), floor at 20
        fill(world, col, 14, 19, WATER_CELL);
        fill(world, col, 20, 29, SAND_CELL);
        updateFloraColumn(makeCtx(world, () => 0), col); // roll 0 -> kelp
        expect((world.map.get(`${col},19`) ?? 0) >>> 24).toBe(MATERIAL_KELP);
    });

    it('does not seed in water shallower than the minimum depth', () => {
        const col = firstColumnWhere(kelpAllowedInColumn);
        const world = makeWorld(col + 3); // water 15..19 (depth 5)
        fill(world, col, 15, 19, WATER_CELL);
        fill(world, col, 20, 29, SAND_CELL);
        updateFloraColumn(makeCtx(world, () => 0), col);
        expect(floraRows(world, col)).toHaveLength(0);
    });

    it('does not seed without a solid floor beneath the water', () => {
        const col = firstColumnWhere(kelpAllowedInColumn);
        const world = makeWorld(col + 3); // deep water, no bed under it
        fill(world, col, 5, 29, WATER_CELL);
        updateFloraColumn(makeCtx(world, () => 0), col);
        expect(floraRows(world, col)).toHaveLength(0);
    });

    it('leaves bare bed where neither kelp nor coral is allowed', () => {
        const col = firstColumnWhere((c) => !kelpAllowedInColumn(c) && !coralAllowedInColumn(c));
        const world = makeWorld(col + 3);
        fill(world, col, 10, 19, WATER_CELL);
        fill(world, col, 20, 29, SAND_CELL);
        const ctx = makeCtx(world, () => 0);
        for (let i = 0; i < 100; i++) updateFloraColumn(ctx, col);
        expect(floraRows(world, col)).toHaveLength(0);
    });
});

describe('growth caps', () => {
    it('grows kelp to varied heights, none above 80% of depth or through the surface', () => {
        const world = makeWorld(40); // water 10..19 (depth 10), floor at 20
        for (let c = 0; c < 40; c++) {
            fill(world, c, 10, 19, WATER_CELL);
            fill(world, c, 20, 29, SAND_CELL);
        }
        const ctx = makeCtx(world, () => 0); // roll 0 -> always seeds and always grows
        for (let i = 0; i < 200; i++) for (let c = 0; c < 40; c++) updateFloraColumn(ctx, c);

        const heights: number[] = [];
        for (let c = 0; c < 40; c++) {
            if (coralAllowedInColumn(c)) continue; // coral patch, capped separately
            const rows = floraRows(world, c);
            if (rows.length === 0) continue;
            heights.push(rows.length);
            expect(Math.min(...rows)).toBeGreaterThanOrEqual(12); // waterTop(10) + headroom(2)
        }

        expect(Math.max(...heights)).toBeLessThanOrEqual(8); // floor(0.8 * 10)
        // The whole point: stalks must not all top out at the same line.
        expect(new Set(heights).size).toBeGreaterThan(1);
    });

    it('grows coral no taller than 25% of depth', () => {
        // Deep pool (water 10..49, floor 50) so the cap has room to be exceeded.
        const world = makeWorld(80, 60);
        for (let c = 0; c < 80; c++) {
            fill(world, c, 10, 49, WATER_CELL);
            fill(world, c, 50, 59, SAND_CELL);
        }
        const ctx = makeCtx(world, () => 0);
        for (let i = 0; i < 400; i++) for (let c = 0; c < 80; c++) updateFloraColumn(ctx, c);

        const depth = 40;
        const cap = Math.floor(depth * 0.25);
        let tallest = 0;
        for (let c = 0; c < 80; c++) {
            if (!coralAllowedInColumn(c)) continue;
            const height = floraRows(world, c).filter(
                (y) => ((world.map.get(`${c},${y}`) ?? 0) >>> 24) === MATERIAL_CORAL
            ).length;
            tallest = Math.max(tallest, height);
        }
        expect(tallest).toBeGreaterThan(0); // coral actually grew
        expect(tallest).toBeLessThanOrEqual(cap);
    });

    it('shapes a coral patch into pillars of differing height', () => {
        const world = makeWorld(80, 60);
        for (let c = 0; c < 80; c++) {
            fill(world, c, 10, 49, WATER_CELL);
            fill(world, c, 50, 59, SAND_CELL);
        }
        const ctx = makeCtx(world, () => 0);
        for (let i = 0; i < 400; i++) for (let c = 0; c < 80; c++) updateFloraColumn(ctx, c);

        const heights = new Set<number>();
        for (let c = 0; c < 80; c++) {
            if (!coralAllowedInColumn(c)) continue;
            heights.add(floraRows(world, c).length);
        }
        // A silhouette, not a flat slab.
        expect(heights.size).toBeGreaterThan(1);
    });

    it('only ever grows onto a supported cell', () => {
        const world = makeWorld();
        fill(world, 2, 10, 19, WATER_CELL);
        fill(world, 2, 20, 29, SAND_CELL);
        const ctx = makeCtx(world, () => 0);
        for (let i = 0; i < 200; i++) updateFloraColumn(ctx, 2);

        for (const y of floraRows(world, 2)) {
            const below = world.map.get(`2,${y + 1}`);
            const belowMat = below ? below >>> 24 : 0;
            expect(isFlora(belowMat) || belowMat === MATERIAL_SAND).toBe(true);
        }
    });
});

describe('coral coverage', () => {
    it('splits the bed between coral, kelp and bare ground', () => {
        const total = 2000;
        let coral = 0;
        let kelp = 0;
        for (let c = 0; c < total; c++) {
            if (coralAllowedInColumn(c)) coral++;
            else if (kelpAllowedInColumn(c)) kelp++;
        }
        const bare = total - coral - kelp;

        // Coral 20-30% of the floor, kelp around 40%, and the rest left open
        // so the seabed reads as seabed rather than a lawn.
        expect(coral / total).toBeGreaterThan(0.18);
        expect(coral / total).toBeLessThan(0.32);
        expect(kelp / total).toBeGreaterThan(0.33);
        expect(kelp / total).toBeLessThan(0.47);
        expect(bare / total).toBeGreaterThan(0.2);
    });

    it('never places coral outside an allowed column', () => {
        const world = makeWorld(60);
        for (let c = 0; c < 60; c++) {
            fill(world, c, 10, 19, WATER_CELL);
            fill(world, c, 20, 29, SAND_CELL);
        }
        // 0.005 is under both seed chances, so each column seeds whatever its
        // patch allows — coral inside patches, kelp outside them.
        const ctx = makeCtx(world, () => 0.005);
        for (let i = 0; i < 100; i++) for (let c = 0; c < 60; c++) updateFloraColumn(ctx, c);

        let coralColumns = 0;
        for (let c = 0; c < 60; c++) {
            const hasCoral = floraRows(world, c).some(
                (y) => ((world.map.get(`${c},${y}`) ?? 0) >>> 24) === MATERIAL_CORAL
            );
            if (hasCoral) {
                coralColumns++;
                expect(coralAllowedInColumn(c)).toBe(true);
            }
        }
        expect(coralColumns).toBeGreaterThan(0); // it did actually grow something
        expect(coralColumns).toBeLessThan(60 * 0.5); // but nowhere near a carpet
    });

    it('gives a column a stable vibrant hue across all its cells', () => {
        const world = makeWorld();
        fill(world, 2, 10, 19, WATER_CELL);
        fill(world, 2, 20, 29, SAND_CELL);
        world.map.set('2,19', CORAL_CELL);
        const ctx = makeCtx(world, scriptedRandom([0, 0.9, 0]));
        for (let i = 0; i < 50; i++) updateFloraColumn(ctx, 2);

        // Every grown coral cell in the column shares one hue (lightness varies).
        const hues = new Set(
            floraRows(world, 2)
                .map((y) => world.map.get(`2,${y}`) ?? 0)
                .filter((p) => p >>> 24 === MATERIAL_CORAL)
                .slice(1) // skip the manually seeded cell
                .map((p) => hueOf(p))
        );
        expect(hues.size).toBeLessThanOrEqual(1);
    });
});

describe('die-off', () => {
    it('kills an entire run once the water has fully drained', () => {
        const world = makeWorld(); // kelp exposed to air, floor still present
        fill(world, 2, 14, 19, kelpColor(() => 0));
        fill(world, 2, 20, 29, SAND_CELL);
        const result = updateFloraColumn(makeCtx(world, () => 0), 2);
        expect(result.died).toHaveLength(6);
        expect(floraRows(world, 2)).toHaveLength(0);
    });

    it('leaves a fully submerged run untouched', () => {
        const world = makeWorld();
        fill(world, 2, 10, 15, WATER_CELL);
        fill(world, 2, 16, 19, kelpColor(() => 0));
        fill(world, 2, 20, 29, SAND_CELL);
        const result = updateFloraColumn(makeCtx(world, () => 1), 2); // random 1 -> never grows
        expect(result.died).toHaveLength(0);
        expect(floraRows(world, 2)).toHaveLength(4);
    });

    it('kills a run whose floor was removed', () => {
        const world = makeWorld(); // kelp resting on water, not on a bed
        fill(world, 2, 10, 14, WATER_CELL);
        fill(world, 2, 15, 18, kelpColor(() => 0));
        world.map.set('2,19', WATER_CELL);
        const result = updateFloraColumn(makeCtx(world, () => 1), 2);
        expect(result.died).toHaveLength(4);
        expect(floraRows(world, 2)).toHaveLength(0);
    });

    it('leaves flora entombed under sand alone', () => {
        const world = makeWorld(); // sand has fallen onto the kelp tip
        fill(world, 2, 10, 12, WATER_CELL);
        world.map.set('2,13', SAND_CELL);
        fill(world, 2, 14, 19, kelpColor(() => 0));
        fill(world, 2, 20, 29, SAND_CELL);
        const result = updateFloraColumn(makeCtx(world, () => 0), 2);
        expect(result.died).toHaveLength(0);
        expect(floraRows(world, 2)).toHaveLength(6);
    });
});
