import React, { useRef } from 'react';
import PanelSlot from './PanelSlot.jsx';
import { sameAddr } from './panelUtils.js';

/*
 * Yuva grubu (ızgara/sütun). items: [{addr, slot, hotbarNumber?, armorIndex?, active?}].
 * mover: useStackMover çıktısı, drag: useSlotDrag çıktısı, nav: useRovingGrid çıktısı.
 * Tıklama: dokun-seç-dokun (mover.onSlotClick), Shift+tık = hızlı taşı, sağ tık/uzun basma = yarı.
 * Dokunmatik: dokunuştan sonra tarayıcının gönderdiği sahte fare olayları (mouseenter) eşya bilgisini değiştirmez; yoksa bilgi kartı
 * boyut değiştirir, aşağı kaydırılmış panelde yuvalar tıklamadan önce kayar ve ikinci dokunuş boşa gider (tap-tap taşıma).
 * Klavye: H = yarısını seç, Q = bir tane bırak (Ctrl+Q hepsi), Shift+Enter = hızlı taşı.
 */
/** Dokunuştan sonra sahte fare olaylarının yok sayılacağı süre (ms). */
const TOUCH_MOUSE_GUARD_MS = 1000;
const recentlyTouched = (ref) => Date.now() - ref.current < TOUCH_MOUSE_GUARD_MS;

const PanelSlotGroup = ({ label, className = '', items, mover, drag, nav, onInspect, canDrop = true }) => {
    const touchAt = useRef(0);
    const fromTouch = () => recentlyTouched(touchAt);
    return (
    <div className={`kp-grid ${className}`} role="group" aria-label={label}>
        {items.map((it) => {
            const np = nav.itemProps(it.addr);
            const bound = drag.bind(it.addr);
            return (
                <PanelSlot
                    key={it.addr}
                    addr={it.addr}
                    slot={it.slot}
                    active={!!it.active}
                    hotbarNumber={it.hotbarNumber || 0}
                    armorIndex={it.armorIndex === undefined ? -1 : it.armorIndex}
                    selected={!!mover.sel && sameAddr(mover.sel.addr, it.addr)}
                    dragging={drag.dragging === it.addr}
                    tabIndex={np.tabIndex}
                    data-grid-item=""
                    data-autofocus={it.autoFocus ? '' : undefined}
                    onFocus={() => {
                        np.onFocus();
                        if (onInspect) onInspect(it.addr, 'focus');
                    }}
                    onMouseEnter={() => onInspect && !fromTouch() && onInspect(it.addr, 'hover')}
                    onMouseLeave={() => onInspect && !fromTouch() && onInspect(null, 'hover')}
                    onPointerDown={(e) => {
                        if (e.pointerType === 'touch' || e.pointerType === 'pen') touchAt.current = Date.now();
                        bound.onPointerDown(e);
                    }}
                    onContextMenu={bound.onContextMenu}
                    onClick={(e) => {
                        if (drag.consumeClick()) return;
                        if (e.shiftKey && it.slot) {
                            mover.quickMove(it.addr);
                            return;
                        }
                        mover.onSlotClick(it.addr);
                    }}
                    onKeyDown={(e) => {
                        if (!it.slot) return;
                        if (e.key === 'h' || e.key === 'H') {
                            e.preventDefault();
                            mover.onSlotHalf(it.addr);
                        } else if ((e.key === 'q' || e.key === 'Q') && canDrop) {
                            e.preventDefault();
                            mover.dropAddr(it.addr, e.ctrlKey ? undefined : 1);
                        } else if (e.key === 'Enter' && e.shiftKey) {
                            e.preventDefault();
                            mover.quickMove(it.addr);
                        }
                    }}
                />
            );
        })}
    </div>
    );
};

export default PanelSlotGroup;
