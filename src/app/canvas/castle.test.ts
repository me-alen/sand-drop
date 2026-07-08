import { buildRandomSandCastle } from './castle';

const buildOnFlatTerrain = () => {
    const gridWidth = 120;
    const gridHeight = 140;
    const surfaceY = 120; // everything at or below this row is terrain
    const cells = new Map<string, number>();

    buildRandomSandCastle({
        gridWidth,
        gridHeight,
        isOccupied: (x, y) => y >= surfaceY || cells.has(`${x},${y}`),
        addGrain: (x, y, color) => {
            const key = `${x},${y}`;
            if (y >= surfaceY || cells.has(key)) return false;
            cells.set(key, color);
            return true;
        },
        getPureSandColor: () => 0xfeaabbcc
    });

    return { cells, gridWidth, gridHeight, surfaceY };
};

describe('buildRandomSandCastle', () => {
    it('builds a castle of reasonable size on flat terrain', () => {
        for (let attempt = 0; attempt < 5; attempt++) {
            const { cells } = buildOnFlatTerrain();
            expect(cells.size).toBeGreaterThan(50);
        }
    });

    it('keeps every grain inside the grid and above the surface', () => {
        const { cells, gridWidth, surfaceY } = buildOnFlatTerrain();
        for (const key of Array.from(cells.keys())) {
            const [x, y] = key.split(',').map(Number);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(gridWidth);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThan(surfaceY);
        }
    });

    it('uses the provided color for every grain', () => {
        const { cells } = buildOnFlatTerrain();
        for (const color of Array.from(cells.values())) {
            expect(color).toBe(0xfeaabbcc);
        }
    });
});
