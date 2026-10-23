import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LuBellRing, LuCamera, LuChevronsUp, LuHand, LuLocateFixed, LuLogOut, LuMap, LuPause, LuSlidersHorizontal, LuZap,
} from 'react-icons/lu';
import { useContainerSize } from '../kxHooks.js';
import { touchScale } from '../kxTouchLayout.js';
import { driveLayout } from './vehicleHudUtils.js';
import { armLateClickGuard } from '../lateClick.js';

/*
 * Dokunmatik sürüş denetimleri (Neon Meridyen). Girdi mantığı inputVehicle.js / inputVehicleMath.js'te; bu bileşen yalnız işaretçi olaylarını iletir ve görseli çizer.
 *
 *   Sol:   DİREKSİYON (parmak tekerlek çevresinde döner, ±135° → ±1, bırakınca 6/sn geri yay) ya da KAYDIRICI (ilk dokunuş sıfır; yatay sapma)
 *   Sağ:   GAZ (96 px; pedalın üstü = 1.0, altı = 0.6 analog) · FREN / GERİ (72 px) · NİTRO (64) · EL FRENİ (56; Süzülkay'da "Zıpla")
 *   Üst:   İn · Yola yerleştir · Korna · Kamera · Harita · Duraklat · Ayarlar (sürüş ayarları: kaydırıcı/tekerlek, otomatik gaz, şerit yardımı, sol elli)
 * Çoklu dokunma: her denetim kendi işaretçisini yakalar ve kimliğine göre yalıtılır; pointercancel / lostpointercapture / blur / sökülme hepsini bırakır.
 * Hedefler ≥ 44 px (driveLayout). Sol elli kipte yerleşim aynalanır. Klavye/anahtar erişimi: pedallar düğmedir (Enter/Boşluk basılı tutar), direksiyon `slider`dır (← →).
 *
 * Props: inputRef ({current: createKesifInput}), cls (araç sınıfı; yalnız bu dizge: hud.vehicle her yayında yeni nesne olur, bileşen boşuna yeniden çizilmesin),
 *        actions ({pause, openMap}), settings ({leftHanded, buttonOpacity}),
 *        prefs ({steerMode, autoThrottle, laneAssist}), onPrefs(patch), onLeftHanded(bool)
 */
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

function useCtl(inputRef) {
  return useCallback(() => {
    const inp = inputRef && inputRef.current;
    return inp && inp.vehicle ? inp.vehicle : null;
  }, [inputRef]);
}

/* ---- Tek seferlik / basılı tutulan düğme (inputVehicle.press yoluyla; titreşim ve ses kilidi input'ta) ---- */
const DriveButton = memo(function DriveButton({ name, label, hold = false, size, children, press, className = '', testId }) {
  const [down, setDown] = useState(false);
  const downRef = useRef(false);
  const handled = useRef(false);
  const timer = useRef(0);

  const begin = () => {
    if (downRef.current) return;
    downRef.current = true;
    setDown(true);
    press(name, true);
    if (!hold) {
      // dokunuş düğmesi: basışta tetiklenir, görsel kısa süre basılı kalır
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        downRef.current = false;
        setDown(false);
      }, 120);
    }
  };
  const end = useCallback(() => {
    if (!hold) return;
    if (!downRef.current) return;
    downRef.current = false;
    setDown(false);
    press(name, false);
  }, [hold, name, press]);

  useEffect(() => () => {
    clearTimeout(timer.current);
    if (hold && downRef.current) {
      downRef.current = false;
      press(name, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    handled.current = true;
    // "İn": arayüz parmağın altında yürüme arayüzüne dönüşür; parmak kalkınca gelen click yeni üst çubuk düğmesine (Duraklat) düşmesin (lateClick.js)
    if (name === 'interact') armLateClickGuard(e.currentTarget, e.clientX, e.clientY);
    begin();
    try {
      if (e.pointerId !== undefined && e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // yakalama desteklenmiyor
    }
  };
  const onKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault();
      handled.current = true;
      begin();
    }
  };
  const onKeyUp = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      end();
    }
  };
  const onClick = (e) => {
    if (handled.current) {
      handled.current = false;
      return;
    }
    // ekran okuyucu etkinleştirmesi: basma + kısa süre sonra bırakma
    if (e.detail === 0 || e.detail === undefined || e.detail === 1) {
      press(name, true);
      setTimeout(() => press(name, false), 90);
    }
  };
  return (
    <button
      type="button"
      className={'kvt-btn ' + className}
      data-no-tap
      data-testid={testId || 'drive-' + name}
      data-down={down ? '1' : '0'}
      aria-label={label}
      aria-pressed={hold ? down : undefined}
      style={{ width: size, height: size }}
      onPointerDown={onPointerDown}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onClick={onClick}
    >
      {children}
      <span className="kvt-btn-label" aria-hidden="true">{label}</span>
    </button>
  );
});

/* ---- Analog pedal (gaz / fren): dikey konum 0.6–1.0 değer verir ---- */
const Pedal = memo(function Pedal({ kind, label, w, h, getCtl, fillRef, hint }) {
  const idRef = useRef(null);
  const elRef = useRef(null);
  const rel = (e) => {
    const r = elRef.current ? elRef.current.getBoundingClientRect() : null;
    if (!r || !(r.height > 0)) return 0.5;
    return clamp((e.clientY - r.top) / r.height, 0, 1);
  };
  const tracker = () => {
    const c = getCtl();
    return c ? c[kind] : null;
  };
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    const t = tracker();
    if (!t) return;
    if (t.begin(e.pointerId, rel(e))) idRef.current = e.pointerId;
    try {
      if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // yakalama desteklenmiyor
    }
  };
  const onPointerMove = (e) => {
    if (idRef.current === null || e.pointerId !== idRef.current) return;
    const t = tracker();
    if (t) t.move(e.pointerId, rel(e));
  };
  const end = (e) => {
    const t = tracker();
    const id = e && e.pointerId !== undefined ? e.pointerId : idRef.current;
    if (t && id !== null && id !== undefined) t.end(id);
    if (id === idRef.current) idRef.current = null;
  };
  const onKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault();
      const t = tracker();
      if (t) t.begin('kbd', 0);
    }
  };
  const onKeyUp = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const t = tracker();
      if (t) t.end('kbd');
    }
  };
  useEffect(() => () => {
    const t = tracker();
    if (t) t.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <button
      ref={elRef}
      type="button"
      className={'kvt-pedal kvt-' + kind}
      data-no-tap
      data-testid={'drive-' + kind}
      aria-label={label}
      style={{ width: w, height: h }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      <span className="kvt-pedal-fill" ref={fillRef} aria-hidden="true" />
      <span className="kvt-pedal-ribs" aria-hidden="true" />
      <span className="kvt-pedal-label" aria-hidden="true">{label}</span>
      {hint ? <span className="kvt-pedal-hint" aria-hidden="true">{hint}</span> : null}
    </button>
  );
});

const OPTION_ROWS = [
  { key: 'steerMode', label: 'Direksiyon', opts: [['wheel', 'Tekerlek'], ['slider', 'Kaydırıcı']] },
  { key: 'laneAssist', label: 'Şerit yardımı', opts: [['auto', 'Otomatik'], ['on', 'Açık'], ['off', 'Kapalı']] },
];

const TouchDriveControls = ({
  inputRef, cls, actions, settings, prefs, onPrefs, onLeftHanded,
}) => {
  const rootRef = useRef(null);
  const { w, h, portrait } = useContainerSize(rootRef, { w: 844, h: 390 });
  const getCtl = useCtl(inputRef);
  const [open, setOpen] = useState(false);
  const wheelRef = useRef(null);
  const sliderThumbRef = useRef(null);
  const steerRef = useRef(null);
  const gasFill = useRef(null);
  const brakeFill = useRef(null);
  const steerId = useRef(null);
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  });

  const leftHanded = Boolean(settings && settings.leftHanded);
  const opacity = settings && typeof settings.buttonOpacity === 'number' ? clamp(settings.buttonOpacity, 0.3, 1) : 0.82;
  const p = prefs || { steerMode: 'wheel', autoThrottle: false, laneAssist: 'auto' };
  const L = useMemo(() => driveLayout({ w, h, portrait, scale: touchScale(w, h, portrait) }), [w, h, portrait]);
  const board = cls === 'suzulkay';

  /* tercihleri denetleyiciye uygula */
  useEffect(() => {
    const c = getCtl();
    if (!c) return;
    c.setOption('steerMode', p.steerMode);
    c.setOption('autoThrottle', p.autoThrottle === true);
    c.setOption('laneAssist', p.laneAssist === 'on' ? true : p.laneAssist === 'off' ? false : null);
  }, [getCtl, p.steerMode, p.autoThrottle, p.laneAssist]);

  /* sökülünce her şeyi bırak */
  useEffect(() => () => {
    const c = getCtl();
    if (c) c.releaseAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* görsel: tekerlek/kaydırıcı/pedal doluluğu rAF ile (React yeniden çizimi yok) */
  useEffect(() => {
    let raf = 0;
    let alive = true;
    const last = { a: NaN, g: NaN, b: NaN };
    const step = () => {
      if (!alive) return;
      raf = requestAnimationFrame(step);
      const c = getCtl();
      if (!c) return;
      const slider = p.steerMode === 'slider';
      const a = slider ? c.slider.state.value : c.wheel.state.angle;
      if (a !== last.a) {
        last.a = a;
        if (!slider && wheelRef.current) wheelRef.current.style.transform = 'rotate(' + ((a * 180) / Math.PI).toFixed(1) + 'deg)';
        if (slider && sliderThumbRef.current) sliderThumbRef.current.style.transform = 'translateX(' + (a * 50).toFixed(1) + '%)';
      }
      const g = c.gas.state.value;
      if (g !== last.g) {
        last.g = g;
        if (gasFill.current) gasFill.current.style.transform = 'scaleY(' + g.toFixed(2) + ')';
      }
      const b = c.brake.state.value;
      if (b !== last.b) {
        last.b = b;
        if (brakeFill.current) brakeFill.current.style.transform = 'scaleY(' + b.toFixed(2) + ')';
      }
      // wheel/slider.update burada çağrılmaz: input.getState her karede ilerletir
    };
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    };
  }, [getCtl, p.steerMode]);

  const press = useCallback(
    (name, isDown) => {
      const inp = inputRef && inputRef.current;
      if (inp && typeof inp.pressButton === 'function') inp.pressButton(name, isDown);
    },
    [inputRef]
  );

  /* ---- direksiyon / kaydırıcı işaretçileri ---- */
  const onSteerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const c = getCtl();
    const el = steerRef.current;
    if (!c || !el) return;
    if (e.cancelable) e.preventDefault();
    const r = el.getBoundingClientRect();
    let ok;
    if (p.steerMode === 'slider') ok = c.slider.begin(e.pointerId, e.clientX, Math.max(30, r.width * 0.36));
    else ok = c.wheel.begin(e.pointerId, e.clientX, e.clientY, r.left + r.width / 2, r.top + r.height / 2, r.width / 2);
    if (ok) steerId.current = e.pointerId;
    try {
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
    } catch {
      // yakalama desteklenmiyor
    }
  };
  const onSteerMove = (e) => {
    if (steerId.current === null || e.pointerId !== steerId.current) return;
    const c = getCtl();
    if (!c) return;
    if (p.steerMode === 'slider') c.slider.move(e.pointerId, e.clientX);
    else c.wheel.move(e.pointerId, e.clientX, e.clientY);
  };
  const onSteerEnd = (e) => {
    const c = getCtl();
    const id = e && e.pointerId !== undefined ? e.pointerId : steerId.current;
    if (c && id !== null && id !== undefined) c.pointerEnd(id);
    if (id === steerId.current) steerId.current = null;
  };
  const onSteerKey = (e) => {
    const c = getCtl();
    if (!c) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -0.14 : 0.14;
      if (p.steerMode === 'slider') {
        const s = c.slider.state;
        s.value = clamp(s.value + d, -1, 1);
        s.steer = Math.abs(s.value) < 0.07 ? 0 : s.value;
      } else c.wheel.nudge(d);
    }
  };

  const setPref = (key, value) => {
    if (onPrefs) onPrefs({ [key]: value });
  };
  const act = actionsRef;
  const small = L.small;
  const style = {
    '--kvt-steer': L.steer + 'px',
    '--kvt-gas-w': L.gas.w + 'px',
    '--kvt-gas-h': L.gas.h + 'px',
    '--kvt-brake-w': L.brake.w + 'px',
    '--kvt-brake-h': L.brake.h + 'px',
    '--kvt-nitro': L.nitro + 'px',
    '--kvt-hand': L.hand + 'px',
    '--kvt-small': small + 'px',
    '--kvt-gap': L.gap + 'px',
    '--kvt-op': opacity,
  };
  const slider = p.steerMode === 'slider';
  return (
    <div
      ref={rootRef}
      className="kvt"
      data-testid="drive-controls"
      data-left={leftHanded ? '1' : '0'}
      data-portrait={portrait ? '1' : '0'}
      data-steer={slider ? 'slider' : 'wheel'}
      style={style}
    >
      {/* üst düğmeler */}
      <div className="kvt-top" role="toolbar" aria-label="Sürüş düğmeleri" data-no-tap>
        <DriveButton name="interact" label="İn" size={small} press={press} className="kvt-small"><LuLogOut aria-hidden="true" /></DriveButton>
        <DriveButton name="vreset" label="Yola" size={small} press={press} className="kvt-small"><LuLocateFixed aria-hidden="true" /></DriveButton>
        <DriveButton name="vhorn" label="Korna" size={small} press={press} className="kvt-small"><LuBellRing aria-hidden="true" /></DriveButton>
        <DriveButton name="vcamera" label="Kamera" size={small} press={press} className="kvt-small"><LuCamera aria-hidden="true" /></DriveButton>
        <button type="button" className="kvt-btn kvt-small kvt-plain" data-no-tap data-testid="drive-map-btn" aria-label="Harita" style={{ width: small, height: small }} onClick={() => act.current && act.current.openMap && act.current.openMap()}>
          <LuMap aria-hidden="true" />
          <span className="kvt-btn-label" aria-hidden="true">Harita</span>
        </button>
        <button type="button" className="kvt-btn kvt-small kvt-plain" data-no-tap data-testid="drive-pause-btn" aria-label="Duraklat" style={{ width: small, height: small }} onClick={() => act.current && act.current.pause && act.current.pause()}>
          <LuPause aria-hidden="true" />
          <span className="kvt-btn-label" aria-hidden="true">Duraklat</span>
        </button>
        <button
          type="button"
          className="kvt-btn kvt-small kvt-plain"
          data-no-tap
          data-testid="drive-options-btn"
          aria-label="Sürüş ayarları"
          aria-expanded={open}
          aria-pressed={open}
          style={{ width: small, height: small }}
          onClick={() => setOpen((v) => !v)}
        >
          <LuSlidersHorizontal aria-hidden="true" />
          <span className="kvt-btn-label" aria-hidden="true">Ayar</span>
        </button>
      </div>

      {open ? (
        <div
          className="kvt-opts"
          role="group"
          aria-label="Sürüş ayarları"
          data-no-tap
          data-testid="drive-options"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <div className="kvt-opt-head">
            <b>Sürüş ayarları</b>
            <button type="button" className="kvt-x" aria-label="Ayarları kapat" onClick={() => setOpen(false)} data-testid="opt-close">
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          {OPTION_ROWS.map((row) => (
            <div key={row.key} className="kvt-opt-row" role="group" aria-label={row.label}>
              <span className="kvt-opt-name">{row.label}</span>
              <span className="kvt-seg">
                {row.opts.map(([val, txt]) => (
                  <button
                    key={val}
                    type="button"
                    className="kvt-seg-btn"
                    aria-pressed={p[row.key] === val}
                    data-testid={'opt-' + row.key + '-' + val}
                    onClick={() => setPref(row.key, val)}
                  >
                    {txt}
                  </button>
                ))}
              </span>
            </div>
          ))}
          <div className="kvt-opt-row">
            <span className="kvt-opt-name">Otomatik gaz</span>
            <button type="button" className="kvt-switch" role="switch" aria-checked={Boolean(p.autoThrottle)} data-testid="opt-autoThrottle" onClick={() => setPref('autoThrottle', !p.autoThrottle)}>
              <span aria-hidden="true">{p.autoThrottle ? 'Açık' : 'Kapalı'}</span>
            </button>
          </div>
          <div className="kvt-opt-row">
            <span className="kvt-opt-name">Sol elli yerleşim</span>
            <button type="button" className="kvt-switch" role="switch" aria-checked={leftHanded} data-testid="opt-leftHanded" onClick={() => onLeftHanded && onLeftHanded(!leftHanded)}>
              <span aria-hidden="true">{leftHanded ? 'Açık' : 'Kapalı'}</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* direksiyon / kaydırıcı */}
      <div
        ref={steerRef}
        className="kvt-steer"
        data-no-tap
        data-testid="drive-steer"
        role="slider"
        tabIndex={0}
        aria-label={slider ? 'Direksiyon kaydırıcısı' : 'Direksiyon'}
        aria-orientation="horizontal"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={0}
        aria-valuetext="Düz"
        style={{ width: slider ? Math.min(Math.round(L.steer * 1.55), L.steerMaxW) : L.steer, height: slider ? Math.max(L.small + 18, Math.round(L.steer * 0.55)) : L.steer }}
        onPointerDown={onSteerDown}
        onPointerMove={onSteerMove}
        onPointerUp={onSteerEnd}
        onPointerCancel={onSteerEnd}
        onLostPointerCapture={onSteerEnd}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onSteerKey}
      >
        {slider ? (
          <>
            <span className="kvt-rail" aria-hidden="true" />
            <span className="kvt-rail-mid" aria-hidden="true" />
            <span className="kvt-thumb" ref={sliderThumbRef} aria-hidden="true">
              <i />
            </span>
            <span className="kvt-steer-cap kvt-cap-l" aria-hidden="true">◂</span>
            <span className="kvt-steer-cap kvt-cap-r" aria-hidden="true">▸</span>
          </>
        ) : (
          <svg ref={wheelRef} className="kvt-wheel" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <circle cx="50" cy="50" r="46" className="kvt-wheel-rim" />
            <circle cx="50" cy="50" r="38" className="kvt-wheel-inner" />
            <path d="M12 54h28M60 54h28M50 56v34" className="kvt-wheel-spoke" />
            <circle cx="50" cy="50" r="9" className="kvt-wheel-hub" />
            <path d="M50 4l6 10H44z" className="kvt-wheel-mark" />
          </svg>
        )}
      </div>

      {/* sağ: pedallar ve eylem düğmeleri */}
      <div className="kvt-right">
        <div className="kvt-act">
          <DriveButton name="vhandbrake" label={board ? 'Zıpla' : 'El freni'} hold size={L.hand} press={press} className="kvt-hand">
            {board ? <LuChevronsUp aria-hidden="true" /> : <LuHand aria-hidden="true" />}
          </DriveButton>
          <DriveButton name="vnitro" label="Nitro" hold size={L.nitro} press={press} className="kvt-nitro-btn">
            <LuZap aria-hidden="true" />
          </DriveButton>
        </div>
        <div className="kvt-pedals">
          <Pedal kind="brake" label="Fren / Geri" w={L.brake.w} h={L.brake.h} getCtl={getCtl} fillRef={brakeFill} />
          <Pedal kind="gas" label="Gaz" w={L.gas.w} h={L.gas.h} getCtl={getCtl} fillRef={gasFill} />
        </div>
      </div>
    </div>
  );
};

export default memo(TouchDriveControls);
