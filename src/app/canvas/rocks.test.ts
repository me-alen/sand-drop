import { MATERIAL_STONE } from './constants';
import {
    placeRockFormation,
    planRockFormation,
    RockContext,
    rockProfile,
    ROCK_SHAPES,
    scatterRocks
} from './rocks';

type World = { map: Map<string, number>; cols: number; rows: number; surfaceY: number };

const makeWorld = (cols = 200, rows = 80, surfaceY = 60): World => ({
    map: new Map(),
    cols,
    rows,
    surfaceY
});

// Deterministic sequence so formations are reproducible in tests.
const seeded = (seed: number): (() => number) => {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
};

const makeCtx = (world: World, random: () => number): RockContext => ({
    cols: world.cols,
    rows: world.rows,
    surfaceAt: () => world.surfaceY,
    setCell: (x, y, color) => {
        world.map.set(`${x},${y}`, color);
    },
    random
});

const columnsOf = (world: World): Map<number, number[]> => {
    const byColumn = new Map<number, number[]>();
    for (const key of Array.from(world.map.keys())) {
        const [x, y] = key.split(',').map(Number);
        const rows = byColumn.get(x) ?? [];
        rows.push(y);
        byColumn.set(x, rows);
    }
    for (const rows of Array.from(byColumn.values())) rows.sort((a, b) => a - b);
    return byColumn;
};

describe('rockProfile', () => {
    it('peaks at the centre and vanishes at the rim for every shape', () => {
        for (const shape of ROCK_SHAPES) {
            expect(rockProfile(shape, 0)).toBeCloseTo(1, 5);
            expect(rockProfile(shape, 1)).toBeCloseTo(0, 5);
            expect(rockProfile(shape, -1)).toBeCloseTo(0, 5);
        }
    });

    it('gives each shape a distinct flank', () => {
        // Half way out, a mesa is still full height while a spire has fallen away.
        expect(rockProfile('ridge', 0.5)).toBeGreaterThan(rockProfile('dome', 0.5));
        expect(rockProfile('dome', 0.5)).toBeGreaterThan(rockProfile('spire', 0.5));
    });
});

describe('placeRockFormation', () => {
    it('writes stone from the summit right down to the last row', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const world = makeWorld();
            const ctx = makeCtx(world, seeded(seed));
            placeRockFormation(ctx, planRockFormation(ctx));

            const byColumn = columnsOf(world);
            expect(byColumn.size).toBeGreaterThan(0);

            for (const rows of Array.from(byColumn.values())) {
                // Rooted: every column runs to the bottom of the grid, so no
                // sand can ever sit underneath the rock.
                expect(rows[rows.length - 1]).toBe(world.rows - 1);
                // And it is one unbroken run, not stacked fragments.
                for (let i = 1; i < rows.length; i++) expect(rows[i] - rows[i - 1]).toBe(1);
            }
        }
    });

    it('breaks the surface of the bed', () => {
        const world = makeWorld();
        const ctx = makeCtx(world, seeded(9));
        placeRockFormation(ctx, planRockFormation(ctx));
        const tops = Array.from(columnsOf(world).values()).map((rows) => rows[0]);
        expect(Math.min(...tops)).toBeLessThan(world.surfaceY);
    });

    it('is one connected span of columns', () => {
        const world = makeWorld();
        const ctx = makeCtx(world, seeded(4));
        placeRockFormation(ctx, planRockFormation(ctx));
        const xs = Array.from(columnsOf(world).keys()).sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBe(1);
    });

    it('writes only stone, inside the grid', () => {
        const world = makeWorld();
        const ctx = makeCtx(world, seeded(6));
        placeRockFormation(ctx, planRockFormation(ctx));
        for (const [key, color] of Array.from(world.map.entries())) {
            const [x, y] = key.split(',').map(Number);
            expect(color >>> 24).toBe(MATERIAL_STONE);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(world.cols);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThan(world.rows);
        }
    });
});

describe('planRockFormation', () => {
    it('keeps the formation inside the grid and varies between sessions', () => {
        const shapes = new Set<string>();
        const widths = new Set<number>();
        for (let seed = 1; seed <= 40; seed++) {
            const world = makeWorld();
            const rock = planRockFormation(makeCtx(world, seeded(seed)));
            expect(rock.centerX - rock.halfWidth).toBeGreaterThanOrEqual(0);
            expect(rock.centerX + rock.halfWidth).toBeLessThan(world.cols);
            shapes.add(rock.shape);
            widths.add(rock.halfWidth);
        }
        expect(shapes.size).toBeGreaterThan(1); // different shapes across sessions
        expect(widths.size).toBeGreaterThan(1); // and different sizes
    });
});

describe('scatterRocks', () => {
    it('leaves most of the bed open', () => {
        const world = makeWorld();
        scatterRocks(makeCtx(world, seeded(12)));
        expect(columnsOf(world).size).toBeLessThan(world.cols * 0.6);
    });
});
