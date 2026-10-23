import React, { useMemo, useState } from 'react';
import PanelItemIcon from './PanelItemIcon.jsx';
import { itemName } from './panelUtils.js';
import {
  FREQ_GLYPHS, drillView, formatEU, freqGlyph, freqName, freqString, liftView, parseFreq, teleporterView,
} from './panelTechUtils.js';
import { FREQ_LENGTH } from '../../../game/kesif/sim/techData.js';
import { LAMP_HUES } from '../../../game/kesif/sim/techMachines.js';

/*
 * Makine panelinin türe özel bölümleri. Hepsi {info, act, config} alır:
 *   act({type, item?, count?, dir?}) → api.machineAction sonucu; config(cfg) → api.setMachineConfig sonucu.
 * Düğme hedefleri ≥ 44 px; renge ek olarak metin/şekil (renk körlüğü).
 */

const Slot = ({ item, count, label, empty, testId }) => (
    <div className={`km-slot${item ? ' has-item' : ''}`} role="group" aria-label={item ? `${label}: ${itemName(item)} ×${count}` : `${label}: boş`} data-testid={testId}>
        <span className="km-slot-label">{label}</span>
        <span className="km-slot-box">
            {item ? <PanelItemIcon item={item} size={48} /> : <span className="km-slot-empty" aria-hidden="true">{empty || '—'}</span>}
            {item && count > 1 ? <b className="km-slot-n">{count}</b> : null}
        </span>
        <span className="km-slot-name">{item ? itemName(item) : 'Boş'}</span>
    </div>
);

const Ring = ({ value, label, testId, caption }) => {
    const R = 44;
    const C = 2 * Math.PI * R;
    const v = Math.max(0, Math.min(1, value || 0));
    return (
        <div className="km-ring" role="progressbar" aria-label={caption} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} data-testid={testId}>
            <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
                <circle className="km-ring-bg" cx="50" cy="50" r={R} />
                <circle className="km-ring-fg" cx="50" cy="50" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - v)} transform="rotate(-90 50 50)" />
            </svg>
            <span className="km-ring-text">{label}</span>
        </div>
    );
};

const Bar = ({ value, max, label, tone = 'good', testId, text }) => {
    const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
    return (
        <div className="km-meter" data-testid={testId}>
            <div className="km-meter-head">
                <span>{label}</span>
                <b>{text || `${formatEU(value)} / ${formatEU(max)}`}</b>
            </div>
            <span className={`km-bar km-bar-${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-valuetext={`${pct} yüzde`}>
                <span style={{ width: `${pct}%` }} />
            </span>
        </div>
    );
};

const Why = ({ text }) => (text ? <p className="km-why" role="status">{text}</p> : null);

/* ----------------------------------------------------------------- jeneratör */
export const GeneratorControls = ({ info, act }) => {
    const total = info.burnTotal > 0 ? info.burnTotal : 1;
    const frac = info.burning ? info.burnLeft / total : 0;
    const fuels = info.fuels || [];
    return (
        <div className="km-body" data-testid="km-generator">
            <div className="km-row">
                <Slot item={info.fuel ? info.fuel.item : null} count={info.fuel ? info.fuel.count : 0} label="Yakıt" testId="km-fuel-slot" />
                <Ring value={frac} label={info.burning ? `${Math.ceil(info.burnLeft)} sn` : 'Boşta'} caption="Yanma süresi" testId="km-burn" />
                <div className="km-facts">
                    <b>{info.rate} EU/sn</b>
                    <small>Yalnız enerji gerekince yakıt yakar; piller doluyken yakmaz.</small>
                    <button type="button" className="kp-btn" disabled={!info.fuel} onClick={() => act({ type: 'takeFuel' })} data-testid="km-take-fuel">Yakıtı geri al</button>
                </div>
            </div>
            <h3 className="kp-h3">Çantandaki yakıtlar</h3>
            {fuels.length === 0 ? <p className="km-empty">Çantanda yakıt yok: kömür, odun kömürü, kütük, tahta ya da sopa getir.</p> : (
                <ul className="km-list">
                    {fuels.map((f) => (
                        <li key={f.item}>
                            <button type="button" className="km-item" onClick={() => act({ type: 'fuel', item: f.item, count: f.count })} data-testid={`km-fuel-${f.item}`} aria-label={`${itemName(f.item)} ×${f.count} ekle, ${f.seconds} saniye yanar`}>
                                <PanelItemIcon item={f.item} size={40} />
                                <span className="km-item-name">{itemName(f.item)}</span>
                                <small>×{f.count} · {f.seconds} sn</small>
                                <span className="km-item-add" aria-hidden="true">Ekle</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

/* ----------------------------------------------------------------------- ocak */
export const FurnaceControls = ({ info, act }) => {
    const smelt = info.smeltables || [];
    return (
        <div className="km-body" data-testid="km-furnace">
            <div className="km-row">
                <Slot item={info.inItem} count={info.inCount} label="Girdi" testId="km-in-slot" />
                <Ring value={info.progress} label={info.on ? `${Math.round(info.progress * 100)}%` : 'Boşta'} caption="Eritme ilerlemesi" testId="km-smelt" />
                <Slot item={info.outItem} count={info.outCount} label="Ürün" testId="km-out-slot" />
            </div>
            <div className="km-actions">
                <button type="button" className="kp-btn kp-btn-good" disabled={!info.outItem} onClick={() => act({ type: 'takeSmelt' })} data-testid="km-take-out">Ürünleri al</button>
                <button type="button" className="kp-btn" disabled={!info.inItem} onClick={() => act({ type: 'takeInput' })} data-testid="km-take-in">Girdiyi geri al</button>
            </div>
            <p className="km-note">Normal ocaktan 2 kat hızlı ({info.time} sn / parça). Yakıt yerine enerji ister.</p>
            <h3 className="kp-h3">Eritilebilir eşyaların</h3>
            {smelt.length === 0 ? <p className="km-empty">Çantanda eritilecek eşya yok (cevher, kum, çiğ yemek, odun).</p> : (
                <ul className="km-list">
                    {smelt.map((f) => (
                        <li key={f.item}>
                            <button type="button" className="km-item" onClick={() => act({ type: 'smelt', item: f.item, count: f.count })} data-testid={`km-smelt-${f.item}`} aria-label={`${itemName(f.item)} ×${f.count} ekle`}>
                                <PanelItemIcon item={f.item} size={40} />
                                <span className="km-item-name">{itemName(f.item)}</span>
                                <small>×{f.count} → {f.out ? itemName(f.out) : ''}</small>
                                <span className="km-item-add" aria-hidden="true">Ekle</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

/* -------------------------------------------------------------------- madenci */
export const DrillControls = ({ info, act, config }) => {
    const v = drillView(info);
    return (
        <div className="km-body" data-testid="km-drill">
            <div className="km-chips" role="radiogroup" aria-label="Kazı modu">
                <button type="button" role="radio" aria-checked={v.mode === 'column'} className={`kp-chip km-chip${v.mode === 'column' ? ' is-on' : ''}`} onClick={() => config({ mode: 'column' })} data-testid="km-mode-column">Sütun (1 blok)</button>
                <button type="button" role="radio" aria-checked={v.mode === 'alan'} className={`kp-chip km-chip${v.mode === 'alan' ? ' is-on' : ''}`} onClick={() => config({ mode: 'alan' })} data-testid="km-mode-alan">Alan (5×5)</button>
            </div>
            <dl className="km-stats">
                <div><dt>Derinlik</dt><dd data-testid="km-depth">{v.depth} blok</dd></div>
                <div><dt>Kazılan blok</dt><dd data-testid="km-mined">{v.mined}</dd></div>
                <div><dt>Tampon</dt><dd data-testid="km-buffer-total">{v.total} eşya</dd></div>
            </dl>
            <p className={`km-status${v.stopped ? ' is-bad' : ''}`} role="status" data-testid="km-drill-status">{v.status}</p>
            {v.buffer.length ? (
                <ul className="km-chips-row" aria-label="Tampondaki eşyalar">
                    {v.buffer.slice(0, 12).map((s, i) => (
                        <li key={`${s.item}-${i}`} className="km-chip-item" title={itemName(s.item)}>
                            <PanelItemIcon item={s.item} size={32} />
                            <b>{s.count}</b>
                        </li>
                    ))}
                </ul>
            ) : null}
            <div className="km-actions">
                <button type="button" className="kp-btn kp-btn-good" disabled={v.total === 0} onClick={() => act({ type: 'drillTake' })} data-testid="km-drill-take">Tamponu boşalt</button>
                <button type="button" className="kp-btn" disabled={!v.stopped} onClick={() => config({ restart: true })} data-testid="km-drill-restart">Yeniden başlat</button>
            </div>
            <p className="km-note">Hava ve sıvıyı atlar; kırılamaz kayaya gelince durur. Yanında sandık varsa eşyaları oraya boşaltır.</p>
        </div>
    );
};

/* ----------------------------------------------------------------- ışınlayıcı */
export const TeleporterControls = ({ info, act, config }) => {
    const server = useMemo(() => parseFreq(info.freq) || null, [info.freq]);
    const [ds, setDs] = useState(() => ({ base: info.freq, draft: server || [0, 1, 2, 3].slice(0, FREQ_LENGTH) }));
    // sunucudaki frekans değişince (başka yerden ayarlandı/temizlendi) taslak ona eşitlenir (türetilmiş durum: etki yok)
    if (ds.base !== info.freq) setDs({ base: info.freq, draft: server || ds.draft });
    const draft = ds.draft;
    const setDraft = (fn) => setDs((cur) => ({ base: cur.base, draft: fn(cur.draft) }));
    const [slot, setSlot] = useState(0);
    const [msg, setMsg] = useState('');
    const v = teleporterView(info);
    const dirty = !server || freqString(draft) !== info.freq;
    const apply = () => {
        const r = config({ freq: freqString(draft) });
        setMsg(r && r.ok ? 'Frekans ayarlandı.' : (r && r.message) || 'Ayarlanamadı.');
    };
    const clear = () => {
        const r = config({ freq: null });
        setMsg(r && r.ok ? 'Frekans temizlendi.' : (r && r.message) || '');
    };
    return (
        <div className="km-body" data-testid="km-teleporter">
            <h3 className="kp-h3">Frekans (4 sembol)</h3>
            <div className="km-freq" role="group" aria-label="Frekans sembolleri">
                {draft.map((s, i) => (
                    <button
                        key={i}
                        type="button"
                        className={`km-freq-slot${slot === i ? ' is-on' : ''}`}
                        aria-pressed={slot === i}
                        aria-label={`${i + 1}. sembol: ${freqName(s)}`}
                        onClick={() => setSlot(i)}
                        data-testid={`km-freq-slot-${i}`}
                    >
                        <span className="km-glyph" aria-hidden="true">{freqGlyph(s)}</span>
                        <small>{freqName(s)}</small>
                    </button>
                ))}
            </div>
            <div className="km-palette" role="radiogroup" aria-label={`${slot + 1}. sembolü seç`}>
                {FREQ_GLYPHS.map((g, n) => (
                    <button
                        key={g}
                        type="button"
                        role="radio"
                        aria-checked={draft[slot] === n}
                        className={`km-pal${draft[slot] === n ? ' is-on' : ''}`}
                        aria-label={freqName(n)}
                        onClick={() => setDraft((d) => d.map((x, k) => (k === slot ? n : x)))}
                        data-testid={`km-freq-pick-${n}`}
                    >
                        <span aria-hidden="true">{g}</span>
                    </button>
                ))}
            </div>
            <div className="km-actions">
                <button type="button" className="kp-btn kp-btn-good" disabled={!dirty} onClick={apply} data-testid="km-freq-apply">Uygula</button>
                <button type="button" className="kp-btn" disabled={!info.freq} onClick={clear} data-testid="km-freq-clear">Temizle</button>
            </div>
            {msg ? <p className="km-status" role="status" data-testid="km-freq-msg">{msg}</p> : null}
            <Bar value={info.buf} max={info.cap} label="Platform tamponu" tone="accent" testId="km-tp-buf" />
            <dl className="km-stats">
                <div><dt>Eş platform</dt><dd data-testid="km-partner">{v.partner ? `${v.partner.x}, ${v.partner.y}, ${v.partner.z}` : 'yok'}</dd></div>
                <div><dt>Bedel</dt><dd data-testid="km-cost">{info.cost ? `${info.cost} EU` : '—'}</dd></div>
                <div><dt>Bekleme</dt><dd>{info.cooldown > 0 ? `${Math.ceil(info.cooldown)} sn` : 'hazır'}</dd></div>
            </dl>
            <div className="km-actions">
                <button type="button" className="kp-btn kp-btn-good" disabled={!v.ready} onClick={() => act({ type: 'teleport' })} data-testid="km-teleport">Işınlan</button>
            </div>
            <Why text={v.ready ? '' : v.reason} />
        </div>
    );
};

/* ------------------------------------------------------------------- asansör */
export const LiftControls = ({ info, act }) => {
    const v = liftView(info);
    return (
        <div className="km-body" data-testid="km-lift">
            <Bar value={info.buf} max={info.cap} label="Platform tamponu" tone="accent" testId="km-lift-buf" />
            <dl className="km-stats">
                <div><dt>Yukarıdaki platform</dt><dd>{info.up !== null && info.up !== undefined ? `y = ${info.up}` : 'yok'}</dd></div>
                <div><dt>Aşağıdaki platform</dt><dd>{info.down !== null && info.down !== undefined ? `y = ${info.down}` : 'yok'}</dd></div>
            </dl>
            <div className="km-actions">
                <button type="button" className="kp-btn kp-btn-good" disabled={!v.up} onClick={() => act({ type: 'lift', dir: 1 })} data-testid="km-lift-up">▲ Yukarı çık</button>
                <button type="button" className="kp-btn kp-btn-good" disabled={!v.down} onClick={() => act({ type: 'lift', dir: -1 })} data-testid="km-lift-down">▼ Aşağı in</button>
            </div>
            <Why text={v.reason} />
            <p className="km-note">Sağ tık: yukarı. Çömelip sağ tık: aşağı. Aynı sütundaki platformlara taşır (en çok 96 blok).</p>
        </div>
    );
};

/* ---------------------------------------------------------------------- pil / şarj */
export const BatteryControls = ({ info, act }) => {
    const isBattery = info.type === 'pil';
    const value = isBattery ? info.stored : info.buf;
    return (
        <div className="km-body" data-testid="km-battery">
            <Bar value={value} max={info.cap} label={isBattery ? 'Depolanan enerji' : 'Şarj tamponu'} tone="accent" testId="km-store" />
            <div className="km-actions">
                <button type="button" className="kp-btn kp-btn-good" disabled={value <= 0 || !(info.chargeNeed > 0)} onClick={() => act({ type: 'charge' })} data-testid="km-charge">Eşyalarımı şarj et</button>
            </div>
            <Why text={value <= 0 ? 'Kaynak boş: ağa enerji bağla.' : !(info.chargeNeed > 0) ? 'Çantandaki şarjlı eşyaların hepsi dolu.' : `Çantandaki eşyaların ${formatEU(info.chargeNeed)} şarja ihtiyacı var.`} />
            <p className="km-note">{isBattery ? 'Elinde şarjlı eşyayla bu bloğa sağ tıklayınca da doldurur. Jeneratör yalnız ağda tüketici varken yanar; artan enerji pili doldurur (güneş paneli tüketici olmadan da doldurur).' : 'Yanında durunca çantandaki şarjlı eşyaları (çubuk, çanta, zırh) kendiliğinden doldurur (menzil 3,5 blok).'}</p>
        </div>
    );
};

/* --------------------------------------------------------------------- düğme */
export const ButtonControls = ({ info, act, config }) => (
    <div className="km-body" data-testid="km-button">
        <div className="km-chips" role="radiogroup" aria-label="Düğme modu">
            <button type="button" role="radio" aria-checked={info.mode === 'toggle'} className={`kp-chip km-chip${info.mode === 'toggle' ? ' is-on' : ''}`} onClick={() => config({ mode: 'toggle' })} data-testid="km-btn-toggle">Aç / kapa</button>
            <button type="button" role="radio" aria-checked={info.mode === 'pulse'} className={`kp-chip km-chip${info.mode === 'pulse' ? ' is-on' : ''}`} onClick={() => config({ mode: 'pulse' })} data-testid="km-btn-pulse">Darbe (3 sn)</button>
        </div>
        <div className="km-switch-row">
            <button type="button" className={`km-switch${info.on ? ' is-on' : ''}`} role="switch" aria-checked={!!info.on} onClick={() => act({ type: 'press' })} data-testid="km-switch">
                <span className="km-switch-knob" aria-hidden="true" />
                <span className="km-switch-text">{info.on ? 'AÇIK' : 'KAPALI'}</span>
            </button>
            <p className="km-note">Yalnız açıkken akımı geçirir: kablo hattının arasına koyarsan devrenin anahtarı olur.</p>
        </div>
    </div>
);

/* ------------------------------------------------------------------- sensör */
export const SensorControls = ({ info, config }) => {
    const set = (r) => config({ radius: Math.max(2, Math.min(8, r)) });
    return (
        <div className="km-body" data-testid="km-sensor">
            <div className="km-stepper" role="group" aria-label="Algılama menzili">
                <button type="button" className="kp-btn" disabled={info.radius <= 2} onClick={() => set(info.radius - 1)} aria-label="Menzili azalt" data-testid="km-radius-minus">−</button>
                <output className="km-radius" aria-live="polite" data-testid="km-radius">{info.radius} blok</output>
                <button type="button" className="kp-btn" disabled={info.radius >= 8} onClick={() => set(info.radius + 1)} aria-label="Menzili artır" data-testid="km-radius-plus">+</button>
            </div>
            <p className="km-note">Menzildeki oyuncuyu algılayınca akımı geçirir (2–8 blok). Kapı ya da lamba önüne koy.</p>
        </div>
    );
};

/* ---------------------------------------------------------------- lamba (renk) */
const swatch = (rgb) => `rgb(${rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255)).join(',')})`;
export const LampControls = ({ info, config }) => {
    const hue = info.hue || 0;
    return (
        <div className="km-body" data-testid="km-lamp">
            <h3 className="kp-h3">Işık rengi</h3>
            <div className="km-hues" role="radiogroup" aria-label="Lamba rengi">
                {LAMP_HUES.map((h, n) => (
                    <button
                        key={h.key}
                        type="button"
                        role="radio"
                        aria-checked={hue === n}
                        className={`km-hue${hue === n ? ' is-on' : ''}`}
                        onClick={() => config({ hue: n })}
                        data-testid={`km-hue-${n}`}
                    >
                        <span className="km-hue-dot" style={{ background: swatch(h.rgb) }} aria-hidden="true">{hue === n ? '✓' : ''}</span>
                        <small>{h.name}</small>
                    </button>
                ))}
            </div>
            <p className="km-note">Yanan lambanın halesi seçtiğin renkte parlar (1 EU/sn). Renk, ışığın parlaklığını değiştirmez.</p>
        </div>
    );
};

/* ------------------------------------------------- açma / kapama anahtarı (ortak) */
export const PowerSwitch = ({ info, config }) => {
    const off = !!info.off;
    return (
        <div className="km-switch-row km-power" data-testid="km-power">
            <button type="button" className={`km-switch${off ? '' : ' is-on'}`} role="switch" aria-checked={!off} aria-label="Makine anahtarı" onClick={() => config({ off: !off })} data-testid="km-power-switch">
                <span className="km-switch-knob" aria-hidden="true" />
                <span className="km-switch-text">{off ? 'KAPALI' : 'AÇIK'}</span>
            </button>
            <p className="km-note">{off ? 'Kapalı: enerji çekmez ve çalışmaz.' : 'Kapatırsan enerji çekmez; açınca kaldığı yerden sürer.'}</p>
        </div>
    );
};

/* ----------------------------------------------------------- güneş / kapı (bilgi) */
export const InfoControls = ({ info }) => (
    <div className="km-body" data-testid="km-info">
        {info.type === 'gunes' ? (
            <p className="km-note">En çok 4 EU/sn (gün ışığı, hava ve gökyüzü erişimine göre). Yağmurda zayıflar, fırtınada neredeyse durur, geceleri üretmez.{info.sky ? '' : ' Şu an üstü kapalı: üstündeki blokları kaldır.'}</p>
        ) : null}
        {info.type === 'kapi' ? <p className="km-note">Enerji varken açılır, yoksa kapanır (0,5 EU/sn). İçeride biri varken kapanmaz.</p> : null}
    </div>
);

export { Bar, Ring, Slot };
