import {
    BedDweller,
    clamIsOpen,
    CLAM_SPRITE_CLOSED,
    CLAM_SPRITE_OPEN,
    CRAB_SPRITE,
    Crawler,
    CreatureKind,
    FISH_SPRITE,
    HABITATS,
    habitatSuits,
    JELLYFISH_SPRITE,
    LOOKS,
    OCTOPUS_SPRITE,
    SHARK_SPRITE,
    spriteFor,
    spriteHeight,
    spriteWidth,
    SQUID_SPRITE,
    STARFISH_SPRITE,
    stepCrawler,
    stepSwimmer,
    Swimmer,
    SwimmerTuning,
    targetPopulation,
    TURTLE_SPRITE,
    WaterStats,
    WHALE_SPRITE
} from './life';

const ALL_SPRITES = [
    FISH_SPRITE,
    SQUID_SPRITE,
    SHARK_SPRITE,
    WHALE_SPRITE,
    TURTLE_SPRITE,
    JELLYFISH_SPRITE,
    STARFISH_SPRITE,
    CRAB_SPRITE,
    CLAM_SPRITE_CLOSED,
    CLAM_SPRITE_OPEN,
    OCTOPUS_SPRITE
];

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

const water = (over: Partial<WaterStats> = {}): WaterStats => ({
    cells: 20000,
    fraction: 0.6,
    maxDepthCells: 60,
    ...over
});

const never = () => 0; // random that never trips a chance roll
const everywhere = () => true;

describe('sprites', () => {
    it('are rectangular masks', () => {
        for (const sprite of ALL_SPRITES) {
            expect(sprite.length).toBeGreaterThan(0);
            for (const row of sprite) expect(row.length).toBe(spriteWidth(sprite));
            expect(spriteHeight(sprite)).toBe(sprite.length);
        }
    });

    it('use only known mask characters', () => {
        for (const sprite of ALL_SPRITES) {
            for (const row of sprite) expect(row).toMatch(/^[#eo.]+$/);
        }
    });

    it('gives every swimming species its own sprite', () => {
        const kinds = ['fish', 'squid', 'jellyfish', 'turtle', 'shark', 'whale'] as const;
        const seen = new Set(kinds.map((kind) => spriteFor(kind)));
        expect(seen.size).toBe(kinds.length);
    });

    it('scales the big animals larger than the small fry', () => {
        expect(LOOKS.whale.pixelMin).toBeGreaterThan(LOOKS.shark.pixelMin);
        expect(LOOKS.shark.pixelMin).toBeGreaterThan(LOOKS.fish.pixelMin);
    });
});

describe('habitats', () => {
    const kinds = Object.keys(HABITATS) as CreatureKind[];

    it('keeps every species out of a scene with no water', () => {
        const dry = water({ cells: 0, fraction: 0, maxDepthCells: 0 });
        for (const kind of kinds) expect(targetPopulation(HABITATS[kind], dry)).toBe(0);
    });

    it('lets only small life into a shallow puddle', () => {
        const puddle = water({ cells: 900, fraction: 0.03, maxDepthCells: 7 });
        expect(targetPopulation(HABITATS.fish, puddle)).toBeGreaterThan(0);
        expect(targetPopulation(HABITATS.clam, puddle)).toBeGreaterThan(0);
        // Nothing large belongs in a puddle.
        expect(targetPopulation(HABITATS.shark, puddle)).toBe(0);
        expect(targetPopulation(HABITATS.whale, puddle)).toBe(0);
        expect(targetPopulation(HABITATS.turtle, puddle)).toBe(0);
    });

    it('only shows a whale once most of the scene is deep water', () => {
        // Plenty of water, but not deep enough.
        expect(habitatSuits(HABITATS.whale, water({ fraction: 0.7, maxDepthCells: 20 }))).toBe(false);
        // Deep, but only a sliver of the scene.
        expect(habitatSuits(HABITATS.whale, water({ fraction: 0.2, maxDepthCells: 80 }))).toBe(false);
        // Both: a real ocean.
        expect(habitatSuits(HABITATS.whale, water({ fraction: 0.7, maxDepthCells: 80 }))).toBe(true);
    });

    it('orders species so bigger animals need more ocean', () => {
        const order: CreatureKind[] = ['fish', 'squid', 'jellyfish', 'turtle', 'shark', 'whale'];
        for (let i = 1; i < order.length; i++) {
            expect(HABITATS[order[i]].minWaterFraction).toBeGreaterThanOrEqual(
                HABITATS[order[i - 1]].minWaterFraction
            );
            expect(HABITATS[order[i]].minDepthCells).toBeGreaterThanOrEqual(
                HABITATS[order[i - 1]].minDepthCells
            );
        }
    });

    it('keeps rare animals rare and small fry plentiful in a full ocean', () => {
        const ocean = water({ cells: 40000, fraction: 0.75, maxDepthCells: 90 });
        expect(targetPopulation(HABITATS.whale, ocean)).toBe(1);
        expect(targetPopulation(HABITATS.shark, ocean)).toBeLessThanOrEqual(2);
        expect(targetPopulation(HABITATS.fish, ocean)).toBeGreaterThan(10);
    });

    it('never exceeds a species ceiling however large the ocean', () => {
        const vast = water({ cells: 10_000_000, fraction: 1, maxDepthCells: 500 });
        for (const kind of kinds) {
            expect(targetPopulation(HABITATS[kind], vast)).toBeLessThanOrEqual(HABITATS[kind].max);
        }
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
            expect(stepSwimmer(swimmer, 1 / 60, t * 16.7, isWater, random, tuning())).toBe(true);
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
        expect(swimmer.targetY).toBeGreaterThan(100);
        expect(swimmer.retargetAt).toBeGreaterThan(1000);
    });

    it('ranges across the water rather than pacing one spot', () => {
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

describe('stepCrawler', () => {
    it('walks along and reverses at an obstacle', () => {
        const crab: Crawler = { kind: 'crab', x: 50, y: 200, dir: 1, hue: 8, phase: 0 };
        stepCrawler(crab, 1, everywhere, 10);
        expect(crab.x).toBeCloseTo(60, 5);

        const blocked: Crawler = { kind: 'octopus', x: 50, y: 200, dir: 1, hue: 288, phase: 0 };
        stepCrawler(blocked, 1, (x) => x <= 50, 10);
        expect(blocked.dir).toBe(-1);
        expect(blocked.x).toBe(50);
    });

    it('reports a stranded crawler', () => {
        const crawler: Crawler = { kind: 'octopus', x: 50, y: 200, dir: 1, hue: 288, phase: 0 };
        expect(stepCrawler(crawler, 1, () => false, 10)).toBe(false);
    });
});

describe('clamIsOpen', () => {
    it('stays shut most of the cycle and gapes near the end', () => {
        const clam: BedDweller = { kind: 'clam', col: 4, y: 10, hue: 300, phase: 0 };
        const period = 1000;
        let openTicks = 0;
        for (let t = 0; t < period; t += 10) if (clamIsOpen(clam, t, period)) openTicks++;
        const openFraction = openTicks / (period / 10);
        expect(openFraction).toBeGreaterThan(0.15);
        expect(openFraction).toBeLessThan(0.4);
    });

    it('puts clams out of phase with each other', () => {
        const period = 1000;
        const a: BedDweller = { kind: 'clam', col: 1, y: 10, hue: 300, phase: 0 };
        const b: BedDweller = { kind: 'clam', col: 2, y: 10, hue: 300, phase: 500 };
        let differ = 0;
        for (let t = 0; t < period; t += 10) {
            if (clamIsOpen(a, t, period) !== clamIsOpen(b, t, period)) differ++;
        }
        expect(differ).toBeGreaterThan(0);
    });
});
