import { buildRandomSandCastle } from './castle';
import { hslToPackedColor, packedColorToCss } from './color';
import {
    DEFAULT_GRAINS_PER_DROP,
    DROP_SAND_HUE_STEP,
    DROP_SAND_LIGHTNESS,
    DROP_SAND_SATURATION,
    EXPLOSION_FULL_CHARGE_MS,
    GRAVITY_CELLS_PER_S2,
    INITIAL_SAND_BASE_HUE,
    INITIAL_SAND_HEIGHT_RATIO,
    MAX_ACTIVE_PARTICLES,
    MAX_EXPLOSION_RADIUS_CELLS,
    MAX_FALL_SPEED_CELLS_PER_S,
    MIN_EXPLOSION_RADIUS_CELLS,
    PURE_SAND_LIGHTNESS,
    PURE_SAND_SATURATION,
    SPAWN_INTERVAL_MS,
    SQUARE_SIZE
} from './constants';

const CELL = SQUARE_SIZE;
const STEP_MS = 1000 / 60;
// Enough fixed steps to fully catch up a (clamped) 100ms frame, so slow or
// janky devices simulate at real speed instead of slow motion.
const MAX_CATCHUP_STEPS = 6;
const TWO_PI = Math.PI * 2;
const SHAKE_DURATION_MS = 260;
const SPARK_GRAVITY_PX_PER_S2 = 900;

// Sand particles live in fractional grid-cell coordinates; visual effects
// (sparks, shockwaves, flashes) live in css pixels.
type SandParticle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
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
type ChargeState = { cellX: number; cellY: number; startMs: number };

export type PointerAction = 'charge' | 'pour';

export class SandEngine {
    grainsPerDrop = DEFAULT_GRAINS_PER_DROP;
    useColoredDrops = true;

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

    private particles: SandParticle[] = [];
    private sparks: Spark[] = [];
    private shockwaves: Shockwave[] = [];
    private flashes: Flash[] = [];
    private stars: Star[] = [];
    private dirtyColumns = new Set<number>();

    private charge: ChargeState | null = null;
    private pointerX = 0;
    private pointerY = 0;
    private pointerDown = false;
    private lastSpawnMs = 0;
    private hue = Math.random() * 360;

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
        this.handleResize();
        this.reset();
    }

    start(): void {
        if (this.rafId !== null) return;
        this.rafId = requestAnimationFrame(this.frame);
    }

    dispose(): void {
        this.disposed = true;
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
        this.dirtyColumns.clear();
        this.charge = null;
        this.pointerDown = false;
        this.gridDirty = true;
        this.seedTerrain();
        this.buildCastle();
    }

    handleResize(): void {
        const cssWidth = Math.max(1, this.canvas.clientWidth || window.innerWidth);
        const cssHeight = Math.max(1, this.canvas.clientHeight || window.innerHeight);
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

    pointerDownAt(cssX: number, cssY: number, now: number = performance.now()): PointerAction {
        const cellX = this.clampCol(Math.floor(cssX / CELL));
        const cellY = this.clampRow(Math.floor(cssY / CELL));
        if (this.isOccupied(cellX, cellY)) {
            this.charge = { cellX, cellY, startMs: now };
            return 'charge';
        }
        this.pointerX = cssX;
        this.pointerY = cssY;
        this.pointerDown = true;
        this.lastSpawnMs = now;
        this.spawnBurst(cssX, cssY);
        return 'pour';
    }

    pointerMoveTo(cssX: number, cssY: number): void {
        this.pointerX = cssX;
        this.pointerY = cssY;
    }

    pointerUp(now: number = performance.now()): void {
        const charge = this.charge;
        if (charge) {
            const heldMs = now - charge.startMs;
            const t = Math.max(0, Math.min(heldMs / EXPLOSION_FULL_CHARGE_MS, 1));
            const radius = Math.round(
                MIN_EXPLOSION_RADIUS_CELLS + t * (MAX_EXPLOSION_RADIUS_CELLS - MIN_EXPLOSION_RADIUS_CELLS)
            );
            this.explodeAt(charge.cellX, charge.cellY, radius, now);
            this.charge = null;
        }
        this.pointerDown = false;
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
            this.spawnBurst(this.pointerX, this.pointerY);
        }

        this.unsettleDirtyColumns();

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

    private moveParticle(p: SandParticle, dt: number): boolean {
        // Horizontal motion with per-cell collision checks.
        p.vx *= Math.max(0, 1 - 0.4 * dt);
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
        if (fromX !== toX) {
            const dir = toX > fromX ? 1 : -1;
            let blocked = false;
            for (let cx = fromX + dir; dir > 0 ? cx <= toX : cx >= toX; cx += dir) {
                if (this.isOccupied(cx, rowY)) {
                    p.x = cx - dir + 0.5;
                    p.vx *= -0.25;
                    blocked = true;
                    break;
                }
            }
            if (!blocked) p.x = targetX;
        } else {
            p.x = targetX;
        }

        // Vertical motion, one cell at a time.
        p.vy = Math.min(p.vy + GRAVITY_CELLS_PER_S2 * dt, MAX_FALL_SPEED_CELLS_PER_S);

        if (p.vy < 0) {
            const cx = this.clampCol(Math.floor(p.x));
            const targetY = p.y + p.vy * dt;
            const fromY = Math.floor(p.y);
            const toY = Math.floor(Math.max(targetY, 0));
            let blocked = false;
            for (let cy = fromY - 1; cy >= toY; cy--) {
                if (this.isOccupied(cx, cy)) {
                    p.y = cy + 1.001;
                    p.vy = 0;
                    blocked = true;
                    break;
                }
            }
            if (!blocked) p.y = Math.max(targetY, 0);
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
                this.settleInto(p, cx, this.rows - 1);
                return false;
            }
            if (!this.isOccupied(cx, nextY)) {
                p.y = targetY;
                remaining -= stepAmt;
                continue;
            }

            // Blocked below: try a diagonal slide, otherwise come to rest.
            const preferred = Math.abs(p.vx) > 0.5 ? (p.vx > 0 ? 1 : -1) : Math.random() < 0.5 ? -1 : 1;
            if (this.canSlideInto(cx + preferred, cy, nextY)) {
                p.x = cx + preferred + 0.5;
                p.y = nextY;
                p.vy *= 0.9;
                remaining -= 1;
                continue;
            }
            if (this.canSlideInto(cx - preferred, cy, nextY)) {
                p.x = cx - preferred + 0.5;
                p.y = nextY;
                p.vy *= 0.9;
                remaining -= 1;
                continue;
            }
            this.settleInto(p, cx, cy);
            return false;
        }
        return true;
    }

    private canSlideInto(sideX: number, cy: number, nextY: number): boolean {
        if (sideX < 0 || sideX >= this.cols) return false;
        return !this.isOccupied(sideX, cy) && !this.isOccupied(sideX, nextY);
    }

    private settleInto(p: SandParticle, cellX: number, cellY: number): void {
        let y = cellY;
        while (y >= 0 && this.isOccupied(cellX, y)) y--;
        if (y < 0) return; // column is full to the top; the grain is lost
        this.setCell(cellX, y, p.color);
    }

    private unsettleDirtyColumns(): void {
        if (this.dirtyColumns.size === 0) return;
        const processed: number[] = [];
        for (const col of this.dirtyColumns) {
            if (this.particles.length >= MAX_ACTIVE_PARTICLES) break;
            for (let y = this.rows - 2; y >= 0; y--) {
                const idx = y * this.cols + col;
                if (this.pixels[idx] === 0) continue;
                if (this.pixels[idx + this.cols] !== 0) continue;
                const color = this.pixels[idx];
                this.clearCell(col, y);
                this.particles.push({
                    x: col + 0.5,
                    y: y + 0.5,
                    vx: (Math.random() - 0.5) * 2,
                    vy: 0,
                    color,
                    css: packedColorToCss(color)
                });
            }
            processed.push(col);
        }
        for (const col of processed) this.dirtyColumns.delete(col);
    }

    private spawnBurst(cssX: number, cssY: number): void {
        for (let i = 0; i < this.grainsPerDrop; i++) {
            if (this.particles.length >= MAX_ACTIVE_PARTICLES) return;
            const cellX = this.clampCol(Math.floor(cssX / CELL) + Math.round((Math.random() - 0.5) * 4));
            const cellY = this.clampRow(Math.floor(cssY / CELL));
            if (this.isOccupied(cellX, cellY)) continue;

            let color: number;
            if (this.useColoredDrops) {
                color = hslToPackedColor(
                    this.hue,
                    DROP_SAND_SATURATION,
                    DROP_SAND_LIGHTNESS + (Math.random() * 6 - 3)
                );
                this.hue = (this.hue + DROP_SAND_HUE_STEP) % 360;
            } else {
                color = this.pureSandColor();
            }

            this.particles.push({
                x: cellX + 0.5,
                y: cellY + 0.5,
                vx: (Math.random() - 0.5) * 3,
                vy: 0,
                color,
                css: packedColorToCss(color)
            });
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
                const color = this.pixels[y * this.cols + x];
                if (color === 0) continue;

                this.clearCell(x, y);
                const safeDist = dist || 1;
                const falloff = 1 - dist / (radiusCells + 1);
                const speed = power * (0.45 + Math.random() * 0.8) * (0.5 + falloff);
                this.particles.push({
                    x: x + 0.5,
                    y: y + 0.5,
                    vx: (dx / safeDist) * speed + (Math.random() - 0.5) * 8,
                    vy: (dy / safeDist) * speed * 0.8 - (8 + Math.random() * 14 + falloff * power * 0.6),
                    color,
                    css: packedColorToCss(color)
                });
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
    }

    // -------------------------------------------------------------- seeding

    private pureSandColor(): number {
        const shadeJitter = Math.floor(Math.random() * 10) - 5;
        return hslToPackedColor(INITIAL_SAND_BASE_HUE + shadeJitter, PURE_SAND_SATURATION, PURE_SAND_LIGHTNESS);
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
            isOccupied: (x, y) => this.isOccupied(x, y),
            addGrain: (x, y, color) => {
                if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return false;
                if (this.isOccupied(x, y)) return false;
                this.setCell(x, y, color);
                return true;
            },
            getPureSandColor: () => this.pureSandColor()
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

    private renderChargeIndicator(now: number): void {
        const charge = this.charge;
        if (!charge) return;
        const ctx = this.ctx;
        const heldMs = now - charge.startMs;
        const t = Math.max(0, Math.min(heldMs / EXPLOSION_FULL_CHARGE_MS, 1));
        const radiusPx = (MIN_EXPLOSION_RADIUS_CELLS + t * (MAX_EXPLOSION_RADIUS_CELLS - MIN_EXPLOSION_RADIUS_CELLS)) * CELL;
        const cx = (charge.cellX + 0.5) * CELL;
        const cy = (charge.cellY + 0.5) * CELL;
        const pulse = 0.5 + 0.5 * Math.sin(now / 110);

        ctx.save();

        // Soft breathing glow over the blast area.
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
        glow.addColorStop(0, `rgba(255,165,70,${0.20 + 0.10 * pulse})`);
        glow.addColorStop(0.7, `rgba(255,120,50,${0.10 + 0.06 * pulse})`);
        glow.addColorStop(1, 'rgba(255,120,50,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, radiusPx, 0, TWO_PI);
        ctx.fill();

        // Rings contracting inward: energy gathering, not a flat growing circle.
        for (let k = 0; k < 3; k++) {
            const phase = (now / 650 + k / 3) % 1;
            const ringRadius = radiusPx * (1.25 - phase);
            const alpha = 0.30 * phase * (0.4 + 0.6 * t);
            ctx.strokeStyle = `rgba(255,195,125,${alpha})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, ringRadius, 0, TWO_PI);
            ctx.stroke();
        }

        // Glowing ember at the epicentre.
        ctx.fillStyle = `rgba(255,225,170,${0.5 + 0.4 * pulse})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, TWO_PI);
        ctx.fill();

        // Small charge-progress dial.
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + t * TWO_PI);
        ctx.stroke();

        // Fully charged: bright rim pulse as a "release now" cue.
        if (t >= 1) {
            ctx.strokeStyle = `rgba(255,235,185,${0.30 + 0.30 * pulse})`;
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

    private isOccupied(x: number, y: number): boolean {
        return this.pixels[y * this.cols + x] !== 0;
    }

    private setCell(x: number, y: number, color: number): void {
        this.pixels[y * this.cols + x] = color;
        this.gridDirty = true;
    }

    private clearCell(x: number, y: number): void {
        this.pixels[y * this.cols + x] = 0;
        this.gridDirty = true;
    }

    private clampCol(x: number): number {
        return Math.max(0, Math.min(x, this.cols - 1));
    }

    private clampRow(y: number): number {
        return Math.max(0, Math.min(y, this.rows - 1));
    }
}
