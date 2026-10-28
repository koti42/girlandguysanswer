import React from 'react';

/** Hub kartı / lobi kahramanı için salt CSS siber küre süsü (dekoratif). */
const PzHeroArt = ({ className = '' }) => (
    <span className={`pz-orb ${className}`} aria-hidden="true">
        <span className="pz-orb-ring" />
        <span className="pz-orb-dot" style={{ left: '28%', top: '34%', color: '#00f0ff', background: '#00f0ff' }} />
        <span className="pz-orb-dot" style={{ left: '52%', top: '26%', color: '#ffaa00', background: '#ffaa00', animationDelay: '0.4s' }} />
        <span className="pz-orb-dot" style={{ left: '64%', top: '48%', color: '#ff003c', background: '#ff003c', animationDelay: '0.8s' }} />
        <span className="pz-orb-dot" style={{ left: '38%', top: '58%', color: '#00f0ff', background: '#00f0ff', animationDelay: '1.1s' }} />
    </span>
);

export default PzHeroArt;
