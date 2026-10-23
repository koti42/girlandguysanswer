import React, { useCallback, useMemo, useState } from 'react';
import PanelShell from './PanelShell.jsx';
import PanelTabs from './PanelTabs.jsx';
import PanelItemIcon from './PanelItemIcon.jsx';
import PanelSlot from './PanelSlot.jsx';
import PanelGhost from './PanelGhost.jsx';
import {
    HOTBAR_SIZE, filterPalette, makeAddr, normalizePalette, paletteTabs, parseAddr, pushRecent, toggleInList,
} from './panelUtils.js';
import { readList, writeList } from './panelStorage.js';
import { useApiSnapshot, useLiveMessage, useRovingGrid, useSlotDrag } from './panelHooks.js';

const FAV_KEY = 'kesif.build.fav';
const RECENT_KEY = 'kesif.build.recent';
const BLK = 'blk:';

/*
 * İnşa paleti (insa modu): kategori sekmeleri + Favoriler + Son kullanılan, arama, büyük blok ızgarası.
 * Atama: hedef hızlı çubuk yuvasını seç (alttaki şerit), sonra bloğa dokun; ya da bloğu yuvaya sürükle.
 * Favori: uzun bas / sağ tık / ★ düğmesi. Sistem blokları (id > 99) paletten süzülür, bildirimi yoktur.
 * Props: api (getBuildPalette, setCreativeSlot, clearSlot, selectHotbar, getInventorySnapshot), onClose, version,
 *        accessibility, reducedMotion.
 */
const BuildPalette = ({ api, onClose, version = 0, accessibility = false, reducedMotion = false }) => {
    const readPalette = useCallback(() => api.getBuildPalette(), [api]);
    const readInv = useCallback(() => api.getInventorySnapshot(), [api]);
    const [rawPalette] = useApiSnapshot(readPalette, 0);
    const [inv, bump] = useApiSnapshot(readInv, version);
    const [msg, announce] = useLiveMessage();

    const [tab, setTab] = useState('tumu');
    const [query, setQuery] = useState('');
    const [favs, setFavs] = useState(() => readList(FAV_KEY));
    const [recents, setRecents] = useState(() => readList(RECENT_KEY));
    const [targetRaw, setTarget] = useState(null);
    const [inspectItem, setInspectItem] = useState(null);

    const entries = useMemo(() => normalizePalette(rawPalette), [rawPalette]);
    const tabs = useMemo(() => paletteTabs(entries), [entries]);
    const shown = useMemo(() => filterPalette(entries, { tab, query, favs, recents }), [entries, tab, query, favs, recents]);
    const byItem = useMemo(() => {
        const m = new Map();
        entries.forEach((e) => m.set(e.item, e));
        return m;
    }, [entries]);

    const slots = (inv && inv.slots) || [];
    const target = targetRaw === null ? Math.max(0, Math.min(HOTBAR_SIZE - 1, (inv && inv.selected) || 0)) : targetRaw;
    const nav = useRovingGrid('auto', shown.length ? BLK + shown[0].item : '');

    const assign = (item, slotIndex) => {
        const e = byItem.get(item);
        let ok = true;
        try {
            api.setCreativeSlot(slotIndex, item);
            if (api.selectHotbar) api.selectHotbar(slotIndex);
        } catch (_e) {
            ok = false;
        }
        bump();
        if (ok) {
            const next = pushRecent(recents, item);
            setRecents(next);
            writeList(RECENT_KEY, next);
            setTarget(slotIndex);
            announce(`${e ? e.name : item} hızlı çubuğun ${slotIndex + 1}. yuvasına konuldu.`);
        } else {
            announce('Yuvaya konulamadı.');
        }
        return ok;
    };

    const toggleFav = (item) => {
        const next = toggleInList(favs, item);
        setFavs(next);
        writeList(FAV_KEY, next);
        const e = byItem.get(item);
        announce(`${e ? e.name : item} ${next.indexOf(item) >= 0 ? 'favorilere eklendi' : 'favorilerden çıkarıldı'}.`);
    };

    const drag = useSlotDrag({
        canStart: (addr) => addr.indexOf(BLK) === 0,
        onDrop: (from, to) => {
            const p = parseAddr(to);
            if (p && p.kind === 's' && p.index < HOTBAR_SIZE && from.indexOf(BLK) === 0) assign(from.slice(BLK.length), p.index);
        },
        onLongPress: (addr) => toggleFav(addr.slice(BLK.length)),
        onContext: (addr) => toggleFav(addr.slice(BLK.length)),
    });

    const clearTarget = () => {
        try {
            api.clearSlot(makeAddr('s', target));
        } catch (_e) {
            announce('Yuva boşaltılamadı.');
            return;
        }
        bump();
        announce(`${target + 1}. yuva boşaltıldı.`);
    };

    const pickSlot = (i) => {
        setTarget(i);
        try {
            if (api.selectHotbar) api.selectHotbar(i);
        } catch (_e) {
            /* seçim yalnızca hedef belirler */
        }
        bump();
    };

    const hot = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
        const s = slots[i];
        hot.push({ addr: makeAddr('s', i), slot: s && s.item && s.count > 0 ? s : null, i });
    }
    const inspectEntry = inspectItem ? byItem.get(inspectItem) : null;
    const ghostSlot = drag.dragging ? { item: drag.dragging.slice(BLK.length), count: 1 } : null;
    const emptyText = tab === 'fav'
        ? 'Henüz favori yok. Bir bloğa uzun bas, sağ tıkla ya da ★ düğmesini kullan.'
        : tab === 'son' ? 'Henüz blok seçmedin.' : 'Eşleşen blok yok.';

    return (
        <PanelShell
            title="İnşa paleti"
            subtitle="Bir yuva seç, sonra bloğa dokun. Sürükleyerek de koyabilirsin."
            onClose={onClose}
            testId="build-palette"
            className="kp-build"
            accessibility={accessibility}
            reducedMotion={reducedMotion}
        >
            <div className="kp-search-row">
                <input
                    type="search"
                    className="kp-search"
                    placeholder="Blok ara"
                    aria-label="Blok ara"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </div>
            <PanelTabs tabs={tabs} value={tab} onChange={setTab} label="Blok kategorileri" idPrefix="build" />

            <div role="tabpanel" id="build-panel" aria-labelledby={`build-tab-${tab}`} className="kp-build-listwrap">
                {shown.length === 0 ? (
                    <p className="kp-empty" data-testid="build-empty">{emptyText}</p>
                ) : (
                    <ul className="kp-blocks" onKeyDown={nav.onKeyDown} aria-label="Bloklar">
                        {shown.map((e) => {
                            const addr = BLK + e.item;
                            const np = nav.itemProps(addr);
                            const bound = drag.bind(addr);
                            const fav = favs.indexOf(e.item) >= 0;
                            return (
                                <li key={e.item} className="kp-block-li">
                                    <button
                                        type="button"
                                        className={`kp-block${drag.dragging === addr ? ' is-dragging' : ''}`}
                                        data-testid={`block-${e.item}`}
                                        aria-label={`${e.name}${fav ? ', favori' : ''}. ${target + 1}. yuvaya koy`}
                                        tabIndex={np.tabIndex}
                                        data-grid-item=""
                                        onFocus={() => {
                                            np.onFocus();
                                            setInspectItem(e.item);
                                        }}
                                        onMouseEnter={() => setInspectItem(e.item)}
                                        onPointerDown={bound.onPointerDown}
                                        onContextMenu={bound.onContextMenu}
                                        onClick={() => {
                                            if (drag.consumeClick()) return;
                                            assign(e.item, target);
                                        }}
                                        onKeyDown={(ev) => {
                                            if (ev.key === 'f' || ev.key === 'F') {
                                                ev.preventDefault();
                                                toggleFav(e.item);
                                            }
                                        }}
                                    >
                                        <PanelItemIcon item={e.item} size={64} />
                                        <span className="kp-block-name">{e.name}</span>
                                        {fav ? <span className="kp-fav-mark" aria-hidden="true">★</span> : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="kp-build-info" aria-live="off">
                {inspectEntry ? (
                    <>
                        <span className="kp-build-info-name">{inspectEntry.name}</span>
                        <button type="button" className={`kp-chip${favs.indexOf(inspectEntry.item) >= 0 ? ' is-on' : ''}`} aria-pressed={favs.indexOf(inspectEntry.item) >= 0} onClick={() => toggleFav(inspectEntry.item)}>
                            ★ Favori
                        </button>
                    </>
                ) : (
                    <span className="kp-actions-hint">Bir bloğun üzerine gel ya da odaklan. Klavyede F favori yapar.</span>
                )}
            </div>

            <div className="kp-hotstrip" role="group" aria-label={`Hedef hızlı çubuk yuvası, şu an ${target + 1}`}>
                {hot.map((h) => (
                    <PanelSlot
                        key={h.addr}
                        addr={h.addr}
                        slot={h.slot}
                        hotbarNumber={h.i + 1}
                        selected={h.i === target}
                        active={inv ? inv.selected === h.i : false}
                        label={`Hızlı çubuk ${h.i + 1}${h.slot ? '' : ', boş'}${h.i === target ? ', hedef yuva' : ''}${h.slot ? ': ' + (byItem.get(h.slot.item) ? byItem.get(h.slot.item).name : h.slot.item) : ''}`}
                        onClick={() => pickSlot(h.i)}
                    />
                ))}
                <button type="button" className="kp-btn" onClick={clearTarget}>Yuvayı boşalt</button>
            </div>
            <div className="kp-live" role="status" aria-live="polite" data-testid="live">{msg}</div>
            {ghostSlot ? <PanelGhost slot={ghostSlot} ghostRef={drag.ghostRef} /> : null}
        </PanelShell>
    );
};

export default BuildPalette;
