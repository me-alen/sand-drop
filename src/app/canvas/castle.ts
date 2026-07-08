type CastleBuildContext = {
    gridWidth: number;
    gridHeight: number;
    isOccupied: (gridX: number, gridY: number) => boolean;
    addGrain: (gridX: number, gridY: number, color: number) => boolean;
    getPureSandColor: () => number;
};

export const buildRandomSandCastle = ({
    gridWidth,
    gridHeight,
    isOccupied,
    addGrain,
    getPureSandColor
}: CastleBuildContext): void => {
    const castleType = Math.floor(Math.random() * 3);
    const castleWidth =
        castleType === 1
            ? 20 + Math.floor(Math.random() * 10)
            : 16 + Math.floor(Math.random() * 8);
    const startX = 1 + Math.floor(Math.random() * Math.max(1, gridWidth - castleWidth - 2));
    const endX = startX + castleWidth - 1;
    const wallHeight = 6 + Math.floor(Math.random() * 4);
    const towerHeight = wallHeight + 3 + Math.floor(Math.random() * 2);
    const gateWidth = Math.max(2, Math.floor(castleWidth * (castleType === 2 ? 0.24 : 0.2)));
    const gateStartX = startX + Math.floor((castleWidth - gateWidth) / 2);
    const centerLocal = Math.floor(castleWidth / 2);
    const surfaceByX: number[] = [];

    for (let x = startX; x <= endX; x++) {
        let surfaceY = gridHeight;
        for (let y = 0; y < gridHeight; y++) {
            if (isOccupied(x, y)) {
                surfaceY = y;
                break;
            }
        }
        surfaceByX.push(surfaceY);
    }

    const minSurfaceY = Math.min(...surfaceByX);
    const baseY = minSurfaceY - 1;
    if (baseY < towerHeight + 3) return;

    for (let x = startX; x <= endX; x++) {
        const localIndex = x - startX;
        const isEdgeTowerColumn = localIndex < 3 || localIndex >= castleWidth - 3;
        const distFromCenter = Math.abs(localIndex - centerLocal);
        const leftKeepCenter = Math.floor(castleWidth * 0.25);
        const rightKeepCenter = Math.floor(castleWidth * 0.75);
        const inLeftKeep = Math.abs(localIndex - leftKeepCenter) <= 1;
        const inRightKeep = Math.abs(localIndex - rightKeepCenter) <= 1;

        let columnHeight = wallHeight;
        if (castleType === 0) {
            columnHeight = isEdgeTowerColumn ? towerHeight : wallHeight;
        } else if (castleType === 1) {
            const slopeHeight = wallHeight + 5 - Math.floor(distFromCenter / 2);
            columnHeight = Math.max(3, slopeHeight);
            if (isEdgeTowerColumn) {
                columnHeight = Math.max(columnHeight, wallHeight + 2);
            }
        } else {
            columnHeight = wallHeight - 1;
            if (inLeftKeep || inRightKeep) {
                columnHeight = towerHeight + 2;
            } else if (distFromCenter <= 2) {
                columnHeight = wallHeight + 1;
            }
        }

        const thisSurfaceY = surfaceByX[localIndex];
        const color = getPureSandColor();

        for (let y = baseY + 1; y < thisSurfaceY; y++) {
            addGrain(x, y, color);
        }

        for (let h = 0; h < columnHeight; h++) {
            const y = baseY - h;
            const gateDepth =
                castleType === 1
                    ? Math.floor(columnHeight * 0.55)
                    : Math.floor(wallHeight * (castleType === 2 ? 0.65 : 0.6));
            const inGate = x >= gateStartX && x < gateStartX + gateWidth && h < gateDepth;
            if (inGate) continue;
            addGrain(x, y, color);
        }

        const shouldAddCrenellation =
            castleType === 1
                ? localIndex % 3 === 0
                : localIndex % 2 === 0;
        if (shouldAddCrenellation && (x < gateStartX || x >= gateStartX + gateWidth)) {
            addGrain(x, baseY - columnHeight, color);
        }
    }
};
