import React from 'react';

const InstructionOverlay = (): React.JSX.Element => {
    return (
        <div className="instruction-overlay">
            <div className="instruction-overlay__title">Pour an Ocean</div>
            <div className="instruction-overlay__hint">Tap or drag to pour sand, then flood it with water</div>
            <div className="instruction-overlay__hint">Deep pools grow kelp, coral, and the life between them</div>
            <div className="instruction-overlay__hint">
                <span className="keycap">↑</span>
                <span>grains per drop</span>
                <span className="keycap">↓</span>
            </div>
            <div className="instruction-overlay__hint">Hold on sand to charge an explosion</div>
            <div className="instruction-overlay__hint">Pick sand, water, stone, or eraser above</div>
        </div>
    );
};

export default InstructionOverlay;
