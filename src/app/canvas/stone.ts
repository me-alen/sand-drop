// Rigid-body gravity for stone. Like flora.ts, grid access is injected through
// a single materialAt callback so the logic can be unit-tested against a Map.
//
// Stone is the one material that moves as a MASS rather than as grains. A
// connected run of it either rests on the ground or it does not; if it does
// not, the whole thing drops keeping its exact shape. That is why stone is
// deliberately kept out of the particle system — a stone particle would go
// through settleSand and roll down slopes like a grain of sand, which is the
// opposite of what a slab should do.
//
// A stone cell is GROUNDED when it sits on the bottom row, or on sand, or
// connects (4-way, through stone) to a cell that does. Everything else floats.
import {
    MATERIAL_CORAL,
    MATERIAL_KELP,
    MATERIAL_GLASS,
    MATERIAL_LAVA,
    MATERIAL_PACKED_SAND,
    MATERIAL_SAND,
    MATERIAL_STONE,
    MATERIAL_WATER
} from './constants';

export type StoneContext = {
    cols: number;
    rows: number;
    materialAt: (x: number, y: number) => number;
};

export type StoneRun = { x: number; yTop: number; yBot: number };

export type StoneBody = {
    // Linear index of the topmost-leftmost cell. Stable enough to carry a
    // body's fall speed across a rescan: it shifts by exactly cols per row
    // descended.
    minIndex: number;
    maxY: number;
    size: number;
    // Rows walked from the bottom up, which is the only safe order to move a
    // body down by one: the cell below has already been vacated.
    rowsDescending: Array<{ y: number; xs: number[] }>;
    cells: Set<number>;
};

export const isStoneMaterial = (material: number): boolean => material === MATERIAL_STONE;

// What can hold a slab up. Water and flora cannot; sand, packed sand and the
// thick body of lava can.
const isGround = (material: number): boolean =>
    material === MATERIAL_SAND ||
    material === MATERIAL_PACKED_SAND ||
    material === MATERIAL_LAVA ||
    material === MATERIAL_GLASS;

// What a slab can move into, crushing or displacing it.
const isPassable = (material: number): boolean =>
    material === 0 ||
    material === MATERIAL_WATER ||
    material === MATERIAL_KELP ||
    material === MATERIAL_CORAL;

// Scratch buffers reused across scans: a scan should not allocate. `visited`
// and `grouped` are stamped with a generation counter rather than cleared.
let visited = new Int32Array(0);
let grouped = new Int32Array(0);
let queue = new Int32Array(0);
let generation = 0;

const ensureBuffers = (size: number): void => {
    if (visited.length >= size) return;
    visited = new Int32Array(size);
    grouped = new Int32Array(size);
    queue = new Int32Array(size);
    generation = 0;
};

// Every connected run of stone with no path to the ground.
export const findFloatingBodies = (ctx: StoneContext): StoneBody[] => {
    const { cols, rows } = ctx;
    const size = cols * rows;
    if (size === 0) return [];
    ensureBuffers(size);

    const groundedStamp = ++generation;
    let head = 0;
    let tail = 0;
    let stoneCount = 0;

    // Seed the flood from every stone cell that is already standing on
    // something, then let support propagate through the mass.
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (!isStoneMaterial(ctx.materialAt(x, y))) continue;
            stoneCount++;
            const restsOnGround = y === rows - 1 || isGround(ctx.materialAt(x, y + 1));
            if (!restsOnGround) continue;
            const index = y * cols + x;
            if (visited[index] === groundedStamp) continue;
            visited[index] = groundedStamp;
            queue[tail++] = index;
        }
    }

    let reached = 0;
    while (head < tail) {
        const index = queue[head++];
        reached++;
        const x = index % cols;
        const y = (index - x) / cols;
        // 4-way: a diagonal touch is not a rigid connection, and the move
        // ordering downstream relies on that.
        if (x > 0) tail = tryPush(ctx, x - 1, y, cols, groundedStamp, tail);
        if (x < cols - 1) tail = tryPush(ctx, x + 1, y, cols, groundedStamp, tail);
        if (y > 0) tail = tryPush(ctx, x, y - 1, cols, groundedStamp, tail);
        if (y < rows - 1) tail = tryPush(ctx, x, y + 1, cols, groundedStamp, tail);
    }

    // The overwhelmingly common case: everything is standing on something.
    if (reached === stoneCount) return [];

    const bodyStamp = ++generation;
    const bodies: StoneBody[] = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const index = y * cols + x;
            if (!isStoneMaterial(ctx.materialAt(x, y))) continue;
            if (visited[index] === groundedStamp) continue; // held up
            if (grouped[index] === bodyStamp) continue; // already collected
            bodies.push(collectBody(ctx, index, bodyStamp));
        }
    }
    return bodies;
};

const tryPush = (
    ctx: StoneContext,
    x: number,
    y: number,
    cols: number,
    stamp: number,
    tail: number
): number => {
    const index = y * cols + x;
    if (visited[index] === stamp) return tail;
    if (!isStoneMaterial(ctx.materialAt(x, y))) return tail;
    visited[index] = stamp;
    queue[tail++] = index;
    return tail;
};

// Flood one floating component, bucketing its cells by row on the way.
const collectBody = (ctx: StoneContext, start: number, stamp: number): StoneBody => {
    const { cols, rows } = ctx;
    const byRow = new Map<number, number[]>();
    const cells = new Set<number>();
    let minIndex = start;
    let maxY = 0;
    let size = 0;

    let head = 0;
    let tail = 0;
    grouped[start] = stamp;
    queue[tail++] = start;

    while (head < tail) {
        const index = queue[head++];
        const x = index % cols;
        const y = (index - x) / cols;
        size++;
        cells.add(index);
        if (index < minIndex) minIndex = index;
        if (y > maxY) maxY = y;
        const row = byRow.get(y);
        if (row) row.push(x);
        else byRow.set(y, [x]);

        if (x > 0) tail = tryGroup(ctx, x - 1, y, cols, stamp, tail);
        if (x < cols - 1) tail = tryGroup(ctx, x + 1, y, cols, stamp, tail);
        if (y > 0) tail = tryGroup(ctx, x, y - 1, cols, stamp, tail);
        if (y < rows - 1) tail = tryGroup(ctx, x, y + 1, cols, stamp, tail);
    }

    const rowsDescending = Array.from(byRow.entries())
        .map(([y, xs]) => ({ y, xs }))
        .sort((a, b) => b.y - a.y);

    return { minIndex, maxY, size, rowsDescending, cells };
};

// Every mass that is not at rest: the ones with nothing under them, plus the
// ones perched so badly they are still toppling. A body that has landed is no
// longer "floating", so tracking floating alone would drop it the moment it
// touched down and freeze it mid-topple on a pinnacle.
export const findUnstableBodies = (ctx: StoneContext): StoneBody[] => {
    const { cols, rows } = ctx;
    const size = cols * rows;
    if (size === 0) return [];
    ensureBuffers(size);

    const groundedStamp = ++generation;
    let head = 0;
    let tail = 0;
    let stoneCount = 0;

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (!isStoneMaterial(ctx.materialAt(x, y))) continue;
            stoneCount++;
            const restsOnGround = y === rows - 1 || isGround(ctx.materialAt(x, y + 1));
            if (!restsOnGround) continue;
            const index = y * cols + x;
            if (visited[index] === groundedStamp) continue;
            visited[index] = groundedStamp;
            queue[tail++] = index;
        }
    }
    if (stoneCount === 0) return [];

    while (head < tail) {
        const index = queue[head++];
        const x = index % cols;
        const y = (index - x) / cols;
        if (x > 0) tail = tryPush(ctx, x - 1, y, cols, groundedStamp, tail);
        if (x < cols - 1) tail = tryPush(ctx, x + 1, y, cols, groundedStamp, tail);
        if (y > 0) tail = tryPush(ctx, x, y - 1, cols, groundedStamp, tail);
        if (y < rows - 1) tail = tryPush(ctx, x, y + 1, cols, groundedStamp, tail);
    }

    const bodyStamp = ++generation;
    const unstable: StoneBody[] = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const index = y * cols + x;
            if (!isStoneMaterial(ctx.materialAt(x, y))) continue;
            if (grouped[index] === bodyStamp) continue;
            const body = collectBody(ctx, index, bodyStamp);
            const floating = visited[index] !== groundedStamp;
            if (floating || bodyTipDirection(ctx, body) !== 0) unstable.push(body);
        }
    }
    return unstable;
};

const tryGroup = (
    ctx: StoneContext,
    x: number,
    y: number,
    cols: number,
    stamp: number,
    tail: number
): number => {
    const index = y * cols + x;
    if (grouped[index] === stamp) return tail;
    if (!isStoneMaterial(ctx.materialAt(x, y))) return tail;
    grouped[index] = stamp;
    queue[tail++] = index;
    return tail;
};

// Whether the whole body can drop one row. A cell may descend into anything
// passable, or into another cell of the same body — but not onto ground, and
// not onto stone belonging to a body that is already standing.
export const bodyCanDescend = (ctx: StoneContext, body: StoneBody): boolean => {
    const { cols, rows } = ctx;
    for (const { y, xs } of body.rowsDescending) {
        const below = y + 1;
        if (below >= rows) return false;
        for (const x of xs) {
            if (body.cells.has(below * cols + x)) continue;
            if (!isPassable(ctx.materialAt(x, below))) return false;
        }
    }
    return true;
};

// ------------------------------------------------------------- stability

// Mean column of the body — its centre of mass, since every cell weighs the
// same.
export const bodyCentreX = (body: StoneBody): number => {
    let total = 0;
    let count = 0;
    for (const { xs } of body.rowsDescending) {
        for (const x of xs) {
            total += x;
            count++;
        }
    }
    return count === 0 ? 0 : total / count;
};

// The span of ground the body is actually standing on. Null when nothing is
// holding it at all.
export const bodySupport = (
    ctx: StoneContext,
    body: StoneBody
): { minX: number; maxX: number } | null => {
    const { cols, rows } = ctx;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const { y, xs } of body.rowsDescending) {
        const below = y + 1;
        for (const x of xs) {
            if (below >= rows) {
                // The floor of the world counts as ground.
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                continue;
            }
            if (body.cells.has(below * cols + x)) continue;
            if (isPassable(ctx.materialAt(x, below))) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
        }
    }
    return maxX < minX ? null : { minX, maxX };
};

// Horizontal extent of the body.
export const bodyBounds = (body: StoneBody): { minX: number; maxX: number } => {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const { xs } of body.rowsDescending) {
        for (const x of xs) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
        }
    }
    return { minX, maxX };
};

// A footing this much narrower than the body cannot hold it up, however neatly
// the weight is centred over it.
const NARROW_FOOTING_RATIO = 4;

// Which way a perched body topples. A mass balances only while its centre sits
// over its footing — and even then, not on a pinhead: a wide slab landing dead
// centre on a single spike is balanced only in theory, so it is toppled toward
// whichever side has more room rather than left standing on one pixel.
export const bodyTipDirection = (ctx: StoneContext, body: StoneBody): -1 | 0 | 1 => {
    const support = bodySupport(ctx, body);
    if (!support) return 0; // nothing to pivot on — it is simply falling
    const centre = bodyCentreX(body);
    // Half a cell of slack so a body centred on the lip of its footing does
    // not jitter back and forth.
    if (centre > support.maxX + 0.5) return 1;
    if (centre < support.minX - 0.5) return -1;

    const bounds = bodyBounds(body);
    const width = bounds.maxX - bounds.minX + 1;
    const footing = support.maxX - support.minX + 1;
    if (width < 4 || footing * NARROW_FOOTING_RATIO >= width) return 0; // genuinely settled

    // Balanced on a pinnacle: fall off the side that overhangs further, and
    // break an exact tie deterministically so it never dithers.
    const leftOverhang = support.minX - bounds.minX;
    const rightOverhang = bounds.maxX - support.maxX;
    if (rightOverhang > leftOverhang) return 1;
    if (leftOverhang > rightOverhang) return -1;
    return body.minIndex % 2 === 0 ? 1 : -1;
};

// Whether the whole body can slide one column sideways.
export const bodyCanShift = (ctx: StoneContext, body: StoneBody, dir: -1 | 1): boolean => {
    const { cols } = ctx;
    for (const { y, xs } of body.rowsDescending) {
        for (const x of xs) {
            const next = x + dir;
            if (next < 0 || next >= cols) return false;
            if (body.cells.has(y * cols + next)) continue;
            if (!isPassable(ctx.materialAt(next, y))) return false;
        }
    }
    return true;
};

// Contiguous horizontal runs, the sideways counterpart of bodyRuns: shifting
// by one vacates the trailing end of each run and swallows the cell past its
// leading end.
export const bodyRowRuns = (body: StoneBody): Array<{ y: number; xLeft: number; xRight: number }> => {
    const runs: Array<{ y: number; xLeft: number; xRight: number }> = [];
    for (const { y, xs } of body.rowsDescending) {
        const sorted = [...xs].sort((a, b) => a - b);
        let xLeft = sorted[0];
        let previous = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === previous + 1) {
                previous = sorted[i];
                continue;
            }
            runs.push({ y, xLeft, xRight: previous });
            xLeft = sorted[i];
            previous = sorted[i];
        }
        runs.push({ y, xLeft, xRight: previous });
    }
    return runs;
};

// ---------------------------------------------------------- enclosed space

// Cells walled in by stone, found by flooding inward from the border through
// everything that is not stone: whatever the flood cannot reach is enclosed.
// The screen edge is deliberately not a wall, so only a genuinely closed loop
// of stone traps anything. Returns an empty list if the pocket is larger than
// `maxCells`, so a stray shape cannot petrify half the world.
export const findEnclosedCells = (ctx: StoneContext, maxCells: number): number[] => {
    const { cols, rows } = ctx;
    const size = cols * rows;
    if (size === 0) return [];
    ensureBuffers(size);

    const stamp = ++generation;
    let head = 0;
    let tail = 0;

    const seed = (x: number, y: number): void => {
        const index = y * cols + x;
        if (visited[index] === stamp) return;
        if (isStoneMaterial(ctx.materialAt(x, y))) return;
        visited[index] = stamp;
        queue[tail++] = index;
    };

    for (let x = 0; x < cols; x++) {
        seed(x, 0);
        seed(x, rows - 1);
    }
    for (let y = 0; y < rows; y++) {
        seed(0, y);
        seed(cols - 1, y);
    }

    while (head < tail) {
        const index = queue[head++];
        const x = index % cols;
        const y = (index - x) / cols;
        if (x > 0) seed(x - 1, y);
        if (x < cols - 1) seed(x + 1, y);
        if (y > 0) seed(x, y - 1);
        if (y < rows - 1) seed(x, y + 1);
    }

    const enclosed: number[] = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const index = y * cols + x;
            if (visited[index] === stamp) continue;
            if (isStoneMaterial(ctx.materialAt(x, y))) continue;
            enclosed.push(index);
            if (enclosed.length > maxCells) return [];
        }
    }
    return enclosed;
};

// Contiguous vertical runs, one per gap-free stretch of a column. Moving a
// body down by one vacates exactly the top of each run and swallows exactly
// the cell under its bottom, so these pair up the swap.
export const bodyRuns = (body: StoneBody): StoneRun[] => {
    const byColumn = new Map<number, number[]>();
    for (const { y, xs } of body.rowsDescending) {
        for (const x of xs) {
            const ys = byColumn.get(x);
            if (ys) ys.push(y);
            else byColumn.set(x, [y]);
        }
    }

    const runs: StoneRun[] = [];
    for (const [x, ys] of Array.from(byColumn.entries())) {
        ys.sort((a, b) => a - b);
        let yTop = ys[0];
        let previous = ys[0];
        for (let i = 1; i < ys.length; i++) {
            if (ys[i] === previous + 1) {
                previous = ys[i];
                continue;
            }
            runs.push({ x, yTop, yBot: previous });
            yTop = ys[i];
            previous = ys[i];
        }
        runs.push({ x, yTop, yBot: previous });
    }
    return runs;
};
