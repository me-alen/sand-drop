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

export const INITIAL_SAND_HEIGHT_RATIO = 0.04;
export const INITIAL_SAND_BASE_HUE = 40;

// Hue advances once per pour burst (not per grain), so grains poured close
// together stay chromatically close even if they shuffle while settling.
export const DROP_SAND_HUE_STEP = 2;
export const DROP_SAND_SATURATION = 100;
export const DROP_SAND_LIGHTNESS = 55;
export const PURE_SAND_SATURATION = 58;
export const PURE_SAND_LIGHTNESS = 66;

// Materials are stored in the alpha byte of each packed grid pixel. All values
// sit close to 0xff so occupied cells stay visually opaque; 0 = empty cell.
export const MATERIAL_SAND = 0xff;
export const MATERIAL_PACKED_SAND = 0xfe;
export const MATERIAL_STONE = 0xfd;
export const MATERIAL_WATER = 0xfc;

export const WATER_HUE = 205;
export const WATER_SATURATION = 82;
export const WATER_LIGHTNESS = 52;
export const WATER_TERMINAL_FALL_CELLS_PER_S = 40;
export const WATER_FLOW_HOPS_PER_TICK = 8;
export const WATER_MAX_FLOW_HOPS = 400;
// How far along the pool surface a grain searches for a spot to drop into.
export const WATER_LEVEL_SCAN_RANGE = 64;

export const STONE_HUE = 222;
export const STONE_SATURATION = 8;
export const STONE_LIGHTNESS = 42;
export const STONE_BRUSH_RADIUS_CELLS = 1.6;
export const ERASE_BRUSH_RADIUS_CELLS = 3.2;

// A column of loose sand topples when it stands this many cells above a
// neighbouring column's surface.
export const TOPPLE_HEIGHT_DIFF_CELLS = 2;

// Fraction of vertical gravity applied sideways at full device tilt.
export const TILT_MAX_GRAVITY_RATIO = 0.55;
