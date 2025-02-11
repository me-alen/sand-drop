import React, { useRef, useState } from 'react';

const Canvas = (): JSX.Element => {
    const gridRef = useRef<HTMLDivElement>(null);
    const [isMouseDown, setIsMouseDown] = useState(false);
    const SQUARE_SIZE = 5;
    const GRID_HEIGHT = Math.floor(window.innerHeight / SQUARE_SIZE);
    const GRID_WIDTH = Math.floor(window.innerWidth / SQUARE_SIZE);

    // Track occupied positions
    const occupiedPositions = useRef<boolean[][]>(
        Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(false))
    );

    const findRestingPosition = (startX: number, startY: number): [number, number] => {
        let gridX = Math.floor(startX / SQUARE_SIZE);
        let gridY = Math.floor(startY / SQUARE_SIZE);
        let hasCollided = false;

        // Fall straight down until hitting any grain or bottom
        while (gridY < GRID_HEIGHT - 1) {
            // Check for any grain in the path
            for (let checkY = gridY + 1; checkY < GRID_HEIGHT; checkY++) {
                if (occupiedPositions.current[checkY][gridX]) {
                    hasCollided = true;
                    gridY = checkY - 1; // Stop just above the found grain
                    break;
                }
            }

            if (hasCollided) break;
            gridY++;
        }

        // Only start rolling logic after first collision
        if (hasCollided && gridY < GRID_HEIGHT - 1) {
            let canRoll = true;

            while (canRoll && gridY < GRID_HEIGHT - 1) {
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
                    canRoll = false;
                }
            }
        }

        return [gridX * SQUARE_SIZE, gridY * SQUARE_SIZE];
    };

    const createSandGrain = (x: number, y: number) => {
        const grid = gridRef.current;
        if (!grid) return;

        const sandGrain = document.createElement('div');
        sandGrain.style.position = 'absolute';
        sandGrain.style.left = `${Math.floor(x / SQUARE_SIZE) * SQUARE_SIZE}px`;
        sandGrain.style.top = `${Math.floor(y / SQUARE_SIZE) * SQUARE_SIZE}px`;
        sandGrain.style.width = `${SQUARE_SIZE}px`;
        sandGrain.style.height = `${SQUARE_SIZE}px`;
        sandGrain.style.backgroundColor = '#fff';
        sandGrain.style.transition = 'all 1s linear';
        grid.appendChild(sandGrain);

        const [finalX, finalY] = findRestingPosition(x, y);

        requestAnimationFrame(() => {
            sandGrain.style.left = `${finalX}px`;
            sandGrain.style.top = `${finalY}px`;
            // Mark position as occupied
            occupiedPositions.current[Math.floor(finalY / SQUARE_SIZE)][Math.floor(finalX / SQUARE_SIZE)] = true;
        });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsMouseDown(true);
        createSandGrain(e.clientX, e.clientY);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isMouseDown) {
            createSandGrain(e.clientX, e.clientY);
        }
    };

    const handleMouseUp = () => {
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
        />
    );
};

export default Canvas;
