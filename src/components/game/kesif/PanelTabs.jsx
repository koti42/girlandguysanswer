import React, { useRef } from 'react';

/*
 * Erişilebilir sekme şeridi (role=tablist). Sol/sağ ok, Home/End ile gezinir (roving tabindex).
 * tabs: [{key,name,count?}]. reserveCount: sayaç 0 iken de yeri ayrılır (görünmez) — sayı belirip kaybolunca sekmeler yana kaymaz.
 * Sekme içeriği role="tabpanel" id={`${idPrefix}-panel`}
 * aria-labelledby={`${idPrefix}-tab-${key}`} olmalıdır.
 */
const PanelTabs = ({ tabs, value, onChange, label, idPrefix, className = '', reserveCount = false }) => {
    const ref = useRef(null);
    const onKeyDown = (e) => {
        const i = tabs.findIndex((t) => t.key === value);
        let n = -1;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        if (n < 0) return;
        e.preventDefault();
        onChange(tabs[n].key);
        const btn = ref.current && ref.current.querySelector(`[data-tab="${tabs[n].key}"]`);
        if (btn) btn.focus();
    };
    return (
        <div ref={ref} className={`kp-tabs ${className}`} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
            {tabs.map((t) => {
                const on = t.key === value;
                return (
                    <button
                        key={t.key}
                        id={`${idPrefix}-tab-${t.key}`}
                        data-tab={t.key}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        aria-controls={`${idPrefix}-panel`}
                        tabIndex={on ? 0 : -1}
                        className={`kp-tab${on ? ' is-on' : ''}`}
                        onClick={() => onChange(t.key)}
                    >
                        {t.name}
                        {t.count > 0 ? <span className="kp-tab-count">{t.count}</span> : (reserveCount ? <span className="kp-tab-count is-empty" aria-hidden="true">0</span> : null)}
                    </button>
                );
            })}
        </div>
    );
};

export default PanelTabs;
