import React, { useCallback, useState } from 'react';
import PanelShell from './PanelShell.jsx';
import PanelSlotGroup from './PanelSlotGroup.jsx';
import PanelItemInfo from './PanelItemInfo.jsx';
import PanelGhost from './PanelGhost.jsx';
import {
    CHEST_SIZE, HOTBAR_SIZE, INV_SIZE, findRoom, makeAddr, quickMovePlan, slotAtAddr,
} from './panelUtils.js';
import { useApiSnapshot, useLiveMessage, useRovingGrid, useSlotDrag, useStackMover } from './panelHooks.js';

const EMPTY_INV = { slots: [], armor: [], selected: 0, heat: 0, creative: false };

const slotOf = (arr, i) => {
    const s = arr && arr[i];
    return s && s.item && s.count > 0 ? s : null;
};

/*
 * Sandık paneli: 27 sandık yuvası (c0..c26) + oyuncu envanteri (s9..s35 çanta, s0..s8 hızlı çubuk).
 * Aynı taşıma akışı: dokun-seç-dokun, sürükle-bırak, yarım (sağ tık/uzun basma/H), hızlı transfer
 * (Shift+tık / çift dokunma / "Aktar" düğmesi), "Hepsini al" ve "Hepsini koy" (hızlı çubuk korunur).
 * Props: api, onClose, version, accessibility, reducedMotion.
 */
const ChestPanel = ({ api, onClose, version = 0, accessibility = false, reducedMotion = false }) => {
    const readInv = useCallback(() => api.getInventorySnapshot(), [api]);
    const readChest = useCallback(() => api.getChest(), [api]);
    const [snap, bumpInv] = useApiSnapshot(readInv, version);
    const [chestSnap, bumpChest] = useApiSnapshot(readChest, version);
    const bump = useCallback(() => {
        bumpInv();
        bumpChest();
    }, [bumpInv, bumpChest]);
    const inv = snap || EMPTY_INV;
    const chest = chestSnap && Array.isArray(chestSnap.slots) ? chestSnap : null;
    const [msg, announce] = useLiveMessage();
    const [hover, setHover] = useState(null);
    const [focused, setFocused] = useState(null);
    const mover = useStackMover({ api, inv, chest, bump, announce });
    const drag = useSlotDrag({
        canStart: (addr) => !!slotAtAddr(addr, inv, chest),
        onDrop: mover.onDrop,
        onLongPress: mover.onSlotHalf,
        onContext: mover.onSlotHalf,
    });
    const nav = useRovingGrid(HOTBAR_SIZE, 'c0');

    const inspected = hover || (mover.sel && mover.sel.addr) || focused;
    const inspectedSlot = inspected ? slotAtAddr(inspected, inv, chest) : null;
    const onInspect = (addr, how) => {
        if (how === 'hover') setHover(addr);
        else setFocused(addr);
    };

    /** Çoklu aktarım: her adımda taze görüntü okunur (motor eşzamanlı değiştirir). */
    const bulk = (fromKind) => {
        let moved = 0;
        for (let guard = 0; guard < 80; guard++) {
            const curInv = api.getInventorySnapshot();
            const curChest = api.getChest();
            if (!curInv || !curChest) break;
            let addr = null;
            if (fromKind === 'c') {
                for (let i = 0; i < Math.min(CHEST_SIZE, curChest.slots.length); i++) {
                    if (slotOf(curChest.slots, i) && findRoom(curInv.slots, curChest.slots[i].item, 0, INV_SIZE) >= 0) {
                        addr = makeAddr('c', i);
                        break;
                    }
                }
            } else {
                for (let i = HOTBAR_SIZE; i < INV_SIZE; i++) {
                    if (slotOf(curInv.slots, i) && findRoom(curChest.slots, curInv.slots[i].item, 0, Math.min(CHEST_SIZE, curChest.slots.length)) >= 0) {
                        addr = makeAddr('s', i);
                        break;
                    }
                }
            }
            if (!addr) break;
            const plan = quickMovePlan(addr, curInv, curChest);
            if (!plan || plan.action !== 'move') break;
            let ok = false;
            try {
                ok = !!api.moveStack(addr, plan.to, { half: false });
            } catch (_e) {
                ok = false;
            }
            if (!ok) break;
            moved++;
        }
        bump();
        announce(moved ? (fromKind === 'c' ? 'Sandıktakiler çantaya alındı.' : 'Çanta sandığa konuldu.') : 'Aktarılacak eşya yok ya da yer yok.');
    };

    const chestItems = [];
    const n = chest ? Math.min(CHEST_SIZE, chest.slots.length) : CHEST_SIZE;
    for (let i = 0; i < n; i++) chestItems.push({ addr: makeAddr('c', i), slot: chest ? slotOf(chest.slots, i) : null });
    const bagItems = [];
    for (let i = HOTBAR_SIZE; i < INV_SIZE; i++) bagItems.push({ addr: makeAddr('s', i), slot: slotOf(inv.slots, i) });
    const hotItems = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
        hotItems.push({ addr: makeAddr('s', i), slot: slotOf(inv.slots, i), hotbarNumber: i + 1, active: inv.selected === i });
    }

    const sel = mover.sel;
    const subtitle = chest && chest.pos ? `Konum ${Math.round(chest.pos.x)}, ${Math.round(chest.pos.y)}, ${Math.round(chest.pos.z)}` : undefined;

    return (
        <PanelShell
            title="Sandık"
            subtitle={subtitle}
            onClose={onClose}
            testId="chest-panel"
            className="kp-chest"
            accessibility={accessibility}
            reducedMotion={reducedMotion}
        >
            {!chest ? (
                <p className="kp-empty" data-testid="chest-closed">Açık bir sandık yok. Bir sandığa yaklaşıp etkileşime geç.</p>
            ) : (
                <div className="kp-chest-layout" onKeyDown={nav.onKeyDown}>
                    <div className="kp-chest-main">
                        <div className="kp-row-head">
                            <h3 className="kp-h3">Sandık</h3>
                            <button type="button" className="kp-btn" onClick={() => bulk('c')}>Hepsini al</button>
                        </div>
                        <PanelSlotGroup label="Sandık" className="kp-grid-chest" items={chestItems} mover={mover} drag={drag} nav={nav} onInspect={onInspect} canDrop={false} />
                        <div className="kp-row-head">
                            <h3 className="kp-h3">Çanta</h3>
                            <button type="button" className="kp-btn" onClick={() => bulk('s')}>Hepsini koy</button>
                        </div>
                        <PanelSlotGroup label="Çanta" className="kp-grid-bag" items={bagItems} mover={mover} drag={drag} nav={nav} onInspect={onInspect} canDrop={false} />
                        <h3 className="kp-h3">Hızlı çubuk</h3>
                        <PanelSlotGroup label="Hızlı çubuk" className="kp-grid-hot" items={hotItems} mover={mover} drag={drag} nav={nav} onInspect={onInspect} canDrop={false} />
                        <div className="kp-actions" role="group" aria-label="Seçili eşya işlemleri">
                            {sel && slotAtAddr(sel.addr, inv, chest) ? (
                                <>
                                    <button type="button" className="kp-btn kp-btn-good" onClick={() => { mover.quickMove(sel.addr); mover.setSel(null); }}>
                                        Aktar
                                    </button>
                                    {slotAtAddr(sel.addr, inv, chest).count > 1 ? (
                                        <button type="button" className="kp-btn" aria-pressed={sel.half} onClick={() => mover.setSel({ addr: sel.addr, half: !sel.half })}>
                                            {sel.half ? 'Tamamını al' : 'Yarısını al'}
                                        </button>
                                    ) : null}
                                    <button type="button" className="kp-btn" onClick={() => mover.setSel(null)}>Vazgeç</button>
                                </>
                            ) : (
                                <span className="kp-actions-hint">Bir eşyaya dokun, sonra hedef yuvaya dokun; çift dokunma hızlı aktarır.</span>
                            )}
                        </div>
                    </div>
                    <aside className="kp-chest-side" aria-label="Eşya bilgisi">
                        <PanelItemInfo slot={inspectedSlot} />
                    </aside>
                </div>
            )}
            <div className="kp-live" role="status" aria-live="polite" data-testid="live">{msg}</div>
            {drag.dragging ? <PanelGhost slot={slotAtAddr(drag.dragging, inv, chest)} ghostRef={drag.ghostRef} /> : null}
        </PanelShell>
    );
};

export default ChestPanel;
