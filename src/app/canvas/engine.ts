import { gameAudio, vibrate } from './audio';
import { buildRandomSandCastle } from './castle';
import { hslToPackedColor, packedColorToCss, withMaterial } from './color';
import {
    DEFAULT_GRAINS_PER_DROP,
    DROP_SAND_HUE_STEP,
    DROP_SAND_LIGHTNESS,
    DROP_SAND_SATURATION,
    ERASE_BRUSH_RADIUS_CELLS,
    EXPLOSION_FULL_CHARGE_MS,
    GRAVITY_CELLS_PER_S2,
    INITIAL_SAND_BASE_HUE,
    INITIAL_SAND_HEIGHT_RATIO,
    MATERIAL_PACKED_SAND,
    MATERIAL_SAND,
    MATERIAL_STONE,
    MATERIAL_WATER,
    MAX_ACTIVE_PARTICLES,
    MAX_EXPLOSION_RADIUS_CELLS,
    MAX_FALL_SPEED_CELLS_PER_S,
    MIN_EXPLOSION_RADIUS_CELLS,
    PURE_SAND_LIGHTNESS,
    PURE_SAND_SATURATION,
    SPAWN_INTERVAL_MS,
    SQUARE_SIZE,
    STONE_BRUSH_RADIUS_CELLS,
    STONE_HUE,
    STONE_LIGHTNESS,
    STONE_SATURATION,
    TILT_MAX_GRAVITY_RATIO,
    TOPPLE_HEIGHT_DIFF_CELLS,
    WATER_FLOW_HOPS_PER_TICK,
    WATER_HUE,
    WATER_LEVEL_SCAN_RANGE,
    WATER_LIGHTNESS,
    WATER_MAX_FLOW_HOPS,
    WATER_SATURATION,
    WATER_TERMINAL_FALL_CELLS_PER_S
} from './constants';
import { decodeRle, encodeRle, SavedGrid } from './storage';

const CELL = SQUARE_SIZE;
const STEP_MS = 1000 / 60;
// Enough fixed steps to fully catch up a (clamped) 100ms frame, so slow or
// janky devices simulate at real speed instead of slow motion.
const MAX_CATCHUP_STEPS = 6;
const TWO_PI = Math.PI * 2;
const SHAKE_DURATION_MS = 260;
const SPARK_GRAVITY_PX_PER_S2 = 900;

// Sand/water particles live in fractional grid-cell coordinates; visual
// effects (sparks, shockwaves, flashes, shooting stars) live in css pixels.
type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    flow: number;
    color: number;
    css: string;
};

type Spark = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    bornAt: number;
    lifeMs: number;
    hue: number;
};

type Shockwave = { x: number; y: number; maxRadius: number; bornAt: number; durMs: number };
type Flash = { x: number; y: number; radius: number; bornAt: number; durMs: number };
type Star = { x: number; y: number; size: number; baseAlpha: number; phase: number; speed: number };
type ShootingStar = { x: number; y: number; vx: number; vy: number; bornAt: number; lifeMs: number };
type ChargeState = { cellX: number; cellY: number; startMs: number };

export type Brush = 'sand' | 'water' | 'stone' | 'erase';
export type PointerAction = 'charge' | 'pour';

export class SandEngine {
    grainsPerDrop = DEFAULT_GRAINS_PER_DROP;
    useColoredDrops = true;
    brush: Brush = 'sand';

    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly gridCanvas: HTMLCanvasElement;
    private readonly gridCtx: CanvasRenderingContext2D;

    private cols = 0;
    private rows = 0;
    private cssWidth = 0;
    private cssHeight = 0;
    private gridImage: ImageData | null = null;
    private pixels: Uint32Array = new Uint32Array(0);
    private gridDirty = true;

    private particles: Particle[] = [];
    private sparks: Spark[] = [];
    private shockwaves: Shockwave[] = [];
    private flashes: Flash[] = [];
    private stars: Star[] = [];
    private shootingStars: ShootingStar[] = [];
    private moonCanvas: HTMLCanvasElement | null = null;
    private dirtyColumns = new Set<number>();

    private charge: ChargeState | null = null;
    private chargeReadyFired = false;
    private pointerX = 0;
    private pointerY = 0;
    private pointerDown = false;
    private lastSpawnMs = 0;
    private lastPaint: { x: number; y: number } | null = null;
    private hue = Math.random() * 360;
    private gravityX = 0;

    private shakeUntil = 0;
    private shakeMagnitude = 0;

    private rafId: number | null = null;
    private lastFrameMs: number | null = null;
    private accumulatorMs = 0;
    private disposed = false;

    static create(canvas: HTMLCanvasElement): SandEngine | null {
        let ctx: CanvasRenderingContext2D | null = null;
        try {
            ctx = canvas.getContext('2d');
        } catch {
            ctx = null;
        }
        if (!ctx) return null;

        const gridCanvas = document.createElement('canvas');
        const gridCtx = gridCanvas.getContext('2d');
        if (!gridCtx) return null;

        return new SandEngine(canvas, ctx, gridCanvas, gridCtx);
    }

    private constructor(
        canvas: HTMLCanvasElement,
        ctx: CanvasRenderingContext2D,
        gridCanvas: HTMLCanvasElement,
        gridCtx: CanvasRenderingContext2D
    ) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.gridCanvas = gridCanvas;
        this.gridCtx = gridCtx;
        this.buildMoon();
        this.handleResize();
        this.reset();
    }

    start(): void {
        if (this.rafId !== null) return;
        this.rafId = requestAnimationFrame(this.frame);
    }

    dispose(): void {
        this.disposed = true;
        gameAudio.stopPour();
        gameAudio.stopCharge();
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    reset(): void {
        this.pixels.fill(0);
        this.particles = [];
        this.sparks = [];
        this.shockwaves = [];
        this.flashes = [];
        this.shootingStars = [];
        this.dirtyColumns.clear();
        this.charge = null;
        this.chargeReadyFired = false;
        this.pointerDown = false;
        this.lastPaint = null;
        this.gridDirty = true;
        gameAudio.stopPour();
        gameAudio.stopCharge();
        this.seedTerrain();
        this.buildCastle();
    }

    handleResize(): void {
        const cssWidth = Math.max(1, this.canvas.clientWidth || window.innerWidth);
        const cssHeight = Math.max(1, this.canvas.clientHeight || window.innerHeight);
        // Backgrounded tabs and mid-rotation layouts can report a ~zero size;
        // rebuilding the grid from that would wipe the whole sandbox.
        if (this.cols > 0 && (cssWidth < 40 || cssHeight < 40)) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        this.cssWidth = cssWidth;
        this.cssHeight = cssHeight;
        this.canvas.width = Math.round(cssWidth * dpr);
        this.canvas.height = Math.round(cssHeight * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const newCols = Math.max(1, Math.floor(cssWidth / CELL));
        const newRows = Math.max(1, Math.floor(cssHeight / CELL));
        this.regenerateStars();
        if (newCols === this.cols && newRows === this.rows) return;

        this.gridCanvas.width = newCols;
        this.gridCanvas.height = newRows;
        const newImage = this.gridCtx.createImageData(newCols, newRows);
        const newPixels = new Uint32Array(newImage.data.buffer);

        // Anchor the old grid to the bottom edge so the sand floor survives
        // height changes (mobile address bar show/hide fires resizes).
        const rowOffset = newRows - this.rows;
        const copyCols = Math.min(this.cols, newCols);
        for (let y = 0; y < this.rows; y++) {
            const newY = y + rowOffset;
            if (newY < 0 || newY >= newRows) continue;
            for (let x = 0; x < copyCols; x++) {
                newPixels[newY * newCols + x] = this.pixels[y * this.cols + x];
            }
        }

        this.cols = newCols;
        this.rows = newRows;
        this.gridImage = newImage;
        this.pixels = newPixels;
        this.gridDirty = true;

        this.particles = this.particles.filter((p) => p.x < newCols);
        for (const particle of this.particles) {
            particle.y = Math.min(particle.y, newRows - 1);
        }
        for (let x = 0; x < newCols; x++) this.dirtyColumns.add(x);
    }

    setTilt(ratio: number): void {
        const clamped = Math.max(-1, Math.min(ratio, 1));
        this.gravityX = clamped * GRAVITY_CELLS_PER_S2 * TILT_MAX_GRAVITY_RATIO;
    }

    serialize(): SavedGrid {
        return { version: 1, cols: this.cols, rows: this.rows, grid: encodeRle(this.pixels) };
    }

    restore(saved: SavedGrid): boolean {
        const data = decodeRle(saved.grid, saved.cols * saved.rows);
        if (!data) return false;

        this.pixels.fill(0);
        const rowOffset = this.rows - saved.rows;
        const copyCols = Math.min(saved.cols, this.cols);
        for (let y = 0; y < saved.rows; y++) {
            const newY = y + rowOffset;
            if (newY < 0 || newY >= this.rows) continue;
            for (let x = 0; x < copyCols; x++) {
                this.pixels[newY * this.cols + x] = data[y * saved.cols + x];
            }
        }
        this.particles = [];
        this.gridDirty = true;
        for (let x = 0; x < this.cols; x++) this.dirtyColumns.add(x);
        return true;
    }

    exportImage(): Promise<Blob | null> {
        const snapshot = document.createElement('canvas');
        snapshot.width = this.cssWidth;
        snapshot.height = this.cssHeight;
        const snapshotCtx = snapshot.getContext('2d');
        if (!snapshotCtx) return Promise.resolve(null);

        // Keep in sync with the .sand-scene gradient in main.scss.
        const background = snapshotCtx.createLinearGradient(0, 0, 0, this.cssHeight);
        background.addColorStop(0, '#04050d');
        background.addColorStop(0.55, '#0b0e1c');
        background.addColorStop(1, '#1a1430');
        snapshotCtx.fillStyle = background;
        snapshotCtx.fillRect(0, 0, this.cssWidth, this.cssHeight);
        snapshotCtx.drawImage(this.canvas, 0, 0, this.cssWidth, this.cssHeight);

        return new Promise((resolve) => snapshot.toBlob((blob) => resolve(blob), 'image/png'));
    }

    pointerDownAt(cssX: number, cssY: number, now: number = performance.now()): PointerAction {
        if (this.brush === 'sand') {
            const cellX = this.clampCol(Math.floor(cssX / CELL));
            const cellY = this.clampRow(Math.floor(cssY / CELL));
            const pixel = this.pixels[cellY * this.cols + cellX];
            if (pixel !== 0 && pixel >>> 24 !== MATERIAL_WATER) {
                this.charge = { cellX, cellY, startMs: now };
                this.chargeReadyFired = false;
                gameAudio.startCharge();
                return 'charge';
            }
        }
        this.pointerX = cssX;
        this.pointerY = cssY;
        this.pointerDown = true;
        this.lastSpawnMs = now;
        this.lastPaint = null;
        this.applyBrush(cssX, cssY);
        if (this.brush === 'sand' || this.brush === 'water') gameAudio.startPour(this.brush);
        return 'pour';
    }

    pointerMoveTo(cssX: number, cssY: number): void {
        this.pointerX = cssX;
        this.pointerY = cssY;
    }

    pointerUp(now: number = performance.now()): void {
        const charge = this.charge;
        if (charge) {
            gameAudio.stopCharge();
            const heldMs = now - charge.startMs;
            const t = Math.max(0, Math.min(heldMs / EXPLOSION_FULL_CHARGE_MS, 1));
            const radius = Math.round(
                MIN_EXPLOSION_RADIUS_CELLS + t * (MAX_EXPLOSION_RADIUS_CELLS - MIN_EXPLOSION_RADIUS_CELLS)
            );
            this.explodeAt(charge.cellX, charge.cellY, radius, now);
            this.charge = null;
        }
        if (this.pointerDown) gameAudio.stopPour();
        this.pointerDown = false;
        this.lastPaint = null;
    }

    private readonly frame = (now: number): void => {
        if (this.disposed) return;
        const elapsed = this.lastFrameMs === null ? STEP_MS : Math.min(now - this.lastFrameMs, 100);
        this.lastFrameMs = now;
        this.accumulatorMs += elapsed;

        let steps = 0;
        while (this.accumulatorMs >= STEP_MS && steps < MAX_CATCHUP_STEPS) {
            this.step(STEP_MS / 1000, now);
            this.accumulatorMs -= STEP_MS;
            steps++;
        }
        if (steps === MAX_CATCHUP_STEPS) this.accumulatorMs = 0;

        this.render(now);
        this.rafId = requestAnimationFrame(this.frame);
    };

    // ------------------------------------------------------------ simulation

    private step(dt: number, now: number): void {
        if (this.pointerDown && !this.charge && now - this.lastSpawnMs >= SPAWN_INTERVAL_MS) {
            this.lastSpawnMs = now;
            this.applyBrush(this.pointerX, this.pointerY);
        }

        if (this.charge && !this.chargeReadyFired && now - this.charge.startMs >= EXPLOSION_FULL_CHARGE_MS) {
            this.chargeReadyFired = true;
            gameAudio.chargeReady();
            vibrate(30);
        }

        if (this.shootingStars.length < 2 && Math.random() < dt / 9) {
            this.shootingStars.push({
                x: this.cssWidth * (0.1 + Math.random() * 0.8),
                y: this.cssHeight * Math.random() * 0.35,
                vx: (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200),
                vy: 130 + Math.random() * 120,
                bornAt: now,
                lifeMs: 800 + Math.random() * 400
            });
        }
        this.shootingStars = this.shootingStars.filter((star) => now - star.bornAt < star.lifeMs);

        this.relaxDirtyColumns();

        for (let i = this.particles.length - 1; i >= 0; i--) {
            if (!this.moveParticle(this.particles[i], dt)) {
                this.particles[i] = this.particles[this.particles.length - 1];
                this.particles.pop();
            }
        }

        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const spark = this.sparks[i];
            if (now - spark.bornAt >= spark.lifeMs) {
                this.sparks[i] = this.sparks[this.sparks.length - 1];
                this.sparks.pop();
                continue;
            }
            spark.vy += SPARK_GRAVITY_PX_PER_S2 * dt;
            spark.x += spark.vx * dt;
            spark.y += spark.vy * dt;
        }

        this.shockwaves = this.shockwaves.filter((wave) => now - wave.bornAt < wave.durMs);
        this.flashes = this.flashes.filter((flash) => now - flash.bornAt < flash.durMs);
    }

    private moveParticle(p: Particle, dt: number): boolean {
        if (p.color >>> 24 === MATERIAL_WATER) return this.moveWaterParticle(p, dt);
        return this.moveSandParticle(p, dt);
    }

    private moveSandParticle(p: Particle, dt: number): boolean {
        const inWater =
            this.pixelAt(this.clampCol(Math.floor(p.x)), this.clampRow(Math.floor(p.y))) >>> 24 ===
            MATERIAL_WATER;

        p.vx += this.gravityX * dt;
        p.vx *= Math.max(0, 1 - (inWater ? 3 : 0.4) * dt);
        this.moveHorizontally(p, dt, (pixel) => this.blocksSand(pixel));

        p.vy = Math.min(p.vy + GRAVITY_CELLS_PER_S2 * dt, MAX_FALL_SPEED_CELLS_PER_S);
        if (inWater) p.vy = Math.min(p.vy, WATER_TERMINAL_FALL_CELLS_PER_S);

        if (p.vy < 0) {
            this.moveUpwards(p, dt, (pixel) => this.blocksSand(pixel));
            return true;
        }

        let remaining = p.vy * dt;
        let guard = 0;
        while (remaining > 0 && guard++ < 64) {
            const cx = this.clampCol(Math.floor(p.x));
            const cy = Math.floor(p.y);
            const stepAmt = Math.min(remaining, 0.99);
            const targetY = p.y + stepAmt;

            if (Math.floor(targetY) === cy) {
                p.y = targetY;
                remaining -= stepAmt;
                continue;
            }

            const nextY = cy + 1;
            if (nextY >= this.rows) {
                this.settleSand(p, cx, this.rows - 1);
                return false;
            }
            if (!this.blocksSand(this.pixelAt(cx, nextY))) {
                p.y = targetY;
                remaining -= stepAmt;
                continue;
            }

            // Blocked below: try a diagonal slide, otherwise come to rest.
            const preferred = Math.abs(p.vx) > 0.5 ? (p.vx > 0 ? 1 : -1) : Math.random() < 0.5 ? -1 : 1;
            if (this.canSandSlideInto(cx + preferred, cy, nextY)) {
                p.x = cx + preferred + 0.5;
                p.y = nextY;
                p.vy *= 0.9;
                remaining -= 1;
                continue;
            }
            if (this.canSandSlideInto(cx - preferred, cy, nextY)) {
                p.x = cx - preferred + 0.5;
                p.y = nextY;
                p.vy *= 0.9;
                remaining -= 1;
                continue;
            }
            this.settleSand(p, cx, cy);
            return false;
        }
        return true;
    }

    private moveWaterParticle(p: Particle, dt: number): boolean {
        p.vx += this.gravityX * dt * 0.8;
        p.vx *= Math.max(0, 1 - 0.8 * dt);
        this.moveHorizontally(p, dt, (pixel) => pixel !== 0);

        p.vy = Math.min(p.vy + GRAVITY_CELLS_PER_S2 * dt, MAX_FALL_SPEED_CELLS_PER_S * 0.8);
        if (p.vy < 0) {
            this.moveUpwards(p, dt, (pixel) => pixel !== 0);
            return true;
        }

        let remaining = p.vy * dt;
        let flowedThisTick = false;
        let guard = 0;
        while (remaining > 0 && guard++ < 64) {
            const cx = this.clampCol(Math.floor(p.x));
            const cy = Math.floor(p.y);
            const stepAmt = Math.min(remaining, 0.99);
            const targetY = p.y + stepAmt;

            if (Math.floor(targetY) === cy) {
                p.y = targetY;
                remaining -= stepAmt;
                continue;
            }

            const nextY = cy + 1;
            if (nextY >= this.rows) {
                this.settleWater(p, cx, this.rows - 1);
                return false;
            }
            if (this.pixelAt(cx, nextY) === 0) {
                p.y = targetY;
                remaining -= stepAmt;
                continue;
            }

            const dir = this.flowDirection(p);
            if (this.isFree(cx + dir, cy) && this.isFree(cx + dir, nextY)) {
                p.x = cx + dir + 0.5;
                p.y = nextY;
                remaining -= 1;
                continue;
            }
            if (this.isFree(cx - dir, cy) && this.isFree(cx - dir, nextY)) {
                p.x = cx - dir + 0.5;
                p.y = nextY;
                remaining -= 1;
                continue;
            }

            // On the pool surface: run toward the nearest reachable drop so
            // pools level out instead of mounding into pyramids.
            if (flowedThisTick) return true;
            flowedThisTick = true;

            const flowDir = this.findWaterDropDirection(cx, cy);
            if (flowDir === 0) {
                this.settleWater(p, cx, cy);
                return false;
            }
            let runCol = cx;
            for (let hop = 0; hop < WATER_FLOW_HOPS_PER_TICK; hop++) {
                const next = runCol + flowDir;
                if (!this.isFree(next, cy)) break;
                runCol = next;
                if (this.pixelAt(runCol, nextY) === 0) break;
            }
            if (runCol === cx) {
                this.settleWater(p, cx, cy);
                return false;
            }
            p.x = runCol + 0.5;
            p.vx = flowDir * 4;
            p.vy = Math.min(p.vy, 8);
            p.flow++;
            if (p.flow > WATER_MAX_FLOW_HOPS) {
                this.settleWater(p, runCol, cy);
                return false;
            }
            continue;
        }
        return true;
    }

    // Walk both directions along the pool surface (row cy) and return the
    // direction of the nearest column where the water can fall, or 0 if the
    // surface is level as far as the scan reaches. Solid cells at surface
    // height act as walls and stop the scan.
    private findWaterDropDirection(cx: number, cy: number): number {
        if (cy + 1 >= this.rows) return 0;
        const preferred =
            Math.abs(this.gravityX) > 20 ? (this.gravityX > 0 ? 1 : -1) : Math.random() < 0.5 ? -1 : 1;
        const other = -preferred;
        let preferredOpen = true;
        let otherOpen = true;
        for (let d = 1; d <= WATER_LEVEL_SCAN_RANGE; d++) {
            if (preferredOpen) {
                const col = cx + preferred * d;
                if (!this.isFree(col, cy)) preferredOpen = false;
                else if (this.pixelAt(col, cy + 1) === 0) return preferred;
            }
            if (otherOpen) {
                const col = cx + other * d;
                if (!this.isFree(col, cy)) otherOpen = false;
                else if (this.pixelAt(col, cy + 1) === 0) return other;
            }
            if (!preferredOpen && !otherOpen) return 0;
        }
        return 0;
    }

    private moveHorizontally(p: Particle, dt: number, blocks: (pixel: number) => boolean): void {
        let targetX = p.x + p.vx * dt;
        if (targetX < 0) {
            targetX = 0;
            p.vx = Math.abs(p.vx) * 0.3;
        } else if (targetX >= this.cols) {
            targetX = this.cols - 0.001;
            p.vx = -Math.abs(p.vx) * 0.3;
        }
        const rowY = this.clampRow(Math.floor(p.y));
        const fromX = Math.floor(p.x);
        const toX = Math.floor(targetX);
        if (fromX === toX) {
            p.x = targetX;
            return;
        }
        const dir = toX > fromX ? 1 : -1;
        for (let cx = fromX + dir; dir > 0 ? cx <= toX : cx >= toX; cx += dir) {
            if (blocks(this.pixelAt(cx, rowY))) {
                p.x = cx - dir + 0.5;
                p.vx *= -0.25;
                return;
            }
        }
        p.x = targetX;
    }

    private moveUpwards(p: Particle, dt: number, blocks: (pixel: number) => boolean): void {
        const cx = this.clampCol(Math.floor(p.x));
        const targetY = p.y + p.vy * dt;
        const fromY = Math.floor(p.y);
        const toY = Math.floor(Math.max(targetY, 0));
        for (let cy = fromY - 1; cy >= toY; cy--) {
            if (blocks(this.pixelAt(cx, cy))) {
                p.y = cy + 1.001;
                p.vy = 0;
                return;
            }
        }
        p.y = Math.max(targetY, 0);
    }

    private canSandSlideInto(sideX: number, cy: number, nextY: number): boolean {
        if (sideX < 0 || sideX >= this.cols) return false;
        return !this.blocksSand(this.pixelAt(sideX, cy)) && !this.blocksSand(this.pixelAt(sideX, nextY));
    }

    private flowDirection(p: Particle): number {
        if (Math.abs(this.gravityX) > 20) return this.gravityX > 0 ? 1 : -1;
        if (Math.abs(p.vx) > 0.3) return p.vx > 0 ? 1 : -1;
        return Math.random() < 0.5 ? -1 : 1;
    }

    private settleSand(p: Particle, cellX: number, cellY: number): void {
        let y = cellY;
        while (y >= 0 && this.blocksSand(this.pixelAt(cellX, y))) y--;
        if (y < 0) return; // column is full to the top; the grain is lost

        const displaced = this.pixelAt(cellX, y);
        this.setCell(cellX, y, p.color);
        if (displaced !== 0 && this.particles.length < MAX_ACTIVE_PARTICLES) {
            // Sand sinks: the water that occupied this cell gets pushed out.
            this.particles.push(this.makeParticle(cellX + 0.5, y + 0.5, (Math.random() - 0.5) * 6, -6, displaced));
        }
        this.markDirtyAround(cellX);
    }

    private settleWater(p: Particle, cellX: number, cellY: number): void {
        let y = cellY;
        while (y >= 0 && this.pixelAt(cellX, y) !== 0) y--;
        if (y < 0) return;

        // Hydrostatic leveling: never rest on top of other water while the
        // pool surface is lower somewhere reachable. Water cells don't block
        // the search (pressure equalizes through the pool); solids do.
        if (y + 1 < this.rows && this.pixelAt(cellX, y + 1) >>> 24 === MATERIAL_WATER) {
            const targetCol = this.findWaterEqualizeColumn(cellX, y);
            if (targetCol !== cellX) {
                let restY = y;
                while (restY + 1 < this.rows && this.pixelAt(targetCol, restY + 1) === 0) restY++;
                this.setCell(targetCol, restY, p.color);
                this.markDirtyAround(targetCol);
                return;
            }
        }

        this.setCell(cellX, y, p.color);
        this.markDirtyAround(cellX);
    }

    // Find the nearest column (along row cy) whose free surface is strictly
    // lower than cy, walking over water but stopping at solid walls.
    private findWaterEqualizeColumn(cx: number, cy: number): number {
        if (cy + 1 >= this.rows) return cx;
        const preferred =
            Math.abs(this.gravityX) > 20 ? (this.gravityX > 0 ? 1 : -1) : Math.random() < 0.5 ? -1 : 1;
        const directions = [preferred, -preferred];
        const open = [true, true];
        for (let d = 1; d <= WATER_LEVEL_SCAN_RANGE; d++) {
            for (let k = 0; k < 2; k++) {
                if (!open[k]) continue;
                const col = cx + directions[k] * d;
                if (col < 0 || col >= this.cols) {
                    open[k] = false;
                    continue;
                }
                const cell = this.pixelAt(col, cy);
                if (cell !== 0 && cell >>> 24 !== MATERIAL_WATER) {
                    open[k] = false; // solid wall
                    continue;
                }
                if (cell === 0 && this.pixelAt(col, cy + 1) === 0) return col;
            }
            if (!open[0] && !open[1]) return cx;
        }
        return cx;
    }

    private relaxDirtyColumns(): void {
        if (this.dirtyColumns.size === 0) return;
        const processed: number[] = [];
        const newlyDirty: number[] = [];

        for (const col of this.dirtyColumns) {
            if (this.particles.length >= MAX_ACTIVE_PARTICLES - 8) break;
            processed.push(col);

            for (let y = this.rows - 2; y >= 0; y--) {
                const idx = y * this.cols + col;
                const pixel = this.pixels[idx];
                if (pixel === 0) continue;
                const material = pixel >>> 24;
                if (material === MATERIAL_STONE) continue; // stone ledges stay put

                if (this.pixels[idx + this.cols] === 0) {
                    this.clearCell(col, y);
                    this.particles.push(this.makeParticle(col + 0.5, y + 0.5, (Math.random() - 0.5) * 2, 0, pixel));
                    newlyDirty.push(col);
                    continue;
                }

                if (material === MATERIAL_WATER) {
                    const leftFree =
                        col > 0 && this.pixels[idx - 1] === 0 && this.pixels[idx + this.cols - 1] === 0;
                    const rightFree =
                        col < this.cols - 1 && this.pixels[idx + 1] === 0 && this.pixels[idx + this.cols + 1] === 0;
                    if (leftFree || rightFree) {
                        const dir = leftFree && rightFree ? (Math.random() < 0.5 ? -1 : 1) : leftFree ? -1 : 1;
                        this.clearCell(col, y);
                        this.particles.push(this.makeParticle(col + 0.5, y + 0.5, dir * 4, 0, pixel));
                        newlyDirty.push(col, col + dir);
                    }
                }
            }

            // Settled water drains toward level: move this column's surface
            // cell to the nearest strictly-lower reachable spot. Chained over
            // dirty columns this flattens whole pools — including mounds
            // restored from old saves.
            const waterTop = this.waterSurfaceOf(col);
            if (waterTop !== -1) {
                const targetCol = this.findWaterEqualizeColumn(col, waterTop);
                if (targetCol !== col) {
                    const color = this.pixels[waterTop * this.cols + col];
                    this.clearCell(col, waterTop);
                    let restY = waterTop;
                    while (restY + 1 < this.rows && this.pixelAt(targetCol, restY + 1) === 0) restY++;
                    this.setCell(targetCol, restY, color);
                    newlyDirty.push(col, targetCol);
                }
            }

            // Loose sand topples when it towers over a neighbouring column.
            const surface = this.surfaceOf(col);
            if (surface < this.rows) {
                const topPixel = this.pixels[surface * this.cols + col];
                if (topPixel >>> 24 === MATERIAL_SAND) {
                    const leftDrop = col > 0 ? this.surfaceOf(col - 1) - surface : 0;
                    const rightDrop = col < this.cols - 1 ? this.surfaceOf(col + 1) - surface : 0;
                    let dir = 0;
                    if (this.gravityX > 25 && rightDrop > 1) dir = 1;
                    else if (this.gravityX < -25 && leftDrop > 1) dir = -1;
                    else if (leftDrop > TOPPLE_HEIGHT_DIFF_CELLS && leftDrop >= rightDrop) dir = -1;
                    else if (rightDrop > TOPPLE_HEIGHT_DIFF_CELLS) dir = 1;
                    if (dir !== 0) {
                        this.clearCell(col, surface);
                        this.particles.push(
                            this.makeParticle(col + 0.5, surface + 0.5, dir * (3 + Math.random() * 3), 0, topPixel)
                        );
                        newlyDirty.push(col, col + dir);
                    }
                }
            }
        }

        for (const col of processed) this.dirtyColumns.delete(col);
        for (const col of newlyDirty) {
            if (col >= 0 && col < this.cols) this.dirtyColumns.add(col);
        }
    }

    private surfaceOf(col: number): number {
        for (let y = 0; y < this.rows; y++) {
            const pixel = this.pixels[y * this.cols + col];
            if (pixel !== 0 && pixel >>> 24 !== MATERIAL_WATER) return y;
        }
        return this.rows;
    }

    // Row of this column's topmost cell if that cell is water, else -1.
    private waterSurfaceOf(col: number): number {
        for (let y = 0; y < this.rows; y++) {
            const pixel = this.pixels[y * this.cols + col];
            if (pixel === 0) continue;
            return pixel >>> 24 === MATERIAL_WATER ? y : -1;
        }
        return -1;
    }

    // ---------------------------------------------------------------- brushes

    private applyBrush(cssX: number, cssY: number): void {
        switch (this.brush) {
            case 'sand':
                this.spawnGrains(cssX, cssY, 'sand');
                break;
            case 'water':
                this.spawnGrains(cssX, cssY, 'water');
                break;
            case 'stone':
                this.paintAlong(cssX, cssY, (x, y) => this.paintStoneAt(x, y));
                break;
            case 'erase':
                this.paintAlong(cssX, cssY, (x, y) => this.eraseAt(x, y));
                break;
        }
    }

    private spawnGrains(cssX: number, cssY: number, kind: 'sand' | 'water'): void {
        // All grains of one burst share a hue so deposits stay chromatically
        // coherent even when settling shuffles them (e.g. sinking in water).
        const burstHue = kind === 'sand' && this.useColoredDrops ? this.hue : null;

        for (let i = 0; i < this.grainsPerDrop; i++) {
            if (this.particles.length >= MAX_ACTIVE_PARTICLES) break;
            const cellX = this.clampCol(Math.floor(cssX / CELL) + Math.round((Math.random() - 0.5) * 4));
            let cellY = this.clampRow(Math.floor(cssY / CELL));

            // If the tap lands inside the pile, spawn from just above it.
            const blocked = (pixel: number): boolean =>
                kind === 'water' ? pixel !== 0 : this.blocksSand(pixel);
            let tries = 4;
            while (tries-- > 0 && cellY > 0 && blocked(this.pixelAt(cellX, cellY))) cellY--;
            if (blocked(this.pixelAt(cellX, cellY))) continue;

            let color: number;
            if (kind === 'water') {
                color = this.waterColor();
            } else if (burstHue !== null) {
                color = hslToPackedColor(
                    burstHue + (Math.random() * 4 - 2),
                    DROP_SAND_SATURATION,
                    DROP_SAND_LIGHTNESS + (Math.random() * 6 - 3),
                    MATERIAL_SAND
                );
            } else {
                color = this.pureSandColor();
            }
            this.particles.push(this.makeParticle(cellX + 0.5, cellY + 0.5, (Math.random() - 0.5) * 3, 0, color));
        }

        if (burstHue !== null) {
            this.hue = (burstHue + DROP_SAND_HUE_STEP) % 360;
        }
    }

    private paintAlong(cssX: number, cssY: number, paint: (x: number, y: number) => void): void {
        const from = this.lastPaint ?? { x: cssX, y: cssY };
        const distance = Math.hypot(cssX - from.x, cssY - from.y);
        const steps = Math.max(1, Math.ceil(distance / CELL));
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            paint(from.x + (cssX - from.x) * t, from.y + (cssY - from.y) * t);
        }
        this.lastPaint = { x: cssX, y: cssY };
    }

    private paintStoneAt(cssX: number, cssY: number): void {
        const centerX = Math.floor(cssX / CELL);
        const centerY = Math.floor(cssY / CELL);
        const span = Math.ceil(STONE_BRUSH_RADIUS_CELLS);
        for (let y = centerY - span; y <= centerY + span; y++) {
            if (y < 0 || y >= this.rows) continue;
            for (let x = centerX - span; x <= centerX + span; x++) {
                if (x < 0 || x >= this.cols) continue;
                if (Math.hypot(x - centerX, y - centerY) > STONE_BRUSH_RADIUS_CELLS) continue;
                if (this.pixels[y * this.cols + x] !== 0) continue;
                this.setCell(x, y, this.stoneColor());
            }
        }
    }

    private eraseAt(cssX: number, cssY: number): void {
        const centerX = Math.floor(cssX / CELL);
        const centerY = Math.floor(cssY / CELL);
        const span = Math.ceil(ERASE_BRUSH_RADIUS_CELLS);
        let erased = false;
        for (let y = centerY - span; y <= centerY + span; y++) {
            if (y < 0 || y >= this.rows) continue;
            for (let x = centerX - span; x <= centerX + span; x++) {
                if (x < 0 || x >= this.cols) continue;
                if (Math.hypot(x - centerX, y - centerY) > ERASE_BRUSH_RADIUS_CELLS) continue;
                if (this.pixels[y * this.cols + x] === 0) continue;
                this.clearCell(x, y);
                erased = true;
            }
        }
        if (erased) {
            for (let x = centerX - span - 1; x <= centerX + span + 1; x++) {
                if (x >= 0 && x < this.cols) this.dirtyColumns.add(x);
            }
        }
    }

    private explodeAt(cellX: number, cellY: number, radiusCells: number, now: number): void {
        const power = 18 + radiusCells * 2.2;

        for (let y = cellY - radiusCells; y <= cellY + radiusCells; y++) {
            if (y < 0 || y >= this.rows) continue;
            for (let x = cellX - radiusCells; x <= cellX + radiusCells; x++) {
                if (x < 0 || x >= this.cols) continue;
                const dx = x - cellX;
                const dy = y - cellY;
                const dist = Math.hypot(dx, dy);
                if (dist > radiusCells) continue;
                const pixel = this.pixels[y * this.cols + x];
                if (pixel === 0) continue;
                const material = pixel >>> 24;
                if (material === MATERIAL_STONE) continue; // stone shrugs off blasts

                this.clearCell(x, y);
                // Packed castle sand crumbles into loose sand when blasted.
                const flying = material === MATERIAL_PACKED_SAND ? withMaterial(pixel, MATERIAL_SAND) : pixel;
                const safeDist = dist || 1;
                const falloff = 1 - dist / (radiusCells + 1);
                const speed = power * (0.45 + Math.random() * 0.8) * (0.5 + falloff);
                this.particles.push(
                    this.makeParticle(
                        x + 0.5,
                        y + 0.5,
                        (dx / safeDist) * speed + (Math.random() - 0.5) * 8,
                        (dy / safeDist) * speed * 0.8 - (8 + Math.random() * 14 + falloff * power * 0.6),
                        flying
                    )
                );
            }
        }

        for (let x = cellX - radiusCells - 2; x <= cellX + radiusCells + 2; x++) {
            if (x >= 0 && x < this.cols) this.dirtyColumns.add(x);
        }

        const px = (cellX + 0.5) * CELL;
        const py = (cellY + 0.5) * CELL;
        const radiusPx = radiusCells * CELL;
        this.flashes.push({ x: px, y: py, radius: radiusPx * 2.4, bornAt: now, durMs: 180 });
        this.shockwaves.push({ x: px, y: py, maxRadius: radiusPx * 2.6, bornAt: now, durMs: 420 });
        this.shockwaves.push({ x: px, y: py, maxRadius: radiusPx * 1.6, bornAt: now, durMs: 280 });

        const sparkCount = Math.min(50, 14 + radiusCells * 2);
        for (let i = 0; i < sparkCount; i++) {
            const angle = Math.random() * TWO_PI;
            const speed = 120 + Math.random() * 260;
            this.sparks.push({
                x: px,
                y: py,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 140,
                bornAt: now,
                lifeMs: 250 + Math.random() * 400,
                hue: 28 + Math.random() * 22
            });
        }

        this.shakeMagnitude = Math.min(10, 1.5 + radiusCells * 0.5);
        this.shakeUntil = now + SHAKE_DURATION_MS;

        gameAudio.explosion(radiusCells / MAX_EXPLOSION_RADIUS_CELLS);
        vibrate(Math.min(200, 30 + radiusCells * 9));
    }

    // -------------------------------------------------------------- seeding

    private pureSandColor(material = MATERIAL_SAND): number {
        const shadeJitter = Math.floor(Math.random() * 10) - 5;
        return hslToPackedColor(
            INITIAL_SAND_BASE_HUE + shadeJitter,
            PURE_SAND_SATURATION,
            PURE_SAND_LIGHTNESS,
            material
        );
    }

    private waterColor(): number {
        return hslToPackedColor(
            WATER_HUE + (Math.random() * 8 - 4),
            WATER_SATURATION,
            WATER_LIGHTNESS + (Math.random() * 10 - 5),
            MATERIAL_WATER
        );
    }

    private stoneColor(): number {
        return hslToPackedColor(
            STONE_HUE,
            STONE_SATURATION,
            STONE_LIGHTNESS + (Math.random() * 10 - 5),
            MATERIAL_STONE
        );
    }

    private seedTerrain(): void {
        const baseHeight = Math.max(1, Math.round(this.rows * INITIAL_SAND_HEIGHT_RATIO));
        const variation = Math.max(1, Math.round(baseHeight * 0.45));
        const minHeight = Math.max(1, baseHeight - variation);
        const maxHeight = Math.min(this.rows - 1, baseHeight + variation);
        let currentHeight = Math.round(baseHeight + (Math.random() * 2 - 1) * variation);

        for (let x = 0; x < this.cols; x++) {
            currentHeight += Math.floor(Math.random() * 3) - 1;
            currentHeight = Math.max(minHeight, Math.min(maxHeight, currentHeight));
            for (let depth = 0; depth < currentHeight; depth++) {
                this.setCell(x, this.rows - 1 - depth, this.pureSandColor());
            }
        }
    }

    private buildCastle(): void {
        buildRandomSandCastle({
            gridWidth: this.cols,
            gridHeight: this.rows,
            isOccupied: (x, y) => this.pixelAt(x, y) !== 0,
            addGrain: (x, y, color) => {
                if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return false;
                if (this.pixels[y * this.cols + x] !== 0) return false;
                this.setCell(x, y, color);
                return true;
            },
            // Castles are packed sand: they stand until a blast loosens them.
            getPureSandColor: () => this.pureSandColor(MATERIAL_PACKED_SAND)
        });
    }

    // ------------------------------------------------------------- rendering

    private render(now: number): void {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

        let shakeX = 0;
        let shakeY = 0;
        if (now < this.shakeUntil) {
            const k = (this.shakeUntil - now) / SHAKE_DURATION_MS;
            shakeX = (Math.random() * 2 - 1) * this.shakeMagnitude * k;
            shakeY = (Math.random() * 2 - 1) * this.shakeMagnitude * k;
        }

        ctx.save();
        ctx.translate(shakeX, shakeY);

        this.renderStars(now);
        if (this.moonCanvas) {
            ctx.drawImage(this.moonCanvas, this.cssWidth * 0.16 - 90, this.cssHeight * 0.14 - 90);
        }
        this.renderShootingStars(now);

        if (this.gridImage) {
            if (this.gridDirty) {
                this.gridCtx.putImageData(this.gridImage, 0, 0);
                this.gridDirty = false;
            }
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(this.gridCanvas, 0, 0, this.cols * CELL, this.rows * CELL);
        }

        for (const p of this.particles) {
            ctx.fillStyle = p.css;
            ctx.fillRect(Math.floor(p.x) * CELL, Math.floor(p.y) * CELL, CELL, CELL);
        }

        this.renderChargeIndicator(now);
        this.renderEffects(now);

        ctx.restore();
    }

    private buildMoon(): void {
        const size = 180;
        const radius = 26;
        const moon = document.createElement('canvas');
        moon.width = size;
        moon.height = size;
        const g = moon.getContext('2d');
        if (!g) {
            this.moonCanvas = null;
            return;
        }
        const cx = size / 2;
        const cy = size / 2;

        g.fillStyle = 'rgba(246,241,222,0.95)';
        g.beginPath();
        g.arc(cx, cy, radius, 0, TWO_PI);
        g.fill();

        // Punch out the crescent, then slip the glow underneath.
        g.globalCompositeOperation = 'destination-out';
        g.beginPath();
        g.arc(cx + radius * 0.45, cy - radius * 0.2, radius * 0.92, 0, TWO_PI);
        g.fill();

        g.globalCompositeOperation = 'destination-over';
        const glow = g.createRadialGradient(cx, cy, radius * 0.4, cx, cy, size / 2);
        glow.addColorStop(0, 'rgba(250,244,220,0.18)');
        glow.addColorStop(1, 'rgba(250,244,220,0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, size, size);

        this.moonCanvas = moon;
    }

    private regenerateStars(): void {
        const count = Math.round((this.cssWidth * this.cssHeight) / 9000);
        this.stars = [];
        for (let i = 0; i < count; i++) {
            this.stars.push({
                x: Math.random() * this.cssWidth,
                y: Math.random() * this.cssHeight * 0.72,
                size: Math.random() < 0.85 ? 1 : 2,
                baseAlpha: 0.25 + Math.random() * 0.55,
                phase: Math.random() * TWO_PI,
                speed: 0.4 + Math.random() * 1.4
            });
        }
    }

    private renderStars(now: number): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = 'rgb(205,218,255)';
        for (const star of this.stars) {
            ctx.globalAlpha = star.baseAlpha * (0.55 + 0.45 * Math.sin(now * 0.001 * star.speed + star.phase));
            ctx.fillRect(star.x, star.y, star.size, star.size);
        }
        ctx.restore();
    }

    private renderShootingStars(now: number): void {
        if (this.shootingStars.length === 0) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        for (const star of this.shootingStars) {
            const t = Math.min((now - star.bornAt) / star.lifeMs, 1);
            const alpha = Math.sin(t * Math.PI) * 0.9;
            const elapsedS = (now - star.bornAt) / 1000;
            const x = star.x + star.vx * elapsedS;
            const y = star.y + star.vy * elapsedS;
            const tailX = x - star.vx * 0.1;
            const tailY = y - star.vy * 0.1;
            const gradient = ctx.createLinearGradient(x, y, tailX, tailY);
            gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
            gradient.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.strokeStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(tailX, tailY);
            ctx.stroke();
        }
        ctx.restore();
    }

    private renderChargeIndicator(now: number): void {
        const charge = this.charge;
        if (!charge) return;
        const ctx = this.ctx;
        const heldMs = now - charge.startMs;
        const t = Math.max(0, Math.min(heldMs / EXPLOSION_FULL_CHARGE_MS, 1));
        const radiusPx =
            (MIN_EXPLOSION_RADIUS_CELLS + t * (MAX_EXPLOSION_RADIUS_CELLS - MIN_EXPLOSION_RADIUS_CELLS)) * CELL;
        const cx = (charge.cellX + 0.5) * CELL;
        const cy = (charge.cellY + 0.5) * CELL;
        const pulse = 0.5 + 0.5 * Math.sin(now / 110);

        ctx.save();

        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
        glow.addColorStop(0, `rgba(255,165,70,${0.2 + 0.1 * pulse})`);
        glow.addColorStop(0.7, `rgba(255,120,50,${0.1 + 0.06 * pulse})`);
        glow.addColorStop(1, 'rgba(255,120,50,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, radiusPx, 0, TWO_PI);
        ctx.fill();

        for (let k = 0; k < 3; k++) {
            const phase = (now / 650 + k / 3) % 1;
            const ringRadius = radiusPx * (1.25 - phase);
            const alpha = 0.3 * phase * (0.4 + 0.6 * t);
            ctx.strokeStyle = `rgba(255,195,125,${alpha})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, ringRadius, 0, TWO_PI);
            ctx.stroke();
        }

        ctx.fillStyle = `rgba(255,225,170,${0.5 + 0.4 * pulse})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, TWO_PI);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + t * TWO_PI);
        ctx.stroke();

        if (t >= 1) {
            ctx.strokeStyle = `rgba(255,235,185,${0.3 + 0.3 * pulse})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, radiusPx, 0, TWO_PI);
            ctx.stroke();
        }

        ctx.restore();
    }

    private renderEffects(now: number): void {
        if (this.shockwaves.length === 0 && this.sparks.length === 0 && this.flashes.length === 0) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (const wave of this.shockwaves) {
            const t = Math.min((now - wave.bornAt) / wave.durMs, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            ctx.strokeStyle = `rgba(255,190,120,${0.45 * (1 - t)})`;
            ctx.lineWidth = 1 + 4 * (1 - t);
            ctx.beginPath();
            ctx.arc(wave.x, wave.y, Math.max(1, wave.maxRadius * eased), 0, TWO_PI);
            ctx.stroke();
        }

        ctx.lineWidth = 2;
        for (const spark of this.sparks) {
            const lifeT = Math.min((now - spark.bornAt) / spark.lifeMs, 1);
            ctx.strokeStyle = `hsla(${spark.hue},100%,${68 - 26 * lifeT}%,${1 - lifeT})`;
            ctx.beginPath();
            ctx.moveTo(spark.x, spark.y);
            ctx.lineTo(spark.x - spark.vx * 0.03, spark.y - spark.vy * 0.03);
            ctx.stroke();
        }

        for (const flash of this.flashes) {
            const t = Math.min((now - flash.bornAt) / flash.durMs, 1);
            const alpha = Math.pow(1 - t, 2) * 0.5;
            const gradient = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, flash.radius);
            gradient.addColorStop(0, `rgba(255,245,225,${alpha})`);
            gradient.addColorStop(0.35, `rgba(255,180,90,${alpha * 0.7})`);
            gradient.addColorStop(1, 'rgba(255,150,60,0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(flash.x, flash.y, flash.radius, 0, TWO_PI);
            ctx.fill();
        }

        ctx.restore();
    }

    // --------------------------------------------------------------- helpers

    private makeParticle(x: number, y: number, vx: number, vy: number, color: number): Particle {
        return { x, y, vx, vy, flow: 0, color, css: packedColorToCss(color) };
    }

    private blocksSand(pixel: number): boolean {
        return pixel !== 0 && pixel >>> 24 !== MATERIAL_WATER;
    }

    private isFree(x: number, y: number): boolean {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return false;
        return this.pixels[y * this.cols + x] === 0;
    }

    private pixelAt(x: number, y: number): number {
        return this.pixels[y * this.cols + x];
    }

    private setCell(x: number, y: number, color: number): void {
        this.pixels[y * this.cols + x] = color;
        this.gridDirty = true;
    }

    private clearCell(x: number, y: number): void {
        this.pixels[y * this.cols + x] = 0;
        this.gridDirty = true;
    }

    private markDirtyAround(col: number): void {
        for (let x = col - 1; x <= col + 1; x++) {
            if (x >= 0 && x < this.cols) this.dirtyColumns.add(x);
        }
    }

    private clampCol(x: number): number {
        return Math.max(0, Math.min(x, this.cols - 1));
    }

    private clampRow(y: number): number {
        return Math.max(0, Math.min(y, this.rows - 1));
    }
}
