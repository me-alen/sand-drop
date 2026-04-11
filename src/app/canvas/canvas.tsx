import React from 'react';

type GrainRecord = {
    element: HTMLDivElement;
    gridX: number;
    gridY: number;
};

type ChargePreview = {
    x: number;
    y: number;
    radiusCells: number;
};

const Canvas = (): React.JSX.Element => {
    const gridRef = React.useRef<HTMLDivElement>(null);
    const [isMouseDown, setIsMouseDown] = React.useState(false);
    const [hasStartedDropping, setHasStartedDropping] = React.useState(false);
    const [grainsPerDrop, setGrainsPerDrop] = React.useState(1);
    const [chargePreview, setChargePreview] = React.useState<ChargePreview | null>(null);
    const [useColoredDrops, setUseColoredDrops] = React.useState(true);
    const hueRef = React.useRef(Math.random() * 360);
    const lastSpawnTimeRef = React.useRef(0);
    const chargeStartRef = React.useRef<{ timeMs: number; gridX: number; gridY: number } | null>(null);
    const chargeAnimationFrameRef = React.useRef<number | null>(null);
    const hasSeededInitialSandRef = React.useRef(false);
    const globalSettleTimeoutRef = React.useRef<number | null>(null);
    const activeGrainsRef = React.useRef<GrainRecord[]>([]);
    const grainsByCellRef = React.useRef<Map<string, GrainRecord>>(new Map());
    const MAX_GRAINS_PER_DROP = 10;
    const MAX_TOTAL_GRAINS = 40000;
    const SPAWN_INTERVAL_MS = 25;
    const EXPLOSION_RADIUS_CELLS = 8;
    const MIN_EXPLOSION_RADIUS_CELLS = 3;
    const MAX_EXPLOSION_RADIUS_CELLS = 14;
    const EXPLOSION_FULL_CHARGE_MS = 1200;
    const EXPLOSION_DURATION_MS = 450;
    const SQUARE_SIZE = 5;
    const INITIAL_SAND_HEIGHT_RATIO = 0.03;
    const INITIAL_SAND_BASE_HUE = 40;
    const DROP_SAND_HUE_STEP = 0.35;
    const DROP_SAND_SATURATION = 100;
    const DROP_SAND_LIGHTNESS = 52;
    const PURE_SAND_SATURATION = 58;
    const PURE_SAND_LIGHTNESS = 66;
    const GRID_HEIGHT = Math.floor(window.innerHeight / SQUARE_SIZE);
    const GRID_WIDTH = Math.floor(window.innerWidth / SQUARE_SIZE);

    // Track occupied positions
    const occupiedPositions = React.useRef<boolean[][]>(
        Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(false))
    );

    const getCellKey = (gridX: number, gridY: number): string => `${gridX},${gridY}`;
    const addGrainRecord = React.useCallback((grainRecord: GrainRecord) => {
        occupiedPositions.current[grainRecord.gridY][grainRecord.gridX] = true;
        activeGrainsRef.current.push(grainRecord);
        grainsByCellRef.current.set(getCellKey(grainRecord.gridX, grainRecord.gridY), grainRecord);

        if (activeGrainsRef.current.length > MAX_TOTAL_GRAINS) {
            const removedGrain = activeGrainsRef.current.shift();
            if (removedGrain) {
                occupiedPositions.current[removedGrain.gridY][removedGrain.gridX] = false;
                grainsByCellRef.current.delete(getCellKey(removedGrain.gridX, removedGrain.gridY));
                if (removedGrain.element.parentElement) {
                    removedGrain.element.remove();
                }
            }
        }
    }, [MAX_TOTAL_GRAINS]);

    const getExplosionRadiusForHold = (heldMs: number): number => {
        const normalized = Math.max(0, Math.min(heldMs / EXPLOSION_FULL_CHARGE_MS, 1));
        return Math.round(
            MIN_EXPLOSION_RADIUS_CELLS +
                normalized * (MAX_EXPLOSION_RADIUS_CELLS - MIN_EXPLOSION_RADIUS_CELLS)
        );
    };

    const getClampedGridPosition = (x: number, y: number): { clampedX: number; clampedY: number; gridX: number; gridY: number } => {
        const clampedX = Math.max(0, Math.min(x, (GRID_WIDTH - 1) * SQUARE_SIZE));
        const clampedY = Math.max(0, Math.min(y, (GRID_HEIGHT - 1) * SQUARE_SIZE));
        const gridX = Math.floor(clampedX / SQUARE_SIZE);
        const gridY = Math.floor(clampedY / SQUARE_SIZE);
        return { clampedX, clampedY, gridX, gridY };
    };

    const findRestingPosition = (startX: number, startY: number): [number, number, number] => {
        const clampedStartX = Math.max(0, Math.min(startX, (GRID_WIDTH - 1) * SQUARE_SIZE));
        const clampedStartY = Math.max(0, Math.min(startY, (GRID_HEIGHT - 1) * SQUARE_SIZE));
        let gridX = Math.floor(clampedStartX / SQUARE_SIZE);
        let gridY = Math.floor(clampedStartY / SQUARE_SIZE);
        const startGridX = gridX;

        // Phase 1: straight vertical fall in the original column.
        while (gridY < GRID_HEIGHT - 1 && !occupiedPositions.current[gridY + 1][startGridX]) {
            gridY++;
        }
        const verticalStopY = gridY;

        // Phase 2: settle with roll/slides after hitting a blocker.
        while (gridY < GRID_HEIGHT - 1) {
            const belowOccupied = occupiedPositions.current[gridY + 1][gridX];

            // Keep falling straight down while possible.
            if (!belowOccupied) {
                gridY++;
                continue;
            }

            // Only try to roll when directly blocked below.
            const leftEmpty = gridX > 0 && !occupiedPositions.current[gridY + 1][gridX - 1];
            const rightEmpty = gridX < GRID_WIDTH - 1 && !occupiedPositions.current[gridY + 1][gridX + 1];

            if (leftEmpty && rightEmpty) {
                gridX += Math.random() < 0.5 ? -1 : 1;
                gridY++;
            } else if (leftEmpty) {
                gridX--;
                gridY++;
            } else if (rightEmpty) {
                gridX++;
                gridY++;
            } else {
                break;
            }
        }

        return [verticalStopY * SQUARE_SIZE, gridX * SQUARE_SIZE, gridY * SQUARE_SIZE];
    };

    const createSandGrain = (x: number, y: number) => {
        const grid = gridRef.current;
        if (!grid) return;
        const { clampedX, clampedY, gridX: startGridX, gridY: startGridY } = getClampedGridPosition(x, y);

        // Ignore drops that start on an already occupied cell.
        if (occupiedPositions.current[startGridY][startGridX]) {
            return;
        }

        const sandGrain = document.createElement('div');
        sandGrain.style.position = 'absolute';
        sandGrain.style.left = `${startGridX * SQUARE_SIZE}px`;
        sandGrain.style.top = `${startGridY * SQUARE_SIZE}px`;
        sandGrain.style.width = `${SQUARE_SIZE}px`;
        sandGrain.style.height = `${SQUARE_SIZE}px`;
        const dropHue = useColoredDrops ? hueRef.current : INITIAL_SAND_BASE_HUE + (Math.random() * 10 - 5);
        const dropSaturation = useColoredDrops ? DROP_SAND_SATURATION : PURE_SAND_SATURATION;
        const dropLightness = useColoredDrops ? DROP_SAND_LIGHTNESS : PURE_SAND_LIGHTNESS;
        sandGrain.style.backgroundColor = `hsl(${dropHue}, ${dropSaturation}%, ${dropLightness}%)`;
        sandGrain.style.transition = 'top 0.8s linear';
        grid.appendChild(sandGrain);
        if (useColoredDrops) {
            hueRef.current = (hueRef.current + DROP_SAND_HUE_STEP) % 360;
        }

        const [verticalY, finalX, finalY] = findRestingPosition(clampedX, clampedY);
        const finalGridX = Math.floor(finalX / SQUARE_SIZE);
        const finalGridY = Math.floor(finalY / SQUARE_SIZE);
        const startX = startGridX * SQUARE_SIZE;
        const needsSlidePhase = finalX !== startX || finalY !== verticalY;
        const grainRecord: GrainRecord = {
            element: sandGrain,
            gridX: finalGridX,
            gridY: finalGridY
        };
        addGrainRecord(grainRecord);

        requestAnimationFrame(() => {
            sandGrain.style.top = `${verticalY}px`;

            if (!needsSlidePhase) {
                return;
            }

            window.setTimeout(() => {
                sandGrain.style.transition = 'left 0.2s linear, top 0.2s linear';
                sandGrain.style.left = `${finalX}px`;
                sandGrain.style.top = `${finalY}px`;
            }, 800);
        });
    };

    const settleExplodedGrain = (grain: GrainRecord, startX: number, startY: number, incomingVelocityY = 0) => {
        const { clampedX, clampedY } = getClampedGridPosition(startX, startY);
        const [verticalY, finalX, finalY] = findRestingPosition(clampedX, clampedY);
        const finalGridX = Math.floor(finalX / SQUARE_SIZE);
        const finalGridY = Math.floor(finalY / SQUARE_SIZE);
        const startGridX = Math.floor(clampedX / SQUARE_SIZE);
        const startGridY = Math.floor(clampedY / SQUARE_SIZE);
        const startSnapX = startGridX * SQUARE_SIZE;
        const startSnapY = startGridY * SQUARE_SIZE;
        const needsSlidePhase = finalX !== startSnapX || finalY !== verticalY;
        const verticalDistance = Math.max(0, verticalY - startSnapY);
        const baseFallSpeedPxPerMs = 0.35;
        const effectiveFallSpeedPxPerMs = Math.max(baseFallSpeedPxPerMs, incomingVelocityY);
        const verticalDurationMs = Math.min(650, Math.max(140, verticalDistance / effectiveFallSpeedPxPerMs));

        // Reserve destination early so multiple settling grains don't collide.
        occupiedPositions.current[finalGridY][finalGridX] = true;
        grainsByCellRef.current.set(getCellKey(finalGridX, finalGridY), grain);
        grain.gridX = finalGridX;
        grain.gridY = finalGridY;

        grain.element.style.transform = 'none';
        grain.element.style.opacity = '1';
        grain.element.style.left = `${startSnapX}px`;
        grain.element.style.top = `${startSnapY}px`;
        grain.element.style.transition = `top ${verticalDurationMs}ms linear`;

        requestAnimationFrame(() => {
            grain.element.style.top = `${verticalY}px`;

            if (!needsSlidePhase) {
                return;
            }

            window.setTimeout(() => {
                grain.element.style.transition = 'left 0.2s linear, top 0.2s linear';
                grain.element.style.left = `${finalX}px`;
                grain.element.style.top = `${finalY}px`;
            }, verticalDurationMs);
        });

        // Debounced global sweep catches late unsupported grains.
        const totalSettleTime = verticalDurationMs + (needsSlidePhase ? 220 : 0);
        if (globalSettleTimeoutRef.current !== null) {
            window.clearTimeout(globalSettleTimeoutRef.current);
        }
        globalSettleTimeoutRef.current = window.setTimeout(() => {
            globalSettleTimeoutRef.current = null;
            triggerCascadeSettle(0, GRID_WIDTH - 1);
        }, totalSettleTime);
    };

    const settleUnsupportedGrainsInColumns = (minGridX: number, maxGridX: number): number => {
        const startX = Math.max(0, minGridX);
        const endX = Math.min(GRID_WIDTH - 1, maxGridX);
        let movedCount = 0;

        for (let gridX = startX; gridX <= endX; gridX++) {
            // Bottom-up so lower grains settle first and reserve cells.
            for (let gridY = GRID_HEIGHT - 2; gridY >= 0; gridY--) {
                if (!occupiedPositions.current[gridY][gridX]) continue;
                if (occupiedPositions.current[gridY + 1][gridX]) continue;

                const grain = grainsByCellRef.current.get(getCellKey(gridX, gridY));
                if (!grain) continue;

                occupiedPositions.current[gridY][gridX] = false;
                grainsByCellRef.current.delete(getCellKey(gridX, gridY));
                settleExplodedGrain(grain, gridX * SQUARE_SIZE, gridY * SQUARE_SIZE, 0);
                movedCount++;
            }
        }

        return movedCount;
    };

    const triggerCascadeSettle = (minGridX: number, maxGridX: number) => {
        let pass = 0;
        const maxPasses = 20;
        const passIntervalMs = 90;

        const runPass = () => {
            pass++;
            const moved = settleUnsupportedGrainsInColumns(minGridX, maxGridX);

            if (moved > 0 && pass < maxPasses) {
                window.setTimeout(runPass, passIntervalMs);
            }
        };

        runPass();
    };

    const animateParabolicExplosion = (
        grain: GrainRecord,
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        onComplete: (endVelocityY: number) => void
    ) => {
        const startTime = performance.now();
        const peakLift = 20 + Math.random() * 50;
        grain.element.style.transition = 'none';
        grain.element.style.willChange = 'left, top';

        const step = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / EXPLOSION_DURATION_MS, 1);

            const currentX = startX + (endX - startX) * progress;
            const arcOffset = -4 * peakLift * progress * (1 - progress);
            const currentY = startY + (endY - startY) * progress + arcOffset;

            grain.element.style.left = `${currentX}px`;
            grain.element.style.top = `${currentY}px`;

            if (progress < 1) {
                requestAnimationFrame(step);
                return;
            }

            // Preserve downward momentum at the end of the arc.
            const endVelocityY = ((endY - startY) + (4 * peakLift)) / EXPLOSION_DURATION_MS;
            onComplete(endVelocityY);
        };

        requestAnimationFrame(step);
    };

    const explodeAt = (gridX: number, gridY: number, radiusCells = EXPLOSION_RADIUS_CELLS) => {
        const grainsToExplode: GrainRecord[] = [];

        for (let y = gridY - radiusCells; y <= gridY + radiusCells; y++) {
            if (y < 0 || y >= GRID_HEIGHT) continue;
            for (let x = gridX - radiusCells; x <= gridX + radiusCells; x++) {
                if (x < 0 || x >= GRID_WIDTH) continue;
                const distance = Math.hypot(x - gridX, y - gridY);
                if (distance > radiusCells) continue;
                const grain = grainsByCellRef.current.get(getCellKey(x, y));
                if (grain) {
                    grainsToExplode.push(grain);
                }
            }
        }

        if (grainsToExplode.length === 0) return;

        for (const grain of grainsToExplode) {
            occupiedPositions.current[grain.gridY][grain.gridX] = false;
            grainsByCellRef.current.delete(getCellKey(grain.gridX, grain.gridY));
        }

        for (const grain of grainsToExplode) {
            let targetGridX = grain.gridX;
            let targetGridY = grain.gridY;

            for (let attempt = 0; attempt < 20; attempt++) {
                const angle = Math.random() * Math.PI * 2;
                const blastRadius = 2 + Math.random() * (radiusCells + 4);
                const candidateX = Math.round(gridX + Math.cos(angle) * blastRadius);
                const candidateY = Math.round(gridY + Math.sin(angle) * blastRadius - 1);
                const clampedX = Math.max(0, Math.min(candidateX, GRID_WIDTH - 1));
                const clampedY = Math.max(0, Math.min(candidateY, GRID_HEIGHT - 1));

                if (!occupiedPositions.current[clampedY][clampedX]) {
                    targetGridX = clampedX;
                    targetGridY = clampedY;
                    break;
                }
            }

            const startX = grain.gridX * SQUARE_SIZE;
            const startY = grain.gridY * SQUARE_SIZE;
            const targetX = targetGridX * SQUARE_SIZE;
            const targetY = targetGridY * SQUARE_SIZE;
            grain.element.style.transform = 'none';
            grain.element.style.opacity = '1';

            animateParabolicExplosion(grain, startX, startY, targetX, targetY, (endVelocityY) => {
                settleExplodedGrain(grain, targetGridX * SQUARE_SIZE, targetGridY * SQUARE_SIZE, endVelocityY);
            });
        }

        // Keep checking for newly unsupported grains as blast motion completes.
        window.setTimeout(() => {
            triggerCascadeSettle(gridX - radiusCells, gridX + radiusCells);
            triggerCascadeSettle(0, GRID_WIDTH - 1);
        }, EXPLOSION_DURATION_MS);
    };

    const createSandBurst = (x: number, y: number) => {
        for (let i = 0; i < grainsPerDrop; i++) {
            const spread = SQUARE_SIZE * 2;
            const randomOffsetX = Math.floor((Math.random() * (spread * 2 + 1)) - spread);
            createSandGrain(x + randomOffsetX, y);
        }
    };

    const tryCreateSandBurst = (x: number, y: number, force = false) => {
        const now = performance.now();
        if (!force && now - lastSpawnTimeRef.current < SPAWN_INTERVAL_MS) {
            return;
        }
        lastSpawnTimeRef.current = now;
        createSandBurst(x, y);
    };

    React.useEffect(() => {
        if (hasSeededInitialSandRef.current) return;

        const grid = gridRef.current;
        if (!grid) return;

        hasSeededInitialSandRef.current = true;
        const baseHeight = Math.max(1, Math.round(GRID_HEIGHT * INITIAL_SAND_HEIGHT_RATIO));
        const variation = Math.max(1, Math.round(baseHeight * 0.45));
        const minHeight = Math.max(1, baseHeight - variation);
        const maxHeight = Math.min(GRID_HEIGHT - 1, baseHeight + variation);
        let currentHeight = Math.round(baseHeight + (Math.random() * 2 - 1) * variation);

        for (let gridX = 0; gridX < GRID_WIDTH; gridX++) {
            currentHeight += Math.floor(Math.random() * 3) - 1;
            currentHeight = Math.max(minHeight, Math.min(maxHeight, currentHeight));

            for (let depth = 0; depth < currentHeight; depth++) {
                const gridY = GRID_HEIGHT - 1 - depth;
                if (occupiedPositions.current[gridY][gridX]) continue;

                const seedGrain = document.createElement('div');
                seedGrain.style.position = 'absolute';
                seedGrain.style.left = `${gridX * SQUARE_SIZE}px`;
                seedGrain.style.top = `${gridY * SQUARE_SIZE}px`;
                seedGrain.style.width = `${SQUARE_SIZE}px`;
                seedGrain.style.height = `${SQUARE_SIZE}px`;
                const shadeJitter = Math.floor(Math.random() * 10) - 5;
                seedGrain.style.backgroundColor = `hsl(${INITIAL_SAND_BASE_HUE + shadeJitter}, 58%, 66%)`;
                seedGrain.style.transition = 'none';
                grid.appendChild(seedGrain);

                addGrainRecord({
                    element: seedGrain,
                    gridX,
                    gridY
                });
            }
        }
    }, [GRID_HEIGHT, GRID_WIDTH, INITIAL_SAND_HEIGHT_RATIO, SQUARE_SIZE, addGrainRecord]);

    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                setGrainsPerDrop((current) => Math.min(current + 1, MAX_GRAINS_PER_DROP));
                return;
            }

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setGrainsPerDrop((current) => Math.max(current - 1, 1));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    React.useEffect(() => {
        return () => {
            if (globalSettleTimeoutRef.current !== null) {
                window.clearTimeout(globalSettleTimeoutRef.current);
                globalSettleTimeoutRef.current = null;
            }
        };
    }, []);

    React.useEffect(() => {
        const updateChargePreview = () => {
            const chargeStart = chargeStartRef.current;
            if (!chargeStart) {
                chargeAnimationFrameRef.current = null;
                return;
            }

            const heldMs = performance.now() - chargeStart.timeMs;
            const radiusCells = getExplosionRadiusForHold(heldMs);
            setChargePreview({
                x: chargeStart.gridX * SQUARE_SIZE + SQUARE_SIZE / 2,
                y: chargeStart.gridY * SQUARE_SIZE + SQUARE_SIZE / 2,
                radiusCells
            });

            chargeAnimationFrameRef.current = requestAnimationFrame(updateChargePreview);
        };

        if (chargeStartRef.current && chargeAnimationFrameRef.current === null) {
            chargeAnimationFrameRef.current = requestAnimationFrame(updateChargePreview);
        }

        return () => {
            if (chargeAnimationFrameRef.current !== null) {
                cancelAnimationFrame(chargeAnimationFrameRef.current);
                chargeAnimationFrameRef.current = null;
            }
        };
    }, [chargePreview, SQUARE_SIZE]);

    const handleMouseDown = (e: React.MouseEvent) => {
        const { gridX, gridY } = getClampedGridPosition(e.clientX, e.clientY);
        if (occupiedPositions.current[gridY][gridX]) {
            setIsMouseDown(false);
            chargeStartRef.current = {
                timeMs: performance.now(),
                gridX,
                gridY
            };
            setChargePreview({
                x: gridX * SQUARE_SIZE + SQUARE_SIZE / 2,
                y: gridY * SQUARE_SIZE + SQUARE_SIZE / 2,
                radiusCells: MIN_EXPLOSION_RADIUS_CELLS
            });
            return;
        }

        setIsMouseDown(true);
        chargeStartRef.current = null;
        setChargePreview(null);
        if (!hasStartedDropping) {
            setHasStartedDropping(true);
        }
        tryCreateSandBurst(e.clientX, e.clientY, true);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isMouseDown) {
            tryCreateSandBurst(e.clientX, e.clientY);
        }
    };

    const handleMouseUp = () => {
        const chargeStart = chargeStartRef.current;
        if (chargeStart) {
            const heldMs = performance.now() - chargeStart.timeMs;
            const dynamicRadius = getExplosionRadiusForHold(heldMs);
            explodeAt(chargeStart.gridX, chargeStart.gridY, dynamicRadius);
            chargeStartRef.current = null;
            setChargePreview(null);
        }
        setIsMouseDown(false);
    };

    return (
        <div
            ref={gridRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
                position: 'relative',
                width: '100vw',
                height: '100vh',
                background: '#000',
                overflow: 'hidden'
            }}
        >
            <button
                type="button"
                onMouseDown={(event) => event.stopPropagation()}
                onMouseUp={(event) => event.stopPropagation()}
                onClick={(event) => {
                    event.stopPropagation();
                    setUseColoredDrops((current) => !current);
                }}
                style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    zIndex: 3,
                    color: '#fff',
                    background: 'rgba(20, 20, 20, 0.75)',
                    border: '1px solid rgba(255, 255, 255, 0.35)',
                    borderRadius: '0.5rem',
                    padding: '0.4rem 0.65rem',
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                }}
            >
                Mode: {useColoredDrops ? 'Colored' : 'Pure Sand'}
            </button>
            {chargePreview && (
                <div
                    style={{
                        position: 'absolute',
                        left: `${chargePreview.x}px`,
                        top: `${chargePreview.y}px`,
                        width: `${chargePreview.radiusCells * SQUARE_SIZE * 2}px`,
                        height: `${chargePreview.radiusCells * SQUARE_SIZE * 2}px`,
                        transform: 'translate(-50%, -50%)',
                        border: '2px solid rgba(255, 120, 80, 0.95)',
                        boxShadow: '0 0 14px rgba(255, 120, 80, 0.7), inset 0 0 10px rgba(255, 120, 80, 0.45)',
                        borderRadius: '50%',
                        pointerEvents: 'none',
                        zIndex: 2
                    }}
                />
            )}
            {!hasStartedDropping && (
                <div
                    style={{
                        position: 'absolute',
                        top: '10rem',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        color: '#fff',
                        fontSize: '1.5rem',
                        fontWeight: 600,
                        pointerEvents: 'none',
                        userSelect: 'none'
                    }}
                >
                    <div style={{ fontSize: '2rem', fontWeight: 700, paddingBottom: '3rem'}}>Drop some Sand</div>
                    <div style={{ marginTop: '0.35rem', opacity: 0.2 }}>Click to drop sand</div>
                    <div
                        style={{
                            marginTop: '0.5rem',
                            fontSize: '1rem',
                            fontWeight: 400,
                            opacity: 0.2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.35rem'
                        }}
                    >
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '1.6rem',
                                padding: '0.1rem 0',
                                border: '1px solid rgba(255,255,255,0.55)',
                                borderRadius: '0.35rem',
                                marginRight: '0.35rem',
                                lineHeight: 1
                            }}
                        >
                            ↑
                        </span>
                        <span>- grain size -</span>
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '1.6rem',
                                padding: '0.1rem 0',
                                border: '1px solid rgba(255,255,255,0.55)',
                                borderRadius: '0.35rem',
                                lineHeight: 1
                            }}
                        >
                            ↓
                        </span>
                    </div>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.9rem', fontWeight: 400, opacity: 0.2 }}>
                        Hold on pile to charge an explosion
                    </div>
                </div>
            )}
        </div>
    );
};

export default Canvas;
