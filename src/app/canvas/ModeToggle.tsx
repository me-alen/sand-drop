import React from 'react';

type ModeToggleProps = {
    useColoredDrops: boolean;
    onToggle: () => void;
};

const ModeToggle = ({ useColoredDrops, onToggle }: ModeToggleProps): React.JSX.Element => {
    return (
        <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onMouseUp={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.stopPropagation();
                onToggle();
            }}
            style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                zIndex: 3,
                color: '#fff',
                background: 'rgba(20, 20, 20, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.35)',
                borderRadius: '0.5rem',
                padding: '0.4rem 0.65rem',
                fontSize: '0.9rem',
                cursor: 'pointer'
            }}
        >
            Mode: {useColoredDrops ? 'Colored' : 'Pure Sand'}
        </button>
    );
};

export default ModeToggle;
