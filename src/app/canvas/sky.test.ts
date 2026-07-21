import { DAY_CYCLE_MS, DAY_START_PHASE } from './constants';
import { daylightOf, moonPosition, skyGradientStops, skyPhase, sunPosition } from './sky';

const parseRgb = (css: string): [number, number, number] => {
    const match = css.match(/rgb\((\d+),(\d+),(\d+)\)/);
    if (!match) throw new Error(`not an rgb() string: ${css}`);
    return [Number(match[1]), Number(match[2]), Number(match[3])];
};

describe('skyPhase', () => {
    it('starts at the configured boot phase and wraps over a full cycle', () => {
        expect(skyPhase(0)).toBeCloseTo(DAY_START_PHASE, 6);
        expect(skyPhase(DAY_CYCLE_MS)).toBeCloseTo(skyPhase(0), 6);
        expect(skyPhase(DAY_CYCLE_MS * 0.25)).toBeCloseTo(DAY_START_PHASE + 0.25, 6);
    });
});

describe('daylightOf', () => {
    it('is dark at midnight and full at noon', () => {
        expect(daylightOf(0)).toBe(0);
        expect(daylightOf(0.5)).toBeCloseTo(1, 6);
    });

    it('rises monotonically across the sunrise window', () => {
        let prev = -1;
        for (let p = 0.21; p <= 0.29; p += 0.01) {
            const d = daylightOf(p);
            expect(d).toBeGreaterThanOrEqual(prev);
            prev = d;
        }
    });

    it('is fully dark deep in the night', () => {
        expect(daylightOf(0.9)).toBe(0);
        expect(daylightOf(0.1)).toBe(0);
    });
});

describe('skyGradientStops', () => {
    it('reproduces the legacy night colours exactly at midnight', () => {
        expect(skyGradientStops(0)).toEqual(['rgb(4,5,13)', 'rgb(11,14,28)', 'rgb(26,20,48)']);
    });

    it('wraps continuously across the midnight seam', () => {
        const before = skyGradientStops(0.999).map(parseRgb);
        const after = skyGradientStops(0.001).map(parseRgb);
        before.forEach((rgb, i) => {
            rgb.forEach((c, ch) => expect(Math.abs(c - after[i][ch])).toBeLessThanOrEqual(2));
        });
    });

    it('paints a brighter sky at noon than at midnight', () => {
        const [, , noonBottom] = skyGradientStops(0.5).map(parseRgb);
        const [, , midnightBottom] = skyGradientStops(0).map(parseRgb);
        const sum = (rgb: number[]) => rgb.reduce((a, b) => a + b, 0);
        expect(sum(noonBottom)).toBeGreaterThan(sum(midnightBottom));
    });
});

describe('sunPosition', () => {
    it('sits at its apex around noon and is fully bright', () => {
        const pos = sunPosition(0.5);
        expect(pos).not.toBeNull();
        expect(pos!.x01).toBeCloseTo(0.5, 6);
        expect(pos!.alpha).toBeCloseTo(1, 6);
        // apex is the highest point (smallest y01) of the whole arc
        expect(pos!.y01).toBeLessThan(sunPosition(0.35)!.y01);
    });

    it('is below the horizon at night', () => {
        expect(sunPosition(0)).toBeNull();
        expect(sunPosition(0.9)).toBeNull();
    });
});

describe('moonPosition', () => {
    it('rides the sky at midnight and is gone at noon', () => {
        const pos = moonPosition(0);
        expect(pos).not.toBeNull();
        expect(pos!.x01).toBeCloseTo(0.5, 6);
        expect(pos!.alpha).toBeCloseTo(1, 6);
        expect(moonPosition(0.5)).toBeNull();
    });
});
