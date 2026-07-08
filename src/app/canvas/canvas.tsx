import React from 'react';

import { BottomBar, TopControls } from './Hud';
import InstructionOverlay from './InstructionOverlay';
import { gameAudio } from './audio';
import { DEFAULT_GRAINS_PER_DROP, MAX_GRAINS_PER_DROP } from './constants';
import { Brush, SandEngine } from './engine';
import { clearGrid, loadGrid, loadSettings, saveGrid, saveSettings } from './storage';

const AUTOSAVE_INTERVAL_MS = 20000;
const BOTTOM_BAR_HIDE_DELAY_MS = 2000;
const BOTTOM_REVEAL_ZONE_PX = 90;

const tiltSupported = (): boolean =>
    'DeviceOrientationEvent' in window && navigator.maxTouchPoints > 0;

const Canvas = (): React.JSX.Element => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const engineRef = React.useRef<SandEngine | null>(null);
    const tiltHandlerRef = React.useRef<((event: DeviceOrientationEvent) => void) | null>(null);

    const storedSettings = React.useMemo(loadSettings, []);
    const [hasStartedDropping, setHasStartedDropping] = React.useState(false);
    const [grainsPerDrop, setGrainsPerDrop] = React.useState(
        storedSettings?.grains ?? DEFAULT_GRAINS_PER_DROP
    );
    const [useColoredDrops, setUseColoredDrops] = React.useState(storedSettings?.colored ?? true);
    const [muted, setMuted] = React.useState(storedSettings?.muted ?? false);
    const [brush, setBrush] = React.useState<Brush>('sand');
    const [tiltEnabled, setTiltEnabled] = React.useState(false);
    const [bottomBarHidden, setBottomBarHidden] = React.useState(false);
    const barHideTimerRef = React.useRef<number | null>(null);
    const pointerActiveRef = React.useRef(false);

    const scheduleBarHide = React.useCallback((delayMs = BOTTOM_BAR_HIDE_DELAY_MS) => {
        if (barHideTimerRef.current !== null) window.clearTimeout(barHideTimerRef.current);
        barHideTimerRef.current = window.setTimeout(() => {
            barHideTimerRef.current = null;
            setBottomBarHidden(true);
        }, delayMs);
    }, []);

    const revealBottomBar = React.useCallback(() => {
        setBottomBarHidden(false);
        scheduleBarHide();
    }, [scheduleBarHide]);

    React.useEffect(() => {
        scheduleBarHide(2500);
        return () => {
            if (barHideTimerRef.current !== null) window.clearTimeout(barHideTimerRef.current);
        };
    }, [scheduleBarHide]);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const engine = SandEngine.create(canvas);
        if (!engine) return;

        engineRef.current = engine;
        const saved = loadGrid();
        if (saved) engine.restore(saved);
        engine.start();

        const handleResize = () => engine.handleResize();
        const persist = () => saveGrid(engine.serialize());
        const autosaveId = window.setInterval(persist, AUTOSAVE_INTERVAL_MS);
        window.addEventListener('resize', handleResize);
        window.addEventListener('pagehide', persist);

        return () => {
            window.clearInterval(autosaveId);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('pagehide', persist);
            persist();
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
        if (engineRef.current) engineRef.current.brush = brush;
    }, [brush]);

    React.useEffect(() => {
        gameAudio.setMuted(muted);
    }, [muted]);

    React.useEffect(() => {
        saveSettings({ colored: useColoredDrops, grains: grainsPerDrop, muted });
    }, [useColoredDrops, grainsPerDrop, muted]);

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
            if (tiltHandlerRef.current) {
                window.removeEventListener('deviceorientation', tiltHandlerRef.current);
                tiltHandlerRef.current = null;
            }
        };
    }, []);

    const disableTilt = () => {
        if (tiltHandlerRef.current) {
            window.removeEventListener('deviceorientation', tiltHandlerRef.current);
            tiltHandlerRef.current = null;
        }
        engineRef.current?.setTilt(0);
        setTiltEnabled(false);
    };

    const enableTilt = async () => {
        // iOS requires an explicit permission request from a user gesture.
        const ctor = DeviceOrientationEvent as unknown as {
            requestPermission?: () => Promise<string>;
        };
        try {
            if (typeof ctor.requestPermission === 'function') {
                const result = await ctor.requestPermission();
                if (result !== 'granted') return;
            }
        } catch {
            return;
        }
        const handler = (event: DeviceOrientationEvent) => {
            const angle = window.screen.orientation ? window.screen.orientation.angle : 0;
            let tilt = event.gamma ?? 0;
            if (angle === 90) tilt = event.beta ?? 0;
            else if (angle === 270 || angle === -90) tilt = -(event.beta ?? 0);
            engineRef.current?.setTilt(tilt / 40);
        };
        tiltHandlerRef.current = handler;
        window.addEventListener('deviceorientation', handler);
        setTiltEnabled(true);
    };

    const handleShare = async () => {
        const engine = engineRef.current;
        if (!engine) return;
        const blob = await engine.exportImage();
        if (!blob) return;
        const file = new File([blob], 'sand-drop.png', { type: 'image/png' });
        try {
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: 'Sand Drop' });
                return;
            }
        } catch {
            // sharing cancelled or unsupported — fall back to a download
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'sand-drop.png';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const handleReset = () => {
        clearGrid();
        engineRef.current?.reset();
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const engine = engineRef.current;
        if (!engine) return;
        gameAudio.unlock();
        pointerActiveRef.current = true;
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
        // Hovering near the bottom edge (while not drawing) reveals the bar.
        if (!pointerActiveRef.current && event.clientY > window.innerHeight - BOTTOM_REVEAL_ZONE_PX) {
            if (bottomBarHidden) setBottomBarHidden(false);
            scheduleBarHide();
        }
    };

    const handlePointerUp = () => {
        pointerActiveRef.current = false;
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
                muted={muted}
                onToggleMute={() => setMuted((current) => !current)}
                tiltAvailable={tiltSupported()}
                tiltEnabled={tiltEnabled}
                onToggleTilt={() => {
                    if (tiltEnabled) disableTilt();
                    else void enableTilt();
                }}
                onShare={() => void handleShare()}
                onReset={handleReset}
            />
            <BottomBar
                brush={brush}
                onBrushChange={(next) => {
                    setBrush(next);
                    revealBottomBar();
                }}
                grainsPerDrop={grainsPerDrop}
                onGrainsChange={(delta) => {
                    setGrainsPerDrop((current) => Math.max(1, Math.min(current + delta, MAX_GRAINS_PER_DROP)));
                    revealBottomBar();
                }}
                hidden={bottomBarHidden}
                onReveal={revealBottomBar}
                onKeepVisible={revealBottomBar}
            />
            {!hasStartedDropping && <InstructionOverlay />}
        </div>
    );
};

export default Canvas;
