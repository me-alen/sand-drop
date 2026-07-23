// Lets the engine be driven in jest without a real canvas.
//
// SandEngine.create bails out when getContext('2d') returns null, which is
// exactly what jsdom does — so until now none of the physics had any test
// coverage at all and every regression had to be caught by hand in a browser.
// The simulation itself only needs a typed array; the 2D context is used for
// drawing and for allocating ImageData. Stubbing it is enough to run the whole
// sim headlessly.
import { SQUARE_SIZE } from './constants';
import { SandEngine } from './engine';

const noop = (): void => {};

// Just enough CanvasRenderingContext2D for the engine to construct, resize and
// render into. Drawing calls are swallowed; createImageData is the one that
// has to do real work, since the grid is a view over its buffer.
const stubContext = (): CanvasRenderingContext2D => {
    const gradient = { addColorStop: noop };
    const context: Record<string, unknown> = {
        createImageData: (width: number, height: number) => ({
            data: new Uint8ClampedArray(width * height * 4),
            width,
            height,
            colorSpace: 'srgb'
        }),
        putImageData: noop,
        drawImage: noop,
        clearRect: noop,
        fillRect: noop,
        strokeRect: noop,
        beginPath: noop,
        closePath: noop,
        arc: noop,
        moveTo: noop,
        lineTo: noop,
        fill: noop,
        stroke: noop,
        save: noop,
        restore: noop,
        translate: noop,
        scale: noop,
        setTransform: noop,
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        lineCap: 'butt',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        imageSmoothingEnabled: true,
        canvas: null
    };
    return context as unknown as CanvasRenderingContext2D;
};

let patched = false;

// The engine also builds offscreen canvases of its own (the grid, the sun and
// moon sprites), so the stub has to be installed on the prototype rather than
// handed to one element.
const patchCanvas = (): void => {
    if (patched) return;
    patched = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLCanvasElement.prototype as any).getContext = function getContext() {
        return stubContext();
    };
};

export type TestEngine = {
    engine: SandEngine;
    cols: number;
    rows: number;
    /** Advance the simulation by n fixed 60Hz steps. */
    run: (steps: number) => void;
    materialAt: (x: number, y: number) => number;
    setCell: (x: number, y: number, color: number) => void;
    fill: (x0: number, y0: number, x1: number, y1: number, color: number) => void;
    /** Topmost row of a given material in a column, or rows if absent. */
    topOf: (x: number, material: number) => number;
    countMaterial: (material: number) => number;
    /** Raw packed pixels of a material, for asserting on colour. */
    pixelsOf: (material: number) => number[];
};

// Builds an engine on a grid of exactly cols x rows, wiped clean so a test
// starts from a known world rather than the generated terrain.
export const createTestEngine = (cols = 60, rows = 40): TestEngine => {
    patchCanvas();

    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: cols * SQUARE_SIZE, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: rows * SQUARE_SIZE, configurable: true });

    const engine = SandEngine.create(canvas);
    if (!engine) throw new Error('engine did not start — the canvas stub is not doing its job');

    // Reach past `private` for test purposes: the alternative is widening the
    // engine's public surface purely for tests, which is worse.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internals = engine as any;
    const wipe = (): void => {
        internals.pixels.fill(0);
        internals.particles.length = 0;
        internals.stoneBodies.length = 0;
        internals.dirtyColumns.clear();
        internals.gridDirty = true;
    };
    wipe();

    let now = 1000;
    return {
        engine,
        cols: internals.cols,
        rows: internals.rows,
        run: (steps: number) => {
            for (let i = 0; i < steps; i++) {
                now += 1000 / 60;
                internals.step(1 / 60, now);
            }
        },
        materialAt: (x: number, y: number) => {
            const pixel = internals.pixels[y * internals.cols + x];
            return pixel === 0 ? 0 : pixel >>> 24;
        },
        setCell: (x: number, y: number, color: number) => internals.setCell(x, y, color),
        fill: (x0: number, y0: number, x1: number, y1: number, color: number) => {
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    if (x < 0 || x >= internals.cols || y < 0 || y >= internals.rows) continue;
                    if (color === 0) internals.clearCell(x, y);
                    else internals.setCell(x, y, color);
                    internals.dirtyColumns.add(x);
                }
            }
            internals.stoneDirty = true;
        },
        topOf: (x: number, material: number) => {
            for (let y = 0; y < internals.rows; y++) {
                const pixel = internals.pixels[y * internals.cols + x];
                if (pixel !== 0 && pixel >>> 24 === material) return y;
            }
            return internals.rows;
        },
        countMaterial: (material: number) => {
            let count = 0;
            for (let i = 0; i < internals.pixels.length; i++) {
                const pixel = internals.pixels[i];
                if (pixel !== 0 && pixel >>> 24 === material) count++;
            }
            return count;
        },
        pixelsOf: (material: number) => {
            const found: number[] = [];
            for (let i = 0; i < internals.pixels.length; i++) {
                const pixel = internals.pixels[i];
                if (pixel !== 0 && pixel >>> 24 === material) found.push(pixel);
            }
            return found;
        }
    };
};

// Colour helpers so tests can write cells without reaching for the palette.
export const colorFor = (engine: SandEngine, material: 'sand' | 'water' | 'stone'): number => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internals = engine as any;
    if (material === 'water') return internals.waterColor();
    if (material === 'stone') return internals.stoneColor();
    return internals.pureSandColor();
};
