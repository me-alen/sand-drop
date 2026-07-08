// Cell colors are packed as little-endian RGBA (0xAABBGGRR) so they can be
// written straight into a Uint32Array view over ImageData pixels. 0 = empty.
// The alpha byte doubles as the material id (see constants.ts).

export const hslToPackedColor = (h: number, s: number, l: number, alpha = 0xff): number => {
    const hue = ((h % 360) + 360) % 360;
    const sat = Math.min(Math.max(s / 100, 0), 1);
    const light = Math.min(Math.max(l / 100, 0), 1);

    const chroma = (1 - Math.abs(2 * light - 1)) * sat;
    const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const offset = light - chroma / 2;

    let r = 0;
    let g = 0;
    let b = 0;
    if (hue < 60) {
        r = chroma; g = secondary;
    } else if (hue < 120) {
        r = secondary; g = chroma;
    } else if (hue < 180) {
        g = chroma; b = secondary;
    } else if (hue < 240) {
        g = secondary; b = chroma;
    } else if (hue < 300) {
        r = secondary; b = chroma;
    } else {
        r = chroma; b = secondary;
    }

    const red = Math.round((r + offset) * 255);
    const green = Math.round((g + offset) * 255);
    const blue = Math.round((b + offset) * 255);
    return (((alpha & 0xff) << 24) | (blue << 16) | (green << 8) | red) >>> 0;
};

export const packedColorToCss = (packed: number): string => {
    const red = packed & 0xff;
    const green = (packed >>> 8) & 0xff;
    const blue = (packed >>> 16) & 0xff;
    return `rgb(${red},${green},${blue})`;
};

export const materialOf = (pixel: number): number => (pixel === 0 ? 0 : pixel >>> 24);

export const withMaterial = (pixel: number, material: number): number =>
    (((pixel & 0x00ffffff) | ((material & 0xff) << 24)) >>> 0);
