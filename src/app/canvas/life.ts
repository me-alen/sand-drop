// Aquatic life: swimmers, bed dwellers and crawlers.
//
// These are render-layer creatures, not grid cells — they live in css pixel
// space alongside sparks and bubbles, so they move freely without ever taking
// part in sand or water physics. Movement is pure and takes an `isWater`
// probe, which keeps it testable without a canvas.
//
// Every species declares a HABITAT: how much of the scene must be water and
// how deep it must get before it will show up at all. Small fry turn up in a
// puddle; a whale needs most of the screen flooded. Filling the ocean is what
// draws the bigger animals in.
//
// Sprites are pixel masks so the creatures match the chunky look of the grid:
// '#' is body, 'e' an eye, 'o' a highlight, '.' transparent.

export type SwimmerKind = 'fish' | 'squid' | 'jellyfish' | 'turtle' | 'shark' | 'whale';
export type BedKind = 'clam' | 'starfish';
export type CrawlerKind = 'octopus' | 'crab';
export type CreatureKind = SwimmerKind | BedKind | CrawlerKind;

export type Swimmer = {
    kind: SwimmerKind;
    x: number;
    y: number;
    dir: 1 | -1;
    speed: number;
    pixel: number;
    hue: number;
    bobPhase: number;
    targetY: number;
    retargetAt: number;
};

export type BedDweller = {
    kind: BedKind;
    col: number;
    y: number;
    hue: number;
    phase: number;
};

export type Crawler = {
    kind: CrawlerKind;
    x: number;
    y: number;
    dir: 1 | -1;
    hue: number;
    phase: number;
};

// ---------------------------------------------------------------- habitats

export type Habitat = {
    // Share of the whole scene that must be water before this species appears.
    minWaterFraction: number;
    // The deepest water column must reach at least this many cells.
    minDepthCells: number;
    // Population ceiling, and how many turn up per 10k cells of water.
    max: number;
    per10kWaterCells: number;
};

// Ordered smallest habitat to largest, which is the order they arrive in as a
// pool grows into an ocean.
export const HABITATS: Record<CreatureKind, Habitat> = {
    fish: { minWaterFraction: 0.02, minDepthCells: 6, max: 60, per10kWaterCells: 17 },
    clam: { minWaterFraction: 0.03, minDepthCells: 4, max: 14, per10kWaterCells: 5 },
    starfish: { minWaterFraction: 0.04, minDepthCells: 4, max: 10, per10kWaterCells: 4 },
    crab: { minWaterFraction: 0.05, minDepthCells: 5, max: 6, per10kWaterCells: 2 },
    squid: { minWaterFraction: 0.08, minDepthCells: 12, max: 10, per10kWaterCells: 3 },
    octopus: { minWaterFraction: 0.1, minDepthCells: 10, max: 3, per10kWaterCells: 1 },
    jellyfish: { minWaterFraction: 0.14, minDepthCells: 16, max: 8, per10kWaterCells: 2 },
    turtle: { minWaterFraction: 0.22, minDepthCells: 22, max: 3, per10kWaterCells: 1 },
    shark: { minWaterFraction: 0.35, minDepthCells: 30, max: 2, per10kWaterCells: 0.6 },
    whale: { minWaterFraction: 0.55, minDepthCells: 42, max: 1, per10kWaterCells: 0.3 }
};

// Shown in the log next to a species you have not attracted yet, so the way to
// get it is legible instead of guesswork.
export const HABITAT_HINTS: Record<CreatureKind, string> = {
    fish: 'a puddle will do',
    clam: 'any shallow bed',
    starfish: 'any shallow bed',
    crab: 'a little more water',
    squid: 'a proper pool',
    octopus: 'a proper pool',
    jellyfish: 'real depth',
    turtle: 'a wide, deep pool',
    shark: 'a third of the scene flooded',
    whale: 'over half, and deep'
};

export const CREATURE_LABELS: Record<CreatureKind, string> = {
    fish: 'Fish',
    clam: 'Clam',
    starfish: 'Starfish',
    crab: 'Crab',
    squid: 'Squid',
    octopus: 'Octopus',
    jellyfish: 'Jellyfish',
    turtle: 'Turtle',
    shark: 'Shark',
    whale: 'Whale'
};

// Ordered as they arrive while an ocean fills, which is the order worth
// showing them in.
export const CREATURE_ORDER: CreatureKind[] = [
    'fish',
    'clam',
    'starfish',
    'crab',
    'squid',
    'octopus',
    'jellyfish',
    'turtle',
    'shark',
    'whale'
];

export type WaterStats = {
    cells: number; // water cells in the grid
    fraction: number; // share of the whole grid that is water
    maxDepthCells: number; // deepest single water column
};

export const habitatSuits = (habitat: Habitat, water: WaterStats): boolean =>
    water.fraction >= habitat.minWaterFraction && water.maxDepthCells >= habitat.minDepthCells;

// How many of a species the current ocean should hold. Zero until its habitat
// is met, then scaled by volume up to the species ceiling.
export const targetPopulation = (habitat: Habitat, water: WaterStats): number => {
    if (!habitatSuits(habitat, water)) return 0;
    const byVolume = Math.floor((water.cells / 10000) * habitat.per10kWaterCells);
    return Math.max(1, Math.min(habitat.max, byVolume));
};

// ----------------------------------------------------------------- sprites

// All face right; they are mirrored when swimming the other way.
export const FISH_SPRITE = [
    '#...####.',
    '##.######',
    '########e',
    '##.######',
    '#...####.'
];

export const SQUID_SPRITE = [
    '####......',
    '#######.#.',
    '########e#',
    '#######.#.',
    '####......'
];

export const SHARK_SPRITE = [
    '......##......',
    '.....####.....',
    '#....######...',
    '##..##########',
    '##.########e##',
    '##..##########',
    '#....#####....'
];

export const WHALE_SPRITE = [
    '#....#############',
    '##..##############',
    '###############e##',
    '##################',
    '##################',
    '##..##############',
    '#....############.',
    '......####........'
];

export const TURTLE_SPRITE = [
    '...#####...',
    '..#######..',
    '.#########.',
    '.#########e',
    '.#########.',
    '..#######..',
    '#..#...#..#'
];

export const JELLYFISH_SPRITE = [
    '..#####..',
    '.#######.',
    '#########',
    '#########',
    '.#.#.#.#.',
    '.#.#.#.#.',
    '..#...#..'
];

export const STARFISH_SPRITE = [
    '....#....',
    '...###...',
    '#########',
    '.#######.',
    '..#####..',
    '..##.##..',
    '.##...##.'
];

export const CRAB_SPRITE = [
    '##.......##',
    '.##.....##.',
    '..#######..',
    '.#e#####e#.',
    '#.#.#.#.#.#'
];

export const CLAM_SPRITE_CLOSED = [
    '.###.',
    '#####',
    '#####'
];

export const CLAM_SPRITE_OPEN = [
    '.###.',
    '#####',
    '..o..',
    '#####'
];

export const OCTOPUS_SPRITE = [
    '..#####..',
    '.#######.',
    '#e#####e#',
    '#########',
    '.#######.'
];

const SWIMMER_SPRITES: Record<SwimmerKind, string[]> = {
    fish: FISH_SPRITE,
    squid: SQUID_SPRITE,
    jellyfish: JELLYFISH_SPRITE,
    turtle: TURTLE_SPRITE,
    shark: SHARK_SPRITE,
    whale: WHALE_SPRITE
};

export const spriteWidth = (sprite: string[]): number => sprite[0].length;
export const spriteHeight = (sprite: string[]): number => sprite.length;
export const spriteFor = (kind: SwimmerKind): string[] => SWIMMER_SPRITES[kind];

// ------------------------------------------------------------ species looks

export type Look = { speedMin: number; speedMax: number; pixelMin: number; pixelMax: number; hues: number[] };

export const LOOKS: Record<SwimmerKind | CrawlerKind | BedKind, Look> = {
    // Warm reef colours for the small fry, muted greys for the big hunters.
    fish: { speedMin: 16, speedMax: 42, pixelMin: 1.5, pixelMax: 3, hues: [28, 45, 5, 200, 320, 260] },
    squid: { speedMin: 11, speedMax: 24, pixelMin: 2, pixelMax: 3.2, hues: [268, 315, 190, 12] },
    jellyfish: { speedMin: 5, speedMax: 12, pixelMin: 2, pixelMax: 3, hues: [295, 320, 265] },
    turtle: { speedMin: 10, speedMax: 20, pixelMin: 2.4, pixelMax: 3.4, hues: [95, 120, 70] },
    shark: { speedMin: 26, speedMax: 46, pixelMin: 3, pixelMax: 4.2, hues: [205, 215, 220] },
    whale: { speedMin: 12, speedMax: 22, pixelMin: 4.5, pixelMax: 6, hues: [220, 228, 212] },
    octopus: { speedMin: 11, speedMax: 11, pixelMin: 3, pixelMax: 3, hues: [288, 12, 330] },
    crab: { speedMin: 14, speedMax: 22, pixelMin: 2, pixelMax: 3, hues: [8, 20, 350] },
    clam: { speedMin: 0, speedMax: 0, pixelMin: 2, pixelMax: 2, hues: [300, 30, 195] },
    starfish: { speedMin: 0, speedMax: 0, pixelMin: 2, pixelMax: 3, hues: [18, 340, 40, 280] }
};

// Sharks and whales are muted; everything else keeps reef saturation.
export const saturationFor = (kind: CreatureKind): number =>
    kind === 'shark' || kind === 'whale' ? 22 : 76;

// --------------------------------------------------------------- movement

export type WaterProbe = (x: number, y: number) => boolean;

export type SwimmerTuning = {
    turnChancePerSecond: number;
    bobSpeed: number;
    verticalSpeed: number;
    roamRange: number;
    retargetMinMs: number;
    retargetMaxMs: number;
};

// Who eats whom, and who keeps company with whom. Everything else simply
// wanders.
export const isPredator = (kind: SwimmerKind): boolean => kind === 'shark';
export const isPrey = (kind: SwimmerKind): boolean => kind === 'fish';

export type Steering = {
    /** Nearest fish for a hunter to run down, if one is close enough. */
    huntRangePx: number;
    /** How near a predator has to be before prey break and scatter. */
    fleeRangePx: number;
    /** How near two fish have to be to keep company. */
    schoolRangePx: number;
    /** Pull of a steering urge on the swimmer's chosen depth, 0..1. */
    urgency: number;
};

// Picks the depth a swimmer should be heading for, given who is nearby. Prey
// bolting away from a hunter overrides everything; otherwise a hunter closes on
// its target, and a fish drifts toward the company of its neighbours. Returns
// null when nothing nearby is worth reacting to.
export const steerTowardNeighbours = (
    swimmer: Swimmer,
    others: Swimmer[],
    steering: Steering
): { targetY: number; dir: 1 | -1 } | null => {
    let nearestPredator: Swimmer | null = null;
    let nearestPredatorDistance = Infinity;
    let nearestPrey: Swimmer | null = null;
    let nearestPreyDistance = Infinity;
    let schoolY = 0;
    let schoolX = 0;
    let schoolCount = 0;

    for (const other of others) {
        if (other === swimmer) continue;
        const dx = other.x - swimmer.x;
        const dy = other.y - swimmer.y;
        const distance = Math.hypot(dx, dy);

        if (isPrey(swimmer.kind) && isPredator(other.kind) && distance < nearestPredatorDistance) {
            nearestPredator = other;
            nearestPredatorDistance = distance;
        }
        if (isPredator(swimmer.kind) && isPrey(other.kind) && distance < nearestPreyDistance) {
            nearestPrey = other;
            nearestPreyDistance = distance;
        }
        if (isPrey(swimmer.kind) && isPrey(other.kind) && distance < steering.schoolRangePx) {
            schoolY += other.y;
            schoolX += other.x;
            schoolCount++;
        }
    }

    // Bolting beats everything else a fish might be doing.
    if (nearestPredator && nearestPredatorDistance < steering.fleeRangePx) {
        const away = swimmer.y - nearestPredator.y;
        return {
            targetY: swimmer.y + (away >= 0 ? 1 : -1) * steering.fleeRangePx,
            dir: nearestPredator.x > swimmer.x ? -1 : 1
        };
    }

    if (nearestPrey && nearestPreyDistance < steering.huntRangePx) {
        return { targetY: nearestPrey.y, dir: nearestPrey.x > swimmer.x ? 1 : -1 };
    }

    if (schoolCount > 0) {
        const meanY = schoolY / schoolCount;
        const meanX = schoolX / schoolCount;
        return {
            targetY: swimmer.y + (meanY - swimmer.y) * steering.urgency,
            dir: meanX > swimmer.x ? 1 : -1
        };
    }
    return null;
};

// Advances one swimmer. Returns false when it is stranded (its water drained)
// and should be removed.
export const stepSwimmer = (
    swimmer: Swimmer,
    dt: number,
    now: number,
    isWater: WaterProbe,
    random: () => number,
    tuning: SwimmerTuning
): boolean => {
    if (!isWater(swimmer.x, swimmer.y)) return false;

    // Pick a fresh depth on arrival, or once the current one times out. Aiming
    // relative to where it is now lets a swimmer work its way anywhere the
    // water reaches instead of orbiting its spawn point; retargeting on arrival
    // (rather than on a timer alone) is what lets each leg actually complete,
    // so it travels instead of jittering in place.
    const arrived = Math.abs(swimmer.targetY - swimmer.y) < 4;
    if (arrived || now >= swimmer.retargetAt) {
        swimmer.targetY = swimmer.y + (random() * 2 - 1) * tuning.roamRange;
        swimmer.retargetAt =
            now + tuning.retargetMinMs + random() * (tuning.retargetMaxMs - tuning.retargetMinMs);
    }

    // Horizontal. The destination itself must be water — testing only a point
    // further ahead would let a swimmer step straight onto a kelp stalk while
    // the open water beyond it read as clear, stranding it next tick. The
    // longer probe is used purely to turn early, after a legal move.
    const stepX = swimmer.dir * swimmer.speed * dt;
    const nextX = swimmer.x + stepX;
    if (isWater(nextX, swimmer.y)) {
        swimmer.x = nextX;
        const lookAhead = nextX + swimmer.dir * swimmer.pixel * 4;
        if (!isWater(lookAhead, swimmer.y)) swimmer.dir = swimmer.dir === 1 ? -1 : 1;
    } else {
        swimmer.dir = swimmer.dir === 1 ? -1 : 1;
    }

    // Vertical: glide toward the target depth, plus a little idle bob.
    const toTarget = swimmer.targetY - swimmer.y;
    const climb = Math.max(
        -tuning.verticalSpeed * dt,
        Math.min(tuning.verticalSpeed * dt, toTarget)
    );
    const bob = Math.sin(now * 0.002 + swimmer.bobPhase) * tuning.bobSpeed * dt;
    const stepY = climb + bob;
    // Blocked vertically (bed below, surface above) — give up on this depth and
    // choose another next tick rather than grinding against it.
    if (isWater(swimmer.x, swimmer.y + stepY)) swimmer.y += stepY;
    else swimmer.targetY = swimmer.y;

    if (random() < tuning.turnChancePerSecond * dt) swimmer.dir = swimmer.dir === 1 ? -1 : 1;
    return true;
};

// Walks the bed, reversing at obstacles. Same stranding rule.
export const stepCrawler = (
    crawler: Crawler,
    dt: number,
    isWater: WaterProbe,
    speed: number
): boolean => {
    if (!isWater(crawler.x, crawler.y)) return false;
    const next = crawler.x + crawler.dir * speed * dt;
    if (isWater(next, crawler.y)) crawler.x = next;
    else crawler.dir = crawler.dir === 1 ? -1 : 1;
    return true;
};

// Clams sit shut most of the time and gape briefly, out of phase with each other.
export const clamIsOpen = (clam: BedDweller, now: number, periodMs: number): boolean =>
    ((now + clam.phase) % periodMs) / periodMs > 0.72;
