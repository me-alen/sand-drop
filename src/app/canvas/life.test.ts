import {
    Clam,
    clamIsOpen,
    CLAM_SPRITE_CLOSED,
    CLAM_SPRITE_OPEN,
    FISH_SPRITE,
    Octopus,
    OCTOPUS_SPRITE,
    SQUID_SPRITE,
    spriteFor,
    spriteHeight,
    spriteWidth,
    stepOctopus,
    stepSwimmer,
    Swimmer,
    SwimmerTuning
} from './life';

const makeSwimmer = (over: Partial<Swimmer> = {}): Swimmer => ({
    kind: 'fish',
    x: 100,
    y: 100,
    dir: 1,
    speed: 30,
    pixel: 2,
    hue: 30,
    bobPhase: 0,
    targetY: 100,
    retargetAt: Number.MAX_SAFE_INTEGER, // never retarget unless a test wants it
    ...over
});

const tuning = (over: Partial<SwimmerTuning> = {}): SwimmerTuning => ({
    turnChancePerSecond: 0,
    bobSpeed: 0,
    verticalSpeed: 10,
    roamRange: 200,
    retargetMinMs: 1000,
    retargetMaxMs: 2000,
    ...over
});

const never = () => 0; // random that never trips a chance roll
const everywhere = () => true;

describe('sprites', () => {
    it('are rectangular masks', () => {
        for (const sprite of [
            FISH_SPRITE,
            SQUID_SPRITE,
            CLAM_SPRITE_CLOSED,
            CLAM_SPRITE_OPEN,
            OCTOPUS_SPRITE
        ]) {
            expect(sprite.length).toBeGreaterThan(0);
            for (const row of sprite) expect(row.length).toBe(spriteWidth(sprite));
            expect(spriteHeight(sprite)).toBe(sprite.length);
        }
    });

    it('use only known mask characters', () => {
        for (const sprite of [
            FISH_SPRITE,
            SQUID_SPRITE,
            CLAM_SPRITE_CLOSED,
            CLAM_SPRITE_OPEN,
            OCTOPUS_SPRITE
        ]) {
            for (const row of sprite) expect(row).toMatch(/^[#eo.]+$/);
        }
    });

    it('maps each swimmer kind to its own sprite', () => {
        expect(spriteFor('fish')).toBe(FISH_SPRITE);
        expect(spriteFor('squid')).toBe(SQUID_SPRITE);
    });
});

describe('stepSwimmer', () => {
    it('swims forward through open water', () => {
        const swimmer = makeSwimmer();
        expect(stepSwimmer(swimmer, 1, 0, everywhere, never, tuning())).toBe(true);
        expect(swimmer.x).toBeCloseTo(130, 5);
    });

    it('turns around instead of swimming into rock', () => {
        const swimmer = makeSwimmer();
        const isWater = (x: number) => x <= 100;
        stepSwimmer(swimmer, 1, 0, isWater, never, tuning());
        expect(swimmer.dir).toBe(-1);
        expect(swimmer.x).toBe(100); // did not push into the wall
    });

    it('never steps onto a thin obstacle with open water beyond it', () => {
        // A one-stalk-wide barrier: the far probe sees clear water past it, so
        // checking only that probe would walk the swimmer into the stalk and
        // strand it on the next tick.
        const isWater = (x: number) => x < 108 || x > 112;
        const swimmer = makeSwimmer({ speed: 10 });
        stepSwimmer(swimmer, 1, 0, isWater, never, tuning());
        expect(isWater(swimmer.x)).toBe(true);
        expect(swimmer.dir).toBe(-1);
    });

    it('keeps swimming for minutes in a walled pool without stranding', () => {
        // Regression: a whole school used to die off over a few minutes.
        const isWater = (x: number, y: number) => x > 0 && x < 600 && y > 0 && y < 400;
        let seed = 7;
        const random = () => {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
        };
        const swimmer = makeSwimmer({ x: 300, y: 200, retargetAt: 0 });
        for (let t = 0; t < 60 * 180; t++) {
            const alive = stepSwimmer(swimmer, 1 / 60, t * 16.7, isWater, random, tuning());
            expect(alive).toBe(true);
        }
    });

    it('reports a stranded swimmer when its water is gone', () => {
        expect(stepSwimmer(makeSwimmer(), 1, 0, () => false, never, tuning())).toBe(false);
    });

    it('climbs toward its target depth', () => {
        const rising = makeSwimmer({ targetY: 20 });
        stepSwimmer(rising, 1, 0, everywhere, never, tuning({ verticalSpeed: 10 }));
        expect(rising.y).toBeCloseTo(90, 5); // moved 10px up toward the target

        const diving = makeSwimmer({ targetY: 300 });
        stepSwimmer(diving, 1, 0, everywhere, never, tuning({ verticalSpeed: 10 }));
        expect(diving.y).toBeCloseTo(110, 5);
    });

    it('picks a new depth when the current one expires', () => {
        const swimmer = makeSwimmer({ retargetAt: 0 });
        stepSwimmer(swimmer, 0.016, 1000, everywhere, () => 1, tuning({ roamRange: 200 }));
        // random()=1 aims a full range downward, and the next target is queued.
        expect(swimmer.targetY).toBeGreaterThan(100);
        expect(swimmer.retargetAt).toBeGreaterThan(1000);
    });

    it('ranges across the water rather than pacing one spot', () => {
        // Open water 2000x600. Over a few minutes a swimmer should cover a wide
        // span both across and down — the whole point of the roaming model.
        const swimmer = makeSwimmer({ retargetAt: 0, speed: 30 });
        const isWater = (x: number, y: number) => x > 0 && x < 2000 && y > 0 && y < 600;
        let seed = 1;
        const random = () => {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
        };
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let t = 0; t < 12000; t++) {
            stepSwimmer(
                swimmer,
                1 / 60,
                t * 16.7,
                isWater,
                random,
                tuning({ verticalSpeed: 18, roamRange: 320, retargetMinMs: 4000, retargetMaxMs: 11000 })
            );
            minX = Math.min(minX, swimmer.x);
            maxX = Math.max(maxX, swimmer.x);
            minY = Math.min(minY, swimmer.y);
            maxY = Math.max(maxY, swimmer.y);
        }
        expect(maxX - minX).toBeGreaterThan(800); // crosses much of the width
        expect(maxY - minY).toBeGreaterThan(250); // and works through the depth
    });

    it('abandons a depth it cannot reach instead of grinding into the bed', () => {
        const swimmer = makeSwimmer({ targetY: 500 });
        const isWater = (_x: number, y: number) => y <= 100; // floor right below
        stepSwimmer(swimmer, 1, 0, isWater, never, tuning());
        expect(swimmer.y).toBe(100);
        expect(swimmer.targetY).toBe(100); // gave up on the unreachable depth
    });
});

describe('stepOctopus', () => {
    it('crawls along and reverses at an obstacle', () => {
        const octopus: Octopus = { x: 50, y: 200, dir: 1, hue: 288, phase: 0 };
        stepOctopus(octopus, 1, everywhere, 10);
        expect(octopus.x).toBeCloseTo(60, 5);

        const blocked: Octopus = { x: 50, y: 200, dir: 1, hue: 288, phase: 0 };
        stepOctopus(blocked, 1, (x) => x <= 50, 10);
        expect(blocked.dir).toBe(-1);
        expect(blocked.x).toBe(50);
    });

    it('reports a stranded octopus', () => {
        const octopus: Octopus = { x: 50, y: 200, dir: 1, hue: 288, phase: 0 };
        expect(stepOctopus(octopus, 1, () => false, 10)).toBe(false);
    });
});

describe('clamIsOpen', () => {
    it('stays shut most of the cycle and gapes near the end', () => {
        const clam: Clam = { col: 4, y: 10, hue: 300, phase: 0 };
        const period = 1000;
        let openTicks = 0;
        for (let t = 0; t < period; t += 10) if (clamIsOpen(clam, t, period)) openTicks++;
        const openFraction = openTicks / (period / 10);
        expect(openFraction).toBeGreaterThan(0.15);
        expect(openFraction).toBeLessThan(0.4);
    });

    it('puts clams out of phase with each other', () => {
        const period = 1000;
        const a: Clam = { col: 1, y: 10, hue: 300, phase: 0 };
        const b: Clam = { col: 2, y: 10, hue: 300, phase: 500 };
        let differ = 0;
        for (let t = 0; t < period; t += 10) {
            if (clamIsOpen(a, t, period) !== clamIsOpen(b, t, period)) differ++;
        }
        expect(differ).toBeGreaterThan(0);
    });
});
