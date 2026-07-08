import { hslToPackedColor, materialOf, packedColorToCss, withMaterial } from './color';

describe('hslToPackedColor', () => {
    it('packs primary hues as little-endian RGBA', () => {
        expect(hslToPackedColor(0, 100, 50)).toBe(0xff0000ff); // red
        expect(hslToPackedColor(120, 100, 50)).toBe(0xff00ff00); // green
        expect(hslToPackedColor(240, 100, 50)).toBe(0xffff0000); // blue
    });

    it('packs black and white', () => {
        expect(hslToPackedColor(0, 0, 0)).toBe(0xff000000);
        expect(hslToPackedColor(0, 0, 100)).toBe(0xffffffff);
    });

    it('stores the material id in the alpha byte', () => {
        expect(hslToPackedColor(0, 100, 50, 0xfc) >>> 24).toBe(0xfc);
        expect(hslToPackedColor(200, 50, 50, 0xfd) >>> 24).toBe(0xfd);
    });

    it('normalizes out-of-range hues', () => {
        expect(hslToPackedColor(360, 100, 50)).toBe(hslToPackedColor(0, 100, 50));
        expect(hslToPackedColor(-120, 100, 50)).toBe(hslToPackedColor(240, 100, 50));
    });
});

describe('packedColorToCss', () => {
    it('extracts rgb channels regardless of material alpha', () => {
        expect(packedColorToCss(hslToPackedColor(0, 100, 50))).toBe('rgb(255,0,0)');
        expect(packedColorToCss(hslToPackedColor(240, 100, 50, 0xfc))).toBe('rgb(0,0,255)');
    });
});

describe('material helpers', () => {
    it('reads and rewrites the material byte', () => {
        const red = hslToPackedColor(0, 100, 50);
        expect(materialOf(red)).toBe(0xff);
        expect(materialOf(0)).toBe(0);
        const asWater = withMaterial(red, 0xfc);
        expect(materialOf(asWater)).toBe(0xfc);
        expect(packedColorToCss(asWater)).toBe('rgb(255,0,0)');
    });
});
