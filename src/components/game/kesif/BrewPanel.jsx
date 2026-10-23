import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PanelShell from './PanelShell.jsx';
import PanelItemIcon from './PanelItemIcon.jsx';
import { useApiSnapshot, useLiveMessage } from './panelHooks.js';
import { brewView, fmtClock } from './panelMagicUtils.js';
import { itemName } from './panelUtils.js';
import { itemByKey } from '../../../game/kesif/sim/items.js';
import { magicDescribe } from '../../../game/kesif/sim/magic.js';
import './panelsMagic.css';

const POLL_MS = 250;
const BOTTLE = 'item:cam_şişe';
const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

const Ingredient = ({ p }) => {
    const ok = p.have >= p.count;
    return (
        <li className={`kb-ing${ok ? ' is-ok' : ' is-miss'}`} aria-label={`${itemName(p.item)}: ${p.have} / ${p.count}${ok ? '' : ', eksik'}`}>
            <PanelItemIcon item={p.item} size={48} />
            <span className="kb-ing-name">{itemName(p.item)}</span>
            <b className="kb-ing-n">{Math.min(p.have, 99)}/{p.count}</b>
            <span className="kb-ing-mark" aria-hidden="true">{ok ? '✓' : '✕'}</span>
        </li>
    );
};

const Ring = ({ progress, label, done }) => (
    <div className={`kb-ring${done ? ' is-done' : ''}`} role="progressbar" aria-label="Demleme ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} data-testid="brew-progress">
        <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <circle className="kb-ring-bg" cx="50" cy="50" r={RING_R} />
            <circle className="kb-ring-fg" cx="50" cy="50" r={RING_R} strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - progress)} transform="rotate(-90 50 50)" />
        </svg>
        <span className="kb-ring-text">{label}</span>
    </div>
);

/*
 * Simya Kazanı paneli: tarif defteri (keşfedilenler + kilitli girdiler), malzeme yuvaları, şişe adedi (1–3), Demle düğmesi,
 * demleme ilerleme halkası (30 sn) ve hazır iksirleri alma. Tarif, tüm malzemeleri bir kez görülünce defterine yazılır.
 * Props: api (getBrewInfo, startBrew, collectBrew), onClose, version, accessibility, reducedMotion.
 */
const BrewPanel = ({ api, onClose, version = 0, accessibility = false, reducedMotion = false }) => {
    const read = useCallback(() => api.getBrewInfo(), [api]);
    const [info, bump] = useApiSnapshot(read, version);
    const [sel, setSel] = useState(null);
    const [bottles, setBottles] = useState(3);
    const [msg, announce] = useLiveMessage();

    useEffect(() => {
        const t = setInterval(bump, POLL_MS);
        return () => clearInterval(t);
    }, [bump]);

    const recipes = useMemo(() => (info && info.recipes ? info.recipes : []), [info]);
    const view = brewView(info);
    const cauldron = info ? info.cauldron : null;
    const have = info ? info.bottles : 0;
    const maxB = info ? info.maxBottles : 3;
    const current = recipes.find((r) => r.id === sel) || recipes.find((r) => r.discovered && r.craftable) || recipes.find((r) => r.discovered) || recipes[0] || null;
    // varsayılan seçim bir kez belirlenince KİLİTLENİR: malzeme toplanıp tarif yapılabilir olunca vurgu kendiliğinden başka tarife atlamaz
    if (!sel && current) setSel(current.id);
    const bCount = Math.max(1, Math.min(bottles, maxB, Math.max(1, have)));
    const canStart = !!(current && current.discovered && current.craftable && have >= 1 && view === 'bos');

    const doStart = () => {
        if (!current) return;
        const r = api.startBrew(current.id, bCount);
        announce(r && r.ok ? `${current.name} demlenmeye başladı: ${r.bottles} şişe.` : (r && r.message) || 'Demlenemedi.');
        bump();
    };
    const doCollect = () => {
        const r = api.collectBrew();
        announce(r && r.ok ? `${itemName(r.items[0].item)} ×${r.items[0].count} alındı.` : (r && r.message) || 'Alınamadı.');
        bump();
    };

    const outItem = current ? itemByKey(current.out) : null;
    const outLines = current ? magicDescribe({ item: current.out }) : [];
    const brewingRec = cauldron ? recipes.find((r) => r.id === cauldron.recipeId) : null;
    const known = recipes.filter((r) => r.discovered).length;

    return (
        <PanelShell
            title="Simya Kazanı"
            subtitle={`${known}/${recipes.length} tarif keşfedildi`}
            onClose={onClose}
            testId="brew-panel"
            className="kp-brew"
            accessibility={accessibility}
            reducedMotion={reducedMotion}
        >
            {!info ? (
                <p className="kp-empty" data-testid="brew-closed">Açık bir kazan yok. Bir Simya Kazanı'na yaklaşıp etkileşime geç.</p>
            ) : (
                <div className="kb-layout">
                    <section className="kb-book" aria-label="Tarif defteri">
                        <h3 className="kp-h3">Tarif defteri</h3>
                        <ul className="kb-list" data-testid="brew-book">
                            {recipes.map((r) => {
                                const on = current && current.id === r.id;
                                const it = itemByKey(r.out);
                                return (
                                    <li key={r.id}>
                                        <button
                                            type="button"
                                            className={`kb-recipe${on ? ' is-on' : ''}${r.discovered ? '' : ' is-locked'}${r.craftable ? ' is-ready' : ''}`}
                                            aria-pressed={!!on}
                                            data-testid={`brew-recipe-${r.id}`}
                                            onClick={() => setSel(r.id)}
                                            aria-label={r.discovered ? `${r.name}${r.craftable ? ', malzemeler hazır' : ', malzeme eksik'}` : 'Kilitli tarif'}
                                        >
                                            <span className="kb-recipe-ico" style={{ '--kb-col': it ? `#${(it.color >>> 0).toString(16).padStart(6, '0')}` : '#b08cff' }}>
                                                {r.discovered ? <PanelItemIcon item={r.out} size={48} /> : <span aria-hidden="true">?</span>}
                                            </span>
                                            <span className="kb-recipe-text">
                                                <b>{r.discovered ? r.name : 'Bilinmeyen tarif'}</b>
                                                <small>{r.discovered ? (r.craftable ? 'Malzemeler hazır' : 'Malzeme eksik') : `${r.in.filter((p) => p.seen).length}/${r.in.length} malzeme görüldü`}</small>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>

                    <section className="kb-main" aria-label="Demleme">
                        {view !== 'bos' ? (
                            <div className="kb-brewing" data-testid="brew-active" data-state={view}>
                                <Ring progress={cauldron.progress01} done={view === 'hazir'} label={view === 'hazir' ? 'Hazır' : fmtClock(cauldron.secondsLeft)} />
                                <div className="kb-brewing-text">
                                    <h3>{brewingRec ? brewingRec.name : cauldron.name}</h3>
                                    <p>{view === 'hazir' ? `${cauldron.bottles} şişe iksir hazır.` : `${cauldron.bottles} şişe demleniyor…`}</p>
                                    <button type="button" className="kp-btn kp-btn-good" disabled={view !== 'hazir'} onClick={doCollect} data-testid="brew-collect" data-autofocus>
                                        {view === 'hazir' ? 'Şişeleri al' : 'Demleniyor…'}
                                    </button>
                                </div>
                            </div>
                        ) : current ? (
                            <div className="kb-detail" data-testid="brew-detail">
                                {current.discovered ? (
                                    <>
                                        <div className="kb-out">
                                            <span className="kb-out-ico"><PanelItemIcon item={current.out} size={64} /></span>
                                            <div>
                                                <h3 className="kb-out-name" style={{ color: outItem ? `#${(outItem.color >>> 0).toString(16).padStart(6, '0')}` : undefined }}>{current.name}</h3>
                                                <p className="kb-out-desc">{outItem ? outItem.desc : ''}</p>
                                                {outLines.length ? <p className="kb-out-lines">{outLines.join(' · ')}</p> : null}
                                            </div>
                                        </div>
                                        <h3 className="kp-h3">Malzemeler (bir kez harcanır)</h3>
                                        <ul className="kb-ings" aria-label="Malzemeler">
                                            {current.in.map((p) => <Ingredient key={p.item} p={p} />)}
                                            <li className={`kb-ing${have >= bCount ? ' is-ok' : ' is-miss'}`} aria-label={`Boş şişe: ${have} / ${bCount}`}>
                                                <PanelItemIcon item={BOTTLE} size={48} />
                                                <span className="kb-ing-name">Boş şişe</span>
                                                <b className="kb-ing-n">{Math.min(have, 99)}/{bCount}</b>
                                                <span className="kb-ing-mark" aria-hidden="true">{have >= bCount ? '✓' : '✕'}</span>
                                            </li>
                                        </ul>
                                        <div className="kb-bottles" role="radiogroup" aria-label="Şişe adedi">
                                            <span className="kb-bottles-label">Şişe</span>
                                            {[1, 2, 3].map((n) => (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={bCount === n}
                                                    className={`kp-chip${bCount === n ? ' is-on' : ''}`}
                                                    disabled={n > Math.max(1, have) || n > maxB}
                                                    onClick={() => setBottles(n)}
                                                    data-testid={`brew-bottles-${n}`}
                                                >
                                                    {n}
                                                </button>
                                            ))}
                                            <span className="kb-time">{current.time} sn</span>
                                        </div>
                                        <div className="kp-actions kb-actions">
                                            <button type="button" className="kp-btn kp-btn-good" disabled={!canStart} onClick={doStart} data-testid="brew-start" data-autofocus>
                                                Demle
                                            </button>
                                            {!canStart ? (
                                                <span className="ke-why" role="status">
                                                    {have < 1 ? 'Boş cam şişen yok.' : !current.craftable ? 'Eksik malzemeler var.' : ''}
                                                </span>
                                            ) : null}
                                        </div>
                                    </>
                                ) : (
                                    <div className="kb-locked" data-testid="brew-locked">
                                        <span className="kb-lock" aria-hidden="true">?</span>
                                        <h3>Bilinmeyen tarif</h3>
                                        <p>Bu tarifin tüm malzemelerini bir kez bulduğunda deftere yazılır.</p>
                                        <ul className="kb-hints">
                                            {current.in.map((p) => (
                                                <li key={p.item} className={p.seen ? 'is-seen' : ''}>
                                                    {p.seen ? <><PanelItemIcon item={p.item} size={32} /> {itemName(p.item)}</> : <span>??? malzeme</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </section>
                </div>
            )}
            <div className="kp-live" role="status" aria-live="polite" data-testid="live">{msg}</div>
        </PanelShell>
    );
};

export default BrewPanel;
