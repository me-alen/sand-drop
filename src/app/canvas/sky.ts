// Pure day/night math for the animated sky. No engine or DOM state lives here
// (drawSky takes the ctx it paints into), so every function is unit-testable.
//
// Phase runs 0..1 across one in-game day: 0 = midnight, 0.25 = sunrise,
// 0.5 = noon, 0.75 = sunset. See DAY_CYCLE_MS / DAY_START_PHASE in constants.
import { DAY_CYCLE_MS, DAY_START_PHASE } from './constants';

export type CelestialPosition = { x01: number; y01: number; alpha: number };

type Rgb = [number, number, number];
type SkyStops = [Rgb, Rgb, Rgb];
type SkyKeyframe = { phase: number; stops: SkyStops };

// Vertical gradient keyframes. The 0.0 and 1.0 frames MUST equal the legacy
// night colours (#04050d / #0b0e1c / #1a1430) so nighttime looks unchanged.
const SKY_KEYFRAMES: SkyKeyframe[] = [
    { phase: 0.0, stops: [[4, 5, 13], [11, 14, 28], [26, 20, 48]] },
    { phase: 0.19, stops: [[10, 13, 31], [26, 31, 58], [58, 37, 69]] },
    { phase: 0.26, stops: [[44, 62, 107], [122, 90, 140], [242, 166, 94]] },
    { phase: 0.34, stops: [[95, 159, 212], [156, 196, 228], [255, 217, 160]] },
    { phase: 0.5, stops: [[74, 144, 217], [142, 195, 238], [207, 232, 250]] },
    { phase: 0.66, stops: [[95, 159, 212], [156, 196, 228], [255, 201, 138]] },
    { phase: 0.74, stops: [[53, 53, 107], [140, 90, 122], [255, 154, 94]] },
    { phase: 0.81, stops: [[10, 13, 31], [26, 31, 58], [58, 37, 69]] },
    { phase: 1.0, stops: [[4, 5, 13], [11, 14, 28], [26, 20, 48]] }
];

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);

const smoothstep = (edge0: number, edge1: number, x: number): number => {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const wrap01 = (x: number): number => ((x % 1) + 1) % 1;

// Real elapsed time -> day phase in [0, 1).
export const skyPhase = (nowMs: number): number => wrap01(nowMs / DAY_CYCLE_MS + DAY_START_PHASE);

// 0 at night, 1 at solar noon, smoothly ramping across sunrise and sunset.
export const daylightOf = (phase: number): number =>
    smoothstep(0.21, 0.29, phase) - smoothstep(0.71, 0.79, phase);

const lerpStops = (a: SkyStops, b: SkyStops, t: number): SkyStops =>
    a.map((stop, i) => stop.map((c, ch) => Math.round(lerp(c, b[i][ch], t))) as Rgb) as SkyStops;

// The three vertical gradient colours (top, middle, bottom) for a given phase.
export const skyGradientStops = (phase: number): [string, string, string] => {
    const p = wrap01(phase);
    let lo = SKY_KEYFRAMES[0];
    let hi = SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1];
    for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
        if (p >= SKY_KEYFRAMES[i].phase && p <= SKY_KEYFRAMES[i + 1].phase) {
            lo = SKY_KEYFRAMES[i];
            hi = SKY_KEYFRAMES[i + 1];
            break;
        }
    }
    const span = hi.phase - lo.phase;
    const t = span <= 0 ? 0 : (p - lo.phase) / span;
    const stops = lerpStops(lo.stops, hi.stops, t);
    return stops.map(([r, g, b]) => `rgb(${r},${g},${b})`) as [string, string, string];
};

// A body travels a sine arc: rising at the left horizon (u=0), apex overhead
// (u=0.5), setting at the right horizon (u=1). alpha fades in/out at the edges.
const arcPosition = (u: number): CelestialPosition => ({
    x01: -0.08 + 1.16 * u,
    y01: 0.55 - 0.42 * Math.sin(Math.PI * u),
    alpha: smoothstep(0, 0.08, u) * smoothstep(0, 0.08, 1 - u)
});

// Sun is up between sunrise (0.25) and sunset (0.75); null otherwise.
export const sunPosition = (phase: number): CelestialPosition | null => {
    const p = wrap01(phase);
    if (p <= 0.25 || p >= 0.75) return null;
    return arcPosition((p - 0.25) / 0.5);
};

// Moon rides the opposite half of the cycle (up through the night, apex at
// midnight); null during the day.
export const moonPosition = (phase: number): CelestialPosition | null => {
    const mp = wrap01(phase + 0.5);
    if (mp <= 0.25 || mp >= 0.75) return null;
    return arcPosition((mp - 0.25) / 0.5);
};

// Paint the vertical sky gradient across the whole canvas.
export const drawSky = (
    ctx: CanvasRenderingContext2D,
    phase: number,
    width: number,
    height: number
): void => {
    const [top, mid, bottom] = skyGradientStops(phase);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.55, mid);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
};
