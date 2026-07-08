import React from 'react';

const InstructionOverlay = (): React.JSX.Element => {
    return (
        <div className="instruction-overlay">
            <div className="instruction-overlay__title">Drop some Sand</div>
            <div className="instruction-overlay__hint">Tap or drag to pour sand</div>
            <div className="instruction-overlay__hint">
                <span className="keycap">↑</span>
                <span>grains per drop</span>
                <span className="keycap">↓</span>
            </div>
            <div className="instruction-overlay__hint">Hold on sand to charge an explosion</div>
        </div>
    );
};

export default InstructionOverlay;
