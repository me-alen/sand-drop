// Regression coverage for the simulation itself.
//
// Every bug in this list was originally found by hand in a browser, because
// engine.ts could not be instantiated in jest at all. They are the expensive
// kind: silent, visual, and easy to reintroduce.
import {
    MATERIAL_GLASS,
    MATERIAL_KELP,
    MATERIAL_LAVA,
    MATERIAL_SAND,
    MATERIAL_STONE,
    MATERIAL_WATER,
    SQUARE_SIZE
} from './constants';
import { colorFor, createTestEngine, TestEngine } from './testHarness';

const px = (cell: number): number => (cell + 0.5) * SQUARE_SIZE;

// Steepest step between neighbouring terrain columns — the measure that
// exposes a spike.
const worstStep = (world: TestEngine, material = MATERIAL_SAND): number => {
    const tops: number[] = [];
    for (let x = 0; x < world.cols; x++) tops.push(world.topOf(x, material));
    let worst = 0;
    for (let x = 1; x < world.cols; x++) {
        if (tops[x] >= world.rows || tops[x - 1] >= world.rows) continue;
        worst = Math.max(worst, Math.abs(tops[x] - tops[x - 1]));
    }
    return worst;
};

const pourSand = (world: TestEngine, atCol: number, atRow: number, steps: number): void => {
    world.engine.brush = 'sand';
    world.engine.grainsPerDrop = 6;
    world.engine.pointerDownAt(px(atCol), px(atRow), 1000);
    world.run(steps);
    world.engine.pointerUp(2000);
};

describe('the harness itself', () => {
    it('starts an engine on a grid of the requested size', () => {
        const world = createTestEngine(80, 50);
        expect(world.cols).toBe(80);
        expect(world.rows).toBe(50);
        expect(world.countMaterial(MATERIAL_SAND)).toBe(0); // wiped clean
    });
});

describe('sand piling', () => {
    it('settles at an angle of repose rather than a spike', () => {
        const world = createTestEngine(140, 90);
        const floor = world.rows - 6;
        world.fill(0, floor, world.cols - 1, world.rows - 1, colorFor(world.engine, 'sand'));

        pourSand(world, 70, 10, 900);
        world.run(900);

        // Every neighbouring column within one cell: no towers.
        expect(worstStep(world)).toBeLessThanOrEqual(1);
    });

    it('does not spike when poured into deep water', () => {
        const world = createTestEngine(140, 90);
        const floor = world.rows - 6;
        world.fill(0, floor, world.cols - 1, world.rows - 1, colorFor(world.engine, 'sand'));
        world.fill(0, 20, world.cols - 1, floor - 1, colorFor(world.engine, 'water'));

        pourSand(world, 70, 10, 900);
        world.run(900);

        expect(worstStep(world)).toBeLessThanOrEqual(1);
    });

    it('falls straight past kelp instead of balancing on it', () => {
        // A single kelp frond used to count as solid ground, so a grain landed
        // on it and the pile grew into a one-column tower held up by a stalk.
        const world = createTestEngine(80, 60);
        const floor = world.rows - 6;
        world.fill(0, floor, world.cols - 1, world.rows - 1, colorFor(world.engine, 'sand'));
        world.fill(0, 20, world.cols - 1, floor - 1, colorFor(world.engine, 'water'));

        const stalkTop = floor - 20;
        for (let y = stalkTop; y < floor; y++) {
            world.setCell(40, y, (MATERIAL_KELP << 24) | 0x2e8b2e);
        }

        pourSand(world, 40, 8, 300);
        world.run(900);

        // The pile that forms must be a proper slope, not a tower on the stalk.
        expect(worstStep(world)).toBeLessThanOrEqual(1);
        const spread = [];
        for (let x = 0; x < world.cols; x++) {
            if (world.topOf(x, MATERIAL_SAND) < floor) spread.push(x);
        }
        expect(spread.length).toBeGreaterThan(10); // it spread out rather than stacking
    });

    it('keeps relaxing terrain that settled outside a dirty window', () => {
        // A step that formed outside the marked columns used to freeze there
        // permanently, however long the sim ran.
        const world = createTestEngine(90, 60);
        const floor = world.rows - 10;
        const sand = colorFor(world.engine, 'sand');
        world.fill(0, floor, world.cols - 1, world.rows - 1, sand);
        // A tower dropped in with no dirty marking of its own.
        world.fill(45, floor - 14, 47, floor - 1, sand);

        world.run(1800);
        expect(worstStep(world)).toBeLessThanOrEqual(1);
    });
});

describe('stone', () => {
    it('drops a detached mass as one rigid piece', () => {
        const world = createTestEngine(90, 70);
        const floor = world.rows - 6;
        world.fill(0, floor, world.cols - 1, world.rows - 1, colorFor(world.engine, 'sand'));

        const slabTop = 20;
        world.fill(30, slabTop, 60, slabTop + 3, colorFor(world.engine, 'stone'));
        const before = world.countMaterial(MATERIAL_STONE);

        world.run(900);

        expect(world.countMaterial(MATERIAL_STONE)).toBe(before); // nothing lost
        // It came down, and arrived intact rather than slumping into a heap.
        expect(world.topOf(30, MATERIAL_STONE)).toBeGreaterThan(slabTop);
        for (let x = 30; x <= 60; x++) {
            expect(world.topOf(x, MATERIAL_STONE)).toBe(world.topOf(30, MATERIAL_STONE));
        }
    });

    it('holds up a mass that is standing on the bed', () => {
        const world = createTestEngine(60, 40);
        const floor = world.rows - 6;
        world.fill(0, floor, world.cols - 1, world.rows - 1, colorFor(world.engine, 'sand'));
        world.fill(20, floor - 4, 40, floor - 1, colorFor(world.engine, 'stone'));
        const before = world.topOf(20, MATERIAL_STONE);

        world.run(600);
        expect(world.topOf(20, MATERIAL_STONE)).toBe(before); // did not budge
    });

    it('rolls off a pinnacle instead of balancing on one cell', () => {
        const world = createTestEngine(120, 70);
        const floor = world.rows - 6;
        const sand = colorFor(world.engine, 'sand');
        world.fill(0, floor, world.cols - 1, world.rows - 1, sand);
        world.fill(60, floor - 8, 60, floor - 1, sand); // lone spike

        world.fill(40, 15, 80, 17, colorFor(world.engine, 'stone'));
        world.run(1800);

        // It must end up lying on the bed, not perched on the spike.
        const restingRow = world.topOf(world.cols - 10, MATERIAL_SAND);
        let touching = 0;
        for (let x = 0; x < world.cols; x++) {
            const top = world.topOf(x, MATERIAL_STONE);
            if (top < world.rows && top >= restingRow - 6) touching++;
        }
        expect(touching).toBeGreaterThan(20); // broadly in contact with the bed
    });

    it('fills the hollow when a stone loop is closed', () => {
        const world = createTestEngine(60, 60);
        const stone = colorFor(world.engine, 'stone');
        world.engine.brush = 'stone';
        // A hollow ring, then finish the stroke.
        world.fill(20, 20, 34, 20, stone);
        world.fill(20, 34, 34, 34, stone);
        world.fill(20, 20, 20, 34, stone);
        world.fill(34, 20, 34, 34, stone);
        const walls = world.countMaterial(MATERIAL_STONE);

        world.engine.pointerUp(3000);
        expect(world.countMaterial(MATERIAL_STONE)).toBeGreaterThan(walls);
        expect(world.materialAt(27, 27)).toBe(MATERIAL_STONE); // the middle is solid
    });
});

describe('lava', () => {
    const lavaColor = (): number => (MATERIAL_LAVA << 24) | 0x1a5cf0;

    it('flows downhill and pools like a liquid', () => {
        const world = createTestEngine(60, 40);
        const floor = world.rows - 6;
        world.fill(0, floor, world.cols - 1, world.rows - 1, colorFor(world.engine, 'sand'));
        world.fill(28, 8, 32, 12, lavaColor());

        world.run(900);

        // It came down and spread out rather than staying a floating block. By
        // now some of it may have cooled to basalt or vitrified the sand it ran
        // over, so measure the whole footprint the flow left — live lava plus
        // the stone and glass it made — not just the lava still molten.
        let widest = 0;
        for (let x = 0; x < world.cols; x++) {
            for (let y = 0; y < world.rows; y++) {
                const m = world.materialAt(x, y);
                if (m === MATERIAL_LAVA || m === MATERIAL_STONE || m === MATERIAL_GLASS) {
                    widest++;
                    break;
                }
            }
        }
        expect(widest).toBeGreaterThan(5); // spread wider than the 5 it started
    });

    it('chills into stone where it meets water', () => {
        const world = createTestEngine(40, 30);
        const floor = world.rows - 4;
        world.fill(0, floor, world.cols - 1, world.rows - 1, colorFor(world.engine, 'sand'));
        world.fill(0, floor - 8, 19, floor - 1, colorFor(world.engine, 'water'));
        world.fill(20, floor - 8, 30, floor - 1, lavaColor());
        expect(world.countMaterial(MATERIAL_STONE)).toBe(0);

        world.run(600);

        // The meeting line turned to rock, and some water boiled away with it.
        expect(world.countMaterial(MATERIAL_STONE)).toBeGreaterThan(0);
    });

    it('leaves basalt behind, not something still glowing orange', () => {
        // Regression: the quench reused the lava pixel and only swapped the
        // material byte, so cooled rock stayed bright orange.
        const world = createTestEngine(40, 30);
        const floor = world.rows - 4;
        world.fill(0, floor, world.cols - 1, world.rows - 1, colorFor(world.engine, 'sand'));
        world.fill(0, floor - 8, 19, floor - 1, colorFor(world.engine, 'water'));
        world.fill(20, floor - 8, 30, floor - 1, lavaColor());

        world.run(600);

        const cooled = world.pixelsOf(MATERIAL_STONE);
        expect(cooled.length).toBeGreaterThan(0);
        for (const pixel of cooled) {
            const red = pixel & 0xff;
            const blue = (pixel >>> 16) & 0xff;
            // Basalt is dark and near-neutral; lava is bright and strongly red.
            expect(red).toBeLessThan(110);
            expect(red - blue).toBeLessThan(60);
        }
    });

    it('vitrifies the sand it runs over into glass', () => {
        const world = createTestEngine(40, 30);
        const floor = world.rows - 4;
        world.fill(0, floor, world.cols - 1, world.rows - 1, colorFor(world.engine, 'sand'));
        world.fill(15, floor - 6, 25, floor - 1, lavaColor());
        expect(world.countMaterial(MATERIAL_GLASS)).toBe(0);

        world.run(300);

        // The flow left a glassy crust where it met the bed.
        expect(world.countMaterial(MATERIAL_GLASS)).toBeGreaterThan(0);
    });

    it('bakes sand into glass in layers deeper than a single skin', () => {
        // The old model glazed only the cells the lava directly touched — a
        // one-cell skin. With heat conducting on through the glass it makes,
        // the flow bakes several layers down into the bed. Stone walls hold the
        // pool in place so the test measures the downward bake, not spreading.
        const world = createTestEngine(24, 44);
        const surface = 14;
        world.fill(0, surface, world.cols - 1, world.rows - 1, colorFor(world.engine, 'sand'));
        const stone = colorFor(world.engine, 'stone');
        world.fill(6, surface - 7, 6, surface - 1, stone);
        world.fill(17, surface - 7, 17, surface - 1, stone);
        world.fill(7, surface - 6, 16, surface - 1, lavaColor());

        world.run(300);

        let deepest = 0;
        for (let x = 7; x <= 16; x++) {
            let depth = 0;
            for (let y = 0; y < world.rows; y++) {
                if (world.materialAt(x, y) === MATERIAL_GLASS) depth++;
            }
            deepest = Math.max(deepest, depth);
        }
        expect(deepest).toBeGreaterThan(1); // more than a one-cell crust
    });

    it('slowly cools to stone in open air, with no water needed', () => {
        // A flow does not need quenching to set: left alone it loses heat to the
        // air and eventually turns to basalt on its own, but not instantly.
        const world = createTestEngine(24, 30);
        world.fill(0, world.rows - 4, world.cols - 1, world.rows - 1, colorFor(world.engine, 'sand'));
        world.fill(9, world.rows - 9, 14, world.rows - 5, lavaColor());
        expect(world.countMaterial(MATERIAL_STONE)).toBe(0);

        world.run(60); // a moment on: still molten, cooling is gradual not instant
        expect(world.countMaterial(MATERIAL_LAVA)).toBeGreaterThan(0);

        world.run(2400); // plenty of time to give up its heat to the open air
        expect(world.countMaterial(MATERIAL_LAVA)).toBe(0); // fully set
        expect(world.countMaterial(MATERIAL_STONE)).toBeGreaterThan(0); // into basalt
    });

    it('burns away flora it touches', () => {
        const world = createTestEngine(40, 30);
        const floor = world.rows - 4;
        world.fill(0, floor, world.cols - 1, world.rows - 1, colorFor(world.engine, 'sand'));
        for (let y = floor - 6; y < floor; y++) {
            world.setCell(20, y, (MATERIAL_KELP << 24) | 0x2e8b2e);
        }
        world.fill(21, floor - 6, 24, floor - 1, lavaColor());
        expect(world.countMaterial(MATERIAL_KELP)).toBe(6);

        world.run(300);
        expect(world.countMaterial(MATERIAL_KELP)).toBe(0);
    });
});

describe('flora', () => {
    it('dries out when it loses contact with water', () => {
        const world = createTestEngine(60, 50);
        const floor = world.rows - 6;
        world.fill(0, floor, world.cols - 1, world.rows - 1, colorFor(world.engine, 'sand'));
        world.fill(0, 10, world.cols - 1, floor - 1, colorFor(world.engine, 'water'));
        for (let y = floor - 8; y < floor; y++) {
            world.setCell(30, y, (MATERIAL_KELP << 24) | 0x2e8b2e);
        }
        expect(world.countMaterial(MATERIAL_KELP)).toBe(8);

        // Take the water away entirely.
        for (let y = 0; y < floor; y++) {
            for (let x = 0; x < world.cols; x++) {
                if (world.materialAt(x, y) === MATERIAL_WATER) world.setCell(x, y, 0);
            }
        }
        world.run(1200);
        expect(world.countMaterial(MATERIAL_KELP)).toBe(0);
    });
});
