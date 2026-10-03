import React from 'react';

/** 3-2-1-YÜKSEL! Motorun onCountdown(n) bildirimlerini gösterir. */
const TowerCountdown = ({ value }) => {
    if (value == null) return null;
    const label = value > 0 ? String(value) : 'YÜKSEL!';
    return (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" role="status" aria-live="assertive">
            <span
                key={label}
                className={`tower-count select-none font-black text-white drop-shadow-[0_6px_24px_rgba(255,107,107,0.65)] ${
                    value > 0 ? 'text-8xl sm:text-9xl' : 'text-5xl sm:text-7xl game-text-gradient'
                }`}
            >
                {label}
            </span>
        </div>
    );
};

export default TowerCountdown;
