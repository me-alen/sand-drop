import {
    MATERIAL_CORAL,
    MATERIAL_KELP,
    MATERIAL_PACKED_SAND,
    MATERIAL_SAND,
    MATERIAL_STONE,
    MATERIAL_WATER
} from './constants';
import {
    bodyCanDescend,
    bodyCanShift,
    bodyCentreX,
    bodyRowRuns,
    bodyRuns,
    bodySupport,
    bodyTipDirection,
    findEnclosedCells,
    findFloatingBodies,
    StoneBody,
    StoneContext
} from './stone';

type World = { map: Map<string, number>; cols: number; rows: number };

const makeWorld = (cols = 20, rows = 20): World => ({ map: new Map(), cols, rows });

const ctxOf = (world: World): StoneContext => ({
    cols: world.cols,
    rows: world.rows,
    materialAt: (x, y) => world.map.get(`${x},${y}`) ?? 0
});

const put = (world: World, x: number, y: number, material: number): void => {
    world.map.set(`${x},${y}`, material);
};

const fillRect = (
    world: World,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    material: number
): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(world, x, y, material);
};

const totalCells = (bodies: StoneBody[]): number => bodies.reduce((n, b) => n + b.size, 0);

describe('grounding', () => {
    it('holds up a column that reaches the bottom row', () => {
        // This is the generated outcrop's shape — it must never move.
        const world = makeWorld();
        fillRect(world, 5, 10, 8, 19, MATERIAL_STONE);
        expect(findFloatingBodies(ctxOf(world))).toHaveLength(0);
    });

    it('holds up a blob resting on sand or packed sand', () => {
        for (const bed of [MATERIAL_SAND, MATERIAL_PACKED_SAND]) {
            const world = makeWorld();
            fillRect(world, 5, 8, 8, 10, MATERIAL_STONE);
            fillRect(world, 0, 11, 19, 19, bed);
            expect(findFloatingBodies(ctxOf(world))).toHaveLength(0);
        }
    });

    it('does not let water or flora hold a blob up', () => {
        for (const soft of [MATERIAL_WATER, MATERIAL_KELP, MATERIAL_CORAL]) {
            const world = makeWorld();
            fillRect(world, 5, 8, 8, 10, MATERIAL_STONE);
            fillRect(world, 0, 11, 19, 19, soft);
            const bodies = findFloatingBodies(ctxOf(world));
            expect(bodies).toHaveLength(1);
            expect(bodies[0].size).toBe(12);
        }
    });

    it('gives no support from the side walls', () => {
        const world = makeWorld();
        fillRect(world, 0, 5, 3, 7, MATERIAL_STONE); // flush against the left wall
        expect(findFloatingBodies(ctxOf(world))).toHaveLength(1);
    });

    it('carries support through the mass from a single footing', () => {
        // An L: only the foot touches sand, but the whole shape is held.
        const world = makeWorld();
        fillRect(world, 5, 4, 6, 14, MATERIAL_STONE); // upright
        fillRect(world, 7, 13, 12, 14, MATERIAL_STONE); // foot
        fillRect(world, 0, 15, 19, 19, MATERIAL_SAND);
        expect(findFloatingBodies(ctxOf(world))).toHaveLength(0);

        // Dig the whole footing away and the entire L becomes one falling body.
        fillRect(world, 5, 15, 12, 19, 0);
        const bodies = findFloatingBodies(ctxOf(world));
        expect(bodies).toHaveLength(1);
        expect(bodies[0].size).toBe(34);
    });
});

describe('components', () => {
    it('separates blobs that do not touch', () => {
        const world = makeWorld();
        fillRect(world, 2, 5, 3, 6, MATERIAL_STONE);
        fillRect(world, 8, 5, 9, 6, MATERIAL_STONE);
        expect(findFloatingBodies(ctxOf(world))).toHaveLength(2);
    });

    it('treats a diagonal touch as two separate bodies', () => {
        // The move ordering assumes bodies are never 4-adjacent, so a diagonal
        // contact must not merge them.
        const world = makeWorld();
        put(world, 5, 5, MATERIAL_STONE);
        put(world, 6, 6, MATERIAL_STONE);
        const bodies = findFloatingBodies(ctxOf(world));
        expect(bodies).toHaveLength(2);
        expect(totalCells(bodies)).toBe(2);
    });

    it('splits one body into two when it is cut through', () => {
        const world = makeWorld();
        fillRect(world, 4, 4, 12, 9, MATERIAL_STONE);
        fillRect(world, 4, 6, 12, 6, 0); // horizontal cut
        const bodies = findFloatingBodies(ctxOf(world));
        expect(bodies).toHaveLength(2);
        expect(totalCells(bodies)).toBe(9 * 2 + 9 * 3);
    });
});

describe('descent', () => {
    it('refuses to descend off the bottom row', () => {
        const world = makeWorld();
        fillRect(world, 5, 18, 7, 19, MATERIAL_STONE);
        fillRect(world, 0, 10, 4, 19, MATERIAL_WATER); // keeps it floating-ish
        const ctx = ctxOf(world);
        const body: StoneBody = {
            minIndex: 18 * world.cols + 5,
            maxY: 19,
            size: 6,
            rowsDescending: [
                { y: 19, xs: [5, 6, 7] },
                { y: 18, xs: [5, 6, 7] }
            ],
            cells: new Set([
                19 * world.cols + 5,
                19 * world.cols + 6,
                19 * world.cols + 7,
                18 * world.cols + 5,
                18 * world.cols + 6,
                18 * world.cols + 7
            ])
        };
        expect(bodyCanDescend(ctx, body)).toBe(false);
    });

    it('descends into passable cells but not onto ground', () => {
        const build = (below: number): boolean => {
            const world = makeWorld();
            fillRect(world, 5, 8, 7, 9, MATERIAL_STONE);
            fillRect(world, 0, 10, 19, 19, below);
            const bodies = findFloatingBodies(ctxOf(world));
            if (bodies.length === 0) return false; // grounded, so it cannot fall
            return bodyCanDescend(ctxOf(world), bodies[0]);
        };
        expect(build(MATERIAL_WATER)).toBe(true);
        expect(build(MATERIAL_KELP)).toBe(true);
        expect(build(MATERIAL_CORAL)).toBe(true);
        expect(build(MATERIAL_SAND)).toBe(false); // grounded — never floats
    });

    it('every floating body can always take its first step down', () => {
        // A theorem of the grounding rule: if a cell could not descend, whatever
        // is beneath it would have grounded it. This guards against a future
        // material or rule change quietly breaking that.
        const shapes: Array<(w: World) => void> = [
            (w) => fillRect(w, 3, 3, 9, 6, MATERIAL_STONE),
            (w) => {
                fillRect(w, 2, 2, 3, 12, MATERIAL_STONE);
                fillRect(w, 4, 11, 10, 12, MATERIAL_STONE);
            },
            (w) => {
                // C-shape: two runs in the middle columns
                fillRect(w, 4, 4, 10, 5, MATERIAL_STONE);
                fillRect(w, 4, 6, 5, 8, MATERIAL_STONE);
                fillRect(w, 4, 9, 10, 10, MATERIAL_STONE);
            },
            (w) => {
                fillRect(w, 2, 3, 4, 5, MATERIAL_STONE);
                fillRect(w, 12, 8, 15, 11, MATERIAL_STONE);
            }
        ];
        for (const shape of shapes) {
            for (const surround of [0, MATERIAL_WATER, MATERIAL_KELP]) {
                const world = makeWorld(24, 24);
                if (surround !== 0) fillRect(world, 0, 0, 23, 23, surround);
                shape(world);
                const ctx = ctxOf(world);
                for (const body of findFloatingBodies(ctx)) {
                    expect(bodyCanDescend(ctx, body)).toBe(true);
                }
            }
        }
    });
});

describe('bodyRuns', () => {
    it('splits a column with a gap into two runs', () => {
        const world = makeWorld();
        // C-shape: column 4 is solid, columns 6..10 have a gap in the middle.
        fillRect(world, 4, 4, 10, 5, MATERIAL_STONE);
        fillRect(world, 4, 6, 5, 8, MATERIAL_STONE);
        fillRect(world, 4, 9, 10, 10, MATERIAL_STONE);
        const bodies = findFloatingBodies(ctxOf(world));
        expect(bodies).toHaveLength(1);

        const runs = bodyRuns(bodies[0]);
        const column4 = runs.filter((r) => r.x === 4);
        const column8 = runs.filter((r) => r.x === 8);
        expect(column4).toHaveLength(1); // solid all the way down
        expect(column8).toHaveLength(2); // top bar and bottom bar
        expect(column8.map((r) => [r.yTop, r.yBot])).toEqual([
            [4, 5],
            [9, 10]
        ]);
    });
});

describe('tipping off a perch', () => {
    // Tipping is judged on a body that has just touched down, so it is
    // grounded by then and findFloatingBodies rightly ignores it. Build the
    // body directly, the way the engine still holds one mid-landing.
    const rectBody = (world: World, x0: number, y0: number, x1: number, y1: number): StoneBody => {
        const rowsDescending: Array<{ y: number; xs: number[] }> = [];
        const cells = new Set<number>();
        for (let y = y1; y >= y0; y--) {
            const xs: number[] = [];
            for (let x = x0; x <= x1; x++) {
                xs.push(x);
                cells.add(y * world.cols + x);
            }
            rowsDescending.push({ y, xs });
        }
        return {
            minIndex: y0 * world.cols + x0,
            maxY: y1,
            size: (x1 - x0 + 1) * (y1 - y0 + 1),
            rowsDescending,
            cells
        };
    };

    // A slab whose middle rests on one pinnacle of sand, weight hanging out.
    const perched = (pinnacleX: number): { ctx: StoneContext; body: StoneBody } => {
        const world = makeWorld(30, 20);
        fillRect(world, 5, 8, 24, 9, MATERIAL_STONE); // slab, centre at x=14.5
        put(world, pinnacleX, 10, MATERIAL_SAND); // the single grain holding it
        return { ctx: ctxOf(world), body: rectBody(world, 5, 8, 24, 9) };
    };

    it('reports the footing the slab is actually standing on', () => {
        const { ctx, body } = perched(14);
        expect(bodySupport(ctx, body)).toEqual({ minX: 14, maxX: 14 });
        expect(bodyCentreX(body)).toBeCloseTo(14.5, 5);
    });

    it('stands firm while its centre is over the footing', () => {
        const world = makeWorld(30, 20);
        fillRect(world, 5, 8, 24, 9, MATERIAL_STONE);
        fillRect(world, 5, 10, 24, 10, MATERIAL_SAND); // fully supported
        const ctx = ctxOf(world);
        expect(findFloatingBodies(ctx)).toHaveLength(0); // grounded, never tips
    });

    it('tips toward whichever side its weight hangs over', () => {
        // Pinnacle left of centre: the mass overhangs to the right.
        const right = perched(8);
        expect(bodyTipDirection(right.ctx, right.body)).toBe(1);

        // Pinnacle right of centre: it overhangs to the left.
        const left = perched(21);
        expect(bodyTipDirection(left.ctx, left.body)).toBe(-1);
    });

    it('topples even when balanced dead centre on a pinnacle', () => {
        // Centre 14.5 sitting on a single grain at 14 is balanced only in
        // theory. A slab does not stand on a pinhead, so it must come off.
        const { ctx, body } = perched(14);
        expect(bodyTipDirection(ctx, body)).not.toBe(0);
    });

    it('settles once the footing is broad enough to hold it', () => {
        const world = makeWorld(30, 20);
        fillRect(world, 5, 8, 24, 9, MATERIAL_STONE); // 20 wide, centre 14.5
        fillRect(world, 9, 10, 20, 10, MATERIAL_SAND); // 12-wide footing under it
        const ctx = ctxOf(world);
        const body = rectBody(world, 5, 8, 24, 9);
        expect(bodyTipDirection(ctx, body)).toBe(0);
    });

    it('leaves a small block alone on a narrow footing', () => {
        // A pebble genuinely can sit on a single grain; the rule is about
        // wide slabs, so short bodies are exempt.
        const world = makeWorld(30, 20);
        fillRect(world, 10, 8, 12, 8, MATERIAL_STONE); // 3 wide, centre 11
        put(world, 11, 9, MATERIAL_SAND);
        const ctx = ctxOf(world);
        const body = rectBody(world, 10, 8, 12, 8);
        expect(bodyTipDirection(ctx, body)).toBe(0);
    });

    it('does not tip a body that is simply falling', () => {
        const world = makeWorld(30, 20);
        fillRect(world, 5, 8, 10, 9, MATERIAL_STONE); // nothing beneath at all
        const ctx = ctxOf(world);
        const body = findFloatingBodies(ctx)[0];
        expect(bodySupport(ctx, body)).toBeNull();
        expect(bodyTipDirection(ctx, body)).toBe(0);
    });

    it('will not slide into a wall or off the grid', () => {
        const world = makeWorld(30, 20);
        fillRect(world, 5, 8, 10, 9, MATERIAL_STONE);
        fillRect(world, 11, 8, 11, 9, MATERIAL_PACKED_SAND); // blocked to the right
        const ctx = ctxOf(world);
        const body = findFloatingBodies(ctx)[0];
        expect(bodyCanShift(ctx, body, 1)).toBe(false);
        expect(bodyCanShift(ctx, body, -1)).toBe(true);

        const edge = makeWorld(30, 20);
        fillRect(edge, 0, 8, 4, 9, MATERIAL_STONE); // flush to the left wall
        const edgeCtx = ctxOf(edge);
        const edgeBody = findFloatingBodies(edgeCtx)[0];
        expect(bodyCanShift(edgeCtx, edgeBody, -1)).toBe(false);
    });

    it('slides sideways without losing or duplicating a cell', () => {
        const world = makeWorld(20, 12);
        fillRect(world, 4, 4, 8, 6, MATERIAL_STONE);
        const body = findFloatingBodies(ctxOf(world))[0];

        // Mirror the engine's apply loop: leading edge first, then hand the
        // swallowed cell back out at the tail.
        const runs = bodyRowRuns(body);
        const swallowed = runs.map((run) => world.map.get(`${run.xRight + 1},${run.y}`) ?? 0);
        for (const { y, xs } of body.rowsDescending) {
            for (const x of [...xs].sort((a, b) => b - a)) {
                put(world, x + 1, y, world.map.get(`${x},${y}`) ?? 0);
            }
        }
        runs.forEach((run, i) => put(world, run.xLeft, run.y, swallowed[i]));

        let stone = 0;
        for (let y = 0; y < 12; y++) {
            for (let x = 0; x < 20; x++) {
                if ((world.map.get(`${x},${y}`) ?? 0) !== MATERIAL_STONE) continue;
                stone++;
                expect(x).toBeGreaterThanOrEqual(5); // moved one column right
                expect(x).toBeLessThanOrEqual(9);
            }
        }
        expect(stone).toBe(15);
    });
});

describe('enclosed pockets', () => {
    const CAP = 6000;

    it('fills the hollow inside a closed ring', () => {
        const world = makeWorld(24, 24);
        // A hollow square: walls only.
        fillRect(world, 5, 5, 15, 5, MATERIAL_STONE);
        fillRect(world, 5, 15, 15, 15, MATERIAL_STONE);
        fillRect(world, 5, 5, 5, 15, MATERIAL_STONE);
        fillRect(world, 15, 5, 15, 15, MATERIAL_STONE);
        const enclosed = findEnclosedCells(ctxOf(world), CAP);
        expect(enclosed).toHaveLength(9 * 9); // the interior, nothing else
    });

    it('fills a pocket regardless of what is sitting in it', () => {
        const world = makeWorld(24, 24);
        fillRect(world, 5, 5, 15, 15, MATERIAL_WATER);
        fillRect(world, 5, 5, 15, 5, MATERIAL_STONE);
        fillRect(world, 5, 15, 15, 15, MATERIAL_STONE);
        fillRect(world, 5, 5, 5, 15, MATERIAL_STONE);
        fillRect(world, 15, 5, 15, 15, MATERIAL_STONE);
        expect(findEnclosedCells(ctxOf(world), CAP)).toHaveLength(9 * 9);
    });

    it('leaves an open shape alone', () => {
        const world = makeWorld(24, 24);
        // Same square with one wall cell missing — it leaks, so nothing fills.
        fillRect(world, 5, 5, 15, 5, MATERIAL_STONE);
        fillRect(world, 5, 15, 15, 15, MATERIAL_STONE);
        fillRect(world, 5, 5, 5, 15, MATERIAL_STONE);
        fillRect(world, 15, 5, 15, 15, MATERIAL_STONE);
        put(world, 15, 10, 0); // puncture
        expect(findEnclosedCells(ctxOf(world), CAP)).toHaveLength(0);
    });

    it('does not treat the screen edge as a wall', () => {
        // A C against the left edge: open to the world, so not enclosed.
        const world = makeWorld(24, 24);
        fillRect(world, 0, 5, 10, 5, MATERIAL_STONE);
        fillRect(world, 0, 15, 10, 15, MATERIAL_STONE);
        fillRect(world, 10, 5, 10, 15, MATERIAL_STONE);
        expect(findEnclosedCells(ctxOf(world), CAP)).toHaveLength(0);
    });

    it('refuses a pocket bigger than the cap', () => {
        const world = makeWorld(40, 40);
        fillRect(world, 2, 2, 37, 2, MATERIAL_STONE);
        fillRect(world, 2, 37, 37, 37, MATERIAL_STONE);
        fillRect(world, 2, 2, 2, 37, MATERIAL_STONE);
        fillRect(world, 37, 2, 37, 37, MATERIAL_STONE);
        expect(findEnclosedCells(ctxOf(world), 100)).toHaveLength(0); // too big
        expect(findEnclosedCells(ctxOf(world), 6000).length).toBeGreaterThan(1000);
    });
});

describe('moving a body down', () => {
    it('never writes into a cell it has not yet vacated', () => {
        // Simulates the engine's apply loop: walk rows bottom-up, move each
        // cell down one, then refill each run's vacated top with whatever the
        // run swallowed. The result must be the same shape one row lower with
        // the displaced water lifted above it.
        const world = makeWorld(12, 12);
        fillRect(world, 0, 0, 11, 11, MATERIAL_WATER);
        fillRect(world, 3, 4, 6, 6, MATERIAL_STONE);
        const ctx = ctxOf(world);
        const bodies = findFloatingBodies(ctx);
        expect(bodies).toHaveLength(1);
        const body = bodies[0];

        const runs = bodyRuns(body);
        const swallowed = runs.map((run) => world.map.get(`${run.x},${run.yBot + 1}`) ?? 0);
        for (const { y, xs } of body.rowsDescending) {
            for (const x of xs) {
                put(world, x, y + 1, world.map.get(`${x},${y}`) ?? 0);
            }
        }
        runs.forEach((run, i) => put(world, run.x, run.yTop, swallowed[i]));

        // Shape preserved, one row lower, nothing lost.
        let stone = 0;
        for (let y = 0; y < 12; y++) {
            for (let x = 0; x < 12; x++) {
                if ((world.map.get(`${x},${y}`) ?? 0) === MATERIAL_STONE) {
                    stone++;
                    expect(y).toBeGreaterThanOrEqual(5);
                    expect(y).toBeLessThanOrEqual(7);
                    expect(x).toBeGreaterThanOrEqual(3);
                    expect(x).toBeLessThanOrEqual(6);
                }
            }
        }
        expect(stone).toBe(12);
        // The water it swallowed came back out on top, so volume is conserved.
        for (let x = 3; x <= 6; x++) {
            expect(world.map.get(`${x},4`)).toBe(MATERIAL_WATER);
        }
    });
});
