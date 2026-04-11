import React from 'react';

const keycapStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.6rem',
    padding: '0.1rem 0',
    border: '1px solid rgba(255,255,255,0.55)',
    borderRadius: '0.35rem',
    lineHeight: 1
};

const InstructionOverlay = (): React.JSX.Element => {
    return (
        <div
            style={{
                position: 'absolute',
                top: '10rem',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                color: '#fff',
                fontSize: '1.5rem',
                fontWeight: 600,
                pointerEvents: 'none',
                userSelect: 'none'
            }}
        >
            <div style={{ fontSize: '2rem', fontWeight: 700, paddingBottom: '3rem' }}>Drop some Sand</div>
            <div style={{ marginTop: '0.35rem', opacity: 0.2 }}>Click to drop sand</div>
            <div
                style={{
                    marginTop: '0.5rem',
                    fontSize: '1rem',
                    fontWeight: 400,
                    opacity: 0.2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem'
                }}
            >
                <span style={{ ...keycapStyle, marginRight: '0.35rem' }}>↑</span>
                <span>- grain size -</span>
                <span style={keycapStyle}>↓</span>
            </div>
            <div style={{ marginTop: '0.25rem', fontSize: '0.9rem', fontWeight: 400, opacity: 0.2 }}>
                Hold on pile to charge an explosion
            </div>
        </div>
    );
};

export default InstructionOverlay;
