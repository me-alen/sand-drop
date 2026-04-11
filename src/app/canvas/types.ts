export type GrainRecord = {
    element: HTMLDivElement;
    gridX: number;
    gridY: number;
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
