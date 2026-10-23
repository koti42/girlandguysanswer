import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PanelShell from './PanelShell.jsx';
import PanelItemIcon from './PanelItemIcon.jsx';
import PanelItemInfo from './PanelItemInfo.jsx';
import { useApiSnapshot, useLiveMessage, useRovingGrid } from './panelHooks.js';
import {
    defaultTarget, enchantList, offerState, pickableSlots, previewEnchants, shelfBooks,
} from './panelMagicUtils.js';
import { rarityColor, slotAriaLabel } from './panelUtils.js';
import { itemByKey } from '../../../game/kesif/sim/items.js';
import './panelsMagic.css';

const DUST = 'item:büyü_tozu';
const SHARD = 'item:kuantum_kıymığı';
const EMPTY_INV = { slots: [], armor: [], selected: 0, heat: 0, creative: false };
const GLOW_MS = 1200;

const BookRow = ({ info }) => (
    <div className="ke-shelves" data-testid="shelf-meter">
        <div className="ke-books" role="img" aria-label={info.label}>
            {info.books.map((b, i) => (
                <svg key={i} className={`ke-book ${b === 'full' ? 'is-full' : ''}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M5 3h11a3 3 0 013 3v13H8a3 3 0 00-3 3V3zm3 3v2h8V6H8zm0 4v2h6v-2H8z" />
                </svg>
            ))}
        </div>
        <div className="ke-shelf-text">
            <b>{info.label}</b>
            <small>{info.note}</small>
        </div>
    </div>
);

const Cost = ({ item, need, have }) => {
    if (!(need > 0)) return null;
    const ok = have >= need;
    const it = itemByKey(item);
    return (
        <span className={`ke-cost ${ok ? '' : 'is-short'}`} aria-label={`${it ? it.name : item}: ${need}, elinde ${have}`}>
            <PanelItemIcon item={item} size={32} />
            <b>{need}</b>
            {!ok ? <i aria-hidden="true">/{have}</i> : null}
        </span>
    );
};

/*
 * Büyü Masası paneli: eşya seç (yalnız büyülenebilirler), 3 kademeli teklif, sonuç önizlemesi, Büyü Tozu/Kıymık bakiyesi,
 * kitaplık göstergesi, yeniden çekme. Klavye: ok tuşlarıyla yuva/teklif gezinme, Enter seç, Esc kapat; dokunmada 44 px hedefler.
 * Props: api (getInventorySnapshot, getEnchantInfo, enchant, rerollEnchant), onClose, version, accessibility, reducedMotion.
 */
const EnchantPanel = ({ api, onClose, version = 0, accessibility = false, reducedMotion = false }) => {
    const readInv = useCallback(() => api.getInventorySnapshot(), [api]);
    const [snap, bumpInv] = useApiSnapshot(readInv, version);
    const inv = snap || EMPTY_INV;
    const list = useMemo(() => pickableSlots(inv), [inv]);
    const [target, setTarget] = useState(null);
    const addr = list.some((p) => p.addr === target) ? target : defaultTarget(inv, list);
    const readInfo = useCallback(() => (addr ? api.getEnchantInfo(addr) : api.getEnchantInfo()), [api, addr]);
    const [info, bumpInfo] = useApiSnapshot(readInfo, version);
    const [offerId, setOfferId] = useState(null);
    const [msg, announce] = useLiveMessage();
    const [glow, setGlow] = useState(0);
    const glowTimer = useRef(null);
    const nav = useRovingGrid('auto', list.length ? list[0].addr : 's0');

    useEffect(() => () => {
        if (glowTimer.current) clearTimeout(glowTimer.current);
    }, []);

    const books = shelfBooks(info ? info.shelfCount : 0);
    const dust = info ? info.dust : 0;
    const shards = info ? info.shards : 0;
    const offers = useMemo(() => (info && info.offers ? info.offers : []), [info]);
    const chosen = useMemo(() => {
        const hit = offers.find((o) => o.id === offerId);
        if (hit) return hit;
        return offers.find((o) => o.affordable) || offers[0] || null;
    }, [offers, offerId]);
    const slot = useMemo(() => (info && info.slot ? { item: info.slot.item, count: 1, ench: info.slot.ench } : null), [info]);
    const invSlot = addr ? list.find((p) => p.addr === addr) : null;
    const preview = useMemo(() => (slot ? previewEnchants(slot, chosen) : []), [slot, chosen]);
    // varsayılan seçim bir kez belirlenince KİLİTLENİR: toz/kıymık değişince (yenileme, toplama) vurgu kendiliğinden başka teklife atlamaz
    if (!offerId && chosen) setOfferId(chosen.id);
    if (!target && addr) setTarget(addr);
    const state = chosen ? offerState(chosen, dust, shards) : null;
    const itemName = info && info.slot ? info.slot.name : '';
    const canEnchant = !!(chosen && state && state.affordable);

    const refresh = useCallback(() => {
        bumpInv();
        bumpInfo();
    }, [bumpInv, bumpInfo]);

    const doEnchant = () => {
        if (!chosen) return;
        const r = api.enchant(chosen.id, addr);
        if (r && r.ok) {
            setGlow((g) => g + 1);
            if (glowTimer.current) clearTimeout(glowTimer.current);
            glowTimer.current = setTimeout(() => setGlow(0), GLOW_MS);
            const names = r.ench ? enchantList(r.ench).map((e) => e.name).join(', ') : '';
            announce(`${itemName} büyülendi: ${names}.`);
            setOfferId(null);
        } else {
            announce((r && r.message) || 'Büyü yapılamadı.');
        }
        refresh();
    };

    const doReroll = () => {
        const r = api.rerollEnchant();
        announce(r && r.ok ? 'Teklifler yenilendi.' : (r && r.message) || 'Yeniden çekilemedi.');
        setOfferId(null);
        refresh();
    };

    const onOfferKey = (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const idx = offers.findIndex((o) => chosen && o.id === chosen.id);
        const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
        const next = offers[(idx + d + offers.length) % offers.length];
        if (next) {
            setOfferId(next.id);
            const el = e.currentTarget.querySelector(`[data-offer="${next.id}"]`);
            if (el) el.focus();
        }
    };

    const shelfSub = books.label;
    const rarity = slot ? itemByKey(slot.item) : null;

    return (
        <PanelShell
            title="Büyü Masası"
            subtitle={shelfSub}
            onClose={onClose}
            testId="enchant-panel"
            className="kp-enchant"
            accessibility={accessibility}
            reducedMotion={reducedMotion}
        >
            <div className="ke-layout">
                <section className="ke-side" aria-label="Eşya seç">
                    <h3 className="kp-h3">Eşyanı seç</h3>
                    {list.length === 0 ? (
                        <p className="kp-empty ke-none" data-testid="enchant-none">
                            Büyülenebilir eşyan yok. Kılıç, kazma, yay, kalkan, zırh ya da büyü asası getir.
                        </p>
                    ) : (
                        <div className="ke-slots" role="listbox" aria-label="Büyülenebilir eşyalar" onKeyDown={nav.onKeyDown}>
                            {list.map((p) => {
                                const it = itemByKey(p.slot.item);
                                const sel = p.addr === addr;
                                return (
                                    <button
                                        key={p.addr}
                                        type="button"
                                        role="option"
                                        aria-selected={sel}
                                        className={`kp-slot has-item ke-slot${sel ? ' is-selected' : ''}${p.slot.ench ? ' is-ench' : ''}`}
                                        data-testid={`ench-slot-${p.addr}`}
                                        aria-label={slotAriaLabel(p.addr, p.slot)}
                                        style={{ '--kp-rar': rarityColor(it ? it.rarity : 'yaygın') }}
                                        onClick={() => { setTarget(p.addr); setOfferId(null); }}
                                        {...nav.itemProps(p.addr)}
                                    >
                                        <PanelItemIcon item={p.slot.item} size={64} ench={!!p.slot.ench} />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    <BookRow info={books} />
                    <div className="ke-balance" data-testid="enchant-balance">
                        <span className="ke-bal"><PanelItemIcon item={DUST} size={32} /><b>{dust}</b><small>Büyü Tozu</small></span>
                        <span className="ke-bal"><PanelItemIcon item={SHARD} size={32} /><b>{shards}</b><small>Kıymık</small></span>
                    </div>
                </section>

                <section className="ke-main" aria-label="Büyü teklifleri">
                    {!slot || (info && !info.enchantable) ? (
                        <p className="kp-empty ke-none" data-testid="enchant-pick">
                            {list.length ? 'Soldan büyülenecek bir eşya seç.' : 'Bu masada büyülenecek eşya yok.'}
                        </p>
                    ) : (
                        <>
                            <div className={`ke-target${glow ? ' is-glow' : ''}`} data-glow={glow ? '1' : '0'} key={glow || 'idle'} style={{ '--kp-rar': rarity ? rarityColor(rarity.rarity) : undefined }}>
                                <span className="ke-target-icon"><PanelItemIcon item={slot.item} size={64} ench={!!(slot.ench && Object.keys(slot.ench).length) || glow > 0} /></span>
                                <div className="ke-target-text">
                                    <h3 className="ke-target-name">{itemName}</h3>
                                    <p className="ke-target-sub">{invSlot ? (preview.length ? `${preview.length} büyü` : 'Büyüsüz') : ''}</p>
                                </div>
                            </div>

                            <h3 className="kp-h3">Teklifler</h3>
                            {offers.length === 0 ? (
                                <p className="kp-empty ke-none" data-testid="enchant-nooffers">Bu eşya için eklenebilecek yeni büyü kalmadı.</p>
                            ) : (
                                <div className="ke-offers" role="radiogroup" aria-label="Büyü teklifleri" onKeyDown={onOfferKey}>
                                    {offers.map((o) => {
                                        const st = offerState(o, dust, shards);
                                        const on = chosen && chosen.id === o.id;
                                        const lines = enchantList(o.enchants);
                                        return (
                                            <button
                                                key={o.id}
                                                type="button"
                                                role="radio"
                                                aria-checked={on}
                                                tabIndex={on ? 0 : -1}
                                                data-offer={o.id}
                                                data-testid={`offer-${o.index}`}
                                                className={`ke-offer${on ? ' is-on' : ''}${st.affordable ? '' : ' is-poor'}`}
                                                onClick={() => setOfferId(o.id)}
                                                aria-label={`${o.tierName}. kademe: ${lines.map((l) => l.name).join(', ')}. Bedel ${o.costDust} büyü tozu${o.costShard ? `, ${o.costShard} kıymık` : ''}.${st.affordable ? '' : ' ' + st.reason + '.'}`}
                                            >
                                                <span className="ke-tier" aria-hidden="true">{o.tierName}</span>
                                                <span className="ke-offer-text">
                                                    <b>{lines.map((l) => l.name).join(' · ')}</b>
                                                    <small>{lines.length ? lines[0].text : ''}</small>
                                                    {!st.affordable ? <em>{st.reason}</em> : null}
                                                </span>
                                                <span className="ke-offer-cost">
                                                    <Cost item={DUST} need={o.costDust} have={dust} />
                                                    <Cost item={SHARD} need={o.costShard} have={shards} />
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {chosen ? (
                                <div className={`ke-preview${glow ? ' is-glow' : ''}`} data-testid="enchant-preview">
                                    <h3 className="kp-h3">Sonuç önizlemesi</h3>
                                    <ul className="ke-preview-lines">
                                        {preview.map((p) => (
                                            <li key={p.key} data-state={p.state}>
                                                <b>{p.name}</b>
                                                <span>{p.text}</span>
                                                {p.state !== 'aynı' ? <i>{p.state === 'yeni' ? 'yeni' : 'yükselir'}</i> : null}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            <div className="kp-actions ke-actions" role="group" aria-label="Büyü işlemleri">
                                <button type="button" className="kp-btn kp-btn-good ke-go" disabled={!canEnchant} onClick={doEnchant} data-testid="enchant-go" data-autofocus>
                                    Büyüle
                                </button>
                                <button type="button" className="kp-btn" disabled={!(info && info.canReroll)} onClick={doReroll} data-testid="enchant-reroll">
                                    Yeniden çek ({info ? info.rerollCost : 1} toz)
                                </button>
                                {state && !state.affordable ? <span className="ke-why" role="status">{state.reason}</span> : null}
                            </div>
                        </>
                    )}
                </section>

                <aside className="ke-info" aria-label="Eşya bilgisi">
                    <PanelItemInfo slot={slot} empty="Büyülemek için bir eşya seç." />
                </aside>
            </div>
            <div className="kp-live" role="status" aria-live="polite" data-testid="live">{msg}</div>
        </PanelShell>
    );
};

export default EnchantPanel;
