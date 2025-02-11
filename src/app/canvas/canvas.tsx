import React, { useEffect, useRef } from 'react';

const Canvas: React.FC = () => {
    const gridRef = useRef<HTMLDivElement>(null);
    const SQUARE_SIZE = 5;
    const GRID_WIDTH = Math.floor(window.innerWidth / SQUARE_SIZE);
    const GRID_HEIGHT = Math.floor(window.innerHeight / SQUARE_SIZE);

    useEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;

        // Create grid squares
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const square = document.createElement('div');
                square.style.position = 'absolute';
                square.style.left = `${x * SQUARE_SIZE}px`;
                square.style.top = `${y * SQUARE_SIZE}px`;
                square.style.width = `${SQUARE_SIZE}px`;
                square.style.height = `${SQUARE_SIZE}px`;
                square.style.border = '0.5px solid #333';
                square.style.boxSizing = 'border-box';
                grid.appendChild(square);
            }
        }
    }, []);

    return (
        <div
            ref={gridRef}
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
