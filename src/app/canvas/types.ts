export type GrainRecord = {
    element: HTMLDivElement;
    gridX: number;
    gridY: number;
    // False while the grain is still animating toward the cell it has claimed.
    settled: boolean;
    // Set when the grain is evicted or dropped on resize so pending animation
    // callbacks know to bail out.
    removed: boolean;
};

export type ChargePreview = {
    x: number;
    y: number;
    radiusCells: number;
};

export type ChargeStart = {
    timeMs: number;
    gridX: number;
    gridY: number;
};
