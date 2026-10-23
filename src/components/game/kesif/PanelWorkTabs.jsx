import React from 'react';
import './panelsCraft.css';

/*
 * Çalışma alanı sekmeleri: Envanter ve Üret aynı pencerenin iki sekmesidir (tarif defteri gibi yan yana).
 * Başlık çubuğuna (PanelShell headerExtra) konur. Klavye: E envanter, R üret; ok tuşları da sekme değiştirir.
 * Props: current 'inventory' | 'crafting', onSwitch(name), craftable (yapılabilir tarif sayısı; rozet), touchHints.
 */
const TABS = [
    { key: 'inventory', label: 'Envanter', hint: 'E' },
    { key: 'crafting', label: 'Üret', hint: 'R' },
];

const PanelWorkTabs = ({ current, onSwitch, craftable = 0 }) => {
    if (typeof onSwitch !== 'function') return null;
    const onKeyDown = (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const i = TABS.findIndex((t) => t.key === current);
        const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
        e.preventDefault();
        onSwitch(n.key);
    };
    return (
        <div className="kp-work" role="tablist" aria-label="Çalışma alanı" onKeyDown={onKeyDown} data-testid="work-tabs">
            {TABS.map((t) => {
                const on = t.key === current;
                return (
                    <button
                        key={t.key}
                        type="button"
                        role="tab"
                        data-work-tab={t.key}
                        aria-selected={on}
                        tabIndex={on ? 0 : -1}
                        className={`kp-work-tab${on ? ' is-on' : ''}`}
                        onClick={() => {
                            if (!on) onSwitch(t.key);
                        }}
                    >
                        <span>{t.label}</span>
                        <kbd className="kp-work-key" aria-hidden="true">{t.hint}</kbd>
                        {t.key === 'crafting' && craftable > 0 ? (
                            <span className="kp-tab-count" aria-label={`${craftable} tarif yapılabilir`}>{craftable}</span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
};

export default PanelWorkTabs;
