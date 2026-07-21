import React from 'react';

import type { Brush } from './engine';

// The HUD sits inside the pointer-driven scene, so swallow pointer events
// before they reach the sand canvas underneath.
const stopPointer = (event: React.SyntheticEvent): void => event.stopPropagation();

const BRUSHES: { kind: Brush; label: string }[] = [
    { kind: 'sand', label: 'Sand' },
    { kind: 'water', label: 'Water' },
    { kind: 'stone', label: 'Stone' },
    { kind: 'erase', label: 'Erase' }
];

type TopBarProps = {
    brush: Brush;
    onBrushChange: (brush: Brush) => void;
    grainsPerDrop: number;
    onGrainsChange: (delta: number) => void;
    muted: boolean;
    onToggleMute: () => void;
    tiltAvailable: boolean;
    tiltEnabled: boolean;
    onToggleTilt: () => void;
    onShare: () => void;
    onReset: () => void;
};

export const TopBar = ({
    brush,
    onBrushChange,
    grainsPerDrop,
    onGrainsChange,
    muted,
    onToggleMute,
    tiltAvailable,
    tiltEnabled,
    onToggleTilt,
    onShare,
    onReset
}: TopBarProps): React.JSX.Element => (
    <div className="hud hud--top" onPointerDown={stopPointer} onPointerUp={stopPointer}>
        <div className="hud-group hud-group--tools">
            {BRUSHES.map(({ kind, label }) => (
                <button
                    key={kind}
                    type="button"
                    className={`material-button ${brush === kind ? 'material-button--active' : ''}`}
                    aria-label={`${label} brush`}
                    title={label}
                    onClick={() => onBrushChange(kind)}
                >
                    <span className={`material-swatch material-swatch--${kind}`} />
                </button>
            ))}
            <span className="hud-divider" />
            <button
                type="button"
                className="hud-button hud-button--round"
                aria-label="Fewer grains per drop"
                onClick={() => onGrainsChange(-1)}
            >
                −
            </button>
            <span className="grain-count">✦ ×{grainsPerDrop}</span>
            <button
                type="button"
                className="hud-button hud-button--round"
                aria-label="More grains per drop"
                onClick={() => onGrainsChange(1)}
            >
                +
            </button>
        </div>

        <div className="hud-group">
            <button
                type="button"
                className="hud-button hud-button--icon"
                aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
                title={muted ? 'Unmute' : 'Mute'}
                onClick={onToggleMute}
            >
                {muted ? '🔇' : '🔊'}
            </button>
            {tiltAvailable && (
                <button
                    type="button"
                    className={`hud-button hud-button--icon ${tiltEnabled ? 'hud-button--active' : ''}`}
                    aria-label={tiltEnabled ? 'Disable tilt gravity' : 'Enable tilt gravity'}
                    title="Tilt gravity"
                    onClick={onToggleTilt}
                >
                    📱
                </button>
            )}
            <button
                type="button"
                className="hud-button hud-button--icon"
                aria-label="Share a snapshot"
                title="Share snapshot"
                onClick={onShare}
            >
                📷
            </button>
            <button
                type="button"
                className="hud-button hud-button--icon"
                aria-label="Reset the sandbox"
                title="Reset"
                onClick={onReset}
            >
                ↺
            </button>
        </div>
    </div>
);
