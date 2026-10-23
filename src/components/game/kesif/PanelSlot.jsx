import React, { memo } from 'react';
import PanelItemIcon from './PanelItemIcon.jsx';
import { chargeInfo, durabilityInfo, rarityColor, slotAriaLabel } from './panelUtils.js';
import { itemByKey } from '../../../game/kesif/sim/items.js';

/* Zırh yuvası silueti (boşken): kafa, göğüs, bacak, ayak. */
const GLYPHS = [
    'M12 3c-3.3 0-5.5 2.4-5.5 5.6V12h2v-1.5h7V12h2V8.6C17.5 5.4 15.3 3 12 3zm-3.5 9.5v3.3c0 .9.7 1.7 1.6 1.7h3.8c.9 0 1.6-.8 1.6-1.7v-3.3h-7z',
    'M8 4 4 7l1.5 4L8 10v10h8V10l2.5 1L20 7l-4-3-1.5 1.8h-5L8 4z',
    'M8 3h8l1 8-1.3 10h-3L12 12l-.7 9h-3L7 11l1-8z',
    'M7 4h5v8.5l5.5 2.4c1 .4 1.5 1.2 1.5 2.1V19H5V8c0-.6.4-1 1-1h1V4z',
];

const ArmorGlyph = ({ index }) => (
    <svg className="kp-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={GLYPHS[index] || GLYPHS[1]} fill="currentColor" />
    </svg>
);

/**
 * Yuva düğmesi. addr: 's12' | 'a0' | 'c5'. slot: {item,count,dur}|null.
 * selected: dokun-seç akışında seçili; active: hotbar'da elde tutulan; dragging: sürükleniyor (soluk).
 */
const PanelSlot = ({
    addr, slot, selected = false, active = false, dragging = false, hotbarNumber = 0, armorIndex = -1,
    label, onClick, onFocus, tabIndex, extra, ...rest
}) => {
    const it = slot ? itemByKey(slot.item) : null;
    const dur = durabilityInfo(slot);
    const chg = chargeInfo(slot);
    const cls = ['kp-slot'];
    if (slot) cls.push('has-item');
    if (slot && slot.ench) cls.push('is-ench');
    if (selected) cls.push('is-selected');
    if (active) cls.push('is-active');
    if (dragging) cls.push('is-dragging');
    return (
        <button
            type="button"
            className={cls.join(' ')}
            data-slot-addr={addr}
            data-testid={`slot-${addr}`}
            aria-label={label || slotAriaLabel(addr, slot)}
            aria-pressed={selected}
            tabIndex={tabIndex}
            onClick={onClick}
            onFocus={onFocus}
            style={slot && it ? { '--kp-rar': rarityColor(it.rarity) } : undefined}
            {...rest}
        >
            {slot ? <PanelItemIcon item={slot.item} size={64} ench={!!slot.ench} /> : armorIndex >= 0 ? <ArmorGlyph index={armorIndex} /> : null}
            {slot && slot.count > 1 ? <span className="kp-count">{slot.count}</span> : null}
            {hotbarNumber > 0 ? <span className="kp-hotnum" aria-hidden="true">{hotbarNumber}</span> : null}
            {chg ? (
                <span className={`kp-chg kp-chg-${chg.level}${dur && dur.pct < 100 ? ' has-dur' : ''}`} aria-hidden="true">
                    <span style={{ width: `${chg.pct}%` }} />
                </span>
            ) : null}
            {dur && dur.pct < 100 ? (
                <span className={`kp-dur kp-dur-${dur.level}`} aria-hidden="true">
                    <span style={{ width: `${dur.pct}%` }} />
                </span>
            ) : null}
            {extra}
        </button>
    );
};

export default memo(PanelSlot);
