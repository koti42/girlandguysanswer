import React, { useCallback, useState } from 'react';
import PanelShell from './PanelShell.jsx';
import PanelSlotGroup from './PanelSlotGroup.jsx';
import PanelItemInfo from './PanelItemInfo.jsx';
import PanelGhost from './PanelGhost.jsx';
import PanelWorkTabs from './PanelWorkTabs.jsx';
import AvatarBust from '../avatar/AvatarBust.jsx';
import { itemByKey } from '../../../game/kesif/sim/items.js';
import {
    ARMOR_COUNT, ARMOR_SLOT_LABELS, HOTBAR_SIZE, INV_SIZE, armorIndexOf, isArmorItem, isUsable, makeAddr, parseAddr, slotAtAddr,
} from './panelUtils.js';
import { useApiSnapshot, useLiveMessage, useRovingGrid, useSlotDrag, useStackMover } from './panelHooks.js';

const EMPTY_INV = { slots: [], armor: [], selected: 0, heat: 0, creative: false };

function armorDefenseOf(armor) {
    let d = 0;
    (armor || []).forEach((s) => {
        const it = s && itemByKey(s.item);
        if (it && it.armor) d += it.armor.defense;
    });
    return d;
}

/*
 * Envanter paneli: 27 çanta + 9 hızlı çubuk yuvası (ayrı satır), 4 zırh yuvası (siluetli).
 * Taşıma: dokun-seç-dokun (birincil, dokunmatik), sürükle-bırak (pointer olayları, hayalet öğe parmağı izler),
 * yarısını al (sağ tık / uzun basma / H), hızlı taşı (Shift+tık / çift dokunma), yere bırakma bölgesi.
 * Props: api (motor ya da oturum cephesi), onClose, version (inventoryChanged ile artan sayı),
 *        avatar/gender (isteğe bağlı karakter portresi), accessibility, reducedMotion,
 *        onSwitch(name) (verilirse başlıkta Envanter | Üret sekmeleri çizilir; Üret rozeti yapılabilir tarif sayısıdır).
 */
const InventoryPanel = ({ api, onClose, onSwitch, version = 0, avatar, gender, accessibility = false, reducedMotion = false }) => {
    const read = useCallback(() => api.getInventorySnapshot(), [api]);
    const [snap, bump] = useApiSnapshot(read, version);
    const inv = snap || EMPTY_INV;
    const readCraftable = useCallback(() => {
        if (typeof onSwitch !== 'function' || typeof api.getRecipes !== 'function') return 0;
        const list = api.getRecipes({});
        return Array.isArray(list) ? list.reduce((n, r) => n + (r && r.craftable ? 1 : 0), 0) : 0;
    }, [api, onSwitch]);
    const [craftableCount] = useApiSnapshot(readCraftable, version);
    const [msg, announce] = useLiveMessage();
    const [hover, setHover] = useState(null);
    const [focused, setFocused] = useState(null);
    const mover = useStackMover({ api, inv, chest: null, bump, announce });
    const drag = useSlotDrag({
        canStart: (addr) => !!slotAtAddr(addr, inv, null),
        onDrop: mover.onDrop,
        onLongPress: mover.onSlotHalf,
        onContext: mover.onSlotHalf,
    });
    const navArmor = useRovingGrid(1, 'a0');
    const navMain = useRovingGrid(HOTBAR_SIZE, 's' + HOTBAR_SIZE);

    const onInspect = (addr, how) => {
        if (how === 'hover') setHover(addr);
        else setFocused(addr);
    };
    const inspected = hover || (mover.sel && mover.sel.addr) || focused;
    const inspectedSlot = inspected ? slotAtAddr(inspected, inv, null) : null;

    const slotOf = (arr, i) => {
        const s = arr[i];
        return s && s.item && s.count > 0 ? s : null;
    };
    const bagItems = [];
    for (let i = HOTBAR_SIZE; i < INV_SIZE; i++) bagItems.push({ addr: makeAddr('s', i), slot: slotOf(inv.slots, i) });
    const hotItems = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
        hotItems.push({ addr: makeAddr('s', i), slot: slotOf(inv.slots, i), hotbarNumber: i + 1, active: inv.selected === i, autoFocus: inv.selected === i });
    }
    const armorItems = [];
    for (let i = 0; i < ARMOR_COUNT; i++) armorItems.push({ addr: makeAddr('a', i), slot: slotOf(inv.armor, i), armorIndex: i });

    const sel = mover.sel;
    const selSlot = sel ? slotAtAddr(sel.addr, inv, null) : null;
    const selP = sel ? parseAddr(sel.addr) : null;

    const act = (fn, okMsg) => {
        try {
            fn();
        } catch (_e) {
            announce('İşlem yapılamadı.');
            bump();
            return;
        }
        bump();
        if (okMsg) announce(okMsg);
    };

    const defense = armorDefenseOf(inv.armor);
    const subtitle = inv.creative ? 'Yaratıcı mod: eşyalar tükenmez' : undefined;

    return (
        <PanelShell
            title="Envanter"
            subtitle={subtitle}
            onClose={onClose}
            testId="inventory-panel"
            className="kp-inv"
            accessibility={accessibility}
            reducedMotion={reducedMotion}
            headerExtra={<PanelWorkTabs current="inventory" onSwitch={onSwitch} craftable={craftableCount || 0} />}
        >
            {!snap ? <p className="kp-empty">Envanter okunamadı.</p> : null}
            <div className="kp-inv-layout">
                <aside className="kp-inv-char" aria-label="Karakter ve zırh">
                    <div className="kp-bust-wrap">
                        {avatar ? (
                            <AvatarBust config={avatar} gender={gender} className="kp-bust" label="Karakterin" />
                        ) : (
                            <svg className="kp-bust kp-bust-ph" viewBox="0 0 48 64" role="img" aria-label="Karakter">
                                <circle cx="24" cy="16" r="9" fill="currentColor" opacity="0.5" />
                                <path d="M8 60c0-12 7-20 16-20s16 8 16 20z" fill="currentColor" opacity="0.4" />
                            </svg>
                        )}
                    </div>
                    <div onKeyDown={navArmor.onKeyDown} className="kp-armor-col">
                        <div className="kp-armor-labels" aria-hidden="true">
                            {ARMOR_SLOT_LABELS.map((l) => (<span key={l}>{l}</span>))}
                        </div>
                        <PanelSlotGroup
                            label="Zırh"
                            className="kp-grid-armor"
                            items={armorItems}
                            mover={mover}
                            drag={drag}
                            nav={navArmor}
                            onInspect={onInspect}
                            canDrop={false}
                        />
                    </div>
                    <p className="kp-defense" data-testid="defense">
                        Savunma <strong>{defense}</strong>
                    </p>
                </aside>

                <section className="kp-inv-main" aria-label="Eşyalar" onKeyDown={navMain.onKeyDown}>
                    <h3 className="kp-h3">Çanta</h3>
                    <PanelSlotGroup label="Çanta" className="kp-grid-bag" items={bagItems} mover={mover} drag={drag} nav={navMain} onInspect={onInspect} />
                    <h3 className="kp-h3">Hızlı çubuk</h3>
                    <PanelSlotGroup label="Hızlı çubuk" className="kp-grid-hot" items={hotItems} mover={mover} drag={drag} nav={navMain} onInspect={onInspect} />

                    <div className="kp-actions" role="group" aria-label="Seçili eşya işlemleri">
                        {sel && selSlot ? (
                            <>
                                <span className="kp-actions-title">
                                    {itemByKey(selSlot.item) ? itemByKey(selSlot.item).name : selSlot.item}
                                    {sel.half ? ' (yarısı)' : ''}
                                </span>
                                {isUsable(selSlot) ? (
                                    <button type="button" className="kp-btn kp-btn-good" onClick={() => { act(() => api.useSlot(sel.addr), 'Kullanıldı.'); mover.setSel(null); }}>
                                        {itemByKey(selSlot.item) && itemByKey(selSlot.item).drink ? 'İç' : 'Ye'}
                                    </button>
                                ) : null}
                                {isArmorItem(selSlot) && selP && selP.kind === 's' ? (
                                    <button type="button" className="kp-btn" onClick={() => { mover.moveTo(sel.addr, makeAddr('a', armorIndexOf(selSlot)), false); mover.setSel(null); }}>
                                        Kuşan
                                    </button>
                                ) : null}
                                {selP && selP.kind === 'a' ? (
                                    <button type="button" className="kp-btn" onClick={() => { act(() => api.unequipArmor(selP.index), 'Zırh çıkarıldı.'); mover.setSel(null); }}>
                                        Çıkar
                                    </button>
                                ) : null}
                                {selP && selP.kind === 's' && selP.index < HOTBAR_SIZE ? (
                                    <button type="button" className="kp-btn" onClick={() => { act(() => api.selectHotbar(selP.index), 'Elinde.'); mover.setSel(null); }}>
                                        Elime al
                                    </button>
                                ) : null}
                                {selSlot.count > 1 ? (
                                    <button type="button" className="kp-btn" aria-pressed={sel.half} onClick={() => mover.setSel({ addr: sel.addr, half: !sel.half })}>
                                        {sel.half ? 'Tamamını al' : 'Yarısını al'}
                                    </button>
                                ) : null}
                                <button type="button" className="kp-btn" onClick={() => { mover.quickMove(sel.addr); mover.setSel(null); }}>
                                    Hızlı taşı
                                </button>
                                {selSlot.count > 1 && selP && selP.kind === 's' ? (
                                    <button type="button" className="kp-btn" onClick={() => mover.dropAddr(sel.addr, 1)}>
                                        1 tane bırak
                                    </button>
                                ) : null}
                                <button type="button" className="kp-btn" onClick={() => mover.setSel(null)}>
                                    Vazgeç
                                </button>
                            </>
                        ) : (
                            <span className="kp-actions-hint">
                                Bir eşyaya dokun, sonra hedef yuvaya dokun. Sürükleyebilirsin.
                                {typeof onSwitch === 'function' ? ' Yeni eşya yapmak için Üret sekmesine geç.' : ''}
                            </span>
                        )}
                    </div>

                    <button
                        type="button"
                        className="kp-dropzone"
                        data-dropzone="drop"
                        onClick={() => {
                            if (sel && selP && selP.kind !== 'c') mover.dropAddr(sel.addr);
                            else announce('Bırakmak için önce bir eşya seç.');
                        }}
                    >
                        <span aria-hidden="true">⤓</span> Yere bırak
                    </button>
                </section>

                <aside className="kp-inv-side" aria-label="Eşya bilgisi">
                    <PanelItemInfo slot={inspectedSlot} />
                    <ul className="kp-keys" aria-label="Klavye kısayolları">
                        <li><kbd>Ok tuşları</kbd> gezin</li>
                        <li><kbd>Enter</kbd> seç / yerleştir</li>
                        <li><kbd>H</kbd> yarısını seç</li>
                        <li><kbd>Q</kbd> bir tane bırak</li>
                        {typeof onSwitch === 'function' ? <li><kbd>R</kbd> Üret sekmesi</li> : null}
                        <li><kbd>Shift</kbd>+<kbd>Enter</kbd> hızlı taşı</li>
                        <li><kbd>Esc</kbd> kapat</li>
                    </ul>
                </aside>
            </div>
            <div className="kp-live" role="status" aria-live="polite" data-testid="live">{msg}</div>
            {drag.dragging ? <PanelGhost slot={slotAtAddr(drag.dragging, inv, null)} ghostRef={drag.ghostRef} /> : null}
        </PanelShell>
    );
};

export default InventoryPanel;
