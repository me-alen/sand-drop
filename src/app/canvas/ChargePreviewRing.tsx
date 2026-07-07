import React from 'react';

import type { ChargePreview } from './types';

type ChargePreviewRingProps = {
    chargePreview: ChargePreview;
    squareSize: number;
};

const ChargePreviewRing = ({ chargePreview, squareSize }: ChargePreviewRingProps): React.JSX.Element => {
    return (
        <div
            style={{
                position: 'absolute',
                left: `${chargePreview.x}px`,
                top: `${chargePreview.y}px`,
                width: `${chargePreview.radiusCells * squareSize * 2}px`,
                height: `${chargePreview.radiusCells * squareSize * 2}px`,
                transform: 'translate(-50%, -50%)',
                border: '2px solid rgba(255, 120, 80, 0.95)',
                boxShadow: '0 0 14px rgba(255, 120, 80, 0.7), inset 0 0 10px rgba(255, 120, 80, 0.45)',
                borderRadius: '50%',
                pointerEvents: 'none',
                zIndex: 2
            }}
        />
    );
};

export default ChargePreviewRing;
