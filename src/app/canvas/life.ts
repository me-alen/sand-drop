// Aquatic life: fish, squid, clams and octopuses.
//
// These are render-layer creatures, not grid cells — they live in css pixel
// space alongside sparks and bubbles, so they swim freely without ever taking
// part in sand or water physics. Movement is pure and takes an `isWater`
// probe, which keeps it testable without a canvas.
//
// Swimmers roam: they hold a heading until something blocks them and glide
// toward a depth that is re-picked every few seconds, so given time they cover
// the whole body of water rather than pacing one small beat.
//
// Sprites are pixel masks so the creatures match the chunky look of the grid:
// '#' is body, 'e' an eye, 'o' a highlight, '.' transparent.

export type SwimmerKind = 'fish' | 'squid';

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

export type Clam = {
    col: number;
    y: number;
    hue: number;
    phase: number;
};

export type Octopus = {
    x: number;
    y: number;
    dir: 1 | -1;
    hue: number;
    phase: number;
};

// Facing right: forked tail on the left, eye at the snout.
export const FISH_SPRITE = [
    '#...####.',
    '##.######',
    '########e',
    '##.######',
    '#...####.'
];

// Facing right: blunt mantle and fins behind, tentacles trailing ahead.
export const SQUID_SPRITE = [
    '####......',
    '#######.#.',
    '########e#',
    '#######.#.',
    '####......'
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

// Head with two eyes; the tentacles below are drawn procedurally so they wave.
export const OCTOPUS_SPRITE = [
    '..#####..',
    '.#######.',
    '#e#####e#',
    '#########',
    '.#######.'
];

export const spriteWidth = (sprite: string[]): number => sprite[0].length;
export const spriteHeight = (sprite: string[]): number => sprite.length;

export const spriteFor = (kind: SwimmerKind): string[] =>
    kind === 'squid' ? SQUID_SPRITE : FISH_SPRITE;

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

// Crawls along the bed, reversing at obstacles. Same stranding rule.
export const stepOctopus = (
    octopus: Octopus,
    dt: number,
    isWater: WaterProbe,
    speed: number
): boolean => {
    if (!isWater(octopus.x, octopus.y)) return false;
    const next = octopus.x + octopus.dir * speed * dt;
    if (isWater(next, octopus.y)) octopus.x = next;
    else octopus.dir = octopus.dir === 1 ? -1 : 1;
    return true;
};

// Clams sit shut most of the time and gape briefly, out of phase with each other.
export const clamIsOpen = (clam: Clam, now: number, periodMs: number): boolean =>
    ((now + clam.phase) % periodMs) / periodMs > 0.72;
