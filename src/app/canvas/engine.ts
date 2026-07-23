import { gameAudio, vibrate } from './audio';
import { buildRandomSandCastle } from './castle';
import { hslToPackedColor, materialOf, packedColorToCss, withMaterial } from './color';
import {
    BUBBLE_RISE_PX_PER_S,
    BUBBLE_SPAWN_CHANCE,
    CLAM_OPEN_PERIOD_MS,
    DEFAULT_GRAINS_PER_DROP,
    DIRTY_MARGIN_COLS,
    ERASE_BRUSH_RADIUS_CELLS,
    EXPLOSION_FULL_CHARGE_MS,
    SWIMMER_BOB_PX_PER_S,
    SWIMMER_FLEE_RANGE_PX,
    SWIMMER_HUNT_RANGE_PX,
    SWIMMER_RETARGET_MAX_MS,
    SWIMMER_RETARGET_MIN_MS,
    SWIMMER_ROAM_RANGE_PX,
    SWIMMER_SCHOOL_RANGE_PX,
    SWIMMER_SCHOOL_URGENCY,
    SWIMMER_STEER_EVERY_STEPS,
    SWIMMER_TURN_CHANCE_PER_S,
    SWIMMER_VERTICAL_SPEED_PX_PER_S,
    FLORA_COLUMNS_PER_TICK,
    FLORA_TICK_MS,
    GRAVITY_CELLS_PER_S2,
    INITIAL_SAND_BASE_HUE,
    INITIAL_SAND_HEIGHT_RATIO,
    LAVA_FLOW_HOPS_PER_TICK,
    LAVA_HUE,
    LAVA_LIGHTNESS_MAX,
    LAVA_LIGHTNESS_MIN,
    LAVA_MAX_FLOW_HOPS,
    COOLED_LAVA_HUE,
    COOLED_LAVA_LIGHTNESS_MAX,
    COOLED_LAVA_LIGHTNESS_MIN,
    COOLED_LAVA_SATURATION,
    GLASS_HUE,
    GLASS_LIGHTNESS_MAX,
    GLASS_LIGHTNESS_MIN,
    GLASS_SATURATION,
    LAVA_QUENCH_SPARKS,
    LAVA_COOL_PER_AIR_NEIGHBOUR,
    LAVA_COOL_PER_TICK,
    LAVA_COOL_PER_WATER_NEIGHBOUR,
    LAVA_HEAT_MAX,
    HEAT_AMBIENT_COOL,
    HEAT_CONDUCTION_LOSS,
    HEAT_TICK_MS,
    SAND_TO_GLASS_HEAT,
    WATER_BOIL_CHANCE_PER_TICK,
    LAVA_SATURATION,
    LAVA_TERMINAL_FALL_CELLS_PER_S,
    MATERIAL_KELP,
    MATERIAL_GLASS,
    MATERIAL_LAVA,
    MATERIAL_PACKED_SAND,
    MATERIAL_SAND,
    MATERIAL_STONE,
    MATERIAL_WATER,
    MAX_ACTIVE_PARTICLES,
    MAX_BUBBLES,
    MAX_SETTLE_ROLLS,
    MAX_TOPPLE_SLIDES_PER_PASS,
    MAX_EXPLOSION_RADIUS_CELLS,
    MAX_FALL_SPEED_CELLS_PER_S,
    MIN_EXPLOSION_RADIUS_CELLS,
    PURE_SAND_LIGHTNESS,
    PURE_SAND_SATURATION,
    SAND_IN_WATER_FALL_CELLS_PER_S,
    SETTLE_SWEEP_COLUMNS_PER_STEP,
    SPAWN_INTERVAL_MS,
    SQUARE_SIZE,
    STONE_FRACTURE_MIN_RADIUS_CELLS,
    STONE_FRACTURE_RADIUS_RATIO,
    STONE_BRUSH_RADIUS_CELLS,
    STONE_FALL_ACCEL_CELLS_PER_S2,
    STONE_HUE,
    STONE_LANDING_SHAKE_MAX,
    STONE_LANDING_SPARKS_MAX,
    STONE_LIGHTNESS,
    STONE_MAX_ENCLOSED_FILL_CELLS,
    STONE_MAX_FALL_CELLS_PER_S,
    STONE_MAX_TIPS_PER_LANDING,
    STONE_RESCAN_EVERY_STEPS,
    STONE_SATURATION,
    TILT_MAX_GRAVITY_RATIO,
    TOPPLE_HEIGHT_DIFF_CELLS,
    WATER_FLOW_HOPS_PER_TICK,
    WATER_HUE,
    WATER_LEVEL_SCAN_RANGE,
    WATER_LIGHTNESS,
    WATER_MAX_FLOW_HOPS,
    WATER_SATURATION
} from './constants';
import { FloraContext, isFlora, updateFloraColumn } from './flora';
import {
    BedDweller,
    BedKind,
    clamIsOpen,
    CLAM_SPRITE_CLOSED,
    CLAM_SPRITE_OPEN,
    CRAB_SPRITE,
    Crawler,
    CrawlerKind,
    CreatureKind,
    HABITATS,
    LOOKS,
    OCTOPUS_SPRITE,
    saturationFor,
    spriteFor,
    spriteHeight,
    spriteWidth,
    STARFISH_SPRITE,
    stepCrawler,
    steerTowardNeighbours,
    stepSwimmer,
    Swimmer,
    SwimmerKind,
    SwimmerTuning,
    targetPopulation,
    WaterStats
} from './life';
import { scatterRocks } from './rocks';
import {
    bodyCanDescend,
    bodyCanShift,
    bodyRowRuns,
    bodyRuns,
    bodyTipDirection,
    findEnclosedCells,
    findFloatingBodies,
    findUnstableBodies,
    StoneBody,
    StoneContext
} from './stone';
import { CelestialPosition, drawSky, daylightOf, moonPosition, skyPhase, sunPosition } from './sky';
import { decodeRle, encodeRle, SavedGrid } from './storage';

const CELL = SQUARE_SIZE;
const STEP_MS = 1000 / 60;
// Enough fixed steps to fully catch up a (clamped) 100ms frame, so slow or
// janky devices simulate at real speed instead of slow motion.
const MAX_CATCHUP_STEPS = 6;
const TWO_PI = Math.PI * 2;
const SHAKE_DURATION_MS = 260;
const SPARK_GRAVITY_PX_PER_S2 = 900;

// Anything that flows and finds its own level. Solids rest on lava rather than
// sinking through it, which keeps it clear of the displacement machinery.
const isLiquid = (material: number): boolean =>
    material === MATERIAL_WATER || material === MATERIAL_LAVA;

// Every species the ocean can hold, grouped by how it gets about.
const SWIMMER_KINDS: SwimmerKind[] = ['fish', 'squid', 'jellyfish', 'turtle', 'shark', 'whale'];
const CRAWLER_KINDS: CrawlerKind[] = ['octopus', 'crab'];
const BED_KINDS: BedKind[] = ['clam', 'starfish'];

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
type Bubble = { x: number; y: number; wobblePhase: number; wobbleSpeed: number; radius: number };
// A detached mass of stone on its way down, with the momentum it has built up.
type FallingStone = { body: StoneBody; speed: number; travel: number; tips: number };
type ChargeState = { cellX: number; cellY: number; startMs: number };

export type Brush = 'sand' | 'water' | 'stone' | 'lava' | 'erase';
export type PointerAction = 'charge' | 'pour';

export class SandEngine {
    grainsPerDrop = DEFAULT_GRAINS_PER_DROP;
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
    // Heat per cell, parallel to `pixels`. Lava is the only source; sand and
    // glass merely carry it. `heatPrevious` snapshots the field each tick so
    // conduction spreads exactly one cell per tick — reading and writing the
    // same array would let heat race across the whole flow in a single pass.
    private heat: Uint8Array = new Uint8Array(0);
    private heatPrevious: Uint8Array = new Uint8Array(0);
    private lastHeatTickMs = 0;
    private gridDirty = true;

    private particles: Particle[] = [];
    private sparks: Spark[] = [];
    private shockwaves: Shockwave[] = [];
    private flashes: Flash[] = [];
    private stars: Star[] = [];
    private shootingStars: ShootingStar[] = [];
    private bubbles: Bubble[] = [];
    private swimmers: Swimmer[] = [];
    private bedLife: BedDweller[] = [];
    private crawlers: Crawler[] = [];
    private moonCanvas: HTMLCanvasElement | null = null;
    private sunCanvas: HTMLCanvasElement | null = null;
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

    private stoneBodies: FallingStone[] = [];
    private stoneDirty = true;
    private stoneScanTick = 0;

    private steerTick = 0;

    private lastFloraTickMs = 0;
    private floraCursor = 0;
    private settleCursor = 0;

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
        this.buildSun();
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
        this.bubbles = [];
        this.swimmers = [];
        this.bedLife = [];
        this.crawlers = [];
        this.stoneBodies = [];
        this.stoneDirty = true;
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
        // Heat is not carried across a resize; the next tick re-seeds any lava
        // it finds back to full, which is close enough and much simpler.
        this.heat = new Uint8Array(newCols * newRows);
        this.heatPrevious = new Uint8Array(newCols * newRows);
        this.gridDirty = true;

        this.particles = this.particles.filter((p) => p.x < newCols);
        for (const particle of this.particles) {
            particle.y = Math.min(particle.y, newRows - 1);
        }
        for (let x = 0; x < newCols; x++) this.dirtyColumns.add(x);
    }

    // Which species are in the world right now, for the log in the HUD.
    presentSpecies(): CreatureKind[] {
        const kinds = new Set<CreatureKind>();
        for (const swimmer of this.swimmers) kinds.add(swimmer.kind);
        for (const crawler of this.crawlers) kinds.add(crawler.kind);
        for (const dweller of this.bedLife) kinds.add(dweller.kind);
        return Array.from(kinds);
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
        // A sandbox saved before stone had weight may hold ledges hanging in
        // mid-air. Settle them now rather than playing out the collapse.
        this.settleStoneImmediately();
        return true;
    }

    exportImage(): Promise<Blob | null> {
        const snapshot = document.createElement('canvas');
        snapshot.width = this.cssWidth;
        snapshot.height = this.cssHeight;
        const snapshotCtx = snapshot.getContext('2d');
        if (!snapshotCtx) return Promise.resolve(null);

        // The canvas already paints an opaque animated sky as its first layer
        // (see sky.ts / render), so the snapshot is just the live canvas.
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
        else if (this.brush === 'lava') gameAudio.startPour('water');
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
        const wasDrawingStone = this.brush === 'stone';
        this.pointerDown = false;
        this.lastPaint = null;
        // A finished stone stroke is one shape: seal any pocket it closed off,
        // then let the whole thing go at once.
        if (wasDrawingStone) this.fillEnclosedStone();
        this.stoneDirty = true;
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

        const night = 1 - daylightOf(skyPhase(now));
        if (this.shootingStars.length < 2 && Math.random() < (dt / 9) * night) {
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

        // Heat runs on its own slow clock: lava conducts warmth into the sand
        // and glass around it, baking successive layers to glass and finally
        // setting itself into basalt once it has none left to give.
        if (now - this.lastHeatTickMs >= HEAT_TICK_MS) {
            this.lastHeatTickMs = now;
            this.updateHeat(now);
        }

        this.updateStone(dt, now);

        // Re-check a rotating slice of terrain so a slope that settled outside
        // a dirty window still gets seen and can never freeze mid-slump.
        this.sweepTerrain();
        this.relaxDirtyColumns();

        if (now - this.lastFloraTickMs >= FLORA_TICK_MS) {
            this.lastFloraTickMs = now;
            this.updateFlora(now);
            this.repopulateLife();
        }

        this.updateLife(dt, now);

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

        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            const bubble = this.bubbles[i];
            bubble.y -= BUBBLE_RISE_PX_PER_S * dt;
            bubble.x += Math.sin(now * 0.001 * bubble.wobbleSpeed + bubble.wobblePhase) * 12 * dt;
            // A bubble pops the moment it leaves the water (surface, drain, or solid).
            const cx = Math.floor(bubble.x / CELL);
            const cy = Math.floor(bubble.y / CELL);
            const inWater =
                cx >= 0 &&
                cx < this.cols &&
                cy >= 0 &&
                cy < this.rows &&
                materialOf(this.pixels[cy * this.cols + cx]) === MATERIAL_WATER;
            if (!inWater) {
                this.bubbles[i] = this.bubbles[this.bubbles.length - 1];
                this.bubbles.pop();
            }
        }

        this.shockwaves = this.shockwaves.filter((wave) => now - wave.bornAt < wave.durMs);
        this.flashes = this.flashes.filter((flash) => now - flash.bornAt < flash.durMs);
    }

    private moveParticle(p: Particle, dt: number): boolean {
        if (isLiquid(p.color >>> 24)) return this.moveLiquidParticle(p, dt);
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
        if (inWater) p.vy = Math.min(p.vy, SAND_IN_WATER_FALL_CELLS_PER_S);

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

    // Water and lava share this: both flow, level and pool. Lava simply does
    // it slower and creeps a shorter distance each tick.
    private moveLiquidParticle(p: Particle, dt: number): boolean {
        const material = p.color >>> 24;
        const lava = material === MATERIAL_LAVA;
        const terminal = lava ? LAVA_TERMINAL_FALL_CELLS_PER_S : MAX_FALL_SPEED_CELLS_PER_S * 0.8;
        const hops = lava ? LAVA_FLOW_HOPS_PER_TICK : WATER_FLOW_HOPS_PER_TICK;
        p.vx += this.gravityX * dt * 0.8;
        p.vx *= Math.max(0, 1 - 0.8 * dt);
        this.moveHorizontally(p, dt, (pixel) => pixel !== 0);

        p.vy = Math.min(p.vy + GRAVITY_CELLS_PER_S2 * dt, terminal);
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
                this.settleLiquid(p, cx, this.rows - 1);
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
                this.settleLiquid(p, cx, cy);
                return false;
            }
            let runCol = cx;
            for (let hop = 0; hop < hops; hop++) {
                const next = runCol + flowDir;
                if (!this.isFree(next, cy)) break;
                runCol = next;
                if (this.pixelAt(runCol, nextY) === 0) break;
            }
            if (runCol === cx) {
                this.settleLiquid(p, cx, cy);
                return false;
            }
            p.x = runCol + 0.5;
            p.vx = flowDir * 4;
            p.vy = Math.min(p.vy, 8);
            p.flow++;
            if (p.flow > (lava ? LAVA_MAX_FLOW_HOPS : WATER_MAX_FLOW_HOPS)) {
                this.settleLiquid(p, runCol, cy);
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

        // Roll down the slope on landing instead of stacking where it hit.
        // A pour through deep water keeps hundreds of grains in flight in one
        // column; the instant the pile rises to meet them they all settle on
        // top of one another and throw up a spire far faster than the relax
        // pass can topple it back down. Stepping sideways only into a free
        // cell, then falling, keeps the grain from passing through walls.
        let col = cellX;
        for (let roll = 0; roll < MAX_SETTLE_ROLLS; roll++) {
            const here = this.terrainSurfaceOf(col);
            const leftDrop = col > 0 ? this.terrainSurfaceOf(col - 1) - here : 0;
            const rightDrop = col < this.cols - 1 ? this.terrainSurfaceOf(col + 1) - here : 0;
            let dir = 0;
            if (leftDrop > TOPPLE_HEIGHT_DIFF_CELLS && leftDrop >= rightDrop) dir = -1;
            else if (rightDrop > TOPPLE_HEIGHT_DIFF_CELLS) dir = 1;
            if (dir === 0) break;
            if (this.blocksSand(this.pixelAt(col + dir, y))) break; // something in the way
            col += dir;
            while (y + 1 < this.rows && !this.blocksSand(this.pixelAt(col, y + 1))) y++;
        }
        cellX = col;

        const displaced = this.pixelAt(cellX, y);
        this.setCell(cellX, y, p.color);
        // Only water needs rehousing; flora the grain landed on is buried.
        if (displaced !== 0 && displaced >>> 24 === MATERIAL_WATER) this.displaceWater(cellX, y, displaced);
        this.markDirtyAround(cellX);
    }

    private settleLiquid(p: Particle, cellX: number, cellY: number): void {
        let y = cellY;
        while (y >= 0 && this.pixelAt(cellX, y) !== 0) y--;
        if (y < 0) return;

        // Hydrostatic leveling: never rest on top of other water while the
        // pool surface is lower somewhere reachable. Water cells don't block
        // the search (pressure equalizes through the pool); solids do.
        const material = p.color >>> 24;
        if (y + 1 < this.rows && this.pixelAt(cellX, y + 1) >>> 24 === material) {
            const targetCol = this.findLiquidEqualizeColumn(cellX, y, material);
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
    private findLiquidEqualizeColumn(cx: number, cy: number, liquid: number): number {
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
                if (cell !== 0 && cell >>> 24 !== liquid) {
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
            processed.push(col);

            // Only the falling and spreading passes below mint particles, so
            // only they wait for budget. Levelling and toppling move cells
            // directly and must keep running — bailing out of the whole column
            // when the budget filled was what stalled relaxation mid-pour and
            // let the pile climb into a spike.
            const canSpawn = this.particles.length < MAX_ACTIVE_PARTICLES - 8;
            for (let y = canSpawn ? this.rows - 2 : -1; y >= 0; y--) {
                const idx = y * this.cols + col;
                const pixel = this.pixels[idx];
                if (pixel === 0) continue;
                const material = pixel >>> 24;
                // Stone ledges and rooted flora stay put instead of falling.
                if (material === MATERIAL_STONE || isFlora(material)) continue;

                if (this.pixels[idx + this.cols] === 0) {
                    this.clearCell(col, y);
                    this.particles.push(this.makeParticle(col + 0.5, y + 0.5, (Math.random() - 0.5) * 2, 0, pixel));
                    newlyDirty.push(col);
                    continue;
                }

                if (isLiquid(material)) {
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
                const targetCol = this.findLiquidEqualizeColumn(col, waterTop, MATERIAL_WATER);
                if (targetCol !== col) {
                    const color = this.pixels[waterTop * this.cols + col];
                    this.clearCell(col, waterTop);
                    let restY = waterTop;
                    while (restY + 1 < this.rows && this.pixelAt(targetCol, restY + 1) === 0) restY++;
                    this.setCell(targetCol, restY, color);
                    newlyDirty.push(col, targetCol);
                }
            }

            this.toppleColumn(col, newlyDirty);
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

    // Rehouses the water a grain displaced when it took a cell. The column's
    // surface simply rises by one, which is what putting sand in water does,
    // and costs no particle — a pour into deep water spawns one grain per drop
    // and the budget is precious.
    private displaceWater(col: number, fromY: number, water: number): void {
        const waterTop = this.waterSurfaceOf(col);
        // waterSurfaceOf only reports a row when it is the column's topmost
        // occupied cell, so the cell above it is guaranteed free.
        if (waterTop > 0) {
            this.setCell(col, waterTop - 1, water);
            return;
        }
        if (this.particles.length < MAX_ACTIVE_PARTICLES) {
            this.particles.push(this.makeParticle(col + 0.5, fromY + 0.5, 0, 0, water));
        }
    }

    // Slides loose sand off a column that towers over its neighbours. A tower
    // sheds several grains per pass, not one: a steady pour stacks grains
    // faster than a single-grain-per-frame slide can clear them, which let a
    // spike climb out of the pile while sand was still falling.
    private toppleColumn(col: number, newlyDirty: number[]): void {
        for (let slide = 0; slide < MAX_TOPPLE_SLIDES_PER_PASS; slide++) {
            const surface = this.terrainSurfaceOf(col);
            if (surface >= this.rows) return;
            const topPixel = this.pixels[surface * this.cols + col];
            if (topPixel >>> 24 !== MATERIAL_SAND) return; // packed sand and stone hold

            const leftDrop = col > 0 ? this.terrainSurfaceOf(col - 1) - surface : 0;
            const rightDrop = col < this.cols - 1 ? this.terrainSurfaceOf(col + 1) - surface : 0;
            // Keep the unstable side awake even when the grain topples the other
            // way, so a slope relaxes all the way out instead of stalling at the
            // edge of the dirty window.
            if (leftDrop > TOPPLE_HEIGHT_DIFF_CELLS) newlyDirty.push(col - 1);
            if (rightDrop > TOPPLE_HEIGHT_DIFF_CELLS) newlyDirty.push(col + 1);

            let dir = 0;
            if (this.gravityX > 25 && rightDrop > 1) dir = 1;
            else if (this.gravityX < -25 && leftDrop > 1) dir = -1;
            else if (leftDrop > TOPPLE_HEIGHT_DIFF_CELLS && leftDrop >= rightDrop) dir = -1;
            else if (rightDrop > TOPPLE_HEIGHT_DIFF_CELLS) dir = 1;
            if (dir === 0) return;

            // Move the grain straight onto the neighbouring ground rather than
            // launching it as a particle. Sliding one cell down a slope needs
            // no flight, and more importantly a particle cannot be spawned once
            // the budget is full — which is exactly when a heavy pour is piling
            // sand up and toppling is needed most. Grid moves always work.
            const landing = this.terrainSurfaceOf(col + dir) - 1;
            if (landing < 0) return;
            this.clearCell(col, surface);
            const displaced = this.pixelAt(col + dir, landing);
            this.setCell(col + dir, landing, topPixel);
            if (displaced !== 0 && displaced >>> 24 === MATERIAL_WATER) {
                this.displaceWater(col + dir, landing, displaced);
            }
            newlyDirty.push(col, col + dir);
        }
    }

    // Re-checks a rotating slice of the grid for over-steep sand. This only
    // touches terrain: routing the sweep through the full dirty-column pass
    // instead kept re-examining settled water too, and every water cell that
    // could spread became a particle — thousands of them, which both churned
    // the whole pool and exhausted the budget that relaxation needs to run.
    private sweepTerrain(): void {
        if (this.cols === 0) return;
        const newlyDirty: number[] = [];
        for (let i = 0; i < SETTLE_SWEEP_COLUMNS_PER_STEP; i++) {
            this.toppleColumn(this.settleCursor, newlyDirty);
            this.settleCursor = (this.settleCursor + 1) % this.cols;
        }
        for (const col of newlyDirty) {
            if (col >= 0 && col < this.cols) this.dirtyColumns.add(col);
        }
    }

    // Everything thermal, on a slow tick of its own.
    //
    // Lava does not flip to stone the moment it meets water — it holds a heat
    // value that drains according to what surrounds it, and only sets once
    // there is nothing left. Meanwhile that heat conducts on through sand and
    // through the glass it has already made, which is what lets a flow bake
    // successive layers rather than glazing a single skin and stopping.
    private updateHeat(now: number): void {
        if (this.cols === 0) return;
        const cells = this.cols * this.rows;
        if (this.heat.length !== cells) {
            this.heat = new Uint8Array(cells);
            this.heatPrevious = new Uint8Array(cells);
        }
        // Snapshot: conduction must read last tick's field, or heat would race
        // across the whole flow in one pass instead of advancing a cell.
        this.heatPrevious.set(this.heat);

        const conductTo = (x: number, y: number, source: number): void => {
            if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
            const material = materialOf(this.pixels[y * this.cols + x]);
            if (material !== MATERIAL_SAND && material !== MATERIAL_PACKED_SAND && material !== MATERIAL_GLASS) {
                return;
            }
            const index = y * this.cols + x;
            const passed = source - HEAT_CONDUCTION_LOSS;
            if (passed > this.heat[index]) this.heat[index] = passed;
        };

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const index = y * this.cols + x;
                const pixel = this.pixels[index];
                const material = pixel === 0 ? 0 : pixel >>> 24;
                const wasHot = this.heatPrevious[index];

                if (material === MATERIAL_LAVA) {
                    // Freshly poured lava arrives at full heat.
                    let level = wasHot === 0 ? LAVA_HEAT_MAX : wasHot;

                    let loss = LAVA_COOL_PER_TICK;
                    const neighbours: Array<[number, number]> = [
                        [x - 1, y],
                        [x + 1, y],
                        [x, y - 1],
                        [x, y + 1]
                    ];
                    for (const [nx, ny] of neighbours) {
                        if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) continue;
                        const near = materialOf(this.pixels[ny * this.cols + nx]);
                        if (near === MATERIAL_WATER) {
                            loss += LAVA_COOL_PER_WATER_NEIGHBOUR;
                            if (Math.random() < WATER_BOIL_CHANCE_PER_TICK) {
                                this.clearCell(nx, ny); // boiled off
                                this.markDirtyAround(nx);
                                this.spawnSteam(nx, ny, now);
                            }
                        } else if (near === 0) {
                            loss += LAVA_COOL_PER_AIR_NEIGHBOUR;
                        } else if (isFlora(near)) {
                            this.clearCell(nx, ny); // scorched
                            this.markDirtyAround(nx);
                        }
                    }

                    level = Math.max(0, level - loss);
                    this.heat[index] = level;
                    if (level === 0) {
                        this.setCell(x, y, this.cooledLavaColor());
                        this.markDirtyAround(x);
                        this.stoneDirty = true;
                    } else {
                        // Show the cooling: bright and yellow while molten,
                        // sinking to a dull red before it sets.
                        this.setCell(x, y, this.lavaColorForHeat(level));
                    }
                    for (const [nx, ny] of neighbours) conductTo(nx, ny, level);
                    continue;
                }

                if (wasHot === 0) {
                    if (this.heat[index] !== 0 && material === 0) this.heat[index] = 0;
                    continue;
                }

                // Sand and glass pass heat along; anything else just loses it.
                if (
                    material === MATERIAL_SAND ||
                    material === MATERIAL_PACKED_SAND ||
                    material === MATERIAL_GLASS
                ) {
                    conductTo(x - 1, y, wasHot);
                    conductTo(x + 1, y, wasHot);
                    conductTo(x, y - 1, wasHot);
                    conductTo(x, y + 1, wasHot);
                    if (
                        (material === MATERIAL_SAND || material === MATERIAL_PACKED_SAND) &&
                        wasHot >= SAND_TO_GLASS_HEAT
                    ) {
                        this.setCell(x, y, this.glassColor());
                    }
                } else {
                    this.heat[index] = 0;
                    continue;
                }

                this.heat[index] = Math.max(0, this.heat[index] - HEAT_AMBIENT_COOL);
            }
        }
    }

    private spawnSteam(col: number, row: number, now: number): void {
        for (let i = 0; i < LAVA_QUENCH_SPARKS; i++) {
            if (this.sparks.length >= MAX_ACTIVE_PARTICLES) break;
            this.sparks.push({
                x: (col + 0.5) * CELL,
                y: (row + 0.5) * CELL,
                vx: (Math.random() - 0.5) * 70,
                vy: -40 - Math.random() * 60,
                bornAt: now,
                lifeMs: 260 + Math.random() * 300,
                hue: 30
            });
        }
    }

    // Topmost cell of the ground itself, ignoring water and anything growing on
    // it. Slope comparisons must use this: surfaceOf counts a kelp stalk as
    // terrain, so a planted column read as high ground and the sand beside it
    // refused to slide, letting pours pile up into towers around the reef.
    private terrainSurfaceOf(col: number): number {
        for (let y = 0; y < this.rows; y++) {
            const pixel = this.pixels[y * this.cols + col];
            if (pixel === 0) continue;
            const material = pixel >>> 24;
            if (material === MATERIAL_WATER || isFlora(material)) continue;
            return y;
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

    // ------------------------------------------------------------------ flora

    // Grows and culls underwater life across a slow rotating sweep of columns,
    // so kelp/coral appear over seconds and drained reefs die off in kind.
    private updateFlora(now: number): void {
        if (this.cols === 0) return;
        const ctx: FloraContext = {
            cols: this.cols,
            rows: this.rows,
            materialAt: (x, y) => materialOf(this.pixels[y * this.cols + x]),
            setCell: (x, y, color) => this.setCell(x, y, color),
            clearCell: (x, y) => this.clearCell(x, y),
            random: Math.random
        };

        let deathSparks = 0;
        const count = Math.min(FLORA_COLUMNS_PER_TICK, this.cols);
        for (let i = 0; i < count; i++) {
            const col = this.floraCursor;
            this.floraCursor = (this.floraCursor + 1) % this.cols;

            const result = updateFloraColumn(ctx, col);
            if (result.died.length > 0) {
                this.markDirtyAround(col);
                for (const dead of result.died) {
                    if (deathSparks >= 8) break;
                    deathSparks++;
                    this.spawnDeathSpark(dead.x, dead.y, dead.material, now);
                }
            }
            if (this.bubbles.length < MAX_BUBBLES && Math.random() < BUBBLE_SPAWN_CHANCE) {
                this.maybeSpawnBubble(col);
            }
        }
    }

    private maybeSpawnBubble(col: number): void {
        // Vent from the water just above a reef tip, so bubbles rise to the surface.
        let waterTop = -1;
        let tipY = -1;
        for (let y = 0; y < this.rows; y++) {
            const m = materialOf(this.pixels[y * this.cols + col]);
            if (m === 0) continue;
            if (m === MATERIAL_WATER) {
                if (waterTop === -1) waterTop = y;
                continue;
            }
            if (isFlora(m)) tipY = y;
            break;
        }
        if (tipY === -1 || waterTop === -1 || tipY - 1 < waterTop) return;

        const spawnRow = tipY - 1 - Math.floor(Math.random() * Math.max(1, tipY - waterTop));
        this.bubbles.push({
            x: (col + 0.5) * CELL,
            y: (spawnRow + 0.5) * CELL,
            wobblePhase: Math.random() * TWO_PI,
            wobbleSpeed: 3 + Math.random() * 3,
            radius: 1 + Math.random() * 1.5
        });
    }

    private spawnDeathSpark(cellX: number, cellY: number, material: number, now: number): void {
        const hue = material === MATERIAL_KELP ? 130 : 340;
        const angle = Math.random() * TWO_PI;
        const speed = 20 + Math.random() * 40;
        this.sparks.push({
            x: (cellX + 0.5) * CELL,
            y: (cellY + 0.5) * CELL,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 20,
            bornAt: now,
            lifeMs: 200 + Math.random() * 200,
            hue
        });
    }

    // ------------------------------------------------------------------ stone

    // Stone moves as a rigid mass, so it is handled here rather than in the
    // per-cell relaxation pass — which is exactly why the stone skip in
    // relaxDirtyColumns must stay. A stone particle would run through
    // settleSand and roll down slopes like a grain of sand.
    private updateStone(dt: number, now: number): void {
        if (this.cols === 0) return;

        // Drawing a stone stroke would otherwise break into a dotted trail of
        // separate blobs falling from different heights, because each dab is
        // its own body the moment it is painted. Hold the world still until
        // the player lifts, then let the whole shape go at once.
        const painting = this.pointerDown && this.brush === 'stone';
        if (painting) return;

        if (this.stoneDirty || ++this.stoneScanTick >= STONE_RESCAN_EVERY_STEPS) {
            this.stoneDirty = false;
            this.stoneScanTick = 0;
            this.rescanStoneBodies();
        }
        if (this.stoneBodies.length === 0) return;

        const ctx = this.stoneContext();
        // Lowest first, so a slab never tries to move into space another is
        // still occupying.
        this.stoneBodies.sort((a, b) => b.body.maxY - a.body.maxY);

        const landed: FallingStone[] = [];
        for (const falling of this.stoneBodies) {
            falling.speed = Math.min(
                STONE_MAX_ENCLOSED_FILL_CELLS,
    STONE_MAX_FALL_CELLS_PER_S,
    STONE_MAX_TIPS_PER_LANDING,
                falling.speed + STONE_FALL_ACCEL_CELLS_PER_S2 * dt
            );
            falling.travel += falling.speed * dt;
            let steps = Math.floor(falling.travel);
            falling.travel -= steps;

            // One cell per check: a slab must not tunnel through a thin floor.
            while (steps-- > 0 && bodyCanDescend(ctx, falling.body)) {
                this.descendStoneBody(falling.body);
                falling.body = this.reindexBody(falling.body);
            }
            if (bodyCanDescend(ctx, falling.body)) continue; // still in the air

            // It has touched down. If its weight hangs off the side of whatever
            // it landed on, tip that way and let it carry on falling rather
            // than balancing on a pinnacle.
            const tip = bodyTipDirection(ctx, falling.body);
            if (tip !== 0 && falling.tips < STONE_MAX_TIPS_PER_LANDING && bodyCanShift(ctx, falling.body, tip)) {
                this.shiftStoneBody(falling.body, tip);
                falling.body = this.shiftBodyIndex(falling.body, tip);
                falling.tips++;
                // Tipping bleeds momentum; it topples rather than rockets off.
                falling.speed *= 0.5;
                continue;
            }
            landed.push(falling);
        }

        for (const falling of landed) {
            this.landStoneBody(falling, now);
            this.stoneBodies.splice(this.stoneBodies.indexOf(falling), 1);
        }
    }

    // Draw a closed ring of stone and the pocket inside it turns solid, so a
    // loop reads as one boulder rather than a hollow shell. Only stone walls
    // count — the screen edge does not — so nothing fills until the ring
    // genuinely closes.
    private fillEnclosedStone(): void {
        if (this.cols === 0) return;
        const enclosed = findEnclosedCells(this.stoneContext(), STONE_MAX_ENCLOSED_FILL_CELLS);
        if (enclosed.length === 0) return;
        for (const index of enclosed) {
            const x = index % this.cols;
            const y = (index - x) / this.cols;
            this.setCell(x, y, this.stoneColor());
            this.markDirtyAround(x);
        }
        this.stoneDirty = true;
    }

    private stoneContext(): StoneContext {
        return {
            cols: this.cols,
            rows: this.rows,
            materialAt: (x, y) => materialOf(this.pixels[y * this.cols + x])
        };
    }

    // Rebuilds the list of unsupported masses, carrying each one's fall speed
    // across by its minIndex — which shifts by exactly cols per row descended,
    // so a body that is mid-fall keeps its momentum. A miss just resets to
    // rest, which is a harmless failure mode.
    private rescanStoneBodies(): void {
        const previous = new Map<number, number>();
        for (const falling of this.stoneBodies) previous.set(falling.body.minIndex, falling.speed);

        // Tracks anything not at rest — falling bodies AND ones still toppling
        // off a perch, which are grounded and so would otherwise be dropped.
        this.stoneBodies = findUnstableBodies(this.stoneContext()).map((body) => ({
            body,
            speed: previous.get(body.minIndex) ?? 0,
            travel: 0,
            tips: 0
        }));
    }

    // Drops a body one row. Walking rows bottom-up is what makes this safe
    // without a snapshot: the cell below has already been vacated. Whatever
    // each vertical run swallows is lifted out to the top of that run, so a
    // slab sinking through a pool pushes the water up over itself instead of
    // deleting it.
    private descendStoneBody(body: StoneBody): void {
        const runs = bodyRuns(body);
        const swallowed = runs.map((run) => this.pixelAt(run.x, run.yBot + 1));

        for (const { y, xs } of body.rowsDescending) {
            for (const x of xs) {
                this.setCell(x, y + 1, this.pixelAt(x, y));
            }
        }
        runs.forEach((run, i) => {
            const lifted = swallowed[i];
            if (lifted === 0) this.clearCell(run.x, run.yTop);
            else this.setCell(run.x, run.yTop, lifted);
            this.markDirtyAround(run.x);
        });
    }

    // Slides a body one column sideways. Mirror of descendStoneBody: walk each
    // row from the leading edge back so a cell is only written once the one
    // ahead has moved, and hand whatever the run swallows back out at its tail.
    private shiftStoneBody(body: StoneBody, dir: -1 | 1): void {
        const runs = bodyRowRuns(body);
        const swallowed = runs.map((run) =>
            dir === 1 ? this.pixelAt(run.xRight + 1, run.y) : this.pixelAt(run.xLeft - 1, run.y)
        );

        for (const { y, xs } of body.rowsDescending) {
            const ordered = [...xs].sort((a, b) => (dir === 1 ? b - a : a - b));
            for (const x of ordered) {
                this.setCell(x + dir, y, this.pixelAt(x, y));
            }
        }
        runs.forEach((run, i) => {
            const tail = dir === 1 ? run.xLeft : run.xRight;
            const lifted = swallowed[i];
            if (lifted === 0) this.clearCell(tail, run.y);
            else this.setCell(tail, run.y, lifted);
            this.markDirtyAround(tail);
        });
    }

    private shiftBodyIndex(body: StoneBody, dir: -1 | 1): StoneBody {
        const cells = new Set<number>();
        for (const index of Array.from(body.cells)) cells.add(index + dir);
        return {
            minIndex: body.minIndex + dir,
            maxY: body.maxY,
            size: body.size,
            rowsDescending: body.rowsDescending.map(({ y, xs }) => ({
                y,
                xs: xs.map((x) => x + dir)
            })),
            cells
        };
    }

    // Shifts a body's own bookkeeping down a row so it can keep falling
    // without a full rescan of the grid.
    private reindexBody(body: StoneBody): StoneBody {
        const cells = new Set<number>();
        for (const index of Array.from(body.cells)) cells.add(index + this.cols);
        return {
            minIndex: body.minIndex + this.cols,
            maxY: body.maxY + 1,
            size: body.size,
            rowsDescending: body.rowsDescending.map(({ y, xs }) => ({ y: y + 1, xs })),
            cells
        };
    }

    // A silent drop reads as a rendering glitch, so sell the mass: shake the
    // screen and throw dust along the contact edge.
    private landStoneBody(falling: FallingStone, now: number): void {
        if (falling.speed < STONE_MAX_FALL_CELLS_PER_S * 0.25) return; // a nudge, not an impact
        const impact = falling.speed / STONE_MAX_FALL_CELLS_PER_S;
        const heft = Math.min(1, falling.body.size / 400);

        this.shakeMagnitude = Math.min(STONE_LANDING_SHAKE_MAX, 1.5 + impact * heft * 9);
        this.shakeUntil = now + SHAKE_DURATION_MS;

        const bottom = falling.body.rowsDescending[0];
        if (bottom) {
            const count = Math.min(STONE_LANDING_SPARKS_MAX, bottom.xs.length);
            for (let i = 0; i < count; i++) {
                const x = bottom.xs[Math.floor((i / count) * bottom.xs.length)];
                this.sparks.push({
                    x: (x + 0.5) * CELL,
                    y: (bottom.y + 1) * CELL,
                    vx: (Math.random() - 0.5) * 90,
                    vy: -30 - Math.random() * 60,
                    bornAt: now,
                    lifeMs: 260 + Math.random() * 260,
                    hue: 40
                });
            }
        }
        gameAudio.explosion(Math.min(1, impact * heft * 0.7));
        vibrate(Math.round(30 + impact * heft * 60));
    }

    // Used on load and resize: settle everything at once so an old sandbox's
    // floating stone does not play a second of slow-motion demolition.
    private settleStoneImmediately(): void {
        if (this.cols === 0) return;
        const ctx = this.stoneContext();
        for (let pass = 0; pass < 200; pass++) {
            const bodies = findFloatingBodies(ctx);
            if (bodies.length === 0) break;
            bodies.sort((a, b) => b.maxY - a.maxY);
            let moved = false;
            for (let body of bodies) {
                while (bodyCanDescend(ctx, body)) {
                    this.descendStoneBody(body);
                    body = this.reindexBody(body);
                    moved = true;
                }
            }
            if (!moved) break;
        }
        this.stoneBodies = [];
        this.stoneDirty = false;
    }

    // ------------------------------------------------------------------- life

    private isWaterAtPx = (px: number, py: number): boolean => {
        const cx = Math.floor(px / CELL);
        const cy = Math.floor(py / CELL);
        if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) return false;
        return materialOf(this.pixels[cy * this.cols + cx]) === MATERIAL_WATER;
    };

    private static readonly swimmerTuning: SwimmerTuning = {
        turnChancePerSecond: SWIMMER_TURN_CHANCE_PER_S,
        bobSpeed: SWIMMER_BOB_PX_PER_S,
        verticalSpeed: SWIMMER_VERTICAL_SPEED_PX_PER_S,
        roamRange: SWIMMER_ROAM_RANGE_PX,
        retargetMinMs: SWIMMER_RETARGET_MIN_MS,
        retargetMaxMs: SWIMMER_RETARGET_MAX_MS
    };

    private updateLife(dt: number, now: number): void {
        // Re-read the neighbourhood periodically rather than every frame: at
        // these speeds nobody notices, and it keeps an O(n^2) scan cheap.
        const steer = ++this.steerTick >= SWIMMER_STEER_EVERY_STEPS;
        if (steer) this.steerTick = 0;

        for (let i = this.swimmers.length - 1; i >= 0; i--) {
            if (steer) {
                const urge = steerTowardNeighbours(this.swimmers[i], this.swimmers, {
                    huntRangePx: SWIMMER_HUNT_RANGE_PX,
                    fleeRangePx: SWIMMER_FLEE_RANGE_PX,
                    schoolRangePx: SWIMMER_SCHOOL_RANGE_PX,
                    urgency: SWIMMER_SCHOOL_URGENCY
                });
                if (urge) {
                    this.swimmers[i].targetY = urge.targetY;
                    this.swimmers[i].dir = urge.dir;
                    // Hold the new heading rather than letting the idle
                    // wander immediately re-aim somewhere else.
                    this.swimmers[i].retargetAt = now + SWIMMER_RETARGET_MIN_MS;
                }
            }
            const alive = stepSwimmer(
                this.swimmers[i],
                dt,
                now,
                this.isWaterAtPx,
                Math.random,
                SandEngine.swimmerTuning
            );
            if (!alive) {
                this.swimmers[i] = this.swimmers[this.swimmers.length - 1];
                this.swimmers.pop();
            }
        }

        for (let i = this.crawlers.length - 1; i >= 0; i--) {
            const crawler = this.crawlers[i];
            const speed = LOOKS[crawler.kind].speedMin;
            if (!stepCrawler(crawler, dt, this.isWaterAtPx, speed)) {
                this.crawlers[i] = this.crawlers[this.crawlers.length - 1];
                this.crawlers.pop();
            }
        }

        this.bedLife = this.bedLife.filter((dweller) => this.bedLifeStillSubmerged(dweller));
    }

    // A clam or starfish only keeps its spot while sitting on the bed under water.
    private bedLifeStillSubmerged(dweller: BedDweller): boolean {
        const surface = this.surfaceOf(dweller.col);
        if (surface >= this.rows || surface <= 0) return false;
        // A slab drifting overhead makes surfaceOf report its top, far above
        // the dweller. That is something passing over, not the bed dropping
        // away, so keep the seat and just check it is still underwater.
        if (surface < dweller.y - 1) {
            return materialOf(this.pixelAt(dweller.col, dweller.y - 1)) === MATERIAL_WATER;
        }
        if (surface > dweller.y + 1) return false; // the bed really did erode away
        dweller.y = surface;
        return materialOf(this.pixelAt(dweller.col, surface - 1)) === MATERIAL_WATER;
    }

    // How much water there is and how deep it gets. Species use this to decide
    // whether the ocean is big enough for them to appear at all.
    private measureWater(): WaterStats {
        let cells = 0;
        let maxDepth = 0;
        // Sample every other column; the numbers only gate spawning.
        for (let x = 0; x < this.cols; x += 2) {
            let first = -1;
            let last = -1;
            for (let y = 0; y < this.rows; y++) {
                if (materialOf(this.pixels[y * this.cols + x]) !== MATERIAL_WATER) continue;
                cells++;
                if (first === -1) first = y;
                last = y;
            }
            // Depth is the span from surface to floor, not the longest unbroken
            // run: a kelp forest growing up the column interrupts the run, and
            // measuring that way made a deep, well-grown reef read as shallow
            // and quietly locked sharks and whales out of it.
            if (first !== -1) maxDepth = Math.max(maxDepth, last - first + 1);
        }
        cells *= 2; // undo the sampling stride
        const total = Math.max(1, this.cols * this.rows);
        return { cells, fraction: cells / total, maxDepthCells: maxDepth };
    }

    // Keeps every population in step with the ocean it lives in. Species whose
    // habitat is not met stay at zero, so filling the world is what brings the
    // bigger animals in.
    private repopulateLife(): void {
        if (this.cols === 0) return;
        const water = this.measureWater();

        // Drain the sea and the big animals leave again, so a species really is
        // only present while its habitat holds.
        const trim = <T extends { kind: CreatureKind }>(list: T[]): T[] => {
            const remaining: Record<string, number> = {};
            return list.filter((creature) => {
                const target = targetPopulation(HABITATS[creature.kind], water);
                const kept = remaining[creature.kind] ?? 0;
                if (kept >= target) return false;
                remaining[creature.kind] = kept + 1;
                return true;
            });
        };
        this.swimmers = trim(this.swimmers);
        this.crawlers = trim(this.crawlers);
        this.bedLife = trim(this.bedLife);

        const stock = <K extends CreatureKind>(
            kinds: K[],
            count: (kind: K) => number,
            spawn: (kind: K) => boolean
        ): void => {
            for (const kind of kinds) {
                const target = targetPopulation(HABITATS[kind], water);
                let living = count(kind);
                while (living < target && spawn(kind)) living++;
            }
        };

        stock(
            SWIMMER_KINDS,
            (kind) => this.swimmers.reduce((n, s) => n + (s.kind === kind ? 1 : 0), 0),
            (kind) => this.spawnSwimmer(kind)
        );
        stock(
            CRAWLER_KINDS,
            (kind) => this.crawlers.reduce((n, c) => n + (c.kind === kind ? 1 : 0), 0),
            (kind) => this.spawnCrawler(kind)
        );
        stock(
            BED_KINDS,
            (kind) => this.bedLife.reduce((n, b) => n + (b.kind === kind ? 1 : 0), 0),
            (kind) => this.spawnBedLife(kind)
        );
    }

    private pickHue(kind: CreatureKind): number {
        const hues = LOOKS[kind].hues;
        return hues[Math.floor(Math.random() * hues.length)];
    }

    private spawnSwimmer(kind: SwimmerKind): boolean {
        const look = LOOKS[kind];
        const sprite = spriteFor(kind);
        // Big animals need room, so only drop them where the water is open.
        const clearance = (spriteWidth(sprite) * look.pixelMax) / 2;
        for (let attempt = 0; attempt < 40; attempt++) {
            const cx = Math.floor(Math.random() * this.cols);
            const cy = Math.floor(Math.random() * this.rows);
            if (materialOf(this.pixels[cy * this.cols + cx]) !== MATERIAL_WATER) continue;
            const x = (cx + 0.5) * CELL;
            const y = (cy + 0.5) * CELL;
            if (!this.isWaterAtPx(x - clearance, y) || !this.isWaterAtPx(x + clearance, y)) continue;
            this.swimmers.push({
                kind,
                x,
                y,
                dir: Math.random() < 0.5 ? -1 : 1,
                speed: look.speedMin + Math.random() * (look.speedMax - look.speedMin),
                pixel: look.pixelMin + Math.random() * (look.pixelMax - look.pixelMin),
                hue: this.pickHue(kind),
                bobPhase: Math.random() * TWO_PI,
                targetY: y,
                retargetAt: 0
            });
            return true;
        }
        return false;
    }

    private spawnBedLife(kind: BedKind): boolean {
        for (let attempt = 0; attempt < 24; attempt++) {
            const col = Math.floor(Math.random() * this.cols);
            if (this.bedLife.some((other) => Math.abs(other.col - col) < 4)) continue;
            const surface = this.surfaceOf(col);
            if (surface <= 0 || surface >= this.rows) continue;
            if (materialOf(this.pixelAt(col, surface - 1)) !== MATERIAL_WATER) continue;
            this.bedLife.push({
                kind,
                col,
                y: surface,
                hue: this.pickHue(kind),
                phase: Math.random() * CLAM_OPEN_PERIOD_MS
            });
            return true;
        }
        return false;
    }

    private spawnCrawler(kind: CrawlerKind): boolean {
        for (let attempt = 0; attempt < 30; attempt++) {
            const col = Math.floor(Math.random() * this.cols);
            if (this.crawlers.some((other) => Math.abs(other.x / CELL - col) < 10)) continue;
            const surface = this.surfaceOf(col);
            if (surface <= 2 || surface >= this.rows) continue;
            // Settle just off the bed, where there is room to move.
            const row = surface - 2;
            if (materialOf(this.pixelAt(col, row)) !== MATERIAL_WATER) continue;
            this.crawlers.push({
                kind,
                x: (col + 0.5) * CELL,
                y: (row + 0.5) * CELL,
                dir: Math.random() < 0.5 ? -1 : 1,
                hue: this.pickHue(kind),
                phase: Math.random() * TWO_PI
            });
            return true;
        }
        return false;
    }

    // Paints a pixel-mask sprite centred on (x, y) so creatures match the
    // chunky look of the grid.
    private drawSprite(
        sprite: string[],
        x: number,
        y: number,
        pixel: number,
        flip: boolean,
        body: string,
        eye: string
    ): void {
        const ctx = this.ctx;
        const w = spriteWidth(sprite);
        const h = spriteHeight(sprite);
        const left = x - (w * pixel) / 2;
        const top = y - (h * pixel) / 2;
        const size = Math.ceil(pixel);
        for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
                const cell = sprite[row][flip ? w - 1 - col : col];
                if (cell === '.') continue;
                ctx.fillStyle = cell === 'e' ? eye : cell === 'o' ? 'rgba(255,246,228,0.9)' : body;
                ctx.fillRect(Math.round(left + col * pixel), Math.round(top + row * pixel), size, size);
            }
        }
    }

    private renderLife(now: number): void {
        const ctx = this.ctx;
        const eye = 'rgba(18,22,38,0.9)';

        for (const dweller of this.bedLife) {
            const sprite =
                dweller.kind === 'starfish'
                    ? STARFISH_SPRITE
                    : clamIsOpen(dweller, now, CLAM_OPEN_PERIOD_MS)
                      ? CLAM_SPRITE_OPEN
                      : CLAM_SPRITE_CLOSED;
            const pixel = LOOKS[dweller.kind].pixelMin;
            const cx = (dweller.col + 0.5) * CELL;
            const cy = dweller.y * CELL - (spriteHeight(sprite) * pixel) / 2;
            const light = dweller.kind === 'starfish' ? 62 : 70;
            this.drawSprite(sprite, cx, cy, pixel, false, `hsl(${dweller.hue},${saturationFor(dweller.kind)}%,${light}%)`, eye);
        }

        for (const crawler of this.crawlers) {
            const pixel = LOOKS[crawler.kind].pixelMin;
            const body = `hsl(${crawler.hue},58%,62%)`;
            if (crawler.kind === 'crab') {
                this.drawSprite(CRAB_SPRITE, crawler.x, crawler.y, pixel, crawler.dir === -1, body, eye);
                continue;
            }
            this.drawSprite(OCTOPUS_SPRITE, crawler.x, crawler.y, pixel, crawler.dir === -1, body, eye);
            // Tentacles trail below the head and curl as it drifts.
            ctx.fillStyle = body;
            const headBottom = crawler.y + (spriteHeight(OCTOPUS_SPRITE) * pixel) / 2;
            for (let arm = 0; arm < 4; arm++) {
                for (let seg = 0; seg < 4; seg++) {
                    const sway = Math.sin(now * 0.004 + crawler.phase + arm + seg * 0.7) * pixel * 0.9;
                    ctx.fillRect(
                        Math.round(crawler.x + (arm - 1.5) * pixel * 2 + sway),
                        Math.round(headBottom + seg * pixel),
                        pixel,
                        pixel
                    );
                }
            }
        }

        for (const swimmer of this.swimmers) {
            // Jellyfish are translucent; everything else is solid.
            if (swimmer.kind === 'jellyfish') ctx.globalAlpha = 0.65;
            this.drawSprite(
                spriteFor(swimmer.kind),
                swimmer.x,
                swimmer.y,
                swimmer.pixel,
                swimmer.dir === -1,
                `hsl(${swimmer.hue},${saturationFor(swimmer.kind)}%,58%)`,
                eye
            );
            if (swimmer.kind === 'jellyfish') ctx.globalAlpha = 1;
        }
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
            case 'lava':
                this.spawnGrains(cssX, cssY, 'lava');
                break;
            case 'erase':
                this.paintAlong(cssX, cssY, (x, y) => this.eraseAt(x, y));
                break;
        }
    }

    private spawnGrains(cssX: number, cssY: number, kind: 'sand' | 'water' | 'lava'): void {
        for (let i = 0; i < this.grainsPerDrop; i++) {
            if (this.particles.length >= MAX_ACTIVE_PARTICLES) break;
            const cellX = this.clampCol(Math.floor(cssX / CELL) + Math.round((Math.random() - 0.5) * 4));
            let cellY = this.clampRow(Math.floor(cssY / CELL));

            // If the tap lands inside the pile, spawn from just above it.
            const blocked = (pixel: number): boolean =>
                kind === 'sand' ? this.blocksSand(pixel) : pixel !== 0;
            let tries = 4;
            while (tries-- > 0 && cellY > 0 && blocked(this.pixelAt(cellX, cellY))) cellY--;
            if (blocked(this.pixelAt(cellX, cellY))) continue;

            const color =
                kind === 'water'
                    ? this.waterColor()
                    : kind === 'lava'
                      ? this.lavaColor()
                      : this.pureSandColor();
            this.particles.push(this.makeParticle(cellX + 0.5, cellY + 0.5, (Math.random() - 0.5) * 3, 0, color));
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
                this.stoneDirty = true;
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
            this.stoneDirty = true;
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
                if (material === MATERIAL_STONE) {
                    // A small charge cannot touch rock; a heavy one cracks the
                    // core of the blast out of it, and gravity does the rest to
                    // whatever is left hanging.
                    if (radiusCells < STONE_FRACTURE_MIN_RADIUS_CELLS) continue;
                    if (dist > radiusCells * STONE_FRACTURE_RADIUS_RATIO) continue;
                    this.clearCell(x, y);
                    this.stoneDirty = true;
                    continue;
                }
                if (isFlora(material)) {
                    // Flora vaporizes; a flying stalk would re-anchor mid-air.
                    this.clearCell(x, y);
                    continue;
                }

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
        // The blast cannot break stone, but clearing the sand out from under an
        // overhang is exactly what sets one falling.
        this.stoneDirty = true;

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

    private lavaColor(): number {
        return hslToPackedColor(
            LAVA_HUE + (Math.random() * 10 - 5),
            LAVA_SATURATION,
            LAVA_LIGHTNESS_MIN + Math.random() * (LAVA_LIGHTNESS_MAX - LAVA_LIGHTNESS_MIN),
            MATERIAL_LAVA
        );
    }

    // Molten colour for a given heat level: bright and yellowish while fully
    // hot, sinking to a dull red as it nears setting. Recomputed every heat
    // tick, so a cooling flow visibly darkens before it turns to basalt.
    private lavaColorForHeat(level: number): number {
        const t = Math.max(0, Math.min(level / LAVA_HEAT_MAX, 1));
        const hue = 10 + t * 32 + (Math.random() * 4 - 2);
        const lightness = 34 + t * 30 + (Math.random() * 4 - 2);
        return hslToPackedColor(hue, LAVA_SATURATION, lightness, MATERIAL_LAVA);
    }

    // Basalt left behind where a flow cooled and set.
    private cooledLavaColor(): number {
        return hslToPackedColor(
            COOLED_LAVA_HUE + (Math.random() * 8 - 4),
            COOLED_LAVA_SATURATION,
            COOLED_LAVA_LIGHTNESS_MIN +
                Math.random() * (COOLED_LAVA_LIGHTNESS_MAX - COOLED_LAVA_LIGHTNESS_MIN),
            MATERIAL_STONE
        );
    }

    private glassColor(): number {
        return hslToPackedColor(
            GLASS_HUE + (Math.random() * 12 - 6),
            GLASS_SATURATION,
            GLASS_LIGHTNESS_MIN + Math.random() * (GLASS_LIGHTNESS_MAX - GLASS_LIGHTNESS_MIN),
            MATERIAL_GLASS
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

        scatterRocks({
            cols: this.cols,
            rows: this.rows,
            surfaceAt: (x) => this.surfaceOf(x),
            setCell: (x, y, color) => this.setCell(x, y, color),
            random: Math.random
        });
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
        const phase = skyPhase(now);
        const night = 1 - daylightOf(phase);

        // The sky fills the whole canvas opaquely; drawn outside the shake
        // transform so screen-shake never smears empty edges into view.
        drawSky(ctx, phase, this.cssWidth, this.cssHeight);

        let shakeX = 0;
        let shakeY = 0;
        if (now < this.shakeUntil) {
            const k = (this.shakeUntil - now) / SHAKE_DURATION_MS;
            shakeX = (Math.random() * 2 - 1) * this.shakeMagnitude * k;
            shakeY = (Math.random() * 2 - 1) * this.shakeMagnitude * k;
        }

        ctx.save();
        ctx.translate(shakeX, shakeY);

        this.renderStars(now, night);
        this.renderCelestialBody(this.sunCanvas, sunPosition(phase));
        this.renderCelestialBody(this.moonCanvas, moonPosition(phase));
        this.renderShootingStars(now, night);

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

        this.renderLife(now);
        this.renderBubbles();
        this.renderChargeIndicator(now);
        this.renderEffects(now);

        ctx.restore();
    }

    private renderCelestialBody(sprite: HTMLCanvasElement | null, pos: CelestialPosition | null): void {
        if (!sprite || !pos) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = pos.alpha;
        ctx.drawImage(sprite, pos.x01 * this.cssWidth - sprite.width / 2, pos.y01 * this.cssHeight - sprite.height / 2);
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

    private buildSun(): void {
        const size = 180;
        const radius = 30;
        const sun = document.createElement('canvas');
        sun.width = size;
        sun.height = size;
        const g = sun.getContext('2d');
        if (!g) {
            this.sunCanvas = null;
            return;
        }
        const cx = size / 2;
        const cy = size / 2;

        // Warm disc first, then a soft radial glow slipped underneath.
        g.fillStyle = 'rgba(255,236,180,0.98)';
        g.beginPath();
        g.arc(cx, cy, radius, 0, TWO_PI);
        g.fill();

        g.globalCompositeOperation = 'destination-over';
        const glow = g.createRadialGradient(cx, cy, radius * 0.5, cx, cy, size / 2);
        glow.addColorStop(0, 'rgba(255,224,150,0.35)');
        glow.addColorStop(0.5, 'rgba(255,196,110,0.12)');
        glow.addColorStop(1, 'rgba(255,196,110,0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, size, size);

        this.sunCanvas = sun;
    }

    private renderBubbles(): void {
        if (this.bubbles.length === 0) return;
        const ctx = this.ctx;
        ctx.save();
        for (const bubble of this.bubbles) {
            ctx.strokeStyle = 'rgba(220,240,255,0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(bubble.x, bubble.y, bubble.radius, 0, TWO_PI);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.arc(bubble.x - bubble.radius * 0.3, bubble.y - bubble.radius * 0.3, 0.6, 0, TWO_PI);
            ctx.fill();
        }
        ctx.restore();
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

    private renderStars(now: number, night: number): void {
        if (night < 0.03) return; // washed out by daylight
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = 'rgb(205,218,255)';
        for (const star of this.stars) {
            const twinkle = star.baseAlpha * (0.55 + 0.45 * Math.sin(now * 0.001 * star.speed + star.phase));
            ctx.globalAlpha = twinkle * night;
            ctx.fillRect(star.x, star.y, star.size, star.size);
        }
        ctx.restore();
    }

    private renderShootingStars(now: number, night: number): void {
        if (this.shootingStars.length === 0 || night < 0.03) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        for (const star of this.shootingStars) {
            const t = Math.min((now - star.bornAt) / star.lifeMs, 1);
            const alpha = Math.sin(t * Math.PI) * 0.9 * night;
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

    // Only ground stops a falling grain. Kelp and coral are soft: sand drops
    // straight past and buries them. Letting a stalk carry sand meant a single
    // one-cell frond could hold up a tower of it, which is where those thin
    // spires rising out of the reef came from.
    private blocksSand(pixel: number): boolean {
        if (pixel === 0) return false;
        const material = pixel >>> 24;
        return material !== MATERIAL_WATER && !isFlora(material);
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

    // Relaxation only ever visits dirty columns, so this window has to be wide
    // enough to catch the imbalance a landing grain creates. At ±1 a step that
    // formed just outside it was never re-examined and froze into a permanent
    // spike, which no amount of settling time would smooth out.
    private markDirtyAround(col: number): void {
        for (let x = col - DIRTY_MARGIN_COLS; x <= col + DIRTY_MARGIN_COLS; x++) {
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
