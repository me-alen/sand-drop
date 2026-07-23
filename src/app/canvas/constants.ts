export const SQUARE_SIZE = 5;

export const MAX_GRAINS_PER_DROP = 10;
export const DEFAULT_GRAINS_PER_DROP = 2;
export const SPAWN_INTERVAL_MS = 30;
export const MAX_ACTIVE_PARTICLES = 5000;

export const GRAVITY_CELLS_PER_S2 = 170;
export const MAX_FALL_SPEED_CELLS_PER_S = 110;

export const MIN_EXPLOSION_RADIUS_CELLS = 3;
export const MAX_EXPLOSION_RADIUS_CELLS = 16;
export const EXPLOSION_FULL_CHARGE_MS = 1200;
// Stone shrugs off a small bang, but a heavy charge fractures it. Only the
// inner part of a big blast breaks rock, so the crater is a bite out of the
// mass rather than the whole radius — and whatever is left overhanging then
// has to hold itself up, which is where the falling comes in.
export const STONE_FRACTURE_MIN_RADIUS_CELLS = 9;
export const STONE_FRACTURE_RADIUS_RATIO = 0.55;

export const INITIAL_SAND_HEIGHT_RATIO = 0.04;
export const INITIAL_SAND_BASE_HUE = 40;

export const PURE_SAND_SATURATION = 58;
export const PURE_SAND_LIGHTNESS = 66;

// Materials are stored in the alpha byte of each packed grid pixel. All values
// sit close to 0xff so occupied cells stay visually opaque; 0 = empty cell.
export const MATERIAL_SAND = 0xff;
export const MATERIAL_PACKED_SAND = 0xfe;
export const MATERIAL_STONE = 0xfd;
export const MATERIAL_WATER = 0xfc;
export const MATERIAL_KELP = 0xfb;
export const MATERIAL_CORAL = 0xfa;
export const MATERIAL_LAVA = 0xf9;

export const WATER_HUE = 205;
export const WATER_SATURATION = 82;
export const WATER_LIGHTNESS = 52;
export const WATER_FLOW_HOPS_PER_TICK = 8;
export const WATER_MAX_FLOW_HOPS = 400;
// How far along the pool surface a grain searches for a spot to drop into.
export const WATER_LEVEL_SCAN_RANGE = 64;

// Lava is a liquid, but a thick one: it creeps where water rushes. Solids rest
// on it rather than sinking, which keeps it out of the displacement paths.
export const LAVA_HUE = 20;
export const LAVA_SATURATION = 100;
export const LAVA_LIGHTNESS_MIN = 48;
export const LAVA_LIGHTNESS_MAX = 62;
export const LAVA_TERMINAL_FALL_CELLS_PER_S = 20;
export const LAVA_FLOW_HOPS_PER_TICK = 2;
// A thick flow does not sheet across the world looking for the lowest point
// the way water does; it stalls and piles up near where it lands. Without this
// cap lava ran the whole width of the scene before settling, so it never sat
// on sand long enough to leave a glassy crust.
export const LAVA_MAX_FLOW_HOPS = 26;
// Meeting water chills lava into fresh stone and boils the water off.
export const LAVA_QUENCH_SPARKS = 5;

// ------------------------------------------------------------------- heat
// Lava carries heat in a field alongside the grid, and everything thermal
// follows from it: rock does not switch to stone the instant it touches water,
// it loses heat until there is none left. Heat also conducts on through sand
// and the glass it has already made, so a flow bakes its way downward one
// layer at a time instead of vitrifying a single skin.
export const HEAT_TICK_MS = 90;
export const LAVA_HEAT_MAX = 255;
// Losses per tick. Lava buried in more lava barely cools; open air draws it
// off steadily; water rips it away.
export const LAVA_COOL_PER_TICK = 1;
export const LAVA_COOL_PER_AIR_NEIGHBOUR = 3;
export const LAVA_COOL_PER_WATER_NEIGHBOUR = 70;
export const WATER_BOIL_CHANCE_PER_TICK = 0.5;
// Heat given up crossing one cell. With the threshold below this is what
// decides how many layers of glass a flow can bake before it runs out.
export const HEAT_CONDUCTION_LOSS = 42;
export const HEAT_AMBIENT_COOL = 7;
export const SAND_TO_GLASS_HEAT = 70;
// Freshly cooled lava is near-black basalt, much darker than the grey outcrop,
// so a flow leaves a visible scar rather than blending in.
export const COOLED_LAVA_HUE = 18;
export const COOLED_LAVA_SATURATION = 16;
export const COOLED_LAVA_LIGHTNESS_MIN = 17;
export const COOLED_LAVA_LIGHTNESS_MAX = 27;

// Sand touched by lava vitrifies: a pale, glassy crust down the edge of a flow.
export const MATERIAL_GLASS = 0xf8;
export const GLASS_HUE = 186;
export const GLASS_SATURATION = 38;
export const GLASS_LIGHTNESS_MIN = 70;
export const GLASS_LIGHTNESS_MAX = 84;

export const STONE_HUE = 222;
export const STONE_SATURATION = 8;
export const STONE_LIGHTNESS = 42;
export const STONE_BRUSH_RADIUS_CELLS = 1.6;

// Stone falls as a rigid mass rather than as grains, so it accelerates like
// anything heavy but is capped lower than loose sand — a slab reads as
// ponderous, not skittish.
export const STONE_FALL_ACCEL_CELLS_PER_S2 = 150;
export const STONE_MAX_FALL_CELLS_PER_S = 70;
// Sand can also leave from under a slab via routes too hot to instrument
// (relaxation, toppling, a landing grain's roll), so as well as the explicit
// triggers the whole grid is re-examined every so many steps.
export const STONE_RESCAN_EVERY_STEPS = 10;
// Dust thrown up where a landing slab meets the ground, capped like the flora
// death sparks so a wide slab cannot flood the effect list.
export const STONE_LANDING_SPARKS_MAX = 10;
export const STONE_LANDING_SHAKE_MAX = 7;
// A mass balances only while its centre sits over its footing. Land one on a
// pinnacle and it tips off instead of standing on a single pixel; this caps
// how far it may work its way sideways before it has to settle regardless.
export const STONE_MAX_TIPS_PER_LANDING = 24;
// Draw a closed ring of stone and the pocket inside it turns solid. Capped so
// a shape that quietly encircles half the scene cannot petrify all of it.
export const STONE_MAX_ENCLOSED_FILL_CELLS = 6000;
export const ERASE_BRUSH_RADIUS_CELLS = 3.2;

// A column of loose sand topples once it stands more than this many cells
// above a neighbouring column, so this sets the angle of repose. At 1 a pile
// holds a ~45° face; at 2 it held ~63°, which piled pours into unnaturally
// sharp spikes.
export const TOPPLE_HEIGHT_DIFF_CELLS = 1;
// How far either side of a change the relaxation pass is woken up. Too narrow
// and a freshly formed step falls outside the window and never settles.
export const DIRTY_MARGIN_COLS = 2;
// Relaxation only visits dirty columns, so a step that forms outside that
// window would stay frozen for good. Re-examining a rotating slice of the grid
// each step guarantees every column eventually settles. A full pass takes
// well under a second and costs a handful of column scans per frame.
export const SETTLE_SWEEP_COLUMNS_PER_STEP = 6;
// Grains a single over-steep column may shed in one relaxation pass. One per
// pass loses the race against a steady pour, so the pile climbs into a spike
// while sand is still falling; letting it avalanche keeps the slope honest.
export const MAX_TOPPLE_SLIDES_PER_PASS = 6;
// Columns a landing grain may roll down before it comes to rest. Applying the
// angle of repose as sand lands is what stops a pour building a spire in the
// first place; the relax pass alone cannot demolish one fast enough.
export const MAX_SETTLE_ROLLS = 8;

// Water slows a sinking grain, but it still drops straight and simply settles
// on the bed. No drift or flourish — the pour should look calm, not animated.
export const SAND_IN_WATER_FALL_CELLS_PER_S = 40;

// Fraction of vertical gravity applied sideways at full device tilt.
export const TILT_MAX_GRAVITY_RATIO = 0.55;

// ---------------------------------------------------------------- day/night
// A full in-game day (midnight -> sunrise -> noon -> sunset -> midnight)
// passes in this many real milliseconds. 5 minutes = one day.
export const DAY_CYCLE_MS = 5 * 60_000;
// Phase runs 0..1: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
// Boot just before dawn so first-time viewers catch a sunrise quickly.
export const DAY_START_PHASE = 0.22;

// -------------------------------------------------------------- flora / reef
// Life grows automatically in pooled water. Heights are capped as a fraction
// of the local water depth so nothing ever pierces the surface.
export const FLORA_TICK_MS = 200;
export const FLORA_COLUMNS_PER_TICK = 16; // rotating sweep across the grid
export const FLORA_MIN_WATER_DEPTH_CELLS = 6;
// Each stalk gets its own target height between these two fractions of the
// local depth, so a bed of kelp has a ragged, natural silhouette instead of
// every stalk topping out at the same line.
export const KELP_MIN_DEPTH_FRACTION = 0.1;
export const KELP_MAX_DEPTH_FRACTION = 0.8;
export const CORAL_MAX_DEPTH_FRACTION = 0.25;
// Fraction of patches that host a reef, in contiguous bands of roughly this
// width. Shape gaps (below) thin it further, so coral ends up occupying about
// a quarter of the floor as scattered clumps rather than a carpet.
export const CORAL_PATCH_CHANCE = 0.34;
export const CORAL_PATCH_WIDTH = 8;
// Kelp claims this fraction of the whole bed. The rest is bare sand and rock,
// which is what makes it read as a seabed rather than a lawn.
export const KELP_FLOOR_COVERAGE = 0.4;

// Per-patch coral silhouettes, as a fraction of the coral height cap for each
// column of the patch. Zeroes are deliberate gaps: they separate a clump into
// distinct pillars so it reads as coral structure, not a mound of coloured
// sand. Shape is picked per patch.
export const CORAL_SHAPES: number[][] = [
    // cactus: two arms, a gap, a tall twin trunk, a gap, two arms
    [0.5, 0.5, 0, 1, 1, 0, 0.5, 0.5],
    // fingers: uneven staghorn spikes
    [0, 0.75, 0.75, 0, 1, 0, 0.6, 0],
    // fan: a slotted sweep that rises toward the middle
    [0.3, 0, 0.65, 1, 1, 0.65, 0, 0.3]
];
// The growing tip always stays at least this many cells below the surface.
export const FLORA_SURFACE_HEADROOM_CELLS = 2;
export const KELP_SEED_CHANCE = 0.02;
export const CORAL_SEED_CHANCE = 0.012;
// Coral seeds far more readily next to existing coral, forming clumps.
export const CORAL_CLUSTER_SEED_MULTIPLIER = 3;
export const KELP_GROW_CHANCE = 0.35;
export const CORAL_GROW_CHANCE = 0.25;
// Chance a coral grow event branches sideways instead of straight up.
export const CORAL_BRANCH_CHANCE = 0.5;
export const KELP_HUE_MIN = 118;
export const KELP_HUE_MAX = 150;
export const KELP_SATURATION = 55;
export const KELP_LIGHTNESS_MIN = 26;
export const KELP_LIGHTNESS_MAX = 40;
// A vibrant reef palette. Each column picks one hue and keeps it, so clumps
// read as distinct colours rather than confetti. Greens are deliberately
// absent so coral never reads as kelp.
export const CORAL_HUES = [335, 350, 12, 30, 48, 190, 210, 280, 315];
export const CORAL_SATURATION = 92;
export const CORAL_LIGHTNESS_MIN = 55;
export const CORAL_LIGHTNESS_MAX = 64;

// ----------------------------------------------------------------- seabed
// One big rock outcrop per session, rooted all the way to the bottom of the
// grid so it reads as bedrock pushing up through the sand rather than a
// boulder resting on top of it. It is stone, so it holds its shape and flora
// roots on it just like the sand bed.
export const ROCK_MIN_HALF_WIDTH_CELLS = 9;
export const ROCK_MAX_HALF_WIDTH_CELLS = 27;
// Peak height above the sand surface, as a fraction of the grid height.
export const ROCK_MIN_PEAK_RATIO = 0.1;
export const ROCK_MAX_PEAK_RATIO = 0.3;
// How far the silhouette wanders from the ideal profile, in cells.
export const ROCK_EDGE_ROUGHNESS_CELLS = 2;
export const ROCK_HUE_MIN = 196;
export const ROCK_HUE_MAX = 232;
export const ROCK_SATURATION = 13;
export const ROCK_LIGHTNESS_MIN = 26;
export const ROCK_LIGHTNESS_MAX = 46;

// ------------------------------------------------------------ aquatic life
// Fish, sharks, whales, crabs and the rest are render-layer creatures like
// bubbles, not grid cells, so they move freely without disturbing sand or
// water physics. Which species appear, how many, and what they look like all
// live in the HABITATS and LOOKS tables in life.ts — a species only shows up
// once the ocean is big and deep enough for it.
//
// These govern how every swimmer moves, whatever species it is.
export const SWIMMER_TURN_CHANCE_PER_S = 0.05;
export const SWIMMER_BOB_PX_PER_S = 7;
// Swimmers pick a new depth every few seconds and glide to it, so over time
// they range across the whole water column rather than holding one line.
export const SWIMMER_VERTICAL_SPEED_PX_PER_S = 18;
export const SWIMMER_ROAM_RANGE_PX = 320;
// Only a fallback for depths that turn out to be unreachable — normally a
// swimmer re-aims the moment it arrives.
export const SWIMMER_RETARGET_MIN_MS = 4000;
export const SWIMMER_RETARGET_MAX_MS = 11000;

export const CLAM_OPEN_PERIOD_MS = 5200;

// Sharks run down fish, fish scatter from sharks, and fish keep company with
// each other. Steering only re-aims a swimmer's chosen depth and heading; the
// wandering underneath it is unchanged.
export const SWIMMER_HUNT_RANGE_PX = 190;
export const SWIMMER_FLEE_RANGE_PX = 120;
export const SWIMMER_SCHOOL_RANGE_PX = 90;
export const SWIMMER_SCHOOL_URGENCY = 0.5;
// How often the school re-reads its neighbours. Every frame is wasted work for
// motion this slow.
export const SWIMMER_STEER_EVERY_STEPS = 6;

// Bubbles rising off the reef are a render effect, not grid cells.
export const MAX_BUBBLES = 120;
export const BUBBLE_RISE_PX_PER_S = 55;
export const BUBBLE_SPAWN_CHANCE = 0.06;
