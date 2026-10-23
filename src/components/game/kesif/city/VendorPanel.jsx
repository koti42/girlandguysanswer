import React, {
  memo, useCallback, useEffect, useState,
} from 'react';
import {
  LuCoins, LuInfo, LuMessageCircle, LuMinus, LuPlus, LuShoppingBag,
} from 'react-icons/lu';
import PanelShell from '../PanelShell.jsx';
import PanelTabs from '../PanelTabs.jsx';
import PanelItemIcon from '../PanelItemIcon.jsx';
import { useApiSnapshot, useLiveMessage } from '../panelHooks.js';
import {
  buyLabel, clampQty, sellLabel, stepperMax,
} from './npcPanelUtils.js';
import './npcPanels.css';

/*
 * Satıcı paneli (hud.ui === 'vendor'; tezgâh / otomat / sokak satıcısı / sahip). Sekmeler: Satın al (günün 6 teklifi: ad, açıklama, Kredi fiyatı, kalan stok,
 * günlük sınır, adet seçici) · Sat (satıcının geri aldığı eşyalar, %40 fiyat). "Ana diyara taşınır" rozeti: bu eşyalar şehirden çıkarken kaybolmaz.
 * role="dialog" (PanelShell: odak tuzağı, Esc, açılışta odak). Sonuçlar role="status" aria-live ile okunur. Hedefler ≥ 44 px. Kredi şehir-yereldir.
 *
 * Motor cephesi: getVendor(), vendorBuy(item, n), vendorSell(item, n), closeVendor().
 * Props: api, onClose, version, accessibility, reducedMotion
 */
const TABS = [{ key: 'buy', name: 'Satın al' }, { key: 'sell', name: 'Sat' }];

const Stepper = ({
  value, max, onChange, label,
}) => (
  <div className="knp-step" role="group" aria-label={label + ' adedi'}>
    <button type="button" className="knp-step-btn" onClick={() => onChange(clampQty(value - 1, max))} disabled={max <= 1 || value <= 1} aria-label="Azalt">
      <LuMinus aria-hidden="true" />
    </button>
    <output className="knp-step-val" aria-live="off">{max > 0 ? value : 0}</output>
    <button type="button" className="knp-step-btn" onClick={() => onChange(clampQty(value + 1, max))} disabled={max <= 1 || value >= max} aria-label="Artır">
      <LuPlus aria-hidden="true" />
    </button>
  </div>
);

const VendorPanel = ({
  api, onClose, version, accessibility = false, reducedMotion = false,
}) => {
  const [view, bump] = useApiSnapshot(useCallback(() => (api && api.getVendor ? api.getVendor() : null), [api]), version);
  const [tab, setTab] = useState('buy');
  const [qty, setQty] = useState({});
  const [msg, announce] = useLiveMessage();

  useEffect(() => {
    const id = setInterval(bump, 600);
    return () => clearInterval(id);
  }, [bump]);

  const close = useCallback(() => {
    if (api && api.closeVendor) api.closeVendor();
    if (onClose) onClose();
  }, [api, onClose]);

  const qOf = (item, max) => clampQty(qty[item] || 1, max);
  const setQ = (item, n) => setQty((m) => Object.assign({}, m, { [item]: n }));

  const doTalk = () => {
    if (api && api.talkTo) api.talkTo(view.vendor.id);
  };
  const doBuy = (o, n) => {
    const r = api.vendorBuy(o.item, n);
    announce(r && r.message ? r.message : 'Olmadı.');
    bump();
  };
  const doSell = (s, n) => {
    const r = api.vendorSell(s.item, n);
    announce(r && r.message ? r.message : 'Olmadı.');
    bump();
  };

  if (!view) {
    return (
      <PanelShell title="Tezgâh" onClose={close} accessibility={accessibility} reducedMotion={reducedMotion} testId="vendor-panel" size="md">
        <p className="knp-empty" role="status">Tezgâh şu an kapalı.</p>
      </PanelShell>
    );
  }

  const header = (
    <div className="knp-wallet" role="group" aria-label={'Bakiye ' + view.kredi + ' Kredi'} data-testid="vendor-kredi">
      <LuCoins aria-hidden="true" />
      <b>{view.kredi}</b>
      <span>Kredi</span>
    </div>
  );
  const sub = [view.vendor.title, view.vendor.brand].filter(Boolean).join(' · ');

  return (
    <PanelShell
      title={view.vendor.name}
      subtitle={sub}
      onClose={close}
      accessibility={accessibility}
      reducedMotion={reducedMotion}
      testId="vendor-panel"
      size="md"
      headerExtra={header}
    >
      <div className="knp-vtop">
        <PanelTabs tabs={TABS} value={tab} onChange={setTab} label="Tezgâh bölümleri" idPrefix="knp-v" />
        <p className="knp-badge" data-testid="vendor-carry"><LuInfo aria-hidden="true" /> {view.carryNote}</p>
        {view.vendor.canTalk ? (
          <button type="button" className="knp-talk" onClick={doTalk} data-testid="vendor-talk">
            <LuMessageCircle aria-hidden="true" /> Konuş
          </button>
        ) : null}
      </div>
      <p className="knp-sr" role="status" aria-live="polite" data-testid="vendor-live">{msg}</p>
      <p className="knp-vmsg" aria-hidden="true" data-testid="vendor-msg">{view.msg || ' '}</p>

      {tab === 'buy' ? (
        <div role="tabpanel" id="knp-v-panel" aria-labelledby="knp-v-tab-buy">
          <p className="knp-day">Bugünün tezgâhı · {view.day + 1}. gün · stok her gün yenilenir</p>
          <ul className="knp-offers" aria-label="Satılık eşyalar">
            {view.offers.map((o) => {
              const max = stepperMax(o, view.kredi);
              const n = qOf(o.item, max);
              return (
                <li key={o.item} className="knp-offer" data-testid={'offer-' + o.item} data-ok={o.canBuy ? '1' : '0'}>
                  <PanelItemIcon item={o.item} size={48} className="knp-icon" />
                  <div className="knp-offer-body">
                    <b className="knp-offer-name">{o.name}</b>
                    {o.desc ? <span className="knp-offer-desc">{o.desc}</span> : null}
                    <span className="knp-offer-meta">
                      <span className="knp-price"><LuCoins aria-hidden="true" /> {o.price}</span>
                      <span>Kalan {o.left}</span>
                      <span className="knp-carry">{o.carry === 'overworld' ? 'Ana diyara taşınır' : 'Yalnız şehirde'}</span>
                    </span>
                    {!o.canBuy && o.why ? <span className="knp-why">{o.why}</span> : null}
                  </div>
                  <div className="knp-offer-act">
                    <Stepper value={n} max={max} onChange={(v) => setQ(o.item, v)} label={o.name} />
                    <button
                      type="button"
                      className="knp-buy"
                      disabled={max <= 0}
                      onClick={() => doBuy(o, n)}
                      aria-label={buyLabel(o, n)}
                      data-testid={'buy-' + o.item}
                    >
                      <LuShoppingBag aria-hidden="true" /> {o.price * n}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div role="tabpanel" id="knp-v-panel" aria-labelledby="knp-v-tab-sell">
          <p className="knp-day">Satıcı eşyalarını %40 fiyatla geri alır; günlük sınır vardır.</p>
          {view.sells.length === 0 ? (
            <p className="knp-empty" data-testid="vendor-sell-empty">Satıcının alacağı bir eşyan yok.</p>
          ) : (
            <ul className="knp-offers" aria-label="Satabileceklerin">
              {view.sells.map((s) => {
                const max = Math.min(s.count, s.left, 64);
                const n = qOf(s.item, max);
                return (
                  <li key={s.item} className="knp-offer" data-testid={'sell-' + s.item}>
                    <PanelItemIcon item={s.item} size={48} className="knp-icon" />
                    <div className="knp-offer-body">
                      <b className="knp-offer-name">{s.name}</b>
                      <span className="knp-offer-meta">
                        <span className="knp-price"><LuCoins aria-hidden="true" /> {s.price}</span>
                        <span>Elinde {s.count}</span>
                        <span>Günlük kalan {s.left}</span>
                      </span>
                    </div>
                    <div className="knp-offer-act">
                      <Stepper value={n} max={max} onChange={(v) => setQ(s.item, v)} label={s.name} />
                      <button
                        type="button"
                        className="knp-buy knp-sell"
                        disabled={max <= 0}
                        onClick={() => doSell(s, n)}
                        aria-label={sellLabel(s, n)}
                        data-testid={'sellbtn-' + s.item}
                      >
                        +{s.price * n}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </PanelShell>
  );
};

export default memo(VendorPanel);
