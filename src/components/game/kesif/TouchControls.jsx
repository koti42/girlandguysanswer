import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LuAnchor,
  LuAperture,
  LuBackpack,
  LuBookOpen,
  LuCamera,
  LuChevronsDown,
  LuChevronsUp,
  LuFeather,
  LuFootprints,
  LuHammer,
  LuHand,
  LuImage,
  LuMap,
  LuOrbit,
  LuPause,
  LuPickaxe,
  LuWind,
  LuZap,
} from 'react-icons/lu';
import { useContainerSize } from './kxHooks.js';
import { buildTouchLayout, touchScale } from './kxTouchLayout.js';

const ICONS = {
  break: LuPickaxe,
  jump: LuChevronsUp,
  place: LuHand,
  crouch: LuChevronsDown,
  sprint: LuFootprints,
  interact: LuZap,
  fly: LuFeather,
  grapple: LuAnchor,
  glide: LuWind,
  portal: LuAperture,
  dimension: LuOrbit,
};

/* ------------------------------------------------------------------------------------------------
 * Oyun düğmesi: basınca press(name,true), bırakınca press(name,false).
 * Çoklu dokunuş: her düğme kendi işaretçisini yakalar (setPointerCapture). Klavye (Enter/Space) ve
 * yardımcı teknoloji (click, detail=0) de çalışır.
 * ---------------------------------------------------------------------------------------------- */
const GameButton = memo(function GameButton({ def, press, locked, cd, charges }) {
  const [down, setDown] = useState(false);
  const downRef = useRef(false);
  const handled = useRef(false);
  const handledTimer = useRef(0);
  const Icon = ICONS[def.icon] || LuZap;

  // Gerçek işaretçi/klavye basışından sonra tarayıcının gönderdiği click ikinci kez saymasın.
  const markHandled = () => {
    handled.current = true;
    clearTimeout(handledTimer.current);
  };

  const begin = () => {
    if (downRef.current) return;
    downRef.current = true;
    setDown(true);
    press(def.name, true);
  };
  const end = useCallback(() => {
    if (!downRef.current) return;
    downRef.current = false;
    setDown(false);
    press(def.name, false);
    // click bırakmadan hemen sonra gelir; gelmezse (parmak düğmeden kaydı) bayrak kısa süre sonra düşer.
    clearTimeout(handledTimer.current);
    handledTimer.current = setTimeout(() => {
      handled.current = false;
    }, 400);
  }, [press, def.name]);

  // Düğme ekrandan kalkarsa (panel açıldı, bileşen söküldü) basılı kalmasın.
  useEffect(
    () => () => {
      clearTimeout(handledTimer.current);
      if (downRef.current) {
        downRef.current = false;
        press(def.name, false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  useEffect(() => {
    const off = () => end();
    window.addEventListener('blur', off);
    return () => window.removeEventListener('blur', off);
  }, [end]);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    markHandled();
    begin();
    try {
      if (e.pointerId !== undefined && e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Yakalama desteklenmiyor/gerekmiyor.
    }
  };
  const onKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault();
      markHandled();
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
    // Ekran okuyucu etkinleştirmesi: basma + kısa süre sonra bırakma.
    if (e.detail === 0 || e.detail === undefined || e.detail === 1) {
      press(def.name, true);
      setTimeout(() => press(def.name, false), 90);
    }
  };

  const showCd = typeof cd === 'number' && cd > 0;
  return (
    <button
      type="button"
      className="kx-tbtn"
      data-no-tap
      data-kind={def.kind}
      data-icon={def.icon}
      data-down={down ? '1' : '0'}
      data-lock={locked ? '1' : '0'}
      aria-label={def.label}
      aria-pressed={def.kind === 'toggle' || locked ? Boolean(locked) : undefined}
      style={{ '--bx': def.bx, '--by': def.by, '--bs': def.size }}
      onPointerDown={onPointerDown}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
      {showCd && <span className="kx-tbtn-cd" style={{ '--cd': cd }} aria-hidden="true" />}
      {typeof charges === 'number' && (
        <span className="kx-tbtn-charges" aria-hidden="true">
          {charges}
        </span>
      )}
    </button>
  );
});

const TOP_BUTTONS = [
  { id: 'pause', label: 'Duraklat', icon: LuPause, action: 'pause', press: 'pause' },
  { id: 'inventory', label: 'Envanter', icon: LuBackpack, action: 'openInventory', press: 'inventory' },
  { id: 'craft', label: 'Üret', icon: LuHammer, action: 'openCrafting', press: 'craft' },
  { id: 'map', label: 'Harita', icon: LuMap, action: 'openMap', press: 'map' },
  { id: 'journal', label: 'Günlük', icon: LuBookOpen, action: 'openJournal', press: null },
  { id: 'photo', label: 'Foto', icon: LuImage, action: 'openPhoto', press: null },
  { id: 'camera', label: 'Kamera', icon: LuCamera, action: 'toggleCamera', press: 'camera' },
];

/**
 * Dokunmatik kontroller (yalnız `touch` iken çizilir).
 *
 *  - Yüzen joystick görseli: input.getJoystickView() rAF ile okunur, düğüm dönüşümleri doğrudan
 *    DOM'a yazılır (React yeniden çizimi yok). Joystick/bakış bölgelerinin kendisi input.js'tedir.
 *  - Sağ başparmak yayı: kır/saldır (basılı tut), zıpla, yerleştir/kullan, çömel, koşu kilidi, bağlamsal
 *    "Etkileş", yetenekler. Dikey ekranda büyük düğmeler alt-sağda yığılır. Sol elli modda aynalanır.
 *  - Üst çubuk: duraklat, envanter, üret, harita, (günlük), kamera. Hepsi `data-no-tap`.
 *
 * Props: inputRef ({current: input}), actions ({pressButton, pause, openInventory, openCrafting, openMap,
 *   openJournal, toggleCamera}), abilities, abilityStatus ({key:{cooldown,charges}}), abilityButtons,
 *   canInteract, flying, mode, cameraMode, settings ({leftHanded, buttonOpacity}), dimButton (Boyut kipi düğmesi: Portal Tabancası yeteneği varken),
 *   dimMode (boyut kipi açık → düğme basılı görünür).
 */
const TouchControls = ({
  inputRef,
  actions,
  abilities,
  abilityStatus,
  abilityButtons,
  canInteract = false,
  flying = false,
  mode = 'macera',
  cameraMode = 'fp',
  settings,
  dimButton = false,
  dimMode = false,
}) => {
  const rootRef = useRef(null);
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  const joyRef = useRef(null);
  const { w, h, portrait } = useContainerSize(rootRef, { w: 800, h: 400 });
  const [latch, setLatch] = useState({ sprint: false, crouch: false });
  const [hintLeft, setHintLeft] = useState(false);

  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  });

  const readHints = useCallback(() => {
    const inp = inputRef && inputRef.current;
    if (!inp || typeof inp.getTouchLayoutHints !== 'function') return null;
    try {
      return inp.getTouchLayoutHints();
    } catch {
      return null;
    }
  }, [inputRef]);

  const settingsLeft = settings && typeof settings.leftHanded === 'boolean' ? settings.leftHanded : null;
  // Dış sistemden (input) okunan yerleşim ipucunu eşitler.
  useEffect(() => {
    const hints = readHints();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hints) setHintLeft(Boolean(hints.leftHanded));
  }, [readHints, settingsLeft]);

  const leftHanded = settingsLeft !== null ? settingsLeft : hintLeft;
  const opacity = settings && typeof settings.buttonOpacity === 'number' ? Math.max(0.3, Math.min(1, settings.buttonOpacity)) : 0.78;

  const press = useCallback(
    (name, isDown) => {
      const a = actionsRef.current;
      if (a && typeof a.pressButton === 'function') a.pressButton(name, isDown);
      else {
        const inp = inputRef && inputRef.current;
        if (inp && typeof inp.pressButton === 'function') inp.pressButton(name, isDown);
      }
      if (isDown && (name === 'sprintToggle' || name === 'crouch' || name === 'crouchToggle')) {
        const hints = readHints();
        if (hints && hints.state) setLatch({ sprint: Boolean(hints.state.sprintLocked), crouch: Boolean(hints.state.crouchLocked) });
      }
    },
    [inputRef, readHints]
  );

  /* ---- Joystick görseli: rAF, React dışı ---- */
  useEffect(() => {
    let raf = 0;
    let alive = true;
    const last = { active: false, sprint: false, bx: NaN, by: NaN, kx: NaN, ky: NaN, r: NaN };
    const step = () => {
      if (!alive) return;
      raf = requestAnimationFrame(step);
      const inp = inputRef && inputRef.current;
      const base = baseRef.current;
      const knob = knobRef.current;
      const joy = joyRef.current;
      if (!inp || typeof inp.getJoystickView !== 'function' || !base || !knob || !joy) return;
      const v = inp.getJoystickView();
      if (v.active !== last.active) {
        last.active = v.active;
        joy.setAttribute('data-active', v.active ? '1' : '0');
      }
      if (v.sprint !== last.sprint) {
        last.sprint = v.sprint;
        joy.setAttribute('data-sprint', v.sprint ? '1' : '0');
      }
      if (!v.active) return;
      if (v.radius !== last.r) {
        last.r = v.radius;
        base.style.width = base.style.height = v.radius * 2 + 'px';
        const kd = Math.round(v.radius * 0.95);
        knob.style.width = knob.style.height = kd + 'px';
        knob.style.marginLeft = knob.style.marginTop = -kd / 2 + 'px';
        base.style.marginLeft = base.style.marginTop = -v.radius + 'px';
      }
      if (v.baseX !== last.bx || v.baseY !== last.by) {
        last.bx = v.baseX;
        last.by = v.baseY;
        base.style.transform = 'translate3d(' + v.baseX + 'px,' + v.baseY + 'px,0)';
      }
      if (v.knobX !== last.kx || v.knobY !== last.ky) {
        last.kx = v.knobX;
        last.ky = v.knobY;
        knob.style.transform = 'translate3d(' + v.knobX + 'px,' + v.knobY + 'px,0)';
      }
    };
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(step);
    return () => {
      alive = false;
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    };
  }, [inputRef]);

  const layout = useMemo(
    () => buildTouchLayout({ portrait, flying, mode, canInteract, abilities, abilityButtons, portalMode: dimButton }),
    [portrait, flying, mode, canInteract, abilities, abilityButtons, dimButton]
  );
  const cs = touchScale(w, h, portrait);

  const topButtons = TOP_BUTTONS.filter((b) => {
    if (b.id === 'journal') return Boolean(actions && actions.openJournal);
    if (b.id === 'photo') return Boolean(actions && actions.openPhoto); // Neon Meridyen foto modu (yalnız şehirde verilir)
    return true;
  });
  const runTop = (b) => {
    const a = actionsRef.current;
    if (a && typeof a[b.action] === 'function') {
      a[b.action]();
    } else if (b.press) {
      press(b.press, true);
      press(b.press, false);
    }
  };

  const style = {
    '--kx-cs': cs,
    '--kx-ax': 'calc(var(--kx-safe-' + (leftHanded ? 'l' : 'r') + ') + ' + layout.anchor.edge * cs + 'px)',
    '--kx-ay': 'calc(var(--kx-safe-b) + ' + layout.anchor.bottom + 'px)',
    '--kx-btn-op': opacity,
  };

  return (
    <div
      ref={rootRef}
      className="kx-touch"
      data-left={leftHanded ? '1' : '0'}
      data-portrait={portrait ? '1' : '0'}
      style={style}
    >
      {/* Yüzen joystick görseli */}
      <div ref={joyRef} className="kx-joy" data-active="0" data-sprint="0" data-left={leftHanded ? '1' : '0'} aria-hidden="true">
        <div className="kx-joy-ghost" />
        <div ref={baseRef} className="kx-joy-base">
          <span className="kx-joy-sprint">Koş</span>
        </div>
        <div ref={knobRef} className="kx-joy-knob" />
      </div>

      {/* Üst çubuk */}
      <div className="kx-topbar" role="toolbar" aria-label="Oyun menüsü" data-no-tap>
        {topButtons.map((b) => {
          const Icon = b.icon;
          return (
            <button
              key={b.id}
              type="button"
              className="kx-topbtn"
              data-no-tap
              data-id={b.id}
              aria-label={b.label}
              aria-pressed={b.id === 'camera' ? cameraMode !== 'fp' : undefined}
              onClick={() => runTop(b)}
            >
              <Icon aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* Başparmak yayı */}
      <div className="kx-arc" role="group" aria-label="Eylem düğmeleri">
        {layout.buttons.map((def) => {
          const st = def.ability && abilityStatus ? abilityStatus[def.ability] : null;
          const locked = def.name === 'sprintToggle' ? latch.sprint : def.name === 'crouch' ? latch.crouch : def.name === 'portalMode' ? dimMode : false;
          return (
            <GameButton
              key={def.id}
              def={def}
              press={press}
              locked={locked}
              cd={st && typeof st.cooldown === 'number' ? st.cooldown : 0}
              charges={st && typeof st.charges === 'number' ? st.charges : undefined}
            />
          );
        })}
      </div>
    </div>
  );
};

export default memo(TouchControls);
