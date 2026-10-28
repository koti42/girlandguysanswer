import React from 'react';
import { LuBiohazard, LuChartColumn, LuFlaskConical, LuGlobe, LuSettings } from 'react-icons/lu';

const PANELS = [
    { key: 'map', label: 'Dünya', icon: LuGlobe },
    { key: 'threat', label: 'Tehdit', icon: LuBiohazard },
    { key: 'research', label: 'Araştırma', icon: LuFlaskConical },
    { key: 'stats', label: 'İstatistikler', icon: LuChartColumn },
    { key: 'settings', label: 'Ayarlar', icon: LuSettings },
];

/** Sol yan menü (dar ekranda alt şerit): Dünya / Tehdit / Araştırma / İstatistikler / Ayarlar. */
const PzSidebar = ({ active = 'map', onSelect, badges = {} }) => (
    <nav className="pz-side" aria-label="Komuta merkezi bölümleri">
        {PANELS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => onSelect(key)} aria-current={active === key ? 'true' : undefined} aria-label={badges[key] ? `${label}, ${badges[key]} uyarı` : label} className="relative">
                <Icon aria-hidden="true" />
                <span>{label}</span>
                {badges[key] ? <span className="pz-side-badge" aria-hidden="true">{badges[key]}</span> : null}
            </button>
        ))}
    </nav>
);

export default PzSidebar;
