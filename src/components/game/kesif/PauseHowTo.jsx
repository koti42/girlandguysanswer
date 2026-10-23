import React, { useMemo, useState } from 'react';
import {
  LuBackpack,
  LuBox,
  LuCamera,
  LuChevronsDown,
  LuChevronsUp,
  LuCpu,
  LuFootprints,
  LuHammer,
  LuHand,
  LuMap,
  LuMoon,
  LuPause,
  LuPickaxe,
  LuPuzzle,
  LuWandSparkles,
  LuZap,
} from 'react-icons/lu';
import { KxSegment } from './KesifControls.jsx';
import { CITY_CONTROLS, CITY_LEAD, CITY_STEPS, CITY_TOUCH, DESKTOP_CONTROLS, PLAY_TIPS, TOUCH_BUTTON_HELP, TOUCH_CONTROLS } from './kxHowTo.js';
import { buildTouchLayout } from './kxTouchLayout.js';
import CityGuide from './CityGuide.jsx';
import './kesifHowTo.css';

/*
 * "Nasıl Oynanır / Kontroller" paneli (duraklatma menüsünün bir sayfası; üst çerçeve — başlık, geri, Tamam — PauseMenu'de).
 * İçerik: klavye + fare listesi, dokunmatik düğme şeması (el ve yön seçilebilir; gerçek yerleşim kxTouchLayout'tan), ipuçları.
 * Şema yalnızca görsel (aria-hidden); aynı bilgi altındaki numaralı açıklama listesinde metin olarak durur.
 */

const BTN_ICON = { break: LuPickaxe, jump: LuChevronsUp, place: LuHand, crouch: LuChevronsDown, sprint: LuFootprints, interact: LuZap };
const TIP_ICON = { hammer: LuHammer, blocks: LuBox, wand: LuWandSparkles, chip: LuCpu, puzzle: LuPuzzle, moon: LuMoon };
const TOP_ICONS = [LuPause, LuBackpack, LuHammer, LuMap, LuCamera];

const HAND_CHOICES = [
  { value: 'right', label: 'Sağ elli' },
  { value: 'left', label: 'Sol elli' },
];
const ORIENT_CHOICES = [
  { value: 'land', label: 'Yatay' },
  { value: 'port', label: 'Dikey' },
];
const TAB_CHOICES = [
  { value: 'keys', label: 'Klavye ve fare' },
  { value: 'touch', label: 'Dokunmatik' },
  { value: 'city', label: 'Neon Meridyen' },
];

const isPortraitNow = () => {
  try {
    return window.innerHeight > window.innerWidth;
  } catch {
    return false;
  }
};

/** Şema ögeleri: [{n, kind:'zone'|'btn'|'top', ...}] — numara aynı zamanda açıklama listesindeki sıradır. */
function buildDiagram(portrait, left) {
  const W = portrait ? 390 : 844;
  const H = portrait ? 844 : 390;
  const lay = buildTouchLayout({ portrait, canInteract: true, mode: 'macera' });
  const items = [
    { kind: 'zone', id: 'move', side: left ? 'right' : 'left', text: 'Yürü: bu yarıda parmağını kaydır, ileri çekersen koşarsın' },
    { kind: 'zone', id: 'look', side: left ? 'left' : 'right', text: 'Etrafa bak: bu yarıda sürükle' },
  ];
  lay.buttons.forEach((b) => {
    if (!TOUCH_BUTTON_HELP[b.id]) return;
    const cx = left ? lay.anchor.edge - b.bx : W - lay.anchor.edge + b.bx;
    const cy = lay.anchor.bottom + b.by;
    items.push({
      kind: 'btn',
      id: b.id,
      icon: b.icon,
      text: TOUCH_BUTTON_HELP[b.id],
      style: { left: (cx / W) * 100 + '%', bottom: (cy / H) * 100 + '%', width: (b.size / W) * 100 + '%' },
    });
  });
  items.push({ kind: 'top', id: 'top', text: 'Üst çubuk: duraklat, envanter, üret, harita, kamera' });
  return { W, H, items: items.map((it, i) => ({ ...it, n: i + 1 })) };
}

const TouchDiagram = ({ portrait, left }) => {
  const d = useMemo(() => buildDiagram(portrait, left), [portrait, left]);
  // Dikey şema ekranı taşırmasın: yüksekliği sınırlı, genişlik orana göre.
  const frame = portrait ? { width: 'min(100%, calc(min(46vh, 22rem) * 390 / 844))', aspectRatio: '390 / 844' } : { width: '100%', aspectRatio: '844 / 390' };
  return (
    <div className="kx-ht-diagram-wrap">
      <div className="kx-ht-diagram" style={frame} aria-hidden="true" data-portrait={portrait ? '1' : '0'}>
        {d.items.map((it) => {
          if (it.kind === 'zone') {
            return (
              <span key={it.id} className="kx-ht-zone" data-side={it.side} data-id={it.id}>
                <b className="kx-ht-n">{it.n}</b>
                {it.id === 'move' ? 'Yürü' : 'Bak'}
              </span>
            );
          }
          if (it.kind === 'top') {
            return (
              <span key={it.id} className="kx-ht-top">
                <b className="kx-ht-n">{it.n}</b>
                {TOP_ICONS.map((Icon, i) => (
                  <i key={i}>
                    <Icon />
                  </i>
                ))}
              </span>
            );
          }
          const Icon = BTN_ICON[it.icon] || LuZap;
          return (
            <span key={it.id} className="kx-ht-btn" style={it.style} data-id={it.id}>
              <Icon />
              <b className="kx-ht-n">{it.n}</b>
            </span>
          );
        })}
      </div>
      <ol className="kx-ht-legend">
        {d.items.map((it) => (
          <li key={it.id} value={it.n}>
            <b className="kx-ht-n" aria-hidden="true">
              {it.n}
            </b>
            <span>{it.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

const KeyboardList = ({ rows = DESKTOP_CONTROLS, label = 'Klavye ve fare kontrolleri' }) => (
  <ul className="kx-ht-keys" aria-label={label}>
    {rows.map((r) => (
      <li key={r.what}>
        <span className="kx-ht-what">{r.what}</span>
        <span className="kx-ht-kbds">
          {r.keys.map((k, i) =>
            k === '…' ? (
              <span key={'gap' + i} aria-hidden="true">
                …
              </span>
            ) : (
              <kbd key={k}>{k}</kbd>
            )
          )}
        </span>
        {r.note ? <span className="kx-ht-note">{r.note}</span> : null}
      </li>
    ))}
  </ul>
);

const TouchList = ({ rows = TOUCH_CONTROLS, label = 'Dokunmatik kontroller' }) => (
  <ul className="kx-ht-touch" aria-label={label}>
    {rows.map((r) => (
      <li key={r.what}>
        <b>{r.what}: </b>
        <span>{r.how}</span>
      </li>
    ))}
  </ul>
);

/** @param {{touch?:boolean, leftHanded?:boolean}} props */
const PauseHowTo = ({ touch = false, leftHanded = false }) => {
  const [tab, setTab] = useState(touch ? 'touch' : 'keys');
  const [hand, setHand] = useState(leftHanded ? 'left' : 'right');
  const [orient, setOrient] = useState(() => (isPortraitNow() ? 'port' : 'land'));
  return (
    <div className="kx-ht">
      <div className="kx-ht-bar">
        <KxSegment label="Kontrol türü" value={tab} choices={TAB_CHOICES} onChange={setTab} />
        {tab === 'touch' && (
          <>
            <KxSegment label="El" value={hand} choices={HAND_CHOICES} onChange={setHand} />
            <KxSegment label="Ekran" value={orient} choices={ORIENT_CHOICES} onChange={setOrient} />
          </>
        )}
      </div>

      {tab === 'city' ? (
        <>
          <section aria-labelledby="kx-ht-city-h" className="kx-set-sec" data-testid="kx-ht-city">
            <h3 id="kx-ht-city-h">Neon Meridyen</h3>
            <p className="kx-ht-city-lead">{CITY_LEAD}</p>
            <ol className="kx-ht-steps" aria-label="Neon Meridyen yolculuk adımları">
              {CITY_STEPS.map((s) => (
                <li key={s.key} data-step={s.key}>
                  <b>{s.title}: </b>
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="kx-ht-city-k-h" className="kx-set-sec">
            <h3 id="kx-ht-city-k-h">Şehir kontrolleri</h3>
            <KeyboardList rows={CITY_CONTROLS} label="Neon Meridyen klavye ve fare kontrolleri" />
            <TouchList rows={CITY_TOUCH} label="Neon Meridyen dokunmatik kontroller" />
          </section>
          <CityGuide />
        </>
      ) : tab === 'keys' ? (
        <section aria-labelledby="kx-ht-keys-h" className="kx-set-sec">
          <h3 id="kx-ht-keys-h">Klavye ve fare</h3>
          <KeyboardList />
          <p className="kx-ht-foot">Oyun alanına tıklayınca fare yakalanır; Esc ile bırakıp bu menüyü açarsın.</p>
        </section>
      ) : (
        <section aria-labelledby="kx-ht-touch-h" className="kx-set-sec">
          <h3 id="kx-ht-touch-h">Dokunmatik kontroller</h3>
          <TouchDiagram portrait={orient === 'port'} left={hand === 'left'} />
          <TouchList />
          <p className="kx-ht-foot">Telefonu yan çevirmeni öneririz; dikey de çalışır. Oyun kolu da desteklenir. Düzeni Ayarlar'dan değiştirebilirsin.</p>
        </section>
      )}

      <section aria-labelledby="kx-ht-tips-h" className="kx-set-sec">
        <h3 id="kx-ht-tips-h">İpuçları</h3>
        <ul className="kx-ht-tips">
          {PLAY_TIPS.map((t) => {
            const Icon = TIP_ICON[t.icon] || LuZap;
            return (
              <li key={t.key} data-tip={t.key}>
                <span className="kx-ht-tip-ico" aria-hidden="true">
                  <Icon />
                </span>
                <span>
                  <b>{t.title}</b>
                  <span>{t.text}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default PauseHowTo;
