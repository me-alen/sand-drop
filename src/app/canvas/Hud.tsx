import React from 'react';

// The HUD sits inside the pointer-driven scene, so swallow pointer events
// before they reach the sand canvas underneath.
const stopPointer = (event: React.SyntheticEvent): void => event.stopPropagation();

type TopControlsProps = {
    useColoredDrops: boolean;
    onToggleColorMode: () => void;
    onReset: () => void;
};

export const TopControls = ({
    useColoredDrops,
    onToggleColorMode,
    onReset
}: TopControlsProps): React.JSX.Element => (
    <div className="hud hud--top" onPointerDown={stopPointer} onPointerUp={stopPointer}>
        <button type="button" className="hud-button" onClick={onToggleColorMode}>
            <span className={`mode-dot ${useColoredDrops ? 'mode-dot--rainbow' : 'mode-dot--sand'}`} />
            {useColoredDrops ? 'Rainbow' : 'Pure Sand'}
        </button>
        <button type="button" className="hud-button" onClick={onReset}>
            ↺ Reset
        </button>
    </div>
);

type GrainCounterProps = {
    grainsPerDrop: number;
    onChange: (delta: number) => void;
};

export const GrainCounter = ({ grainsPerDrop, onChange }: GrainCounterProps): React.JSX.Element => (
    <div className="hud hud--bottom" onPointerDown={stopPointer} onPointerUp={stopPointer}>
        <button
            type="button"
            className="hud-button hud-button--round"
            aria-label="Fewer grains per drop"
            onClick={() => onChange(-1)}
        >
            −
        </button>
        <span className="grain-count">✦ ×{grainsPerDrop}</span>
        <button
            type="button"
            className="hud-button hud-button--round"
            aria-label="More grains per drop"
            onClick={() => onChange(1)}
        >
            +
        </button>
    </div>
);
