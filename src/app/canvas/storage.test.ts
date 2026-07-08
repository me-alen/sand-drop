import { decodeRle, encodeRle } from './storage';

describe('RLE grid encoding', () => {
    const roundtrip = (data: Uint32Array): Uint32Array | null =>
        decodeRle(encodeRle(data), data.length);

    it('roundtrips an empty-sky grid', () => {
        const grid = new Uint32Array(5000);
        expect(roundtrip(grid)).toEqual(grid);
    });

    it('roundtrips a uniform grid', () => {
        const grid = new Uint32Array(1000).fill(0xff123456);
        expect(roundtrip(grid)).toEqual(grid);
    });

    it('roundtrips noisy data with no runs', () => {
        const grid = new Uint32Array(2048);
        for (let i = 0; i < grid.length; i++) {
            grid[i] = (Math.floor(Math.random() * 0xffffffff) >>> 0);
        }
        expect(roundtrip(grid)).toEqual(grid);
    });

    it('roundtrips mixed runs and singles', () => {
        const grid = Uint32Array.from([1, 1, 1, 2, 3, 3, 0, 0, 0, 0, 7]);
        expect(roundtrip(grid)).toEqual(grid);
    });

    it('rejects data that decodes to the wrong length', () => {
        const grid = new Uint32Array(100).fill(5);
        const encoded = encodeRle(grid);
        expect(decodeRle(encoded, 99)).toBeNull();
        expect(decodeRle(encoded, 101)).toBeNull();
    });

    it('rejects garbage input', () => {
        expect(decodeRle('not base64 at all!!!', 10)).toBeNull();
        expect(decodeRle('QUJD', 10)).toBeNull(); // valid base64, wrong shape
    });
});
