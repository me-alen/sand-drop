import React from 'react';

import ChargePreviewRing from './ChargePreviewRing.tsx';
import InstructionOverlay from './InstructionOverlay.tsx';
import ModeToggle from './ModeToggle.tsx';
import { buildRandomSandCastle } from './castle.ts';
import {
    DROP_SAND_HUE_STEP,
    DROP_SAND_LIGHTNESS,
    DROP_SAND_SATURATION,
    EXPLOSION_DURATION_MS,
    EXPLOSION_FULL_CHARGE_MS,
    EXPLOSION_RADIUS_CELLS,
    INITIAL_SAND_BASE_HUE,
    INITIAL_SAND_HEIGHT_RATIO,
    MAX_EXPLOSION_RADIUS_CELLS,
    MAX_GRAINS_PER_DROP,
    MAX_TOTAL_GRAINS,
    MIN_EXPLOSION_RADIUS_CELLS,
    PURE_SAND_LIGHTNESS,
    PURE_SAND_SATURATION,
    SPAWN_INTERVAL_MS,
    SQUARE_SIZE
} from './constants.ts';
import type { ChargePreview, ChargeStart, GrainRecord } from './types.ts';

const Canvas = (): React.JSX.Element => {
    const gridRef = React.useRef<HTMLDivElement>(null);
    const [isMouseDown, setIsMouseDown] = React.useState(false);
    const [hasStartedDropping, setHasStartedDropping] = React.useState(false);
    const [grainsPerDrop, setGrainsPerDrop] = React.useState(1);
    const [chargePreview, setChargePreview] = React.useState<ChargePreview | null>(null);
    const [useColoredDrops, setUseColoredDrops] = React.useState(true);

    const hueRef = React.useRef(Math.random() * 360);
    const lastSpawnTimeRef = React.useRef(0);
    const chargeStartRef = React.useRef<ChargeStart | null>(null);
    const chargeAnimationFrameRef = React.useRef<number | null>(null);
    const hasSeededInitialSandRef = React.useRef(false);
    const hasBuiltInitialCastleRef = React.useRef(false);
    const globalSettleTimeoutRef = React.useRef<number | null>(null);
    const activeGrainsRef = React.useRef<GrainRecord[]>([]);
    const grainsByCellRef = React.useRef<Map<string, GrainRecord>>(new Map());

    const GRID_HEIGHT = Math.floor(window.innerHeight / SQUARE_SIZE);
    const GRID_WIDTH = Math.floor(window.innerWidth / SQUARE_SIZE);

    const occupiedPositions = React.useRef<boolean[][]>(
        Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(false))
    );

    const getCellKey = (gridX: number, gridY: number): string => `${gridX},${gridY}`;

    const getPureSandColor = React.useCallback((): string => {
        const shadeJitter = Math.floor(Math.random() * 10) - 5;
        return `hsl(${INITIAL_SAND_BASE_HUE + shadeJitter}, ${PURE_SAND_SATURATION}%, ${PURE_SAND_LIGHTNESS}%)`;
    }, []);

    const addGrainRecord = React.useCallback((grainRecord: GrainRecord) => {
        occupiedPositions.current[grainRecord.gridY][grainRecord.gridX] = true;
        activeGrainsRef.current.push(grainRecord);
        grainsByCellRef.current.set(getCellKey(grainRecord.gridX, grainRecord.gridY), grainRecord);

        if (activeGrainsRef.current.length > MAX_TOTAL_GRAINS) {
            const removedGrain = activeGrainsRef.current.shift();
            if (!removedGrain) return;
            occupiedPositions.current[removedGrain.gridY][removedGrain.gridX] = false;
            grainsByCellRef.current.delete(getCellKey(removedGrain.gridX, removedGrain.gridY));
            removedGrain.element.remove();
        }
    }, []);

    const addStaticGrain = React.useCallback((gridX: number, gridY: number, color: string): boolean => {
        const grid = gridRef.current;
        if (!grid) return false;
        if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) return false;
        if (occupiedPositions.current[gridY][gridX]) return false;

        const grain = document.createElement('div');
        grain.style.position = 'absolute';
        grain.style.left = `${gridX * SQUARE_SIZE}px`;
        grain.style.top = `${gridY * SQUARE_SIZE}px`;
        grain.style.width = `${SQUARE_SIZE}px`;
        grain.style.height = `${SQUARE_SIZE}px`;
        grain.style.backgroundColor = color;
        grain.style.transition = 'none';
        grid.appendChild(grain);

        addGrainRecord({ element: grain, gridX, gridY });
        return true;
    }, [GRID_HEIGHT, GRID_WIDTH, addGrainRecord]);

    const getExplosionRadiusForHold = React.useCallback((heldMs: number): number => {
        const normalized = Math.max(0, Math.min(heldMs / EXPLOSION_FULL_CHARGE_MS, 1));
        return Math.round(
            MIN_EXPLOSION_RADIUS_CELLS +
            normalized * (MAX_EXPLOSION_RADIUS_CELLS - MIN_EXPLOSION_RADIUS_CELLS)
        );
    }, []);

    const buildCastle = React.useCallback(() => {
        buildRandomSandCastle({
            gridWidth: GRID_WIDTH,
            gridHeight: GRID_HEIGHT,
            occupiedPositions: occupiedPositions.current,
            addStaticGrain,
            getPureSandColor
        });
    }, [GRID_HEIGHT, GRID_WIDTH, addStaticGrain, getPureSandColor]);

    const getClampedGridPosition = React.useCallback((x: number, y: number) => {
        const clampedX = Math.max(0, Math.min(x, (GRID_WIDTH - 1) * SQUARE_SIZE));
        const clampedY = Math.max(0, Math.min(y, (GRID_HEIGHT - 1) * SQUARE_SIZE));
        return {
            clampedX,
            clampedY,
            gridX: Math.floor(clampedX / SQUARE_SIZE),
            gridY: Math.floor(clampedY / SQUARE_SIZE)
        };
    }, [GRID_HEIGHT, GRID_WIDTH]);

    const findRestingPosition = React.useCallback((startX: number, startY: number): [number, number, number] => {
        const { clampedX, clampedY } = getClampedGridPosition(startX, startY);
        let gridX = Math.floor(clampedX / SQUARE_SIZE);
        let gridY = Math.floor(clampedY / SQUARE_SIZE);
        const startGridX = gridX;

        while (gridY < GRID_HEIGHT - 1 && !occupiedPositions.current[gridY + 1][startGridX]) {
            gridY++;
        }
        const verticalStopY = gridY;

        while (gridY < GRID_HEIGHT - 1) {
            const belowOccupied = occupiedPositions.current[gridY + 1][gridX];
            if (!belowOccupied) {
                gridY++;
                continue;
            }

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
    }, [GRID_HEIGHT, GRID_WIDTH, getClampedGridPosition]);

    const triggerCascadeSettle = React.useCallback((minGridX: number, maxGridX: number) => {
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
                if (!needsSlidePhase) return;
                window.setTimeout(() => {
                    grain.element.style.transition = 'left 0.2s linear, top 0.2s linear';
                    grain.element.style.left = `${finalX}px`;
                    grain.element.style.top = `${finalY}px`;
                }, verticalDurationMs);
            });

            const totalSettleTime = verticalDurationMs + (needsSlidePhase ? 220 : 0);
            if (globalSettleTimeoutRef.current !== null) {
                window.clearTimeout(globalSettleTimeoutRef.current);
            }
            globalSettleTimeoutRef.current = window.setTimeout(() => {
                globalSettleTimeoutRef.current = null;
                triggerCascadeSettle(0, GRID_WIDTH - 1);
            }, totalSettleTime);
        };

        const settleUnsupportedGrainsInColumns = (startColumn: number, endColumn: number): number => {
            const startX = Math.max(0, startColumn);
            const endX = Math.min(GRID_WIDTH - 1, endColumn);
            let movedCount = 0;

            for (let gridX = startX; gridX <= endX; gridX++) {
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
    }, [GRID_HEIGHT, GRID_WIDTH, findRestingPosition, getClampedGridPosition]);

    const scheduleStabilitySweeps = React.useCallback((initialDelayMs = 0) => {
        const sweepDelays = [0, 220, 480, 850, 1300];
        for (const delay of sweepDelays) {
            window.setTimeout(() => {
                triggerCascadeSettle(0, GRID_WIDTH - 1);
            }, initialDelayMs + delay);
        }
    }, [GRID_WIDTH, triggerCascadeSettle]);

    const animateParabolicExplosion = React.useCallback((
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

            const endVelocityY = ((endY - startY) + (4 * peakLift)) / EXPLOSION_DURATION_MS;
            onComplete(endVelocityY);
        };

        requestAnimationFrame(step);
    }, []);

    const explodeAt = React.useCallback((gridX: number, gridY: number, radiusCells = EXPLOSION_RADIUS_CELLS) => {
        const grainsToExplode: GrainRecord[] = [];

        for (let y = gridY - radiusCells; y <= gridY + radiusCells; y++) {
            if (y < 0 || y >= GRID_HEIGHT) continue;
            for (let x = gridX - radiusCells; x <= gridX + radiusCells; x++) {
                if (x < 0 || x >= GRID_WIDTH) continue;
                const distance = Math.hypot(x - gridX, y - gridY);
                if (distance > radiusCells) continue;
                const grain = grainsByCellRef.current.get(getCellKey(x, y));
                if (grain) grainsToExplode.push(grain);
            }
        }

        if (grainsToExplode.length === 0) return;

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
                if (!needsSlidePhase) return;
                window.setTimeout(() => {
                    grain.element.style.transition = 'left 0.2s linear, top 0.2s linear';
                    grain.element.style.left = `${finalX}px`;
                    grain.element.style.top = `${finalY}px`;
                }, verticalDurationMs);
            });

            const totalSettleTime = verticalDurationMs + (needsSlidePhase ? 220 : 0);
            scheduleStabilitySweeps(totalSettleTime);
        };

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

        window.setTimeout(() => {
            triggerCascadeSettle(gridX - radiusCells, gridX + radiusCells);
            scheduleStabilitySweeps();
        }, EXPLOSION_DURATION_MS);
    }, [GRID_HEIGHT, GRID_WIDTH, animateParabolicExplosion, findRestingPosition, getClampedGridPosition, scheduleStabilitySweeps, triggerCascadeSettle]);

    const createSandGrain = React.useCallback((x: number, y: number) => {
        const grid = gridRef.current;
        if (!grid) return;
        const { clampedX, clampedY, gridX: startGridX, gridY: startGridY } = getClampedGridPosition(x, y);

        if (occupiedPositions.current[startGridY][startGridX]) return;

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

        addGrainRecord({ element: sandGrain, gridX: finalGridX, gridY: finalGridY });

        requestAnimationFrame(() => {
            sandGrain.style.top = `${verticalY}px`;
            if (!needsSlidePhase) return;
            window.setTimeout(() => {
                sandGrain.style.transition = 'left 0.2s linear, top 0.2s linear';
                sandGrain.style.left = `${finalX}px`;
                sandGrain.style.top = `${finalY}px`;
            }, 800);
        });
    }, [addGrainRecord, findRestingPosition, getClampedGridPosition, useColoredDrops]);

    const createSandBurst = React.useCallback((x: number, y: number) => {
        for (let i = 0; i < grainsPerDrop; i++) {
            const spread = SQUARE_SIZE * 2;
            const randomOffsetX = Math.floor((Math.random() * (spread * 2 + 1)) - spread);
            createSandGrain(x + randomOffsetX, y);
        }
    }, [createSandGrain, grainsPerDrop]);

    const tryCreateSandBurst = React.useCallback((x: number, y: number, force = false) => {
        const now = performance.now();
        if (!force && now - lastSpawnTimeRef.current < SPAWN_INTERVAL_MS) return;
        lastSpawnTimeRef.current = now;
        createSandBurst(x, y);
    }, [createSandBurst]);

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
                seedGrain.style.backgroundColor = getPureSandColor();
                seedGrain.style.transition = 'none';
                grid.appendChild(seedGrain);

                addGrainRecord({ element: seedGrain, gridX, gridY });
            }
        }

        if (!hasBuiltInitialCastleRef.current) {
            hasBuiltInitialCastleRef.current = true;
            buildCastle();
        }
    }, [GRID_HEIGHT, GRID_WIDTH, addGrainRecord, buildCastle, getPureSandColor]);

    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                setGrainsPerDrop((current) => Math.min(current + 1, MAX_GRAINS_PER_DROP));
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setGrainsPerDrop((current) => Math.max(current - 1, 1));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    React.useEffect(() => {
        return () => {
            if (globalSettleTimeoutRef.current !== null) {
                window.clearTimeout(globalSettleTimeoutRef.current);
                globalSettleTimeoutRef.current = null;
            }
        };
    }, []);

    const startChargePreviewLoop = React.useCallback(() => {
        if (chargeAnimationFrameRef.current !== null) return;

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

        chargeAnimationFrameRef.current = requestAnimationFrame(updateChargePreview);
    }, [getExplosionRadiusForHold]);

    const handleMouseDown = (event: React.MouseEvent) => {
        const { gridX, gridY } = getClampedGridPosition(event.clientX, event.clientY);
        if (occupiedPositions.current[gridY][gridX]) {
            setIsMouseDown(false);
            chargeStartRef.current = { timeMs: performance.now(), gridX, gridY };
            setChargePreview({
                x: gridX * SQUARE_SIZE + SQUARE_SIZE / 2,
                y: gridY * SQUARE_SIZE + SQUARE_SIZE / 2,
                radiusCells: MIN_EXPLOSION_RADIUS_CELLS
            });
            startChargePreviewLoop();
            return;
        }

        setIsMouseDown(true);
        chargeStartRef.current = null;
        setChargePreview(null);
        if (chargeAnimationFrameRef.current !== null) {
            cancelAnimationFrame(chargeAnimationFrameRef.current);
            chargeAnimationFrameRef.current = null;
        }
        if (!hasStartedDropping) setHasStartedDropping(true);
        tryCreateSandBurst(event.clientX, event.clientY, true);
    };

    const handleMouseMove = (event: React.MouseEvent) => {
        if (!isMouseDown) return;
        tryCreateSandBurst(event.clientX, event.clientY);
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
        if (chargeAnimationFrameRef.current !== null) {
            cancelAnimationFrame(chargeAnimationFrameRef.current);
            chargeAnimationFrameRef.current = null;
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
            <ModeToggle
                useColoredDrops={useColoredDrops}
                onToggle={() => setUseColoredDrops((current) => !current)}
            />
            {chargePreview && <ChargePreviewRing chargePreview={chargePreview} squareSize={SQUARE_SIZE} />}
            {!hasStartedDropping && <InstructionOverlay />}
        </div>
    );
};

export default Canvas;
