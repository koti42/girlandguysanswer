import React from 'react';

/*
 * Lobi kahramanındaki küçük kule animasyonu (yalnızca CSS): pastelden
 * neona katlar, tepede kayıp oturan kat ve mükemmel halkası.
 */
const FLOORS = [
    { w: 100, c: '#3a2f6b' },
    { w: 100, c: '#f9a8c9' },
    { w: 96, c: '#f7b38a' },
    { w: 96, c: '#f5d77a' },
    { w: 92, c: '#a7e3a1' },
    { w: 92, c: '#7fd3e6' },
    { w: 88, c: '#8ea2ff' },
];

const TowerHeroArt = ({ className = '' }) => {
    const top = FLOORS.length;
    return (
        <div className={`tower-hero-art ${className}`} aria-hidden="true">
            {FLOORS.map((f, i) => (
                <span key={i} className="tower-hero-floor" style={{ bottom: i * 22, width: f.w, backgroundColor: f.c }} />
            ))}
            <span className="tower-hero-floor tower-hero-top" style={{ bottom: top * 22, width: 88, backgroundColor: '#c58bff' }} />
            <span className="tower-hero-ring" style={{ bottom: top * 22 - 2, width: 92, height: 26 }} />
        </div>
    );
};

export default TowerHeroArt;
