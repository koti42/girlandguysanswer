import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { LuCoins, LuKey, LuLock, LuPaintbrush, LuCar, LuCheck } from 'react-icons/lu';
import PanelShell from '../PanelShell.jsx';
import { useApiSnapshot, useLiveMessage } from '../panelHooks.js';
import { VEHICLE_DEFS } from '../../../../game/kesif/sim/city/vehicle/vehicleData.js';
import { classStats } from './vehicleHudUtils.js';
import {
  TAB_LABEL, TAB_ORDER, apiMessage, buyState, previewModel, rentState, shapePath, swatchHex,
} from './garageUtils.js';
import './vehicleHud.css';
import './garagePanel.css';

/*
 * Garaj paneli (hud.ui === 'garage'; garaj terminali ya da kiralama noktası). Sekmeler: Garajım (aktif yap, çağır, boya/neon/zemin ışığı/jant/korna) ·
 * Satın al (Kredi fiyatı, sınıf özellikleri, kilit) · Kirala (20 Kredi'den, 10 dk). Renk örnekleri ŞEKİL + ADLA ayrışır (renk körü dostu).
 * role="dialog" (PanelShell: odak tuzağı, Esc, açılışta odak). Ekran okuyucu: sonuçlar role="status" ile okunur. Hedefler ≥ 44 px.
 *
 * Props: api (getGarage, setGarage, buyVehicle, summonVehicle, rentVehicle), onClose, version, accessibility, reducedMotion
 */
const Glyph = ({ shape }) => (
  <svg className="kg-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d={shapePath(shape)} />
  </svg>
);

/** Yandan görünüm silueti (renkler seçili kozmetikten). */
export const VehiclePreview = memo(function VehiclePreview({ model }) {
  const { kind, body, accent, neon, glow } = model;
  const wheel = (cx, r) => (
    <g key={cx} className={'kg-wheel kg-wheel-' + model.wheelStyle}>
      <circle cx={cx} cy={52} r={r} className="kg-tyre" />
      <circle cx={cx} cy={52} r={r * 0.5} className="kg-rim" style={{ stroke: model.wheelStyle === 'neon' ? neon : undefined }} />
    </g>
  );
  let shape;
  if (kind === 'motor') {
    shape = (
      <g>
        <path d="M30 40l12-14h14l6 8 10 2v4H44z" fill={body} className="kg-body" />
        <path d="M44 28l8 0 5 6H46z" fill={accent} />
        <path d="M70 34l8-8 4 2-6 8z" fill={accent} />
        {wheel(34, 9)}
        {wheel(80, 9)}
      </g>
    );
  } else if (kind === 'hover') {
    shape = (
      <g>
        <path d="M18 44c6-14 24-18 48-18 14 0 22 6 30 12l-4 6H26z" fill={body} className="kg-body" />
        <path d="M52 29h22l8 7H54z" fill={accent} />
        <ellipse cx="60" cy="56" rx="38" ry="4.500" fill={neon} opacity="0.55" />
      </g>
    );
  } else if (kind === 'tahta') {
    shape = (
      <g>
        <path d="M20 46c8-4 52-4 70 0 4 1 4 5 0 6-18 4-62 4-70 0-4-1-4-5 0-6z" fill={body} className="kg-body" />
        <path d="M30 47h50v2H30z" fill={accent} />
        <ellipse cx="55" cy="58" rx="34" ry="3.500" fill={neon} opacity="0.55" />
      </g>
    );
  } else {
    const truck = model.cls === 'kamyonet';
    shape = (
      <g>
        {truck ? (
          <>
            <path d="M12 44V30h26l8-10h24l6 12h14v12z" fill={body} className="kg-body" />
            <path d="M12 30h26v14H12z" fill={accent} opacity="0.35" />
            <path d="M48 22h20l4 9H46z" className="kg-glass" />
          </>
        ) : (
          <>
            <path d="M10 44l4-10c2-6 8-8 14-8l12-8h26l12 10c6 1 14 4 14 10v6z" fill={body} className="kg-body" />
            <path d="M44 20h20l9 9H40z" className="kg-glass" />
            <path d="M14 38h88v3H14z" fill={accent} />
          </>
        )}
        {wheel(32, 9)}
        {wheel(86, 9)}
      </g>
    );
  }
  return (
    <svg className="kg-prev" viewBox="0 0 120 70" role="img" aria-label="Araç ön izlemesi" data-testid="garage-preview">
      {glow ? <ellipse cx="60" cy="60" rx="46" ry="5" fill={glow} className="kg-glow" data-pattern={model.pattern} /> : null}
      <g>{shape}</g>
    </svg>
  );
});

const StatBars = ({ cls }) => (
  <ul className="kg-stats" aria-label="Sınıf özellikleri">
    {classStats(cls).map((s) => (
      <li key={s.key}>
        <span className="kg-stat-name">{s.label}</span>
        <span className="kg-stat-bar" aria-hidden="true">
          <i style={{ width: Math.round(s.frac * 100) + '%' }} />
        </span>
        <b>{s.text}</b>
      </li>
    ))}
  </ul>
);

const Swatches = ({ label, list, value, onPick, withHex = true }) => (
  <div className="kg-sw-group" role="group" aria-label={label}>
    <span className="kg-sw-title">{label}</span>
    <div className="kg-sw-row">
      {list.map((s, i) => (
        <button
          key={s.name + i}
          type="button"
          className="kg-sw"
          aria-pressed={value === i}
          aria-label={s.name}
          title={s.name}
          data-testid={'sw-' + label + '-' + i}
          onClick={() => onPick(i)}
          style={withHex ? { '--kg-c': swatchHex(list, i) } : undefined}
        >
          <Glyph shape={s.shape} />
          {value === i ? <LuCheck className="kg-sw-tick" aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  </div>
);

const GaragePanel = ({
  api, onClose, version = 0, accessibility = false, reducedMotion = false,
}) => {
  const read = useCallback(() => (api && typeof api.getGarage === 'function' ? api.getGarage() : null), [api]);
  const [view, bump] = useApiSnapshot(read, version);
  const [tab, setTab] = useState('mine');
  const [sel, setSel] = useState(0);
  const [pick, setPick] = useState('');
  const [msg, announce] = useLiveMessage();

  // sunucu tarafı her açılışta bir kez yenilensin (kredi/yarı yolda biten kiralama)
  useEffect(() => {
    const id = setInterval(bump, 1500);
    return () => clearInterval(id);
  }, [bump]);

  const owned = useMemo(() => (view && Array.isArray(view.owned) ? view.owned : []), [view]);
  const catalog = useMemo(() => (view && Array.isArray(view.catalog) ? view.catalog : []), [view]);
  const kredi = view ? view.kredi : 0;
  const idx = Math.min(sel, Math.max(0, owned.length - 1));
  const cur = owned[idx] || null;
  const catSel = catalog.find((c) => c.cls === pick) || catalog[0] || null;

  const doPaint = (patch) => {
    if (!cur || !api) return;
    const cos = Object.assign({}, cur.cos, patch);
    if (patch.under) cos.under = Object.assign({}, cur.cos.under, patch.under);
    const ok = api.setGarage({ paint: { idx: cur.idx, cos } });
    if (!ok) announce('Boya uygulanamadı.');
    bump();
  };
  const doActive = () => {
    if (!cur) return;
    const ok = api.setGarage({ active: cur.idx });
    announce(ok ? cur.name + ' aktif araç oldu.' : 'Aktif araç değiştirilemedi.');
    bump();
  };
  const doSummon = () => {
    const r = api.summonVehicle();
    announce(apiMessage('summon', r));
    bump();
    if (r && r.ok && onClose) onClose();
  };
  const doBuy = (entry) => {
    const r = api.buyVehicle(entry.cls);
    announce(apiMessage('buy', r));
    bump();
    if (r && r.ok) {
      setTab('mine');
    }
  };
  const doRent = (entry) => {
    const r = api.rentVehicle(entry.cls);
    announce(apiMessage('rent', r));
    bump();
    if (r && r.ok && onClose) onClose();
  };

  const header = (
    <div className="kg-wallet" role="group" aria-label={'Bakiye ' + kredi + ' Kredi'} data-testid="garage-kredi">
      <LuCoins aria-hidden="true" />
      <b>{kredi}</b>
      <span>Kredi</span>
    </div>
  );

  if (!view) {
    return (
      <PanelShell title="Garaj" onClose={onClose} accessibility={accessibility} reducedMotion={reducedMotion} testId="garage-panel" size="md">
        <p className="kg-empty" role="status">Garaj şu an kullanılamıyor.</p>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      title="Garaj"
      subtitle={owned.length + ' / ' + view.capacity + ' araç · ' + view.km + ' km sürdün'}
      onClose={onClose}
      accessibility={accessibility}
      reducedMotion={reducedMotion}
      testId="garage-panel"
      size="md"
      headerExtra={header}
    >
      <div className="kp-tabs kg-tabs" role="tablist" aria-label="Garaj bölümleri">
        {TAB_ORDER.map((t) => (
          <button key={t} type="button" role="tab" id={'kg-tab-' + t} aria-selected={tab === t} aria-controls={'kg-pane-' + t} className="kp-tab" data-testid={'tab-' + t} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      <p className="kv-sr" role="status" aria-live="polite" data-testid="garage-live">{msg}</p>

      {tab === 'mine' ? (
        <div role="tabpanel" id="kg-pane-mine" aria-labelledby="kg-tab-mine" className="kg-pane">
          {owned.length === 0 ? (
            <p className="kg-empty" data-testid="garage-empty">Garajın boş. “Satın al” sekmesinden araç alabilirsin; Süzülkay hediyedir.</p>
          ) : (
            <div className="kg-mine">
              <ul className="kg-list" aria-label="Araçların">
                {owned.map((o, i) => (
                  <li key={o.idx}>
                    <button type="button" className="kg-card" aria-pressed={i === idx} data-testid={'owned-' + i} onClick={() => setSel(i)}>
                      <LuCar aria-hidden="true" />
                      <span className="kg-card-name">{o.name}</span>
                      {view.active === o.idx ? <span className="kg-badge" data-testid="active-badge"><LuKey aria-hidden="true" /> Aktif</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
              {cur ? (
                <div className="kg-detail">
                  <VehiclePreview model={previewModel(view, cur.cls, cur.cos)} />
                  <StatBars cls={cur.cls} />
                  <div className="kg-actions">
                    <button type="button" className="kp-btn kp-btn-good" onClick={doSummon} data-testid="btn-summon">Çağır</button>
                    <button type="button" className="kp-btn" onClick={doActive} disabled={view.active === cur.idx} data-testid="btn-active">Aktif yap</button>
                  </div>
                  <details className="kg-paint" open>
                    <summary><LuPaintbrush aria-hidden="true" /> Boya ve süsler</summary>
                    <Swatches label="Gövde" list={view.swatches.body} value={cur.cos.body} onPick={(i) => doPaint({ body: i })} />
                    <Swatches label="Şerit" list={view.swatches.accent} value={cur.cos.accent} onPick={(i) => doPaint({ accent: i })} />
                    <Swatches label="Neon" list={view.swatches.neon} value={cur.cos.neon} onPick={(i) => doPaint({ neon: i })} />
                    <div className="kg-under" role="group" aria-label="Zemin ışığı">
                      <button type="button" className="kvt-switch" role="switch" aria-checked={cur.cos.under.on} data-testid="under-toggle" onClick={() => doPaint({ under: { on: !cur.cos.under.on } })}>
                        <span aria-hidden="true">Zemin ışığı: {cur.cos.under.on ? 'Açık' : 'Kapalı'}</span>
                      </button>
                      {cur.cos.under.on ? (
                        <>
                          <Swatches label="Zemin rengi" list={view.swatches.neon} value={cur.cos.under.color} onPick={(i) => doPaint({ under: { color: i } })} />
                          <div className="kg-sw-group" role="group" aria-label="Zemin ışığı deseni">
                            <span className="kg-sw-title">Desen</span>
                            <div className="kg-sw-row">
                              {view.swatches.underPatterns.map((p, i) => (
                                <button key={p} type="button" className="kg-chip" aria-pressed={cur.cos.under.pattern === i} data-testid={'pattern-' + p} onClick={() => doPaint({ under: { pattern: i } })}>
                                  {p === 'sabit' ? 'Sabit' : p === 'nefes' ? 'Nefes' : 'Dalga'}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>
                    <Swatches label="Jant" list={view.swatches.wheels} value={cur.cos.wheels} onPick={(i) => doPaint({ wheels: i })} withHex={false} />
                    <Swatches label="Korna" list={view.swatches.horns} value={cur.cos.horn} onPick={(i) => doPaint({ horn: i })} withHex={false} />
                  </details>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'buy' ? (
        <div role="tabpanel" id="kg-pane-buy" aria-labelledby="kg-tab-buy" className="kg-pane">
          <ul className="kg-shop" aria-label="Satılık araçlar">
            {catalog.map((c) => {
              const st = buyState(c, kredi, owned.length, view.capacity);
              return (
                <li key={c.cls} className="kg-shop-item" data-testid={'shop-' + c.cls} data-owned={c.owned ? '1' : '0'}>
                  <div className="kg-shop-head">
                    <b>{VEHICLE_DEFS[c.cls].name}</b>
                    <span className="kg-price">{c.price > 0 ? <><LuCoins aria-hidden="true" /> {c.price} Kredi</> : 'Ücretsiz'}</span>
                  </div>
                  <p className="kg-desc">{c.desc}</p>
                  <StatBars cls={c.cls} />
                  <div className="kg-shop-foot">
                    {!c.unlocked && !c.owned ? <span className="kg-lock"><LuLock aria-hidden="true" /> {st.text}</span> : <span className="kg-note">{st.ok ? '' : st.text}</span>}
                    <button type="button" className="kp-btn kp-btn-good" disabled={!st.ok} onClick={() => doBuy(c)} data-testid={'buy-' + c.cls} aria-label={'Satın al: ' + c.name + (c.price > 0 ? ', ' + c.price + ' Kredi' : ', ücretsiz')}>
                      Satın al
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {tab === 'rent' ? (
        <div role="tabpanel" id="kg-pane-rent" aria-labelledby="kg-tab-rent" className="kg-pane">
          {view.rental ? <p className="kg-rental" data-testid="rental-active">Kiralık araç: {VEHICLE_DEFS[view.rental.cls].name} · kalan {Math.floor(view.rental.left / 60)} dk {view.rental.left % 60} sn</p> : null}
          <p className="kg-hint">Kiralama noktasının yakınında kirala; araç yanında belirir. Süre bitince araç teslim edilir.</p>
          <ul className="kg-shop" aria-label="Kiralık araçlar">
            {catalog.map((c) => {
              const st = rentState(c, kredi, Boolean(view.rental));
              const sel2 = catSel && catSel.cls === c.cls;
              return (
                <li key={c.cls} className="kg-shop-item" data-testid={'rent-' + c.cls} data-selected={sel2 ? '1' : '0'} onFocus={() => setPick(c.cls)}>
                  <div className="kg-shop-head">
                    <b>{c.name}</b>
                    <span className="kg-price"><LuCoins aria-hidden="true" /> {c.rent} Kredi / 10 dk</span>
                  </div>
                  <StatBars cls={c.cls} />
                  <div className="kg-shop-foot">
                    <span className="kg-note">{st.ok ? '' : st.text}</span>
                    <button type="button" className="kp-btn kp-btn-good" disabled={!st.ok} onClick={() => doRent(c)} data-testid={'rentbtn-' + c.cls} aria-label={'Kirala: ' + c.name + ', ' + c.rent + ' Kredi'}>
                      Kirala
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </PanelShell>
  );
};

export default memo(GaragePanel);
