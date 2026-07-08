import React from 'react';

import { GrainCounter, TopControls } from './Hud';
import InstructionOverlay from './InstructionOverlay';
import { DEFAULT_GRAINS_PER_DROP, MAX_GRAINS_PER_DROP } from './constants';
import { SandEngine } from './engine';

const Canvas = (): React.JSX.Element => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const engineRef = React.useRef<SandEngine | null>(null);
    const [hasStartedDropping, setHasStartedDropping] = React.useState(false);
    const [grainsPerDrop, setGrainsPerDrop] = React.useState(DEFAULT_GRAINS_PER_DROP);
    const [useColoredDrops, setUseColoredDrops] = React.useState(true);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const engine = SandEngine.create(canvas);
        if (!engine) return;

        engineRef.current = engine;
        engine.start();

        const handleResize = () => engine.handleResize();
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            engine.dispose();
            engineRef.current = null;
        };
    }, []);

    React.useEffect(() => {
        if (engineRef.current) engineRef.current.grainsPerDrop = grainsPerDrop;
    }, [grainsPerDrop]);

    React.useEffect(() => {
        if (engineRef.current) engineRef.current.useColoredDrops = useColoredDrops;
    }, [useColoredDrops]);

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

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const engine = engineRef.current;
        if (!engine) return;
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // Pointer capture is unavailable in some environments (e.g. jsdom).
        }
        const action = engine.pointerDownAt(event.clientX, event.clientY);
        if (action === 'pour' && !hasStartedDropping) setHasStartedDropping(true);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        engineRef.current?.pointerMoveTo(event.clientX, event.clientY);
    };

    const handlePointerUp = () => {
        engineRef.current?.pointerUp();
    };

    return (
        <div
            className="sand-scene"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onContextMenu={(event) => event.preventDefault()}
        >
            <canvas ref={canvasRef} className="sand-canvas" />
            <TopControls
                useColoredDrops={useColoredDrops}
                onToggleColorMode={() => setUseColoredDrops((current) => !current)}
                onReset={() => engineRef.current?.reset()}
            />
            <GrainCounter
                grainsPerDrop={grainsPerDrop}
                onChange={(delta) =>
                    setGrainsPerDrop((current) => Math.max(1, Math.min(current + delta, MAX_GRAINS_PER_DROP)))
                }
            />
            {!hasStartedDropping && <InstructionOverlay />}
        </div>
    );
};

export default Canvas;
